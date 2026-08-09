package toudocu

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func newReviewRepository(t *testing.T) (string, string) {
	t.Helper()
	root, docs := newChangesRepository(t)
	writeChangesTestFile(t, filepath.Join(root, "server.go"), "package main\n\nfunc hello() {\n\tprintln(\"привет\")\n}\n")
	writeChangesTestFile(t, filepath.Join(root, "path.go"), "package main\n\nfunc path() string { return \"old\" }\n")
	gitTestRun(t, root, "add", "server.go", "path.go")
	gitTestRun(t, root, "commit", "-q", "-m", "review baseline")
	return root, docs
}

func reviewOptions(root, docs string) Options {
	return Options{RepositoryRoot: root, InputDirectory: docs, ChangeBase: "HEAD", ChangeTarget: "working-tree", ChangeRenameSimilarity: 60}
}

func TestRepositoryReviewProjectionAndFile(t *testing.T) {
	root, docs := newReviewRepository(t)
	writeChangesTestFile(t, filepath.Join(root, "server.go"), "package main\n\nfunc hello() {\n\tprintln(\"hello\")\n}\n")
	writeChangesTestFile(t, filepath.Join(root, "new.js"), "export const value = 1;\n")
	report, err := BuildRepositoryReview(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	if !report.FeedbackWritable || report.RepositoryRevision == "" || len(report.Files) != 2 {
		t.Fatalf("report=%#v", report)
	}
	paths := map[string]RepositoryReviewFile{}
	for _, file := range report.Files {
		paths[file.Path] = file
	}
	if paths["server.go"].Language != "go" || paths["new.js"].Status != "untracked" || paths["new.js"].Language != "javascript" {
		t.Fatalf("files=%#v", paths)
	}
	detail, err := BuildRepositoryReviewFile(reviewOptions(root, docs), "server.go")
	if err != nil || detail.Current == nil || detail.Before == nil || !strings.Contains(detail.Patch, "hello") || len(detail.Hunks) == 0 {
		t.Fatalf("detail=%#v err=%v", detail, err)
	}
	linked, err := BuildRepositoryReviewFile(reviewOptions(root, docs), "path.go")
	if err != nil || linked.File.Status != "linked" || linked.Current == nil {
		t.Fatalf("linked=%#v err=%v", linked, err)
	}
	readonly := reviewOptions(root, docs)
	readonly.ChangeTarget = "HEAD"
	readonlyReport, err := BuildRepositoryReview(readonly)
	if err != nil || readonlyReport.FeedbackWritable {
		t.Fatalf("readonly=%#v err=%v", readonlyReport, err)
	}
	arbitrary := reviewOptions(root, docs)
	arbitrary.ChangeBase = gitTestRun(t, root, "rev-parse", "HEAD~1")
	arbitrary.ChangeTarget = "HEAD"
	arbitraryReport, err := BuildRepositoryReview(arbitrary)
	if err != nil || arbitraryReport.Comparison.Base.Resolved == "" || arbitraryReport.Comparison.Target.Resolved == "" || len(arbitraryReport.Files) < 2 || arbitraryReport.FeedbackWritable {
		t.Fatalf("arbitrary=%#v err=%v", arbitraryReport, err)
	}
}

func TestRepositoryReviewRevisionTracksUntrackedBytes(t *testing.T) {
	root, docs := newReviewRepository(t)
	path := filepath.Join(root, "draft.txt")
	writeChangesTestFile(t, path, "first\n")
	first, err := BuildRepositoryReview(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	writeChangesTestFile(t, path, "second\n")
	second, err := BuildRepositoryReview(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	if first.RepositoryRevision == second.RepositoryRevision {
		t.Fatal("repository revision did not change when only untracked bytes changed")
	}
}

func TestReviewUnsafeBinaryAndLargeSource(t *testing.T) {
	root, docs := newReviewRepository(t)
	if _, err := BuildRepositoryReviewFile(reviewOptions(root, docs), "../.git/config"); reviewErrorCode(err) != "REVIEW_UNSAFE_PATH" {
		t.Fatalf("traversal err=%v", err)
	}
	if _, err := BuildRepositoryReviewFile(reviewOptions(root, docs), ".git/config"); reviewErrorCode(err) != "REVIEW_UNSAFE_PATH" {
		t.Fatalf("git err=%v", err)
	}
	writeChangesTestFile(t, filepath.Join(root, "binary.bin"), "a\x00b")
	if _, err := BuildRepositoryReviewFile(reviewOptions(root, docs), "binary.bin"); reviewErrorCode(err) != "REVIEW_BINARY" {
		t.Fatalf("binary err=%v", err)
	}
	writeChangesTestFile(t, filepath.Join(root, "large.txt"), strings.Repeat("x", reviewSnapshotLimit+1))
	if _, err := BuildRepositoryReviewFile(reviewOptions(root, docs), "large.txt"); reviewErrorCode(err) != "REVIEW_TOO_LARGE" {
		t.Fatalf("large err=%v", err)
	}
	outside := filepath.Join(t.TempDir(), "outside.txt")
	writeChangesTestFile(t, outside, "outside")
	if err := os.Symlink(outside, filepath.Join(root, "linked.txt")); err == nil {
		if _, err := BuildRepositoryReviewFile(reviewOptions(root, docs), "linked.txt"); reviewErrorCode(err) != "REVIEW_UNSAFE_PATH" {
			t.Fatalf("symlink err=%v", err)
		}
	}
}

func TestReviewStoreDiscussionFeedbackResponseAndReanchor(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	initial, err := service.discussions()
	if err != nil || initial.Revision != 0 || initial.StateDigest == "" || initial.Session != nil {
		t.Fatalf("initial=%#v err=%v", initial, err)
	}
	report, err := BuildRepositoryReview(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	created, err := service.createDiscussion(CreateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: initial.Revision, ExpectedStateDigest: initial.StateDigest},
		RepositoryRevision:  report.RepositoryRevision,
		Target:              ReviewTarget{Type: "fileRange", Path: "server.go", Start: &ReviewPosition{Line: 3, Column: 6}, End: &ReviewPosition{Line: 3, Column: 11}},
		Type:                "issue", Message: "Проверь имя функции",
	})
	if err != nil || created.Session == nil || len(created.Session.Discussions) != 1 {
		t.Fatalf("created=%#v err=%v", created, err)
	}
	discussion := created.Session.Discussions[0]
	if discussion.Anchor == nil || discussion.Anchor.SelectedText != "hello" || discussion.Anchor.SnapshotRef == "" {
		t.Fatalf("anchor=%#v", discussion.Anchor)
	}
	restarted, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := restarted.discussions()
	if err != nil || reloaded.Session.ID != created.Session.ID {
		t.Fatalf("reloaded=%#v err=%v", reloaded, err)
	}
	feedbackState, batch, err := restarted.createFeedback(ReviewMutationGuard{ExpectedRevision: reloaded.Revision, ExpectedStateDigest: reloaded.StateDigest})
	if err != nil || batch == nil || len(batch.Items) != 1 || feedbackState.Revision != reloaded.Revision+1 {
		t.Fatalf("batch=%#v state=%#v err=%v", batch, feedbackState, err)
	}
	if _, err := restarted.updateDiscussion(discussion.ID, UpdateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: feedbackState.Revision, ExpectedStateDigest: feedbackState.StateDigest},
		Operation:           "edit", MessageID: discussion.Messages[0].ID, Type: "issue", Message: "Нельзя изменить",
	}); reviewErrorCode(err) != "REVIEW_INVALID_STATE" {
		t.Fatalf("sent message edit err=%v", err)
	}
	if _, err := restarted.updateDiscussion(discussion.ID, UpdateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: feedbackState.Revision, ExpectedStateDigest: feedbackState.StateDigest},
		Operation:           "reply", Type: "question", Message: "Нельзя ответить in-flight",
	}); reviewErrorCode(err) != "REVIEW_CONFLICT" {
		t.Fatalf("in-flight reply err=%v", err)
	}
	pendingOne, _ := restarted.pendingFeedback()
	pendingTwo, _ := restarted.pendingFeedback()
	if pendingOne.Feedback == nil || pendingTwo.Feedback == nil || pendingOne.Feedback.ID != pendingTwo.Feedback.ID {
		t.Fatalf("pending not stable: %#v %#v", pendingOne, pendingTwo)
	}
	bad := AgentFeedbackResponse{SchemaVersion: 1, ReviewID: batch.ReviewID, FeedbackID: batch.ID, FeedbackDigest: batch.Digest, ExpectedRevision: pendingOne.Revision, ExpectedStateDigest: pendingOne.StateDigest}
	if _, err := restarted.respond(bad); reviewErrorCode(err) != "REVIEW_INVALID_RESPONSE" {
		t.Fatalf("bad response err=%v", err)
	}
	afterBad, _ := restarted.pendingFeedback()
	if afterBad.Revision != pendingOne.Revision || afterBad.Feedback == nil {
		t.Fatalf("invalid response mutated state: %#v", afterBad)
	}
	response := bad
	response.Results = []AgentFeedbackResult{{ItemID: batch.Items[0].ID, Outcome: "fixed", Message: "Исправлено", ChangedPaths: []string{"server.go"}}}
	responded, err := restarted.respond(response)
	if err != nil {
		t.Fatal(err)
	}
	if responded.Session.Discussions[0].State != "open" || len(responded.Session.Discussions[0].Messages) != 2 || responded.Session.Discussions[0].Messages[1].Outcome != "fixed" {
		t.Fatalf("response auto-resolved or missing: %#v", responded.Session.Discussions[0])
	}
	empty, _ := restarted.pendingFeedback()
	if empty.Feedback != nil {
		t.Fatalf("completed feedback remained pending: %#v", empty)
	}
	writeChangesTestFile(t, filepath.Join(root, "server.go"), "package main\n\nfunc welcome() {\n\tprintln(\"привет\")\n}\n")
	lineMapped, err := restarted.discussions()
	if err != nil || lineMapped.Session.Discussions[0].Placement.Status != "moved" || lineMapped.Session.Discussions[0].Placement.Start.Line != 3 || !strings.Contains(lineMapped.Session.Discussions[0].Placement.Reason, "Git line mapping") {
		t.Fatalf("line-mapped placement=%#v err=%v", lineMapped.Session.Discussions[0].Placement, err)
	}
	writeChangesTestFile(t, filepath.Join(root, "server.go"), "// inserted\npackage main\n\nfunc hello() {\n\tprintln(\"привет\")\n}\n")
	reanchored, err := restarted.discussions()
	if err != nil || reanchored.Session.Discussions[0].Placement.Status != "moved" || reanchored.Session.Discussions[0].Placement.Start.Line != 4 {
		t.Fatalf("placement=%#v err=%v", reanchored.Session.Discussions[0].Placement, err)
	}
	writeChangesTestFile(t, filepath.Join(root, "server.go"), "// inserted\npackage main\n\nfunc () {\n\tprintln(\"привет\")\n}\n")
	deletedFragment, err := restarted.discussions()
	if err != nil || deletedFragment.Session.Discussions[0].Placement.Status != "deleted" {
		t.Fatalf("deleted fragment placement=%#v err=%v", deletedFragment.Session.Discussions[0].Placement, err)
	}
}

func TestReviewDiscussionMutationsAndCleanup(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	state, _ := service.discussions()
	report, _ := BuildRepositoryReview(reviewOptions(root, docs))
	state, err = service.createDiscussion(CreateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest},
		RepositoryRevision:  report.RepositoryRevision,
		Target:              ReviewTarget{Type: "global"}, Type: "question", Message: "Исходное сообщение",
	})
	if err != nil {
		t.Fatal(err)
	}
	discussion := state.Session.Discussions[0]
	state, err = service.updateDiscussion(discussion.ID, UpdateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest},
		Operation:           "edit", MessageID: discussion.Messages[0].ID, Type: "suggestion", Message: "Изменённое сообщение",
	})
	if err != nil || state.Session.Discussions[0].Messages[0].Body != "Изменённое сообщение" || state.Session.Discussions[0].Messages[0].EditedAt.IsZero() {
		t.Fatalf("edited state=%#v err=%v", state, err)
	}
	state, err = service.updateDiscussion(discussion.ID, UpdateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest},
		Operation:           "delete", MessageID: discussion.Messages[0].ID,
	})
	if err != nil || len(state.Session.Discussions) != 0 {
		t.Fatalf("deleted state=%#v err=%v", state, err)
	}
	for index, message := range []string{"Закрыть", "Оставить"} {
		state, err = service.createDiscussion(CreateDiscussionRequest{
			ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest},
			RepositoryRevision:  report.RepositoryRevision,
			Target:              ReviewTarget{Type: "global"}, Type: "issue", Message: message,
		})
		if err != nil {
			t.Fatalf("create %d: %v", index, err)
		}
	}
	closedID := state.Session.Discussions[0].ID
	state, err = service.updateDiscussion(closedID, UpdateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest},
		Operation:           "resolve",
	})
	if err != nil || state.Session.Discussions[0].State != "resolved" {
		t.Fatalf("resolved state=%#v err=%v", state, err)
	}
	state, err = service.cleanup(CleanupReviewRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest}, Mode: "closed",
	})
	if err != nil || len(state.Session.Discussions) != 1 || state.Session.Discussions[0].ID == closedID {
		t.Fatalf("closed cleanup state=%#v err=%v", state, err)
	}
	previousSession := state.Session.ID
	state, err = service.cleanup(CleanupReviewRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest}, Mode: "all", Confirm: true,
	})
	if err != nil || state.Session.ID == previousSession || len(state.Session.Discussions) != 0 || len(state.Feedback) != 0 {
		t.Fatalf("full cleanup state=%#v err=%v", state, err)
	}
}

func TestReviewFeedbackResponseEnforcesFIFO(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	state, _ := service.discussions()
	report, _ := BuildRepositoryReview(reviewOptions(root, docs))
	create := func(message string) {
		state, err = service.createDiscussion(CreateDiscussionRequest{
			ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest},
			RepositoryRevision:  report.RepositoryRevision,
			Target:              ReviewTarget{Type: "global"}, Type: "issue", Message: message,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	create("Первый batch")
	state, first, err := service.createFeedback(ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest})
	if err != nil {
		t.Fatal(err)
	}
	create("Второй batch")
	state, second, err := service.createFeedback(ReviewMutationGuard{ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest})
	if err != nil {
		t.Fatal(err)
	}
	response := AgentFeedbackResponse{
		SchemaVersion: reviewSchemaVersion, ReviewID: second.ReviewID, FeedbackID: second.ID, FeedbackDigest: second.Digest,
		ExpectedRevision: state.Revision, ExpectedStateDigest: state.StateDigest,
		Results: []AgentFeedbackResult{{ItemID: second.Items[0].ID, Outcome: "fixed", Message: "Второй", ChangedPaths: []string{}}},
	}
	if _, err := service.respond(response); reviewErrorCode(err) != "REVIEW_INVALID_RESPONSE" {
		t.Fatalf("out-of-order response err=%v", err)
	}
	pending, err := service.pendingFeedback()
	if err != nil || pending.Feedback == nil || pending.Feedback.ID != first.ID || pending.Revision != state.Revision {
		t.Fatalf("pending=%#v err=%v", pending, err)
	}
}

func TestReviewCleanupCorruptionAndBusyState(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	initial, _ := service.discussions()
	if _, err := service.cleanup(CleanupReviewRequest{ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: initial.Revision, ExpectedStateDigest: initial.StateDigest}, Mode: "all"}); reviewErrorCode(err) != "REVIEW_CONFIRMATION_REQUIRED" {
		t.Fatalf("cleanup confirmation err=%v", err)
	}
	if err := os.MkdirAll(service.store.directory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(service.store.statePath, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.discussions(); reviewErrorCode(err) != "REVIEW_STATE_CORRUPTED" {
		t.Fatalf("corrupted err=%v", err)
	}
	content, _ := os.ReadFile(service.store.statePath)
	if string(content) != "{" {
		t.Fatalf("corrupted state was overwritten: %q", content)
	}
}

func TestReviewCASConcurrentWritersAndBusyLock(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	initial, _ := service.discussions()
	report, _ := BuildRepositoryReview(reviewOptions(root, docs))
	request := CreateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: initial.Revision, ExpectedStateDigest: initial.StateDigest},
		RepositoryRevision:  report.RepositoryRevision,
		Target:              ReviewTarget{Type: "global"}, Type: "question", Message: "concurrent",
	}
	var wait sync.WaitGroup
	wait.Add(2)
	errors := make(chan error, 2)
	for range 2 {
		go func() {
			defer wait.Done()
			_, createErr := service.createDiscussion(request)
			errors <- createErr
		}()
	}
	wait.Wait()
	close(errors)
	successes, conflicts := 0, 0
	for createErr := range errors {
		if createErr == nil {
			successes++
		} else if reviewErrorCode(createErr) == "REVIEW_CONFLICT" {
			conflicts++
		} else {
			t.Fatalf("unexpected concurrent error: %v", createErr)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
	}

	if err := os.MkdirAll(service.store.directory, 0o700); err != nil {
		t.Fatal(err)
	}
	lock, err := os.OpenFile(service.store.lockPath, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if err := lockReviewFile(lock); err != nil {
		_ = lock.Close()
		t.Fatal(err)
	}
	defer func() {
		_ = unlockReviewFile(lock)
		_ = lock.Close()
	}()
	current, _ := service.discussions()
	_, err = service.cleanup(CleanupReviewRequest{ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: current.Revision, ExpectedStateDigest: current.StateDigest}, Mode: "closed"})
	if reviewErrorCode(err) != "REVIEW_STATE_BUSY" {
		t.Fatalf("busy lock err=%v", err)
	}
}

func TestReviewConflictDoesNotRetainSnapshot(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	report, _ := BuildRepositoryReview(reviewOptions(root, docs))
	_, err = service.createDiscussion(CreateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: 99, ExpectedStateDigest: "stale"},
		RepositoryRevision:  report.RepositoryRevision,
		Target:              ReviewTarget{Type: "file", Path: "server.go"}, Type: "issue", Message: "stale",
	})
	if reviewErrorCode(err) != "REVIEW_CONFLICT" {
		t.Fatalf("conflict err=%v", err)
	}
	entries, readErr := os.ReadDir(service.store.snapshotsPath)
	if readErr != nil && !os.IsNotExist(readErr) {
		t.Fatal(readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("orphan snapshots=%v", entries)
	}
}

func TestReviewHTTPAndCLI(t *testing.T) {
	root, docs := newReviewRepository(t)
	t.Setenv("TOUDOCU_STATE_HOME", t.TempDir())
	server := &documentationServer{options: reviewOptions(root, docs), changesCache: map[string]*ChangeSetReport{}}
	request := httptest.NewRequest(http.MethodGet, reviewAPIBase+"/repository/changes", nil)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"feedbackWritable":true`) {
		t.Fatalf("repository HTTP: %d %s", response.Code, response.Body.String())
	}
	unsafe := httptest.NewRecorder()
	server.ServeHTTP(unsafe, httptest.NewRequest(http.MethodGet, reviewAPIBase+"/repository/file?path=%252e%252e%252f.git%252fconfig", nil))
	if unsafe.Code != http.StatusForbidden || !strings.Contains(unsafe.Body.String(), "REVIEW_UNSAFE_PATH") {
		t.Fatalf("unsafe HTTP: %d %s", unsafe.Code, unsafe.Body.String())
	}
	var stdout, stderr strings.Builder
	if code := RunCLI([]string{"changes", "feedback", "pending", "--repository-root", root, "--json"}, &stdout, &stderr); code != 0 {
		t.Fatalf("pending exit=%d stderr=%s", code, stderr.String())
	}
	var pending PendingFeedbackEnvelope
	if err := json.Unmarshal([]byte(stdout.String()), &pending); err != nil || pending.SchemaVersion != 1 || pending.Feedback != nil {
		t.Fatalf("pending=%#v err=%v", pending, err)
	}

	service, err := newReviewService(reviewOptions(root, docs))
	if err != nil {
		t.Fatal(err)
	}
	initial, _ := service.discussions()
	report, _ := BuildRepositoryReview(reviewOptions(root, docs))
	created, err := service.createDiscussion(CreateDiscussionRequest{
		ReviewMutationGuard: ReviewMutationGuard{ExpectedRevision: initial.Revision, ExpectedStateDigest: initial.StateDigest},
		RepositoryRevision:  report.RepositoryRevision,
		Target:              ReviewTarget{Type: "global"}, Type: "question", Message: "Что изменилось?",
	})
	if err != nil {
		t.Fatal(err)
	}
	firstDiscussions := httptest.NewRecorder()
	server.ServeHTTP(firstDiscussions, httptest.NewRequest(http.MethodGet, reviewAPIBase+"/discussions", nil))
	firstETag := firstDiscussions.Header().Get("ETag")
	writeChangesTestFile(t, filepath.Join(root, "server.go"), "package main\n\nfunc changed() {}\n")
	secondRequest := httptest.NewRequest(http.MethodGet, reviewAPIBase+"/discussions", nil)
	secondRequest.Header.Set("If-None-Match", firstETag)
	secondDiscussions := httptest.NewRecorder()
	server.ServeHTTP(secondDiscussions, secondRequest)
	if secondDiscussions.Code != http.StatusOK || firstETag == "" || secondDiscussions.Header().Get("ETag") == firstETag {
		t.Fatalf("repository-sensitive review ETag: first=%q second=%q status=%d", firstETag, secondDiscussions.Header().Get("ETag"), secondDiscussions.Code)
	}
	readonlyResponse := httptest.NewRecorder()
	readonlyRequest := httptest.NewRequest(http.MethodPost, reviewAPIBase+"/feedback/01ARZ3NDEKTSV4RRFFQ69G5FAW/response?target=HEAD", strings.NewReader(`{}`))
	readonlyRequest.Header.Set("Content-Type", "application/json")
	readonlyRequest.Header.Set("X-Toudocu-Action", "review-feedback-response")
	readonlyRequest.Header.Set("Origin", "http://example.com")
	server.ServeHTTP(readonlyResponse, readonlyRequest)
	if readonlyResponse.Code != http.StatusForbidden || !strings.Contains(readonlyResponse.Body.String(), "REVIEW_READ_ONLY") {
		t.Fatalf("readonly response mutation: %d %s", readonlyResponse.Code, readonlyResponse.Body.String())
	}
	feedbackState, batch, err := service.createFeedback(ReviewMutationGuard{ExpectedRevision: created.Revision, ExpectedStateDigest: created.StateDigest})
	if err != nil {
		t.Fatal(err)
	}
	input := AgentFeedbackResponse{
		SchemaVersion: 1, ReviewID: batch.ReviewID, FeedbackID: batch.ID, FeedbackDigest: batch.Digest,
		ExpectedRevision: feedbackState.Revision, ExpectedStateDigest: feedbackState.StateDigest,
		Results: []AgentFeedbackResult{{ItemID: batch.Items[0].ID, Outcome: "notFixed", Message: "Ответ без изменения", ChangedPaths: []string{}}},
	}
	content, _ := json.Marshal(input)
	inputPath := filepath.Join(t.TempDir(), "response.json")
	if err := os.WriteFile(inputPath, content, 0o600); err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	stderr.Reset()
	if code := RunCLI([]string{"changes", "feedback", "respond", "--input", inputPath, "--repository-root", root, "--json"}, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), `"accepted": true`) {
		t.Fatalf("respond exit=%d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	previousDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join(root, "docs")); err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	stderr.Reset()
	code := RunCLI([]string{"changes", "feedback", "pending", "--json"}, &stdout, &stderr)
	if restoreErr := os.Chdir(previousDirectory); restoreErr != nil {
		t.Fatal(restoreErr)
	}
	if code != 0 {
		t.Fatalf("nested cwd pending exit=%d stderr=%s", code, stderr.String())
	}
}
