package docudocu

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
)

const (
	editorAPIBase   = "/_docu-docu/api/editor"
	editorUIPath    = "/_docu-docu/editor/"
	editorBodyLimit = 3 << 20
)

type apiRoute struct {
	Path    string
	Methods []string
	Handler func(*documentationServer, http.ResponseWriter, *http.Request)
}

var editorRouteRegistry = []apiRoute{
	{Path: editorAPIBase + "/files", Methods: []string{http.MethodGet}, Handler: (*documentationServer).serveEditorFiles},
	{Path: editorAPIBase + "/file", Methods: []string{http.MethodGet, http.MethodPut}, Handler: (*documentationServer).serveEditorFile},
	{Path: editorAPIBase + "/preview", Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveEditorPreview},
	{Path: editorAPIBase + "/validate", Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveEditorValidate},
	{Path: editorAPIBase + "/create", Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveEditorCreate},
}

var editorServiceRouteRegistry = []apiRoute{
	{Path: rebuildEndpoint, Methods: []string{http.MethodPost}, Handler: (*documentationServer).serveRebuild},
}

type editorErrorEnvelope struct {
	SchemaVersion int               `json:"schemaVersion"`
	Error         editorErrorDetail `json:"error"`
}

type editorErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

type editorRebuild struct {
	Documents int `json:"documents"`
	Pages     int `json:"pages"`
	Warnings  int `json:"warnings"`
	Errors    int `json:"errors"`
}

func (s *documentationServer) rebuildPayload() editorRebuild {
	return editorRebuild{Documents: s.model.Stats.Documents, Pages: s.result.Pages, Warnings: s.model.Stats.Warnings, Errors: s.model.Stats.Errors}
}

func writeEditorJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeEditorError(w http.ResponseWriter, status int, code, message string, details any) {
	writeEditorJSON(w, status, editorErrorEnvelope{SchemaVersion: 1, Error: editorErrorDetail{Code: code, Message: message, Details: details}})
}

func allowEditorMethods(w http.ResponseWriter, r *http.Request, methods ...string) bool {
	for _, method := range methods {
		if r.Method == method {
			return true
		}
	}
	w.Header().Set("Allow", strings.Join(methods, ", "))
	writeEditorError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Метод не поддерживается", nil)
	return false
}

func editorOriginAllowed(r *http.Request) bool {
	fetchSite := strings.TrimSpace(r.Header.Get("Sec-Fetch-Site"))
	if fetchSite != "" && fetchSite != "same-origin" {
		return false
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return fetchSite == "same-origin"
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.User != nil || parsed.Host != r.Host {
		return false
	}
	expectedScheme := "http"
	if r.TLS != nil {
		expectedScheme = "https"
	}
	return parsed.Scheme == expectedScheme
}

func requireEditorJSONAction(w http.ResponseWriter, r *http.Request, action string) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeEditorError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "Требуется Content-Type application/json", nil)
		return false
	}
	if r.Header.Get("X-Docu-docu-Action") != action {
		writeEditorError(w, http.StatusForbidden, "action_forbidden", "Неверный X-Docu-docu-Action", nil)
		return false
	}
	if !editorOriginAllowed(r) {
		writeEditorError(w, http.StatusForbidden, "origin_forbidden", "Запрос должен быть same-origin", nil)
		return false
	}
	return true
}

func decodeEditorJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, editorBodyLimit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeEditorError(w, http.StatusRequestEntityTooLarge, "request_too_large", "JSON body превышает 3 MiB", nil)
		} else {
			writeEditorError(w, http.StatusBadRequest, "invalid_json", "Некорректный JSON: "+err.Error(), nil)
		}
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		writeEditorError(w, http.StatusBadRequest, "invalid_json", "После JSON object обнаружены дополнительные данные", nil)
		return false
	}
	return true
}

func editorStatusForError(err error) (int, string) {
	switch workspaceErrorCode(err) {
	case "invalid_path":
		return http.StatusBadRequest, "invalid_path"
	case "unsupported_extension":
		return http.StatusUnsupportedMediaType, "unsupported_extension"
	case "path_forbidden":
		return http.StatusForbidden, "path_forbidden"
	case "file_not_found":
		return http.StatusNotFound, "file_not_found"
	case "content_too_large":
		return http.StatusRequestEntityTooLarge, "content_too_large"
	default:
		return http.StatusInternalServerError, "workspace_error"
	}
}

func (s *documentationServer) serveEditorAPI(w http.ResponseWriter, r *http.Request) {
	for _, route := range editorRouteRegistry {
		if r.URL.Path == route.Path {
			if !allowEditorMethods(w, r, route.Methods...) {
				return
			}
			route.Handler(s, w, r)
			return
		}
	}
	writeEditorError(w, http.StatusNotFound, "route_not_found", "Editor API route не найден", nil)
}

func (s *documentationServer) serveEditorFiles(w http.ResponseWriter, r *http.Request) {
	if !allowEditorMethods(w, r, http.MethodGet) {
		return
	}
	files, _, err := s.workspace.scan(s.model)
	if err != nil {
		writeEditorError(w, http.StatusInternalServerError, "workspace_error", err.Error(), nil)
		return
	}
	revision := s.revision
	if revision == "" {
		_, revision, err = s.workspace.scan(s.model)
		if err != nil {
			writeEditorError(w, http.StatusInternalServerError, "workspace_error", err.Error(), nil)
			return
		}
	}
	etag := `"` + revision + `"`
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	writeEditorJSON(w, http.StatusOK, struct {
		SchemaVersion int                 `json:"schemaVersion"`
		Revision      string              `json:"revision"`
		Files         []editorFileSummary `json:"files"`
		Templates     []editorTemplate    `json:"templates"`
	}{1, revision, editorFileSummaries(files), editorTemplates()})
}

func editorFileSummaries(files []editorFile) []editorFileSummary {
	summaries := make([]editorFileSummary, 0, len(files))
	for _, file := range files {
		summaries = append(summaries, file.summary())
	}
	return summaries
}

func (s *documentationServer) serveEditorFile(w http.ResponseWriter, r *http.Request) {
	if !allowEditorMethods(w, r, http.MethodGet, http.MethodPut) {
		return
	}
	if r.Method == http.MethodGet {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		filePath := r.URL.Query().Get("path")
		item, err := s.workspace.read(filePath, s.model, r.URL.Query().Get("raw") != "1")
		if err != nil {
			status, code := editorStatusForError(err)
			writeEditorError(w, status, code, err.Error(), nil)
			return
		}
		if r.URL.Query().Get("raw") == "1" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = io.WriteString(w, item.Content)
			return
		}
		_, revision, scanErr := s.workspace.scan(s.model)
		if scanErr != nil {
			writeEditorError(w, http.StatusInternalServerError, "workspace_error", scanErr.Error(), nil)
			return
		}
		writeEditorJSON(w, http.StatusOK, struct {
			SchemaVersion int        `json:"schemaVersion"`
			Revision      string     `json:"revision"`
			File          editorFile `json:"file"`
		}{1, revision, item})
		return
	}
	if !requireEditorJSONAction(w, r, "save") {
		return
	}
	var request struct {
		Path             string `json:"path"`
		Content          string `json:"content"`
		ExpectedDigest   string `json:"expectedDigest"`
		ConfirmOverwrite bool   `json:"confirmOverwrite"`
	}
	if !decodeEditorJSON(w, r, &request) {
		return
	}
	if len(request.Content) > editorContentLimit {
		writeEditorError(w, http.StatusRequestEntityTooLarge, "content_too_large", "Содержимое превышает 2 MiB", nil)
		return
	}
	if pendingDigest, pending := s.overwrites[request.Path]; pending {
		if !request.ConfirmOverwrite || request.ExpectedDigest != pendingDigest {
			current, currentErr := s.workspace.read(request.Path, s.model, false)
			if currentErr != nil {
				status, code := editorStatusForError(currentErr)
				writeEditorError(w, status, code, currentErr.Error(), nil)
				return
			}
			s.writeEditorStale(w, request.Path, current)
			return
		}
	} else if request.ConfirmOverwrite {
		current, currentErr := s.workspace.read(request.Path, s.model, false)
		if currentErr != nil {
			status, code := editorStatusForError(currentErr)
			writeEditorError(w, status, code, currentErr.Error(), nil)
			return
		}
		s.writeEditorStale(w, request.Path, current)
		return
	}
	_, err := s.workspace.save(request.Path, []byte(request.Content), request.ExpectedDigest)
	if err != nil {
		var stale *staleFileError
		if errors.As(err, &stale) {
			s.writeEditorStale(w, request.Path, stale.file)
			return
		}
		status, code := editorStatusForError(err)
		writeEditorError(w, status, code, err.Error(), nil)
		return
	}
	delete(s.overwrites, request.Path)
	if _, _, err = s.rebuild(); err != nil {
		writeEditorError(w, http.StatusInternalServerError, "rebuild_failed", err.Error(), nil)
		return
	}
	item, err := s.workspace.read(request.Path, s.model, true)
	if err != nil {
		writeEditorError(w, http.StatusInternalServerError, "workspace_error", err.Error(), nil)
		return
	}
	writeEditorJSON(w, http.StatusOK, struct {
		SchemaVersion int           `json:"schemaVersion"`
		Revision      string        `json:"revision"`
		File          editorFile    `json:"file"`
		Rebuild       editorRebuild `json:"rebuild"`
	}{1, s.revision, item, s.rebuildPayload()})
}

func (s *documentationServer) writeEditorStale(w http.ResponseWriter, filePath string, current editorFile) {
	_, revision, err := s.workspace.scan(s.model)
	if err != nil {
		revision = s.revision
	}
	s.overwrites[filePath] = current.Digest
	writeEditorError(w, http.StatusConflict, "stale_digest", "файл изменён внешним процессом", map[string]any{
		"digest": current.Digest, "content": current.Content, "revision": revision,
	})
}

type editorContentRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (s *documentationServer) decodeContentRequest(w http.ResponseWriter, r *http.Request, action string) (editorContentRequest, bool) {
	if !requireEditorJSONAction(w, r, action) {
		return editorContentRequest{}, false
	}
	var request editorContentRequest
	if !decodeEditorJSON(w, r, &request) {
		return editorContentRequest{}, false
	}
	if len(request.Content) > editorContentLimit {
		writeEditorError(w, http.StatusRequestEntityTooLarge, "content_too_large", "Содержимое превышает 2 MiB", nil)
		return editorContentRequest{}, false
	}
	if _, _, err := s.workspace.resolve(request.Path, false); err != nil {
		status, code := editorStatusForError(err)
		writeEditorError(w, status, code, err.Error(), nil)
		return editorContentRequest{}, false
	}
	return request, true
}

func (s *documentationServer) serveEditorPreview(w http.ResponseWriter, r *http.Request) {
	if !allowEditorMethods(w, r, http.MethodPost) {
		return
	}
	request, ok := s.decodeContentRequest(w, r, "preview")
	if !ok {
		return
	}
	if language, _ := editorLanguage(request.Path); language != "markdown" {
		writeEditorError(w, http.StatusUnsupportedMediaType, "preview_not_supported", "Preview доступен только для Markdown", nil)
		return
	}
	model, err := buildDocumentationModel(s.options, map[string][]byte{request.Path: []byte(request.Content)})
	if err != nil {
		writeEditorError(w, http.StatusInternalServerError, "preview_failed", err.Error(), nil)
		return
	}
	document := model.DocByPath[request.Path]
	if document == nil {
		writeEditorError(w, http.StatusNotFound, "file_not_found", "Markdown document не найден", nil)
		return
	}
	html := renderDocumentMarkdown(document, linkResolverFor(model, document), nil)
	diagnostics := issueDiagnostics(model.Issues)
	writeEditorJSON(w, http.StatusOK, struct {
		SchemaVersion int                `json:"schemaVersion"`
		Path          string             `json:"path"`
		HTML          string             `json:"html"`
		Diagnostics   []editorDiagnostic `json:"diagnostics"`
	}{1, request.Path, html, diagnostics})
}

func (s *documentationServer) serveEditorValidate(w http.ResponseWriter, r *http.Request) {
	if !allowEditorMethods(w, r, http.MethodPost) {
		return
	}
	request, ok := s.decodeContentRequest(w, r, "validate")
	if !ok {
		return
	}
	diagnostics, err := s.workspace.diagnostics(request.Path, []byte(request.Content))
	if err != nil {
		writeEditorError(w, http.StatusInternalServerError, "validation_failed", err.Error(), nil)
		return
	}
	writeEditorJSON(w, http.StatusOK, struct {
		SchemaVersion int                `json:"schemaVersion"`
		Path          string             `json:"path"`
		Diagnostics   []editorDiagnostic `json:"diagnostics"`
	}{1, request.Path, diagnostics})
}

func (s *documentationServer) serveEditorCreate(w http.ResponseWriter, r *http.Request) {
	if !allowEditorMethods(w, r, http.MethodPost) || !requireEditorJSONAction(w, r, "create") {
		return
	}
	var request struct {
		Template string            `json:"template"`
		Language string            `json:"language"`
		Fields   map[string]string `json:"fields"`
	}
	if !decodeEditorJSON(w, r, &request) {
		return
	}
	template, templateExists := scaffoldTemplate(request.Template)
	if !templateExists {
		writeEditorError(w, http.StatusBadRequest, "invalid_template", "Неизвестный шаблон", nil)
		return
	}
	createDirectory := template.spec.directory
	if request.Template == "task-init" {
		createDirectory = "work"
	}
	if err := s.workspace.validateCreateDirectory(createDirectory); err != nil {
		status, code := editorStatusForError(err)
		writeEditorError(w, status, code, err.Error(), nil)
		return
	}
	createdPath, err := createFromEditorTemplate(s.options, request.Template, request.Language, request.Fields)
	if err != nil {
		code, status := "invalid_template", http.StatusBadRequest
		if strings.Contains(err.Error(), "уже существует") {
			code, status = "file_exists", http.StatusConflict
		}
		writeEditorError(w, status, code, err.Error(), nil)
		return
	}
	if _, _, err = s.rebuild(); err != nil {
		writeEditorError(w, http.StatusInternalServerError, "rebuild_failed", err.Error(), nil)
		return
	}
	item, err := s.workspace.read(createdPath, s.model, true)
	if err != nil {
		writeEditorError(w, http.StatusInternalServerError, "workspace_error", err.Error(), nil)
		return
	}
	writeEditorJSON(w, http.StatusCreated, struct {
		SchemaVersion int           `json:"schemaVersion"`
		Revision      string        `json:"revision"`
		File          editorFile    `json:"file"`
		Rebuild       editorRebuild `json:"rebuild"`
	}{1, s.revision, item, s.rebuildPayload()})
}

func (s *documentationServer) serveEditorUI(w http.ResponseWriter, r *http.Request) {
	if !allowEditorMethods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method == http.MethodHead {
		return
	}
	title := escapeHTML(s.model.Project.Title)
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Редактор — %s</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/editor.css"><script src="/assets/codemirror.js" defer></script><script src="/assets/editor.js" defer></script></head><body><a class="editor-skip" href="#editor-workspace">Перейти к редактору</a><div class="editor-shell"><header class="editor-header"><a class="editor-brand" href="/"><span aria-hidden="true">DG</span><strong>%s</strong></a><div class="editor-path"><button type="button" data-tree-toggle aria-label="Открыть дерево файлов">Файлы</button><span data-current-path>Выберите документ</span><span class="dirty-mark" data-dirty-state hidden>Изменён</span></div><div class="editor-actions"><a data-raw-link href="#" target="_blank" rel="noopener" hidden>Исходник</a><button type="button" data-create-open>Создать</button><button class="primary" type="button" data-save disabled>Сохранить</button></div></header><div class="editor-layout"><aside class="editor-tree" data-tree><div class="tree-heading"><strong>Документы</strong><button type="button" data-tree-close aria-label="Закрыть дерево">Закрыть</button></div><label class="tree-search"><span>Фильтр</span><input type="search" data-file-filter placeholder="Путь или название"></label><nav aria-label="Исходные файлы" data-file-tree></nav></aside><main id="editor-workspace" class="editor-workspace"><div class="editor-notice" data-conflict hidden role="alert"><strong>Файл изменён снаружи.</strong><span data-conflict-message>Ваш текст сохранён в редакторе. Сравните версии или подтвердите перезапись.</span><button type="button" data-conflict-load>Загрузить внешнюю</button><button type="button" data-conflict-overwrite>Перезаписать</button><button type="button" data-conflict-download hidden>Скачать текст</button></div><div class="editor-tabs" role="tablist" aria-label="Режим просмотра"><button role="tab" aria-selected="true" data-view="editor">Редактор</button><button role="tab" aria-selected="false" data-view="preview">Preview</button><button role="tab" aria-selected="false" data-view="split">Разделённый экран</button></div><div class="editor-stage" data-stage="editor"><section class="source-pane" aria-label="Редактор исходного текста"><div data-editor-host></div><textarea data-editor-fallback spellcheck="false" aria-label="Содержимое документа"></textarea></section><section class="preview-pane" aria-label="Preview" data-preview><div class="preview-empty">Preview доступен для Markdown.</div></section></div><section class="diagnostics" aria-labelledby="diagnostics-title"><div class="diagnostics-heading"><strong id="diagnostics-title">Diagnostics</strong><span data-diagnostic-count>0</span></div><ol data-diagnostics></ol></section></main></div></div><dialog data-create-dialog><form method="dialog" data-create-form><header><h2>Создать документ</h2><button value="cancel" aria-label="Закрыть">Закрыть</button></header><label>Шаблон<select data-template-select></select></label><label>Язык<select data-template-language></select></label><div data-template-fields></div><p class="form-error" data-create-error role="alert"></p><footer><button value="cancel">Отмена</button><button class="primary" type="submit" value="default">Создать</button></footer></form></dialog><div class="editor-toast" data-toast role="status" aria-live="polite"></div></body></html>`, title, title)
}
