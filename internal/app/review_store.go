package toudocu

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type reviewStore struct {
	repositoryRoot string
	directory      string
	statePath      string
	lockPath       string
}

func openReviewStore(repositoryRoot string) (*reviewStore, error) {
	g, err := openGitRepositorySource(repositoryRoot, 60)
	if err != nil {
		return nil, err
	}
	root, err := reviewUserStateRoot()
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256([]byte(filepath.Clean(g.root)))
	directory := filepath.Join(root, "toudocu", "agent-feedback", hex.EncodeToString(hash[:]))
	return &reviewStore{
		repositoryRoot: g.root,
		directory:      directory,
		statePath:      filepath.Join(directory, "state.json"),
		lockPath:       filepath.Join(directory, "state.lock"),
	}, nil
}

func reviewUserStateRoot() (string, error) {
	if override := strings.TrimSpace(os.Getenv("TOUDOCU_STATE_HOME")); override != "" {
		return filepath.Abs(override)
	}
	switch runtime.GOOS {
	case "windows":
		if value := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); value != "" {
			return filepath.Abs(value)
		}
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Application Support"), nil
	default:
		if value := strings.TrimSpace(os.Getenv("XDG_STATE_HOME")); value != "" {
			return filepath.Abs(value)
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".local", "state"), nil
	}
	return "", fmt.Errorf("user state directory unavailable")
}

func emptyReviewState() ReviewState {
	state := ReviewState{SchemaVersion: reviewSchemaVersion, StoreVersion: reviewStoreVersion, Deliveries: []AgentDelivery{}}
	state.StateDigest = calculateReviewStateDigest(state)
	return state
}

func calculateReviewStateDigest(state ReviewState) string {
	state.StateDigest = ""
	state.RepositoryRevision = ""
	normalizeReviewState(&state)
	data, _ := json.Marshal(state)
	return digestBytes(data)
}

func normalizeReviewState(state *ReviewState) {
	if state.Deliveries == nil {
		state.Deliveries = []AgentDelivery{}
	}
	for index := range state.Deliveries {
		if state.Deliveries[index].MessageIDs == nil {
			state.Deliveries[index].MessageIDs = []string{}
		}
	}
	if state.Session == nil {
		return
	}
	if state.Session.Discussions == nil {
		state.Session.Discussions = []Discussion{}
	}
	for discussionIndex := range state.Session.Discussions {
		discussion := &state.Session.Discussions[discussionIndex]
		if discussion.Messages == nil {
			discussion.Messages = []ReviewMessage{}
		}
		for messageIndex := range discussion.Messages {
			message := &discussion.Messages[messageIndex]
			if message.Evidence == nil {
				message.Evidence = []AgentEvidence{}
			}
			if message.ChangedPaths == nil {
				message.ChangedPaths = []string{}
			}
		}
	}
}

func validateStoredReviewState(state ReviewState) error {
	if state.SchemaVersion != reviewSchemaVersion || state.StoreVersion != reviewStoreVersion || state.StateDigest == "" || calculateReviewStateDigest(state) != state.StateDigest {
		return corruptedReviewState("agent feedback state digest or version is invalid")
	}
	discussions, messages, deliveries := map[string]bool{}, map[string]bool{}, map[string]bool{}
	if state.Session != nil {
		for _, discussion := range state.Session.Discussions {
			if discussion.ID == "" || discussions[discussion.ID] || discussion.State != "open" && discussion.State != "resolved" {
				return corruptedReviewState("agent feedback discussion is invalid: " + discussion.ID)
			}
			discussions[discussion.ID] = true
			for _, message := range discussion.Messages {
				if message.ID == "" || messages[message.ID] || message.Author != "human" && message.Author != "agent" {
					return corruptedReviewState("agent feedback message is invalid: " + message.ID)
				}
				messages[message.ID] = true
			}
		}
	}
	for _, delivery := range state.Deliveries {
		if delivery.ID == "" || deliveries[delivery.ID] || !discussions[delivery.DiscussionID] || delivery.State != "pending" && delivery.State != "claimed" && delivery.State != "responded" {
			return corruptedReviewState("agent delivery is invalid: " + delivery.ID)
		}
		deliveries[delivery.ID] = true
		for _, messageID := range delivery.MessageIDs {
			if !messages[messageID] {
				return corruptedReviewState("agent delivery references an unknown message: " + delivery.ID)
			}
		}
	}
	return nil
}

func corruptedReviewState(message string) error {
	return &reviewFailure{Code: "AGENT_STATE_CORRUPTED", Status: http.StatusInternalServerError, Message: message + "; the file was not overwritten"}
}

func (store *reviewStore) load() (ReviewState, error) {
	return store.loadUnlocked()
}

func (store *reviewStore) loadUnlocked() (ReviewState, error) {
	data, err := os.ReadFile(store.statePath)
	if os.IsNotExist(err) {
		return emptyReviewState(), nil
	}
	if err != nil {
		return ReviewState{}, err
	}
	var state ReviewState
	if err := json.Unmarshal(data, &state); err != nil {
		return ReviewState{}, corruptedReviewState("agent feedback state is not valid JSON")
	}
	if err := validateStoredReviewState(state); err != nil {
		return ReviewState{}, err
	}
	normalizeReviewState(&state)
	return state, nil
}

func (store *reviewStore) withLock(operation func() error) error {
	if err := os.MkdirAll(store.directory, 0o700); err != nil {
		return err
	}
	_ = os.Chmod(store.directory, 0o700)
	lock, err := os.OpenFile(store.lockPath, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	defer lock.Close()
	_ = lock.Chmod(0o600)
	deadline := time.Now().Add(750 * time.Millisecond)
	for {
		err = lockReviewFile(lock)
		if err == nil {
			break
		}
		if !reviewLockBusy(err) {
			return err
		}
		if time.Now().After(deadline) {
			return &reviewFailure{Code: "AGENT_INBOX_BUSY", Status: http.StatusConflict, Message: "agent feedback state is locked by another process"}
		}
		time.Sleep(25 * time.Millisecond)
	}
	defer unlockReviewFile(lock)
	if err := lock.Truncate(0); err != nil {
		return err
	}
	if _, err := lock.Seek(0, 0); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(lock, "%d\n", os.Getpid())
	_ = lock.Sync()
	return operation()
}

func (store *reviewStore) mutate(guard ReviewMutationGuard, operation func(*ReviewState) error) (ReviewState, error) {
	return store.update(func(state *ReviewState) (bool, error) {
		if state.Revision != guard.ExpectedRevision || state.StateDigest != guard.ExpectedStateDigest {
			return false, &reviewFailure{Code: "AGENT_REVISION_CONFLICT", Status: http.StatusConflict, Message: "agent feedback revision/state digest is stale"}
		}
		return true, operation(state)
	})
}

func (store *reviewStore) update(operation func(*ReviewState) (bool, error)) (ReviewState, error) {
	var result ReviewState
	err := store.withLock(func() error {
		state, err := store.loadUnlocked()
		if err != nil {
			return err
		}
		changed, err := operation(&state)
		if err != nil {
			return err
		}
		if changed {
			state.Revision++
			state.StateDigest = calculateReviewStateDigest(state)
			if err := store.writeState(state); err != nil {
				return err
			}
		}
		result = state
		return nil
	})
	return result, err
}

func (store *reviewStore) writeState(state ReviewState) error {
	state.RepositoryRevision = ""
	normalizeReviewState(&state)
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	temporary, err := os.CreateTemp(store.directory, ".state-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := replaceReviewStateFile(temporaryPath, store.statePath); err != nil {
		return err
	}
	_ = os.Chmod(store.statePath, 0o600)
	if directory, err := os.Open(store.directory); err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
	return nil
}

func newAgentID(prefix string, now time.Time) (string, error) {
	id, err := newReviewID(now)
	if err != nil {
		return "", err
	}
	return prefix + "-" + id, nil
}

func newReviewID(now time.Time) (string, error) {
	var data [16]byte
	milliseconds := uint64(now.UnixMilli())
	for index := 5; index >= 0; index-- {
		data[index] = byte(milliseconds)
		milliseconds >>= 8
	}
	if _, err := rand.Read(data[6:]); err != nil {
		return "", err
	}
	value := new(big.Int).SetBytes(data[:])
	base := big.NewInt(32)
	zero := big.NewInt(0)
	alphabet := "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	encoded := make([]byte, 26)
	for index := len(encoded) - 1; index >= 0; index-- {
		if value.Cmp(zero) == 0 {
			encoded[index] = '0'
			continue
		}
		quotient, remainder := new(big.Int), new(big.Int)
		quotient.QuoRem(value, base, remainder)
		encoded[index] = alphabet[remainder.Int64()]
		value = quotient
	}
	return string(encoded), nil
}
