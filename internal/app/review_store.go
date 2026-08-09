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
	snapshotsPath  string
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
	directory := filepath.Join(root, "toudocu", "reviews", hex.EncodeToString(hash[:]))
	return &reviewStore{
		repositoryRoot: g.root, directory: directory, statePath: filepath.Join(directory, "state.json"),
		lockPath: filepath.Join(directory, "state.lock"), snapshotsPath: filepath.Join(directory, "snapshots"),
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
	state := ReviewState{SchemaVersion: reviewSchemaVersion, Feedback: []FeedbackBatch{}}
	state.StateDigest = calculateReviewStateDigest(state)
	return state
}

func calculateReviewStateDigest(state ReviewState) string {
	state.StateDigest = ""
	data, _ := json.Marshal(state)
	return digestBytes(data)
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
	if err := json.Unmarshal(data, &state); err != nil || state.SchemaVersion != reviewSchemaVersion || state.StateDigest == "" || calculateReviewStateDigest(state) != state.StateDigest {
		return ReviewState{}, &reviewFailure{Code: "REVIEW_STATE_CORRUPTED", Status: http.StatusInternalServerError, Message: "review state повреждён; файл не был перезаписан"}
	}
	if state.Feedback == nil {
		state.Feedback = []FeedbackBatch{}
	}
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
			return &reviewFailure{Code: "REVIEW_STATE_BUSY", Status: http.StatusConflict, Message: "review state занят другим процессом"}
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
	var result ReviewState
	err := store.withLock(func() error {
		state, err := store.loadUnlocked()
		if err != nil {
			return err
		}
		if state.Revision != guard.ExpectedRevision || state.StateDigest != guard.ExpectedStateDigest {
			return &reviewFailure{Code: "REVIEW_CONFLICT", Status: http.StatusConflict, Message: "review revision/state digest устарел"}
		}
		if err := operation(&state); err != nil {
			return err
		}
		state.Revision++
		state.StateDigest = calculateReviewStateDigest(state)
		if err := store.writeState(state); err != nil {
			return err
		}
		result = state
		return nil
	})
	return result, err
}

func (store *reviewStore) writeState(state ReviewState) error {
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

func (store *reviewStore) saveSnapshot(content []byte) (string, error) {
	if len(content) > reviewSnapshotLimit {
		return "", &reviewFailure{Code: "REVIEW_TOO_LARGE", Status: http.StatusRequestEntityTooLarge, Message: "review snapshot превышает 2 MiB"}
	}
	digest := digestBytes(content)
	if err := os.MkdirAll(store.snapshotsPath, 0o700); err != nil {
		return "", err
	}
	_ = os.Chmod(store.snapshotsPath, 0o700)
	destination := filepath.Join(store.snapshotsPath, digest)
	if info, err := os.Lstat(destination); err == nil {
		if !info.Mode().IsRegular() {
			return "", &reviewFailure{Code: "REVIEW_STATE_CORRUPTED", Status: http.StatusInternalServerError, Message: "snapshot path не является regular file"}
		}
		return digest, nil
	}
	temporary, err := os.CreateTemp(store.snapshotsPath, ".snapshot-*.tmp")
	if err != nil {
		return "", err
	}
	name := temporary.Name()
	defer os.Remove(name)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return "", err
	}
	if _, err := temporary.Write(content); err != nil {
		_ = temporary.Close()
		return "", err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return "", err
	}
	if err := temporary.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(name, destination); err != nil && !os.IsExist(err) {
		return "", err
	}
	_ = os.Chmod(destination, 0o600)
	return digest, nil
}

func (store *reviewStore) snapshot(digest string) ([]byte, error) {
	if len(digest) != 64 {
		return nil, &reviewFailure{Code: "REVIEW_STATE_CORRUPTED", Status: http.StatusInternalServerError, Message: "invalid snapshot reference"}
	}
	for _, character := range digest {
		if !strings.ContainsRune("0123456789abcdef", character) {
			return nil, &reviewFailure{Code: "REVIEW_STATE_CORRUPTED", Status: http.StatusInternalServerError, Message: "invalid snapshot reference"}
		}
	}
	content, err := os.ReadFile(filepath.Join(store.snapshotsPath, digest))
	if err != nil || digestBytes(content) != digest {
		return nil, &reviewFailure{Code: "REVIEW_STATE_CORRUPTED", Status: http.StatusInternalServerError, Message: "review snapshot повреждён"}
	}
	return content, nil
}

func (store *reviewStore) garbageCollectSnapshots(state ReviewState) {
	referenced := map[string]bool{}
	if state.Session != nil {
		for _, discussion := range state.Session.Discussions {
			if discussion.Anchor != nil && discussion.Anchor.SnapshotRef != "" {
				referenced[discussion.Anchor.SnapshotRef] = true
			}
		}
	}
	entries, err := os.ReadDir(store.snapshotsPath)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() && len(entry.Name()) == 64 && !referenced[entry.Name()] {
			_ = os.Remove(filepath.Join(store.snapshotsPath, entry.Name()))
		}
	}
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
