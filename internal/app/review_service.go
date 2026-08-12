package toudocu

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type reviewService struct {
	store    *reviewStore
	options  Options
	docsRoot string
	now      func() time.Time
}

func newReviewService(options Options) (*reviewService, error) {
	store, err := openReviewStore(options.RepositoryRoot)
	if err != nil {
		return nil, err
	}
	options.RepositoryRoot = store.repositoryRoot
	docsRoot := options.InputDirectory
	if strings.TrimSpace(docsRoot) == "" {
		state, loadErr := store.load()
		if loadErr != nil {
			return nil, loadErr
		}
		if state.DocsPath != "" {
			docsRoot = filepath.Join(store.repositoryRoot, filepath.FromSlash(state.DocsPath))
		} else {
			docsRoot = filepath.Join(store.repositoryRoot, "docs")
		}
	}
	docsRoot, err = resolvePathForSafety(docsRoot)
	if err != nil || !pathContains(store.repositoryRoot, docsRoot) {
		return nil, agentFailure("AGENT_INVALID_PATH", http.StatusForbidden, "canonical documentation root must stay inside the repository")
	}
	return &reviewService{store: store, options: options, docsRoot: docsRoot, now: func() time.Time { return time.Now().UTC() }}, nil
}

func (service *reviewService) discussions() (ReviewState, error) {
	state, err := service.store.load()
	if err != nil {
		return ReviewState{}, err
	}
	service.applyPlacements(&state)
	sortReviewDiscussions(&state)
	state.RepositoryRevision = service.repositoryRevision(state)
	return state, nil
}

func (service *reviewService) createDiscussion(request CreateDiscussionRequest) (ReviewState, error) {
	if err := validateHumanMessage(request.Intent, request.Text); err != nil {
		return ReviewState{}, err
	}
	anchor, target, err := service.captureAnchor(request.Target, request.Selection)
	if err != nil {
		return ReviewState{}, err
	}
	now := service.now()
	discussionID, err := newAgentID("DISC", now)
	if err != nil {
		return ReviewState{}, err
	}
	messageID, err := newAgentID("MSG", now.Add(time.Nanosecond))
	if err != nil {
		return ReviewState{}, err
	}
	result, err := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		if state.Session == nil {
			sessionID, idErr := newAgentID("SESS", now)
			if idErr != nil {
				return idErr
			}
			state.Session = &ReviewSession{ID: sessionID, CreatedAt: now, Discussions: []Discussion{}}
		}
		state.DocsPath = service.docsPath()
		state.Session.Discussions = append(state.Session.Discussions, Discussion{
			ID: discussionID, State: "open", Target: target, Anchor: anchor,
			Placement: placementFromTarget(target, "current", ""),
			Messages: []ReviewMessage{{
				ID: messageID, Author: "human", Intent: request.Intent, State: "draft", Text: strings.TrimSpace(request.Text),
				Evidence: []AgentEvidence{}, ChangedPaths: []string{}, CreatedAt: now,
			}},
			CreatedAt: now, UpdatedAt: now,
		})
		service.garbageCollect(state, now)
		return nil
	})
	return service.present(result), err
}

func (service *reviewService) createMessage(discussionID string, request CreateMessageRequest) (ReviewState, error) {
	if err := validateHumanMessage(request.Intent, request.Text); err != nil {
		return ReviewState{}, err
	}
	now := service.now()
	messageID, err := newAgentID("MSG", now)
	if err != nil {
		return ReviewState{}, err
	}
	result, err := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		discussion := findDiscussion(state, discussionID)
		if discussion == nil {
			return agentFailure("AGENT_DISCUSSION_NOT_FOUND", http.StatusNotFound, "discussion not found")
		}
		if discussion.State != "open" {
			return agentFailure("AGENT_INVALID_MESSAGE", http.StatusConflict, "a message can be added only to an open discussion")
		}
		if draftMessage(discussion) != nil || discussionInFlight(*state, discussionID, now) {
			return agentFailure("AGENT_REVISION_CONFLICT", http.StatusConflict, "finish the current draft or agent delivery first")
		}
		discussion.Messages = append(discussion.Messages, ReviewMessage{
			ID: messageID, Author: "human", Intent: request.Intent, State: "draft", Text: strings.TrimSpace(request.Text),
			Evidence: []AgentEvidence{}, ChangedPaths: []string{}, CreatedAt: now,
		})
		discussion.UpdatedAt = now
		service.garbageCollect(state, now)
		return nil
	})
	return service.present(result), err
}

func (service *reviewService) updateMessage(discussionID, messageID string, request UpdateMessageRequest) (ReviewState, error) {
	if err := validateHumanMessage(request.Intent, request.Text); err != nil {
		return ReviewState{}, err
	}
	now := service.now()
	result, err := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		discussion := findDiscussion(state, discussionID)
		message := findDraftMessage(discussion, messageID)
		if discussion == nil {
			return agentFailure("AGENT_DISCUSSION_NOT_FOUND", http.StatusNotFound, "discussion not found")
		}
		if message == nil {
			return agentFailure("AGENT_INVALID_MESSAGE", http.StatusConflict, "only a draft human message can be edited")
		}
		message.Intent, message.Text, message.EditedAt = request.Intent, strings.TrimSpace(request.Text), &now
		discussion.UpdatedAt = now
		return nil
	})
	return service.present(result), err
}

func (service *reviewService) deleteMessage(discussionID, messageID string, guard ReviewMutationGuard) (ReviewState, error) {
	now := service.now()
	result, err := service.store.mutate(guard, func(state *ReviewState) error {
		discussion := findDiscussion(state, discussionID)
		if discussion == nil {
			return agentFailure("AGENT_DISCUSSION_NOT_FOUND", http.StatusNotFound, "discussion not found")
		}
		if findDraftMessage(discussion, messageID) == nil {
			return agentFailure("AGENT_INVALID_MESSAGE", http.StatusConflict, "only a draft human message can be deleted")
		}
		for index := range discussion.Messages {
			if discussion.Messages[index].ID == messageID {
				discussion.Messages = append(discussion.Messages[:index], discussion.Messages[index+1:]...)
				break
			}
		}
		if len(discussion.Messages) == 0 {
			removeDiscussion(state, discussionID)
		} else {
			discussion.UpdatedAt = now
		}
		return nil
	})
	return service.present(result), err
}

func (service *reviewService) submitMessage(discussionID, messageID string, guard ReviewMutationGuard) (ReviewState, *AgentDelivery, error) {
	now := service.now()
	deliveryID, err := newAgentID("DEL", now)
	if err != nil {
		return ReviewState{}, nil, err
	}
	var delivery *AgentDelivery
	result, err := service.store.mutate(guard, func(state *ReviewState) error {
		discussion := findDiscussion(state, discussionID)
		if discussion == nil {
			return agentFailure("AGENT_DISCUSSION_NOT_FOUND", http.StatusNotFound, "discussion not found")
		}
		message := findDraftMessage(discussion, messageID)
		if message == nil || discussion.State != "open" {
			return agentFailure("AGENT_INVALID_MESSAGE", http.StatusConflict, "only a draft in an open discussion can be queued")
		}
		if discussionInFlight(*state, discussionID, now) {
			return agentFailure("AGENT_INBOX_BUSY", http.StatusConflict, "this discussion already has an unfinished delivery")
		}
		placement := service.reanchor(*discussion)
		if placement.Status == "deleted" {
			return agentFailure("AGENT_INVALID_TARGET", http.StatusConflict, "the selected document or fragment was deleted")
		}
		if placement.Range != nil {
			discussion.Target.Range = cloneReviewRange(placement.Range)
		}
		if refreshed, _, captureErr := service.captureAnchor(discussion.Target, nil); captureErr == nil {
			discussion.Anchor = refreshed
		}
		discussion.Placement = placement
		message.State, message.DeliveryID, message.SubmittedAt, message.EditedAt = "submitted", deliveryID, &now, nil
		state.NextSequence++
		created := AgentDelivery{
			SchemaVersion: reviewSchemaVersion, ID: deliveryID, Sequence: state.NextSequence, State: "pending",
			DiscussionID: discussionID, MessageIDs: []string{messageID}, CreatedAt: now,
		}
		state.Deliveries = append(state.Deliveries, created)
		discussion.UpdatedAt = now
		delivery = &created
		return nil
	})
	return service.present(result), delivery, err
}

func (service *reviewService) updateDiscussion(id string, request UpdateDiscussionRequest) (ReviewState, error) {
	if request.State != "open" && request.State != "resolved" {
		return ReviewState{}, agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "discussion state must be open or resolved")
	}
	now := service.now()
	result, err := service.store.mutate(request.ReviewMutationGuard, func(state *ReviewState) error {
		discussion := findDiscussion(state, id)
		if discussion == nil {
			return agentFailure("AGENT_DISCUSSION_NOT_FOUND", http.StatusNotFound, "discussion not found")
		}
		discussion.State, discussion.UpdatedAt = request.State, now
		service.garbageCollect(state, now)
		return nil
	})
	return service.present(result), err
}

func (service *reviewService) deleteDiscussion(id string, guard ReviewMutationGuard) (ReviewState, error) {
	result, err := service.store.mutate(guard, func(state *ReviewState) error {
		if findDiscussion(state, id) == nil {
			return agentFailure("AGENT_DISCUSSION_NOT_FOUND", http.StatusNotFound, "discussion not found")
		}
		removeDiscussion(state, id)
		kept := state.Deliveries[:0]
		for _, delivery := range state.Deliveries {
			if delivery.DiscussionID != id {
				kept = append(kept, delivery)
			}
		}
		state.Deliveries = kept
		return nil
	})
	return service.present(result), err
}

func (service *reviewService) claimNext() (AgentRequest, error) {
	now := service.now()
	request := AgentRequest{SchemaVersion: reviewSchemaVersion, Pending: false}
	state, err := service.store.update(func(state *ReviewState) (bool, error) {
		unfinished := unfinishedDeliveries(state)
		if len(unfinished) == 0 {
			return false, nil
		}
		delivery := unfinished[0]
		if delivery.State == "claimed" && delivery.LeaseExpiresAt != nil && delivery.LeaseExpiresAt.After(now) {
			return false, agentFailure("AGENT_INBOX_BUSY", http.StatusConflict, "the oldest delivery is claimed by another consumer")
		}
		leaseExpiresAt := now.Add(reviewClaimLease)
		delivery.State, delivery.ClaimedAt, delivery.LeaseExpiresAt = "claimed", &now, &leaseExpiresAt
		discussion := findDiscussion(state, delivery.DiscussionID)
		if discussion == nil {
			return false, corruptedReviewState("the oldest delivery has no discussion")
		}
		discussion.Placement = service.reanchor(*discussion)
		request = service.agentRequest(*state, *delivery, *discussion, len(unfinished))
		return true, nil
	})
	if err != nil {
		return AgentRequest{}, err
	}
	if !request.Pending {
		return request, nil
	}
	_ = state
	return request, nil
}

func (service *reviewService) respond(response AgentResponse) (ReviewState, error) {
	response = normalizeAgentResponse(response)
	if err := reviewResponseSize(response); err != nil {
		return ReviewState{}, err
	}
	if err := service.validateAgentResponse(response); err != nil {
		return ReviewState{}, err
	}
	data, _ := json.Marshal(response)
	responseDigest := digestBytes(data)
	now := service.now()
	result, err := service.store.update(func(state *ReviewState) (bool, error) {
		delivery := findDelivery(state, response.DeliveryID)
		if delivery == nil {
			return false, agentFailure("AGENT_DELIVERY_NOT_FOUND", http.StatusNotFound, "delivery not found")
		}
		if delivery.DiscussionID != response.DiscussionID {
			return false, agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "discussionId does not match delivery")
		}
		if delivery.State == "responded" {
			if delivery.ResponseDigest == responseDigest {
				return false, nil
			}
			return false, agentFailure("AGENT_RESPONSE_CONFLICT", http.StatusConflict, "the delivery already has a different response")
		}
		unfinished := unfinishedDeliveries(state)
		if len(unfinished) == 0 || unfinished[0].ID != delivery.ID {
			return false, agentFailure("AGENT_INBOX_BUSY", http.StatusConflict, "response must complete the oldest delivery")
		}
		discussion := findDiscussion(state, delivery.DiscussionID)
		if discussion == nil {
			return false, corruptedReviewState("delivery discussion disappeared")
		}
		human := messageByID(discussion, delivery.MessageIDs[0])
		if human == nil {
			return false, corruptedReviewState("delivery message disappeared")
		}
		if human.Intent == "question" && response.Outcome == "changed" {
			return false, agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "a question cannot report a documentation change")
		}
		if response.Outcome == "changed" && len(response.ChangedPaths) == 0 {
			return false, agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "changed requires at least one changedPaths entry")
		}
		for _, path := range response.ChangedPaths {
			if err := service.validateDocumentationPath(path, true); err != nil {
				return false, err
			}
		}
		messageID, idErr := newAgentID("MSG", now)
		if idErr != nil {
			return false, idErr
		}
		discussion.Messages = append(discussion.Messages, ReviewMessage{
			ID: messageID, Author: "agent", Text: response.Message, DeliveryID: delivery.ID, Outcome: response.Outcome,
			Evidence: append([]AgentEvidence{}, response.Evidence...), ChangedPaths: append([]string{}, response.ChangedPaths...), CreatedAt: now,
		})
		discussion.UpdatedAt = now
		delivery.State, delivery.RespondedAt, delivery.ResponseDigest = "responded", &now, responseDigest
		delivery.LeaseExpiresAt = nil
		return true, nil
	})
	return service.present(result), err
}

func (service *reviewService) agentRequest(state ReviewState, delivery AgentDelivery, discussion Discussion, pendingCount int) AgentRequest {
	placement := discussion.Placement
	target := AgentRequestTarget{
		Kind: discussion.Target.Kind, Path: placement.Path, DocumentID: discussion.Target.DocumentID,
		AnchorState: placement.Status, Range: cloneReviewRange(placement.Range),
	}
	if discussion.Anchor != nil {
		target.SelectedText = discussion.Anchor.SelectedText
	}
	head := ""
	if g, err := openGitRepositorySource(service.options.RepositoryRoot, 60); err == nil {
		head, _ = g.resolveCommit("HEAD")
	}
	return AgentRequest{
		SchemaVersion: reviewSchemaVersion, Pending: true, DeliveryID: delivery.ID, Discussion: &discussion, Target: &target,
		Repository: &AgentRepository{Head: head}, PendingCount: pendingCount, HasMore: pendingCount > 1,
	}
}

func (service *reviewService) captureAnchor(target ReviewTarget, selection *SelectionHint) (*DocumentAnchor, ReviewTarget, error) {
	if target.Kind == "" {
		target.Kind = "document"
	}
	if target.Kind != "document" {
		return nil, ReviewTarget{}, agentFailure("AGENT_INVALID_TARGET", http.StatusBadRequest, "MVP accepts only target.kind=document")
	}
	path, content, err := service.readDocumentation(target.Path)
	if err != nil {
		return nil, ReviewTarget{}, err
	}
	target.Path = path
	if selection != nil && target.Range == nil {
		selected := selection.SelectedText
		if len([]byte(selected)) > reviewSelectionLimit {
			return nil, ReviewTarget{}, agentFailure("AGENT_PAYLOAD_TOO_LARGE", http.StatusRequestEntityTooLarge, "selectedText exceeds 32 KiB")
		}
		matches := allByteMatches(content, []byte(selected))
		occurrence := max(1, selection.Occurrence)
		if strings.TrimSpace(selected) == "" || occurrence > len(matches) {
			return nil, ReviewTarget{}, agentFailure("AGENT_INVALID_TARGET", http.StatusConflict, "selected text occurrence was not found in the current document")
		}
		match := matches[occurrence-1]
		target.Range = &ReviewRange{Start: offsetReviewPosition(content, match), End: offsetReviewPosition(content, match+len(selected))}
	}
	selected, before, after, err := extractReviewSelection(content, target)
	if err != nil {
		return nil, ReviewTarget{}, err
	}
	if len([]byte(selected)) > reviewSelectionLimit {
		return nil, ReviewTarget{}, agentFailure("AGENT_PAYLOAD_TOO_LARGE", http.StatusRequestEntityTooLarge, "selectedText exceeds 32 KiB")
	}
	return &DocumentAnchor{
		Kind: "document", Path: path, DocumentID: target.DocumentID, SourceDigest: "sha256:" + digestBytes(content),
		Range: cloneReviewRange(target.Range), SelectedText: selected, ContextBefore: before, ContextAfter: after,
	}, target, nil
}

func (service *reviewService) readDocumentation(requested string) (string, []byte, error) {
	g, err := openGitRepositorySource(service.options.RepositoryRoot, 60)
	if err != nil {
		return "", nil, err
	}
	path, err := validateReviewPath(g, requested)
	if err != nil {
		return "", nil, mapReviewPathError(err)
	}
	if err := service.validateDocumentationPath(path, false); err != nil {
		return "", nil, err
	}
	content, err := readReviewText(g, ChangeSide{Type: "working-tree"}, path)
	if err != nil {
		return "", nil, mapReviewPathError(err)
	}
	return path, content, nil
}

func (service *reviewService) validateDocumentationPath(requested string, allowMissing bool) error {
	g, err := openGitRepositorySource(service.options.RepositoryRoot, 60)
	if err != nil {
		return err
	}
	path, err := validateReviewPath(g, requested)
	if err != nil {
		return mapReviewPathError(err)
	}
	absolute := filepath.Join(g.root, filepath.FromSlash(path))
	if !pathContains(service.docsRoot, absolute) || !strings.EqualFold(filepath.Ext(path), ".md") {
		return agentFailure("AGENT_INVALID_PATH", http.StatusForbidden, "path must be a Markdown file inside the canonical documentation root")
	}
	if allowMissing {
		if err := validateReviewChangedPath(g, path); err != nil {
			return mapReviewPathError(err)
		}
	}
	return nil
}

func mapReviewPathError(err error) error {
	var failure *reviewFailure
	if !errors.As(err, &failure) {
		return err
	}
	code := "AGENT_INVALID_PATH"
	if failure.Code == "REVIEW_NOT_FOUND" {
		code = "AGENT_INVALID_TARGET"
	} else if strings.Contains(strings.ToLower(failure.Message), "escapes the repository") {
		code = "AGENT_PATH_OUTSIDE_ROOT"
	}
	return agentFailure(code, failure.Status, failure.Message)
}

func extractReviewSelection(content []byte, target ReviewTarget) (string, string, string, error) {
	if target.Range == nil {
		return "", truncateUTF8End(content, reviewContextByteSize), "", nil
	}
	start, err := reviewPositionOffset(content, target.Range.Start)
	if err != nil {
		return "", "", "", err
	}
	end, err := reviewPositionOffset(content, target.Range.End)
	if err != nil || end <= start {
		return "", "", "", agentFailure("AGENT_INVALID_TARGET", http.StatusBadRequest, "document range is empty or outside the file")
	}
	return string(content[start:end]), truncateUTF8Start(content[max(0, start-reviewContextByteSize):start], reviewContextByteSize), truncateUTF8End(content[end:min(len(content), end+reviewContextByteSize)], reviewContextByteSize), nil
}

func reviewPositionOffset(content []byte, position ReviewPosition) (int, error) {
	if position.Line < 1 || position.Column < 1 {
		return 0, agentFailure("AGENT_INVALID_TARGET", http.StatusBadRequest, "line and column must be 1-based")
	}
	line, offset := 1, 0
	for line < position.Line {
		newline := bytes.IndexByte(content[offset:], '\n')
		if newline < 0 {
			return 0, agentFailure("AGENT_INVALID_TARGET", http.StatusBadRequest, "line is outside the file")
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
		return 0, agentFailure("AGENT_INVALID_TARGET", http.StatusUnsupportedMediaType, "document source is not UTF-8")
	}
	runes := []rune(string(lineContent))
	if position.Column > len(runes)+1 {
		return 0, agentFailure("AGENT_INVALID_TARGET", http.StatusBadRequest, "column is outside the line")
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
	return AnchorPlacement{Status: status, Path: target.Path, Range: cloneReviewRange(target.Range), Reason: reason}
}

func (service *reviewService) reanchor(discussion Discussion) AnchorPlacement {
	if discussion.Anchor == nil {
		return placementFromTarget(discussion.Target, "stale", "anchor is missing")
	}
	anchor := discussion.Anchor
	_, content, err := service.readDocumentation(anchor.Path)
	if err != nil {
		return AnchorPlacement{Status: "deleted", Path: anchor.Path, Reason: "document was deleted"}
	}
	if anchor.Range == nil {
		return AnchorPlacement{Status: "current", Path: anchor.Path}
	}
	if "sha256:"+digestBytes(content) == anchor.SourceDigest {
		return AnchorPlacement{Status: "current", Path: anchor.Path, Range: cloneReviewRange(anchor.Range)}
	}
	matches := allByteMatches(content, []byte(anchor.SelectedText))
	if anchor.Range != nil {
		window := []int{}
		for _, offset := range matches {
			line := 1 + bytes.Count(content[:offset], []byte{'\n'})
			if line >= anchor.Range.Start.Line-20 && line <= anchor.Range.Start.Line+20 {
				window = append(window, offset)
			}
		}
		if len(window) == 1 {
			return placementForOffsets(content, anchor.Path, window[0], window[0]+len(anchor.SelectedText), "moved", "exact text found near the original range")
		}
	}
	if len(matches) == 1 {
		return placementForOffsets(content, anchor.Path, matches[0], matches[0]+len(anchor.SelectedText), "moved", "unique exact text")
	}
	if from, to, unique := uniqueReviewContextPair(content, anchor.ContextBefore, anchor.ContextAfter); unique {
		status, reason := "moved", "unique surrounding context"
		if from == to {
			status, reason = "deleted", "selected fragment was deleted"
		}
		return placementForOffsets(content, anchor.Path, from, to, status, reason)
	}
	return AnchorPlacement{Status: "stale", Path: anchor.Path, Reason: "anchor cannot be matched unambiguously"}
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
			if after-from <= reviewSelectionLimit {
				pairs = append(pairs, [2]int{from, after})
			}
		}
	}
	if len(pairs) != 1 {
		return 0, 0, false
	}
	return pairs[0][0], pairs[0][1], true
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

func placementForOffsets(content []byte, path string, start, end int, status, reason string) AnchorPlacement {
	return AnchorPlacement{Status: status, Path: path, Range: &ReviewRange{Start: offsetReviewPosition(content, start), End: offsetReviewPosition(content, end)}, Reason: reason}
}

func offsetReviewPosition(content []byte, offset int) ReviewPosition {
	lineStart := bytes.LastIndexByte(content[:offset], '\n') + 1
	return ReviewPosition{Line: 1 + bytes.Count(content[:offset], []byte{'\n'}), Column: 1 + utf8.RuneCount(content[lineStart:offset])}
}

func cloneReviewRange(value *ReviewRange) *ReviewRange {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func validateHumanMessage(intent, message string) error {
	if intent != "question" && intent != "change_request" {
		return agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "intent must be question or change_request")
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "message must not be empty")
	}
	if len([]byte(message)) > reviewMessageLimit {
		return agentFailure("AGENT_PAYLOAD_TOO_LARGE", http.StatusRequestEntityTooLarge, "human message exceeds 64 KiB")
	}
	return nil
}

func (service *reviewService) validateAgentResponse(response AgentResponse) error {
	if response.SchemaVersion != reviewSchemaVersion || response.DeliveryID == "" || response.DiscussionID == "" || !validReviewOutcome(response.Outcome) || strings.TrimSpace(response.Message) == "" {
		return agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "agent response is incomplete or invalid")
	}
	if len([]byte(response.Message)) > reviewMessageLimit {
		return agentFailure("AGENT_PAYLOAD_TOO_LARGE", http.StatusRequestEntityTooLarge, "agent response exceeds 64 KiB")
	}
	if len(response.Evidence) > 256 || len(response.ChangedPaths) > 256 {
		return agentFailure("AGENT_PAYLOAD_TOO_LARGE", http.StatusRequestEntityTooLarge, "agent response contains too many paths")
	}
	g, err := openGitRepositorySource(service.options.RepositoryRoot, 60)
	if err != nil {
		return err
	}
	for _, evidence := range response.Evidence {
		if evidence.StartLine < 0 || evidence.EndLine < evidence.StartLine {
			return agentFailure("AGENT_INVALID_MESSAGE", http.StatusBadRequest, "evidence line range is invalid")
		}
		if _, err := validateReviewPath(g, evidence.Path); err != nil {
			return mapReviewPathError(err)
		}
	}
	return nil
}

func normalizeAgentResponse(response AgentResponse) AgentResponse {
	response.Message = strings.TrimSpace(response.Message)
	if response.Evidence == nil {
		response.Evidence = []AgentEvidence{}
	}
	if response.ChangedPaths == nil {
		response.ChangedPaths = []string{}
	}
	return response
}

func validReviewOutcome(outcome string) bool {
	return outcome == "answered" || outcome == "changed" || outcome == "no_change" || outcome == "needs_clarification" || outcome == "failed"
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

func messageByID(discussion *Discussion, id string) *ReviewMessage {
	if discussion == nil {
		return nil
	}
	for index := range discussion.Messages {
		if discussion.Messages[index].ID == id {
			return &discussion.Messages[index]
		}
	}
	return nil
}

func findDraftMessage(discussion *Discussion, id string) *ReviewMessage {
	message := messageByID(discussion, id)
	if message == nil || message.Author != "human" || message.State != "draft" {
		return nil
	}
	return message
}

func draftMessage(discussion *Discussion) *ReviewMessage {
	if discussion == nil {
		return nil
	}
	for index := range discussion.Messages {
		if discussion.Messages[index].Author == "human" && discussion.Messages[index].State == "draft" {
			return &discussion.Messages[index]
		}
	}
	return nil
}

func findDelivery(state *ReviewState, id string) *AgentDelivery {
	for index := range state.Deliveries {
		if state.Deliveries[index].ID == id {
			return &state.Deliveries[index]
		}
	}
	return nil
}

func unfinishedDeliveries(state *ReviewState) []*AgentDelivery {
	result := []*AgentDelivery{}
	for index := range state.Deliveries {
		if state.Deliveries[index].State != "responded" {
			result = append(result, &state.Deliveries[index])
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].Sequence < result[j].Sequence })
	return result
}

func discussionInFlight(state ReviewState, discussionID string, _ time.Time) bool {
	for _, delivery := range state.Deliveries {
		if delivery.DiscussionID == discussionID && delivery.State != "responded" {
			return true
		}
	}
	return false
}

func sortReviewDiscussions(state *ReviewState) {
	if state.Session == nil {
		return
	}
	sort.SliceStable(state.Session.Discussions, func(i, j int) bool {
		if state.Session.Discussions[i].State != state.Session.Discussions[j].State {
			return state.Session.Discussions[i].State == "open"
		}
		return state.Session.Discussions[i].CreatedAt.Before(state.Session.Discussions[j].CreatedAt)
	})
}

func (service *reviewService) present(state ReviewState) ReviewState {
	sortReviewDiscussions(&state)
	return state
}

func (service *reviewService) applyPlacements(state *ReviewState) {
	if state.Session == nil {
		return
	}
	for index := range state.Session.Discussions {
		state.Session.Discussions[index].Placement = service.reanchor(state.Session.Discussions[index])
	}
}

func (service *reviewService) repositoryRevision(state ReviewState) string {
	parts := []string{}
	if g, err := openGitRepositorySource(service.options.RepositoryRoot, 60); err == nil {
		head, _ := g.resolveCommit("HEAD")
		parts = append(parts, head)
	}
	paths := map[string]bool{}
	if state.Session != nil {
		for _, discussion := range state.Session.Discussions {
			paths[discussion.Target.Path] = true
		}
	}
	ordered := make([]string, 0, len(paths))
	for path := range paths {
		ordered = append(ordered, path)
	}
	sort.Strings(ordered)
	for _, path := range ordered {
		content, err := os.ReadFile(filepath.Join(service.options.RepositoryRoot, filepath.FromSlash(path)))
		if err != nil {
			parts = append(parts, path+"\x00deleted")
		} else {
			parts = append(parts, path+"\x00"+digestBytes(content))
		}
	}
	return digestBytes([]byte(strings.Join(parts, "\x00")))
}

func (service *reviewService) docsPath() string {
	rel, err := filepath.Rel(service.options.RepositoryRoot, service.docsRoot)
	if err != nil {
		return "docs"
	}
	return filepath.ToSlash(rel)
}

func (service *reviewService) garbageCollect(state *ReviewState, now time.Time) {
	if state.Session == nil {
		return
	}
	removable := map[string]bool{}
	for _, discussion := range state.Session.Discussions {
		if discussion.State == "resolved" && now.Sub(discussion.UpdatedAt) >= reviewResolvedRetention && !discussionInFlight(*state, discussion.ID, now) {
			removable[discussion.ID] = true
		}
	}
	if len(removable) == 0 {
		return
	}
	discussions := state.Session.Discussions[:0]
	for _, discussion := range state.Session.Discussions {
		if !removable[discussion.ID] {
			discussions = append(discussions, discussion)
		}
	}
	state.Session.Discussions = discussions
	deliveries := state.Deliveries[:0]
	for _, delivery := range state.Deliveries {
		if !removable[delivery.DiscussionID] {
			deliveries = append(deliveries, delivery)
		}
	}
	state.Deliveries = deliveries
}

func agentFailure(code string, status int, message string) error {
	return &reviewFailure{Code: code, Status: status, Message: message}
}

func reviewResponseSize(response AgentResponse) error {
	data, _ := json.Marshal(response)
	if len(data) > reviewResponseLimit {
		return agentFailure("AGENT_PAYLOAD_TOO_LARGE", http.StatusRequestEntityTooLarge, "agent response exceeds 64 KiB")
	}
	return nil
}
