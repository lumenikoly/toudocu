package toudocu

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type reviewService struct {
	store   *reviewStore
	options Options
	now     func() time.Time
}

func newReviewService(options Options) (*reviewService, error) {
	store, err := openReviewStore(options.RepositoryRoot)
	if err != nil {
		return nil, err
	}
	options.RepositoryRoot = store.repositoryRoot
	return &reviewService{store: store, options: options, now: func() time.Time { return time.Now().UTC() }}, nil
}

func (service *reviewService) discussions() (ReviewState, error) {
	state, err := service.store.load()
	if err != nil {
		return ReviewState{}, err
	}
	if state.Session == nil {
		return state, nil
	}
	report, reportErr := BuildRepositoryReview(service.options)
	if reportErr != nil {
		return ReviewState{}, reportErr
	}
	for index := range state.Session.Discussions {
		state.Session.Discussions[index].Placement = service.reanchor(state.Session.Discussions[index], report)
	}
	sortReviewDiscussions(&state)
	state.RepositoryRevision = report.RepositoryRevision
	return state, nil
}

func (service *reviewService) createDiscussion(request CreateDiscussionRequest) (ReviewState, error) {
	if err := validateHumanMessage(request.Message); err != nil {
		return ReviewState{}, err
	}
	report, err := BuildRepositoryReview(service.options)
	if err != nil {
		return ReviewState{}, err
	}
	if !report.FeedbackWritable {
		return ReviewState{}, &reviewFailure{Code: "REVIEW_READ_ONLY", Status: http.StatusForbidden, Message: "review target доступен только для чтения"}
	}
	if request.RepositoryRevision != report.RepositoryRevision {
		return ReviewState{}, &reviewFailure{Code: "REVIEW_CONFLICT", Status: http.StatusConflict, Message: "repository revision устарел"}
	}
	anchor, snapshot, err := service.captureAnchor(report, request.Target)
	if err != nil {
		return ReviewState{}, err
	}
	now := service.now()
	discussionID, err := newReviewID(now)
	if err != nil {
		return ReviewState{}, err
	}
	messageID, err := newReviewID(now.Add(time.Nanosecond))
	if err != nil {
		return ReviewState{}, err
	}
	result, mutateErr := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		if state.Session == nil {
			sessionID, idErr := newReviewID(now)
			if idErr != nil {
				return idErr
			}
			state.Session = &ReviewSession{ID: sessionID, CreatedAt: now, Discussions: []Discussion{}}
		}
		if anchor != nil {
			snapshotRef, snapshotErr := service.store.saveSnapshot(snapshot)
			if snapshotErr != nil {
				return snapshotErr
			}
			anchor.SnapshotRef = snapshotRef
		}
		discussion := Discussion{
			ID: discussionID, State: "open", Target: request.Target, Anchor: anchor,
			Placement: placementFromTarget(request.Target, "exact", ""),
			Messages:  []ReviewMessage{{ID: messageID, Author: "human", Body: strings.TrimSpace(request.Message), CreatedAt: now}},
			CreatedAt: now, UpdatedAt: now,
		}
		state.Session.Discussions = append(state.Session.Discussions, discussion)
		return nil
	})
	if mutateErr != nil {
		if current, loadErr := service.store.load(); loadErr == nil {
			service.store.garbageCollectSnapshots(current)
		}
	}
	return result, mutateErr
}

func (service *reviewService) updateDiscussion(id string, request UpdateDiscussionRequest) (ReviewState, error) {
	result, err := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		discussion := findDiscussion(state, id)
		if discussion == nil {
			return &reviewFailure{Code: "REVIEW_NOT_FOUND", Status: http.StatusNotFound, Message: "discussion не найден"}
		}
		now := service.now()
		switch request.Operation {
		case "reply":
			if discussion.State != "open" {
				return &reviewFailure{Code: "REVIEW_INVALID_STATE", Status: http.StatusConflict, Message: "reply доступен только в open discussion"}
			}
			if discussionInFlight(*state, discussion.ID) {
				return &reviewFailure{Code: "REVIEW_CONFLICT", Status: http.StatusConflict, Message: "discussion ожидает ответ агента"}
			}
			for _, message := range discussion.Messages {
				if message.Author == "human" && message.FeedbackID == "" {
					return &reviewFailure{Code: "REVIEW_CONFLICT", Status: http.StatusConflict, Message: "сначала отправьте или измените существующее unsent сообщение"}
				}
			}
			if err := validateHumanMessage(request.Message); err != nil {
				return err
			}
			messageID, err := newReviewID(now)
			if err != nil {
				return err
			}
			discussion.Messages = append(discussion.Messages, ReviewMessage{ID: messageID, Author: "human", Body: strings.TrimSpace(request.Message), CreatedAt: now})
		case "edit":
			if err := validateHumanMessage(request.Message); err != nil {
				return err
			}
			message := findUnsentHumanMessage(discussion, request.MessageID)
			if message == nil {
				return &reviewFailure{Code: "REVIEW_INVALID_STATE", Status: http.StatusConflict, Message: "редактировать можно только unsent human message"}
			}
			message.Body, message.EditedAt = strings.TrimSpace(request.Message), now
		case "delete":
			message := findUnsentHumanMessage(discussion, request.MessageID)
			if message == nil {
				return &reviewFailure{Code: "REVIEW_INVALID_STATE", Status: http.StatusConflict, Message: "удалить можно только unsent human message"}
			}
			for index := range discussion.Messages {
				if discussion.Messages[index].ID == message.ID {
					discussion.Messages = append(discussion.Messages[:index], discussion.Messages[index+1:]...)
					break
				}
			}
			if len(discussion.Messages) == 0 {
				removeDiscussion(state, discussion.ID)
				return nil
			}
		case "deleteDiscussion":
			removeDiscussion(state, id)
			kept := state.Feedback[:0]
			for _, batch := range state.Feedback {
				affected := false
				for _, item := range batch.Items {
					if item.DiscussionID == id {
						affected = true
						break
					}
				}
				if !affected {
					kept = append(kept, batch)
					continue
				}
				if batch.RespondedAt.IsZero() {
					for _, item := range batch.Items {
						discussion := findDiscussion(state, item.DiscussionID)
						if discussion == nil {
							continue
						}
						for index := range discussion.Messages {
							if discussion.Messages[index].ID == item.MessageID && discussion.Messages[index].FeedbackID == batch.ID {
								discussion.Messages[index].FeedbackID = ""
							}
						}
					}
				}
			}
			state.Feedback = kept
			return nil
		case "resolve":
			discussion.State = "resolved"
		case "reopen":
			discussion.State = "open"
		default:
			return &reviewFailure{Code: "REVIEW_INVALID_REQUEST", Status: http.StatusBadRequest, Message: "unknown discussion operation"}
		}
		discussion.UpdatedAt = now
		return nil
	})
	if err == nil && request.Operation == "deleteDiscussion" {
		service.store.garbageCollectSnapshots(result)
	}
	return result, err
}

func (service *reviewService) createFeedback(guard ReviewMutationGuard) (ReviewState, *FeedbackBatch, error) {
	var created *FeedbackBatch
	state, err := service.store.mutate(guard, func(state *ReviewState) error {
		if state.Session == nil {
			return &reviewFailure{Code: "REVIEW_NO_FEEDBACK", Status: http.StatusConflict, Message: "нет новых сообщений для отправки"}
		}
		items := []FeedbackItem{}
		for discussionIndex := range state.Session.Discussions {
			discussion := &state.Session.Discussions[discussionIndex]
			if discussion.State != "open" || discussionInFlight(*state, discussion.ID) {
				continue
			}
			for messageIndex := range discussion.Messages {
				message := &discussion.Messages[messageIndex]
				if message.Author != "human" || message.FeedbackID != "" {
					continue
				}
				itemID, idErr := newReviewID(service.now().Add(time.Duration(len(items)) * time.Nanosecond))
				if idErr != nil {
					return idErr
				}
				anchor := AnchorSnapshot{}
				if discussion.Anchor != nil {
					anchor = *discussion.Anchor
				}
				items = append(items, FeedbackItem{ID: itemID, DiscussionID: discussion.ID, MessageID: message.ID, Body: message.Body, Target: discussion.Target, Anchor: anchor})
			}
		}
		if len(items) == 0 {
			return &reviewFailure{Code: "REVIEW_NO_FEEDBACK", Status: http.StatusConflict, Message: "нет новых сообщений для отправки"}
		}
		feedbackID, idErr := newReviewID(service.now())
		if idErr != nil {
			return idErr
		}
		batch := FeedbackBatch{SchemaVersion: reviewSchemaVersion, ID: feedbackID, ReviewID: state.Session.ID, CreatedAt: service.now(), Items: items}
		batch.Digest = feedbackBatchDigest(batch)
		for _, item := range items {
			discussion := findDiscussion(state, item.DiscussionID)
			for index := range discussion.Messages {
				if discussion.Messages[index].ID == item.MessageID {
					discussion.Messages[index].FeedbackID = feedbackID
				}
			}
		}
		state.Feedback = append(state.Feedback, batch)
		created = &batch
		return nil
	})
	return state, created, err
}

func feedbackBatchDigest(batch FeedbackBatch) string {
	batch.Digest = ""
	data, _ := json.Marshal(batch)
	return digestBytes(data)
}

func (service *reviewService) pendingFeedback() (PendingFeedbackEnvelope, error) {
	state, err := service.store.load()
	if err != nil {
		return PendingFeedbackEnvelope{}, err
	}
	envelope := PendingFeedbackEnvelope{SchemaVersion: reviewSchemaVersion, Revision: state.Revision, StateDigest: state.StateDigest}
	for index := range state.Feedback {
		if state.Feedback[index].RespondedAt.IsZero() {
			copy := state.Feedback[index]
			envelope.Feedback = &copy
			break
		}
	}
	return envelope, nil
}

func (service *reviewService) respond(response AgentFeedbackResponse) (ReviewState, error) {
	if response.SchemaVersion != reviewSchemaVersion {
		return ReviewState{}, invalidReviewResponse("unsupported response schemaVersion")
	}
	guard := ReviewMutationGuard{ExpectedRevision: response.ExpectedRevision, ExpectedStateDigest: response.ExpectedStateDigest}
	return service.store.mutate(guard, func(state *ReviewState) error {
		if state.Session == nil || state.Session.ID != response.ReviewID {
			return invalidReviewResponse("unknown reviewId")
		}
		var batch *FeedbackBatch
		for index := range state.Feedback {
			if state.Feedback[index].RespondedAt.IsZero() {
				if state.Feedback[index].ID != response.FeedbackID {
					return invalidReviewResponse("response must match oldest pending feedback")
				}
				batch = &state.Feedback[index]
				break
			}
		}
		if batch == nil || !batch.RespondedAt.IsZero() || batch.Digest != response.FeedbackDigest || feedbackBatchDigest(*batch) != batch.Digest {
			return invalidReviewResponse("unknown, completed, or mismatched feedback")
		}
		if len(response.Results) != len(batch.Items) {
			return invalidReviewResponse("response must contain exactly one result per feedback item")
		}
		results := map[string]AgentFeedbackResult{}
		for _, result := range response.Results {
			if _, duplicate := results[result.ItemID]; duplicate {
				return invalidReviewResponse("duplicate item result")
			}
			if !validReviewOutcome(result.Outcome) || strings.TrimSpace(result.Message) == "" {
				return invalidReviewResponse("invalid outcome or empty message")
			}
			if len(result.Message) > reviewMessageLimit {
				return &reviewFailure{Code: "REVIEW_MESSAGE_TOO_LARGE", Status: http.StatusRequestEntityTooLarge, Message: "agent message превышает лимит"}
			}
			if len(result.ChangedPaths) > 256 {
				return invalidReviewResponse("too many changedPaths")
			}
			g, err := openGitRepositorySource(service.options.RepositoryRoot, 60)
			if err != nil {
				return err
			}
			for _, path := range result.ChangedPaths {
				if err := validateReviewChangedPath(g, path); err != nil {
					return invalidReviewResponse("unsafe changedPath")
				}
			}
			results[result.ItemID] = result
		}
		for _, item := range batch.Items {
			if _, ok := results[item.ID]; !ok {
				return invalidReviewResponse("missing feedback item result")
			}
		}
		now := service.now()
		for _, item := range batch.Items {
			result := results[item.ID]
			discussion := findDiscussion(state, item.DiscussionID)
			if discussion == nil {
				return invalidReviewResponse("feedback discussion no longer exists")
			}
			messageID, err := newReviewID(now.Add(time.Duration(len(discussion.Messages)) * time.Nanosecond))
			if err != nil {
				return err
			}
			discussion.Messages = append(discussion.Messages, ReviewMessage{ID: messageID, Author: "agent", Body: strings.TrimSpace(result.Message), Outcome: result.Outcome, ChangedPaths: append([]string{}, result.ChangedPaths...), FeedbackID: batch.ID, CreatedAt: now})
			discussion.UpdatedAt = now
		}
		batch.RespondedAt = now
		return nil
	})
}

func invalidReviewResponse(message string) error {
	return &reviewFailure{Code: "REVIEW_INVALID_RESPONSE", Status: http.StatusBadRequest, Message: message}
}

func (service *reviewService) cleanup(request CleanupReviewRequest) (ReviewState, error) {
	state, err := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		switch request.Mode {
		case "closed":
			if state.Session == nil {
				return nil
			}
			kept := state.Session.Discussions[:0]
			for _, discussion := range state.Session.Discussions {
				if discussion.State != "resolved" || discussionInFlight(*state, discussion.ID) {
					kept = append(kept, discussion)
				}
			}
			state.Session.Discussions = kept
		case "all":
			if !request.Confirm {
				return &reviewFailure{Code: "REVIEW_CONFIRMATION_REQUIRED", Status: http.StatusBadRequest, Message: "full cleanup требует confirm=true"}
			}
			now := service.now()
			id, idErr := newReviewID(now)
			if idErr != nil {
				return idErr
			}
			state.Session = &ReviewSession{ID: id, CreatedAt: now, Discussions: []Discussion{}}
			state.Feedback = []FeedbackBatch{}
		default:
			return &reviewFailure{Code: "REVIEW_INVALID_REQUEST", Status: http.StatusBadRequest, Message: "cleanup mode должен быть closed или all"}
		}
		return nil
	})
	if err == nil {
		service.store.garbageCollectSnapshots(state)
	}
	return state, err
}

func (service *reviewService) captureAnchor(report *RepositoryReviewReport, target ReviewTarget) (*AnchorSnapshot, []byte, error) {
	if err := validateReviewTarget(target); err != nil {
		return nil, nil, err
	}
	if target.Type == "global" {
		return nil, nil, nil
	}
	g, err := openGitRepositorySource(service.options.RepositoryRoot, service.options.ChangeRenameSimilarity)
	if err != nil {
		return nil, nil, err
	}
	path, err := validateReviewPath(g, target.Path)
	if err != nil {
		return nil, nil, err
	}
	side := report.Comparison.Target
	resolvedPath := path
	if target.Type == "diff" {
		var changed *RepositoryReviewFile
		for index := range report.Files {
			if report.Files[index].Path == path || report.Files[index].OldPath == path {
				changed = &report.Files[index]
				break
			}
		}
		if changed == nil {
			return nil, nil, &reviewFailure{Code: "REVIEW_NOT_FOUND", Status: http.StatusNotFound, Message: "diff target не найден"}
		}
		if target.Side == "old" {
			side = report.Comparison.Base
			if changed.OldPath != "" {
				resolvedPath = changed.OldPath
			}
		} else {
			resolvedPath = changed.Path
		}
	}
	content, err := readReviewText(g, side, resolvedPath)
	if err != nil {
		return nil, nil, err
	}
	selected, before, after, err := extractReviewSelection(content, target)
	if err != nil {
		return nil, nil, err
	}
	return &AnchorSnapshot{
		OriginalTarget: target, OriginalPath: resolvedPath, OriginalRepositoryRevision: report.RepositoryRevision,
		ContentDigest: digestBytes(content), SelectedText: selected, ContextBefore: before, ContextAfter: after,
	}, content, nil
}

func validateReviewTarget(target ReviewTarget) error {
	switch target.Type {
	case "global":
		if target.Path != "" || target.Start != nil || target.End != nil || target.Side != "" {
			return &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "global target не принимает path/range/side"}
		}
		return nil
	case "file":
		if target.Path == "" || target.Start != nil || target.End != nil || target.Side != "" {
			return &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "file target принимает только path"}
		}
	case "fileRange":
		if target.Path == "" || target.Start == nil || target.End == nil || target.Side != "" {
			return &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "fileRange требует path и range"}
		}
	case "diff":
		if target.Path == "" || target.Start == nil || target.End == nil || target.Side != "old" && target.Side != "new" {
			return &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "diff требует path, one side и range"}
		}
	default:
		return &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "target type должен быть diff, fileRange, file или global"}
	}
	return nil
}

func extractReviewSelection(content []byte, target ReviewTarget) (string, string, string, error) {
	if target.Type == "file" {
		return "", truncateUTF8End(content, reviewContextByteSize), "", nil
	}
	start, err := reviewPositionOffset(content, *target.Start)
	if err != nil {
		return "", "", "", err
	}
	end, err := reviewPositionOffset(content, *target.End)
	if err != nil || end <= start {
		return "", "", "", &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "review range пуст или выходит за файл"}
	}
	return string(content[start:end]), truncateUTF8Start(content[max(0, start-reviewContextByteSize):start], reviewContextByteSize), truncateUTF8End(content[end:min(len(content), end+reviewContextByteSize)], reviewContextByteSize), nil
}

func reviewPositionOffset(content []byte, position ReviewPosition) (int, error) {
	if position.Line < 1 || position.Column < 1 {
		return 0, &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "line/column должны быть 1-based"}
	}
	line, offset := 1, 0
	for line < position.Line {
		newline := bytes.IndexByte(content[offset:], '\n')
		if newline < 0 {
			return 0, &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "line выходит за файл"}
		}
		offset += newline + 1
		line++
	}
	end := len(content)
	if newline := bytes.IndexByte(content[offset:], '\n'); newline >= 0 {
		end = offset + newline
	}
	lineContent := content[offset:end]
	if !utf8.Valid(lineContent) {
		return 0, &reviewFailure{Code: "REVIEW_BINARY", Status: http.StatusUnsupportedMediaType, Message: "invalid UTF-8 review source"}
	}
	runes := []rune(string(lineContent))
	if position.Column > len(runes)+1 {
		return 0, &reviewFailure{Code: "REVIEW_INVALID_TARGET", Status: http.StatusBadRequest, Message: "column выходит за строку"}
	}
	return offset + len([]byte(string(runes[:position.Column-1]))), nil
}

func truncateUTF8Start(content []byte, limit int) string {
	if len(content) > limit {
		content = content[len(content)-limit:]
		for len(content) > 0 && !utf8.Valid(content) {
			content = content[1:]
		}
	}
	return string(content)
}

func truncateUTF8End(content []byte, limit int) string {
	if len(content) > limit {
		content = content[:limit]
		for len(content) > 0 && !utf8.Valid(content) {
			content = content[:len(content)-1]
		}
	}
	return string(content)
}

func placementFromTarget(target ReviewTarget, status, reason string) AnchorPlacement {
	return AnchorPlacement{Status: status, Path: target.Path, Side: target.Side, Start: target.Start, End: target.End, Reason: reason}
}

func (service *reviewService) reanchor(discussion Discussion, report *RepositoryReviewReport) AnchorPlacement {
	if discussion.Anchor == nil {
		return placementFromTarget(discussion.Target, "exact", "")
	}
	anchor := discussion.Anchor
	path := anchor.OriginalPath
	if path == "" {
		path = discussion.Target.Path
	}
	renamed := false
	for _, file := range report.Files {
		if file.OldPath == path && file.Status == "renamed" {
			path = file.Path
			renamed = true
			break
		}
	}
	g, err := openGitRepositorySource(service.options.RepositoryRoot, service.options.ChangeRenameSimilarity)
	if err != nil {
		return placementFromTarget(discussion.Target, "stale", "Git недоступен")
	}
	side := ChangeSide{Type: "working-tree"}
	if discussion.Target.Type == "diff" && discussion.Target.Side == "old" {
		side = report.Comparison.Base
	}
	content, err := readReviewText(g, side, path)
	if err != nil {
		var failure *reviewFailure
		if os.IsNotExist(err) || asReviewFailure(err, &failure) && failure.Code == "REVIEW_NOT_FOUND" {
			return AnchorPlacement{Status: "deleted", Path: path, Side: discussion.Target.Side, Reason: "anchor file удалён"}
		}
		return AnchorPlacement{Status: "stale", Path: path, Side: discussion.Target.Side, Reason: err.Error()}
	}
	if discussion.Target.Type == "file" {
		status, reason := "exact", ""
		if renamed {
			status, reason = "moved", "однозначный Git rename"
		}
		return AnchorPlacement{Status: status, Path: path, Side: discussion.Target.Side, Reason: reason}
	}
	if digestBytes(content) == anchor.ContentDigest {
		status, reason := "exact", ""
		if renamed {
			status, reason = "moved", "однозначный Git rename"
		}
		placement := placementFromTarget(discussion.Target, status, reason)
		placement.Path = path
		return placement
	}
	if anchor.SelectedText == "" {
		return AnchorPlacement{Status: "stale", Path: path, Side: discussion.Target.Side, Reason: "file content изменён"}
	}
	if from, to, unique := uniqueReviewContextPair(content, anchor.ContextBefore, anchor.ContextAfter); unique && from == to {
		return placementForOffsets(content, path, discussion.Target.Side, from, to, "deleted", "anchor fragment удалён")
	}
	if anchor.SnapshotRef != "" && side.Type == "working-tree" {
		snapshotPath := filepath.Join(service.store.snapshotsPath, anchor.SnapshotRef)
		currentPath := filepath.Join(g.root, filepath.FromSlash(path))
		if hunks, mapErr := gitReviewLineHunks(g.root, snapshotPath, currentPath); mapErr == nil {
			if placement, mapped := placementFromGitLineHunks(content, discussion.Target, path, hunks); mapped {
				if renamed {
					placement.Reason = "однозначный Git rename/line mapping"
				}
				return placement
			}
		}
	}
	matches := allByteMatches(content, []byte(anchor.SelectedText))
	if startLine := originalStartLine(discussion.Target); startLine > 0 {
		window := []int{}
		for _, offset := range matches {
			line := 1 + bytes.Count(content[:offset], []byte{'\n'})
			if line >= startLine-20 && line <= startLine+20 {
				window = append(window, offset)
			}
		}
		if len(window) == 1 {
			return placementForOffsets(content, path, discussion.Target.Side, window[0], window[0]+len(anchor.SelectedText), "moved", "exact text в окне ±20 строк")
		}
	}
	if len(matches) == 1 {
		return placementForOffsets(content, path, discussion.Target.Side, matches[0], matches[0]+len(anchor.SelectedText), "moved", "единственный exact text")
	}
	if from, to, unique := uniqueReviewContextPair(content, anchor.ContextBefore, anchor.ContextAfter); unique {
		return placementForOffsets(content, path, discussion.Target.Side, from, to, "moved", "единственная context boundary pair")
	}
	return AnchorPlacement{Status: "stale", Path: path, Side: discussion.Target.Side, Reason: "anchor невозможно сопоставить однозначно"}
}

func uniqueReviewContextPair(content []byte, beforeText, afterText string) (int, int, bool) {
	if beforeText == "" || afterText == "" {
		return 0, 0, false
	}
	pairs := [][2]int{}
	for _, before := range allByteMatches(content, []byte(beforeText)) {
		from := before + len(beforeText)
		for _, afterRelative := range allByteMatches(content[from:], []byte(afterText)) {
			after := from + afterRelative
			if after-from <= 32<<10 {
				pairs = append(pairs, [2]int{from, after})
			}
		}
	}
	if len(pairs) != 1 {
		return 0, 0, false
	}
	return pairs[0][0], pairs[0][1], true
}

func placementFromGitLineHunks(content []byte, target ReviewTarget, path string, hunks []reviewLineHunk) (AnchorPlacement, bool) {
	if target.Start == nil || target.End == nil {
		return AnchorPlacement{}, false
	}
	startLine, endLine, delta := target.Start.Line, target.End.Line, 0
	for _, hunk := range hunks {
		if hunk.oldCount == 0 {
			if hunk.oldStart < startLine {
				delta += hunk.newCount
			}
			continue
		}
		oldEnd := hunk.oldStart + hunk.oldCount - 1
		if oldEnd < startLine {
			delta += hunk.newCount - hunk.oldCount
			continue
		}
		if hunk.oldStart > endLine {
			break
		}
		if startLine < hunk.oldStart || endLine > oldEnd {
			return AnchorPlacement{}, false
		}
		if hunk.newCount == 0 {
			return AnchorPlacement{Status: "deleted", Path: path, Side: target.Side, Reason: "Git line mapping определил удалённый fragment"}, true
		}
		mappedStart := hunk.newStart + min(startLine-hunk.oldStart, hunk.newCount-1)
		mappedEnd := hunk.newStart + min(endLine-hunk.oldStart, hunk.newCount-1)
		start := ReviewPosition{Line: mappedStart, Column: 1}
		end := ReviewPosition{Line: mappedEnd, Column: reviewLineEndColumn(content, mappedEnd)}
		return AnchorPlacement{Status: "moved", Path: path, Side: target.Side, Start: &start, End: &end, Reason: "однозначный Git line mapping"}, true
	}
	if delta == 0 {
		return AnchorPlacement{}, false
	}
	start, end := *target.Start, *target.End
	start.Line += delta
	end.Line += delta
	return AnchorPlacement{Status: "moved", Path: path, Side: target.Side, Start: &start, End: &end, Reason: "однозначный Git line mapping"}, true
}

func reviewLineEndColumn(content []byte, line int) int {
	if line < 1 {
		return 1
	}
	start := 0
	for current := 1; current < line; current++ {
		index := bytes.IndexByte(content[start:], '\n')
		if index < 0 {
			return 1
		}
		start += index + 1
	}
	end := bytes.IndexByte(content[start:], '\n')
	if end < 0 {
		end = len(content) - start
	}
	return 1 + utf8.RuneCount(content[start:start+end])
}

func allByteMatches(content, needle []byte) []int {
	if len(needle) == 0 {
		return nil
	}
	result := []int{}
	for offset := 0; offset <= len(content)-len(needle); {
		index := bytes.Index(content[offset:], needle)
		if index < 0 {
			break
		}
		result = append(result, offset+index)
		offset += index + 1
	}
	return result
}

func placementForOffsets(content []byte, path, side string, start, end int, status, reason string) AnchorPlacement {
	startPosition := offsetReviewPosition(content, start)
	endPosition := offsetReviewPosition(content, end)
	return AnchorPlacement{Status: status, Path: path, Side: side, Start: &startPosition, End: &endPosition, Reason: reason}
}

func offsetReviewPosition(content []byte, offset int) ReviewPosition {
	lineStart := bytes.LastIndexByte(content[:offset], '\n') + 1
	return ReviewPosition{Line: 1 + bytes.Count(content[:offset], []byte{'\n'}), Column: 1 + utf8.RuneCount(content[lineStart:offset])}
}

func originalStartLine(target ReviewTarget) int {
	if target.Start != nil {
		return target.Start.Line
	}
	return 0
}

func validateHumanMessage(message string) error {
	message = strings.TrimSpace(message)
	if message == "" {
		return &reviewFailure{Code: "REVIEW_INVALID_REQUEST", Status: http.StatusBadRequest, Message: "message не может быть пустым"}
	}
	if len(message) > reviewMessageLimit {
		return &reviewFailure{Code: "REVIEW_MESSAGE_TOO_LARGE", Status: http.StatusRequestEntityTooLarge, Message: "review message превышает лимит"}
	}
	return nil
}

func validReviewOutcome(outcome string) bool {
	return outcome == "fixed" || outcome == "notFixed" || outcome == "needsClarification"
}

func findDiscussion(state *ReviewState, id string) *Discussion {
	if state.Session == nil {
		return nil
	}
	for index := range state.Session.Discussions {
		if state.Session.Discussions[index].ID == id {
			return &state.Session.Discussions[index]
		}
	}
	return nil
}

func removeDiscussion(state *ReviewState, id string) {
	if state.Session == nil {
		return
	}
	for index := range state.Session.Discussions {
		if state.Session.Discussions[index].ID == id {
			state.Session.Discussions = append(state.Session.Discussions[:index], state.Session.Discussions[index+1:]...)
			return
		}
	}
}

func findUnsentHumanMessage(discussion *Discussion, id string) *ReviewMessage {
	unsent := []*ReviewMessage{}
	for index := range discussion.Messages {
		message := &discussion.Messages[index]
		if message.Author == "human" && message.FeedbackID == "" {
			unsent = append(unsent, message)
		}
	}
	if len(unsent) != 1 || unsent[0].ID != id {
		return nil
	}
	return unsent[0]
}

func discussionInFlight(state ReviewState, discussionID string) bool {
	for _, batch := range state.Feedback {
		if !batch.RespondedAt.IsZero() {
			continue
		}
		for _, item := range batch.Items {
			if item.DiscussionID == discussionID {
				return true
			}
		}
	}
	return false
}

func asReviewFailure(err error, target **reviewFailure) bool {
	failure, ok := err.(*reviewFailure)
	if ok {
		*target = failure
	}
	return ok
}

func sortReviewDiscussions(state *ReviewState) {
	if state.Session != nil {
		sort.SliceStable(state.Session.Discussions, func(i, j int) bool {
			if state.Session.Discussions[i].State != state.Session.Discussions[j].State {
				return state.Session.Discussions[i].State == "open"
			}
			return state.Session.Discussions[i].CreatedAt.Before(state.Session.Discussions[j].CreatedAt)
		})
	}
}

func reviewResponseSize(response AgentFeedbackResponse) error {
	data, _ := json.Marshal(response)
	if len(data) > reviewResponseLimit {
		return invalidReviewResponse(fmt.Sprintf("response exceeds %d bytes", reviewResponseLimit))
	}
	return nil
}
