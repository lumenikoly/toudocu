package toudocu

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
)

const reviewAPIBase = changesAPIBase + "/review"

var reviewRouteRegistry = []apiRoute{
	{Path: reviewAPIBase + "/repository/changes", Methods: []string{http.MethodGet}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/repository/files", Methods: []string{http.MethodGet}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/repository/file", Methods: []string{http.MethodGet}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/discussions", Methods: []string{http.MethodGet, http.MethodPost}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/discussions/{id}", Methods: []string{http.MethodPatch}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/feedback", Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/feedback/pending", Methods: []string{http.MethodGet}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/feedback/{id}/response", Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveReviewAPI},
	{Path: reviewAPIBase + "/cleanup", Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveReviewAPI},
}

func reviewOptionsFromRequest(base Options, request *http.Request) Options {
	options := base
	options.ChangeBase = request.URL.Query().Get("base")
	options.ChangeTarget = request.URL.Query().Get("target")
	options.ChangeBranchBase = request.URL.Query().Get("branchBase")
	return options
}

func (s *documentationServer) serveReviewAPI(w http.ResponseWriter, request *http.Request) {
	path := strings.TrimSuffix(request.URL.Path, "/")
	if path == reviewAPIBase+"/repository/changes" {
		if !allowReviewMethods(w, request, http.MethodGet) {
			return
		}
		report, err := BuildRepositoryReview(reviewOptionsFromRequest(s.options, request))
		if err != nil {
			writeReviewError(w, err)
			return
		}
		etag := `"` + report.RepositoryRevision + `"`
		w.Header().Set("ETag", etag)
		if request.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		writeChangesJSON(w, http.StatusOK, report)
		return
	}
	if path == reviewAPIBase+"/repository/files" {
		if !allowReviewMethods(w, request, http.MethodGet) {
			return
		}
		limit, err := reviewQueryLimit(request.URL.Query().Get("limit"))
		if err != nil {
			writeReviewError(w, err)
			return
		}
		g, err := openGitRepositorySource(s.options.RepositoryRoot, s.options.ChangeRenameSimilarity)
		if err != nil {
			writeReviewError(w, err)
			return
		}
		files, err := reviewInventory(g, request.URL.Query().Get("q"), limit)
		if err != nil {
			writeReviewError(w, err)
			return
		}
		writeChangesJSON(w, http.StatusOK, map[string]any{"schemaVersion": reviewSchemaVersion, "files": files})
		return
	}
	if path == reviewAPIBase+"/repository/file" {
		if !allowReviewMethods(w, request, http.MethodGet) {
			return
		}
		detail, err := BuildRepositoryReviewFile(reviewOptionsFromRequest(s.options, request), request.URL.Query().Get("path"))
		if err != nil {
			writeReviewError(w, err)
			return
		}
		writeChangesJSON(w, http.StatusOK, detail)
		return
	}
	service, err := newReviewService(reviewOptionsFromRequest(s.options, request))
	if err != nil {
		writeReviewError(w, err)
		return
	}
	if path == reviewAPIBase+"/discussions" {
		switch request.Method {
		case http.MethodGet:
			state, loadErr := service.discussions()
			if loadErr != nil {
				writeReviewError(w, loadErr)
				return
			}
			etag := `"` + digestBytes([]byte(state.StateDigest+"\x00"+state.RepositoryRevision)) + `"`
			w.Header().Set("ETag", etag)
			if request.Header.Get("If-None-Match") == etag {
				w.WriteHeader(http.StatusNotModified)
				return
			}
			writeChangesJSON(w, http.StatusOK, state)
		case http.MethodPost:
			if !requireReviewJSONAction(w, request, "review-discussion-create") {
				return
			}
			if !requireReviewWritable(w, service) {
				return
			}
			var input CreateDiscussionRequest
			if !decodeReviewJSON(w, request, &input) {
				return
			}
			state, createErr := service.createDiscussion(input)
			if createErr != nil {
				writeReviewError(w, createErr)
				return
			}
			writeChangesJSON(w, http.StatusCreated, state)
		default:
			allowReviewMethods(w, request, http.MethodGet, http.MethodPost)
		}
		return
	}
	if id, ok := reviewPathID(path, reviewAPIBase+"/discussions/", ""); ok {
		if !allowReviewMethods(w, request, http.MethodPatch) || !requireReviewJSONAction(w, request, "review-discussion-update") {
			return
		}
		if !requireReviewWritable(w, service) {
			return
		}
		var input UpdateDiscussionRequest
		if !decodeReviewJSON(w, request, &input) {
			return
		}
		state, updateErr := service.updateDiscussion(id, input)
		if updateErr != nil {
			writeReviewError(w, updateErr)
			return
		}
		writeChangesJSON(w, http.StatusOK, state)
		return
	}
	if path == reviewAPIBase+"/feedback" {
		if !allowReviewMethods(w, request, http.MethodPost) || !requireReviewJSONAction(w, request, "review-feedback-create") {
			return
		}
		if !requireReviewWritable(w, service) {
			return
		}
		var guard ReviewMutationGuard
		if !decodeReviewJSON(w, request, &guard) {
			return
		}
		state, batch, createErr := service.createFeedback(guard)
		if createErr != nil {
			writeReviewError(w, createErr)
			return
		}
		writeChangesJSON(w, http.StatusCreated, map[string]any{"schemaVersion": reviewSchemaVersion, "revision": state.Revision, "stateDigest": state.StateDigest, "feedback": batch})
		return
	}
	if path == reviewAPIBase+"/feedback/pending" {
		if !allowReviewMethods(w, request, http.MethodGet) {
			return
		}
		pending, pendingErr := service.pendingFeedback()
		if pendingErr != nil {
			writeReviewError(w, pendingErr)
			return
		}
		writeChangesJSON(w, http.StatusOK, pending)
		return
	}
	if id, ok := reviewPathID(path, reviewAPIBase+"/feedback/", "/response"); ok {
		if !allowReviewMethods(w, request, http.MethodPost) || !requireReviewJSONAction(w, request, "review-feedback-response") {
			return
		}
		if !requireReviewWritable(w, service) {
			return
		}
		var response AgentFeedbackResponse
		if !decodeReviewJSON(w, request, &response) {
			return
		}
		if response.FeedbackID != id {
			writeReviewError(w, invalidReviewResponse("feedback path ID mismatch"))
			return
		}
		if sizeErr := reviewResponseSize(response); sizeErr != nil {
			writeReviewError(w, sizeErr)
			return
		}
		state, responseErr := service.respond(response)
		if responseErr != nil {
			writeReviewError(w, responseErr)
			return
		}
		writeChangesJSON(w, http.StatusOK, state)
		return
	}
	if path == reviewAPIBase+"/cleanup" {
		if !allowReviewMethods(w, request, http.MethodPost) || !requireReviewJSONAction(w, request, "review-cleanup") {
			return
		}
		if !requireReviewWritable(w, service) {
			return
		}
		var input CleanupReviewRequest
		if !decodeReviewJSON(w, request, &input) {
			return
		}
		state, cleanupErr := service.cleanup(input)
		if cleanupErr != nil {
			writeReviewError(w, cleanupErr)
			return
		}
		writeChangesJSON(w, http.StatusOK, state)
		return
	}
	writeReviewError(w, &reviewFailure{Code: "REVIEW_NOT_FOUND", Status: http.StatusNotFound, Message: "review route не найден"})
}

func requireReviewWritable(w http.ResponseWriter, service *reviewService) bool {
	report, err := BuildRepositoryReview(service.options)
	if err != nil {
		writeReviewError(w, err)
		return false
	}
	if !report.FeedbackWritable {
		writeReviewError(w, &reviewFailure{Code: "REVIEW_READ_ONLY", Status: http.StatusForbidden, Message: "review target доступен только для чтения"})
		return false
	}
	return true
}

func allowReviewMethods(w http.ResponseWriter, request *http.Request, methods ...string) bool {
	for _, method := range methods {
		if request.Method == method {
			return true
		}
	}
	w.Header().Set("Allow", strings.Join(methods, ", "))
	writeReviewError(w, &reviewFailure{Code: "REVIEW_METHOD_NOT_ALLOWED", Status: http.StatusMethodNotAllowed, Message: "метод не поддерживается"})
	return false
}

func requireReviewJSONAction(w http.ResponseWriter, request *http.Request, action string) bool {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeReviewError(w, &reviewFailure{Code: "REVIEW_INVALID_CONTENT_TYPE", Status: http.StatusUnsupportedMediaType, Message: "требуется Content-Type application/json"})
		return false
	}
	if request.Header.Get("X-Toudocu-Action") != action {
		writeReviewError(w, &reviewFailure{Code: "REVIEW_ACTION_FORBIDDEN", Status: http.StatusForbidden, Message: "неверный X-Toudocu-Action"})
		return false
	}
	if !editorOriginAllowed(request) {
		writeReviewError(w, &reviewFailure{Code: "REVIEW_ACTION_FORBIDDEN", Status: http.StatusForbidden, Message: "mutation должна быть same-origin"})
		return false
	}
	return true
}

func decodeReviewJSON(w http.ResponseWriter, request *http.Request, target any) bool {
	reader := http.MaxBytesReader(w, request.Body, reviewResponseLimit)
	decoder := json.NewDecoder(reader)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		status, code := http.StatusBadRequest, "REVIEW_INVALID_REQUEST"
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			status, code = http.StatusRequestEntityTooLarge, "REVIEW_TOO_LARGE"
		}
		writeReviewError(w, &reviewFailure{Code: code, Status: status, Message: "invalid review JSON: " + err.Error()})
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeReviewError(w, &reviewFailure{Code: "REVIEW_INVALID_REQUEST", Status: http.StatusBadRequest, Message: "request body должен содержать один JSON object"})
		return false
	}
	return true
}

func writeReviewError(w http.ResponseWriter, err error) {
	failure := &reviewFailure{Code: "REVIEW_INTERNAL", Status: http.StatusInternalServerError, Message: err.Error()}
	var typed *reviewFailure
	if errors.As(err, &typed) {
		failure = typed
	}
	writeChangesJSON(w, failure.Status, map[string]any{"schemaVersion": reviewSchemaVersion, "diagnostics": []Issue{{Severity: "error", Code: failure.Code, Message: failure.Message}}})
}

func reviewPathID(path, prefix, suffix string) (string, bool) {
	if !strings.HasPrefix(path, prefix) || suffix != "" && !strings.HasSuffix(path, suffix) {
		return "", false
	}
	id := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if id == "" || strings.Contains(id, "/") || len(id) != 26 {
		return "", false
	}
	return id, true
}

func reviewQueryLimit(raw string) (int, error) {
	if raw == "" {
		return 50, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > 200 {
		return 0, &reviewFailure{Code: "REVIEW_INVALID_REQUEST", Status: http.StatusBadRequest, Message: "limit должен быть от 1 до 200"}
	}
	return value, nil
}

func reviewRouteDescription() string {
	return fmt.Sprintf("%d review routes", len(reviewRouteRegistry))
}
