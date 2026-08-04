package docudocu

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

const (
	changesAPIBase = "/_docu-docu/api/changes"
	changesUIPath  = "/changes/"
)

func changesOptionsFromRequest(base Options, request *http.Request) Options {
	options := base
	query := request.URL.Query()
	options.ChangeBase = query.Get("base")
	options.ChangeTarget = query.Get("target")
	options.ChangeStatus = query.Get("status")
	options.ChangeEntityType = query.Get("type")
	options.ChangeModule = query.Get("module")
	options.ChangeTaskID = query.Get("task")
	options.ChangeBranchBase = query.Get("branchBase")
	if options.ChangeTaskID == "" {
		options.ChangeTaskID = query.Get("id")
	}
	return options
}

func (s *documentationServer) buildChanges(request *http.Request) (*ChangeSetReport, error) {
	options := changesOptionsFromRequest(s.options, request)
	endpoint := strings.TrimPrefix(request.URL.Path, changesAPIBase)
	options.ChangeOmitSourceDiff = endpoint != "/file"
	if endpoint == "/file" || endpoint == "/content" || endpoint == "/render" {
		options.ChangeFile = filepath.ToSlash(request.URL.Query().Get("path"))
	}
	cacheKey := ""
	if fingerprint, err := s.changesFingerprint(options); err == nil {
		cacheKey = fmt.Sprintf("%x:%s:%s", sha256.Sum256([]byte(fingerprint)), endpoint, request.URL.RawQuery)
		if cached := s.changesCache[cacheKey]; cached != nil {
			return cached, nil
		}
	}
	report, err := BuildDocumentationChanges(options)
	if err != nil {
		return nil, err
	}
	filterDocumentationChanges(report, options)
	if cacheKey != "" {
		if s.changesCache == nil {
			s.changesCache = map[string]*ChangeSetReport{}
		}
		if len(s.changesCache) >= 16 {
			s.changesCache = map[string]*ChangeSetReport{}
		}
		s.changesCache[cacheKey] = report
	}
	return report, nil
}

func (s *documentationServer) changesFingerprint(options Options) (string, error) {
	g, err := openGitChangeSource(s.options.InputDirectory, s.options.ChangeRenameSimilarity)
	if err != nil {
		return "", err
	}
	head, err := g.resolveCommit("HEAD")
	if err != nil {
		return "", err
	}
	status, err := g.run("status", "--porcelain=v2", "-z", "--untracked-files=all", "--", g.docsRel)
	if err != nil {
		return "", err
	}
	resolved := []string{s.revision, head, string(status)}
	for _, revision := range []string{options.ChangeBase, options.ChangeTarget, options.ChangeBranchBase} {
		if revision == "" || revision == "HEAD" || revision == "index" || revision == "working-tree" {
			continue
		}
		commit, resolveErr := g.resolveCommit(revision)
		if resolveErr != nil {
			return "", resolveErr
		}
		resolved = append(resolved, revision, commit)
	}
	return strings.Join(resolved, "\x00"), nil
}

func writeChangesJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeChangesAPIError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	code := "git-command-failed"
	if failure, ok := err.(*changeFailure); ok {
		code = failure.IssueCode
		if failure.Code == 2 {
			status = http.StatusBadRequest
		} else if failure.Code == 3 {
			status = http.StatusServiceUnavailable
		}
	}
	writeChangesJSON(w, status, map[string]any{"schemaVersion": 1, "diagnostics": []Issue{{Severity: "error", Code: code, Message: err.Error()}}})
}

func (s *documentationServer) serveChangesAPI(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	report, err := s.buildChanges(request)
	if err != nil {
		writeChangesAPIError(w, err)
		return
	}
	endpoint := strings.TrimPrefix(request.URL.Path, changesAPIBase)
	switch endpoint {
	case "", "/":
		if request.Method == http.MethodHead {
			w.Header().Set("ETag", `"`+report.ChangeSetDigest+`"`)
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("ETag", `"`+report.ChangeSetDigest+`"`)
		writeChangesJSON(w, http.StatusOK, report)
	case "/file":
		change := findRequestedChange(report, request.URL.Query().Get("path"))
		if change == nil {
			writeChangesJSON(w, http.StatusNotFound, map[string]any{"schemaVersion": 1, "diagnostics": []Issue{{Severity: "error", Code: "change-new-version-missing", Message: "Изменение файла не найдено."}}})
			return
		}
		writeChangesJSON(w, http.StatusOK, change)
	case "/task":
		if report.TaskImpact == nil {
			writeChangesJSON(w, http.StatusBadRequest, map[string]any{"schemaVersion": 1, "diagnostics": []Issue{{Severity: "error", Code: "task-not-found", Message: "Параметр task обязателен."}}})
			return
		}
		writeChangesJSON(w, http.StatusOK, report.TaskImpact)
	case "/content", "/render":
		s.serveChangedContent(w, request, report, endpoint == "/render")
	case "/screen-map":
		writeChangesJSON(w, http.StatusOK, buildScreenMapChanges(report))
	default:
		http.NotFound(w, request)
	}
}

func findRequestedChange(report *ChangeSetReport, requested string) *DocumentationChange {
	requested = filepath.ToSlash(requested)
	if filepath.IsAbs(requested) || requested == ".." || strings.HasPrefix(requested, "../") || strings.Contains(requested, "/../") || strings.Contains(requested, "\\") {
		return nil
	}
	for i := range report.Changes {
		if report.Changes[i].Path == requested || report.Changes[i].OldPath == requested {
			return &report.Changes[i]
		}
	}
	return nil
}

func (s *documentationServer) serveChangedContent(w http.ResponseWriter, request *http.Request, report *ChangeSetReport, render bool) {
	change := findRequestedChange(report, request.URL.Query().Get("path"))
	if change == nil {
		http.NotFound(w, request)
		return
	}
	sideName := request.URL.Query().Get("side")
	side := report.Comparison.Target
	path := change.Path
	if sideName == "before" {
		side, path = report.Comparison.Base, change.Path
		if change.OldPath != "" {
			path = change.OldPath
		}
	} else if sideName != "after" {
		http.Error(w, "side должен быть before или after", http.StatusBadRequest)
		return
	}
	if sideName == "before" && (change.Status == "added" || change.Status == "untracked") || sideName == "after" && change.Status == "deleted" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	g, err := openGitChangeSource(s.options.InputDirectory, s.options.ChangeRenameSimilarity)
	if err != nil {
		writeChangesAPIError(w, err)
		return
	}
	content, err := g.content(side, path)
	if err != nil {
		writeChangesAPIError(w, err)
		return
	}
	limit := s.options.ChangeMaxSourceDiffBytes
	if limit <= 0 {
		limit = 2 * 1024 * 1024
	}
	if len(content) > limit {
		writeChangesJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"schemaVersion": 1, "diagnostics": []Issue{{Severity: "warning", Code: "change-file-too-large", Message: "Содержимое превышает лимит changes API.", DocumentPath: path}}})
		return
	}
	if render {
		if strings.ToLower(filepath.Ext(path)) != ".md" {
			http.Error(w, "Rendered diff поддерживает Markdown", http.StatusUnsupportedMediaType)
			return
		}
		parsed := AnalyzeMarkdown(string(content))
		html := RenderMarkdown(parsed, RenderContext{HeadingByLine: parsed.HeadingByLine}, RenderOptions{SkipH1: false, SuppressMetadata: false, InteractiveMermaid: true})
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprint(w, html)
		return
	}
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'none'; sandbox")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	contentType := http.DetectContentType(content)
	if strings.EqualFold(filepath.Ext(path), ".svg") {
		contentType = "image/svg+xml"
	}
	if strings.HasPrefix(contentType, "text/") {
		contentType += "; charset=utf-8"
	}
	w.Header().Set("Content-Type", contentType)
	_, _ = w.Write(content)
}

func buildScreenMapChanges(report *ChangeSetReport) map[string]any {
	nodes := []map[string]any{}
	edges := []map[string]any{}
	for _, change := range report.Changes {
		if change.Screen == nil {
			continue
		}
		nodes = append(nodes, map[string]any{"id": firstScreenID(change.Screen), "status": change.Status, "path": change.Path, "before": change.Screen.Before, "after": change.Screen.After, "ghost": change.Screen.After == nil})
		for _, transition := range change.Screen.Transitions {
			edges = append(edges, map[string]any{"id": transition.ID, "status": transition.Status, "before": transition.Before, "after": transition.After, "ghost": transition.After == nil})
		}
	}
	return map[string]any{"schemaVersion": 1, "changeSetDigest": report.ChangeSetDigest, "nodes": nodes, "edges": edges}
}

func firstScreenID(screen *ScreenDiffMetadata) string {
	if screen.After != nil {
		return screen.After.ID
	}
	if screen.Before != nil {
		return screen.Before.ID
	}
	return ""
}

func changesDocumentURL(path string) string { return changesUIPath + "?path=" + url.QueryEscape(path) }
