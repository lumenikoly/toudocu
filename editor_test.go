package docgent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func editorTestServer(t *testing.T) (*documentationServer, Options, string) {
	t.Helper()
	options, docs := serveTestOptions(t)
	server, _, _, err := newDocumentationServer(options, &strings.Builder{})
	if err != nil {
		t.Fatal(err)
	}
	return server, options, docs
}

func editorRequest(method, target, action string, body any) *http.Request {
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else if raw, ok := body.([]byte); ok {
		reader = bytes.NewReader(raw)
	} else {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	request := httptest.NewRequest(method, target, reader)
	if action != "" {
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Docgent-Action", action)
		request.Header.Set("Sec-Fetch-Site", "same-origin")
		request.Header.Set("Origin", "http://"+request.Host)
	}
	return request
}

func performEditorRequest(server *documentationServer, request *http.Request) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	return response
}

func TestStaticSiteExcludesEditor(t *testing.T) {
	options, _ := serveTestOptions(t)
	model, err := BuildDocumentationModel(options)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = GenerateSite(model, options); err != nil {
		t.Fatal(err)
	}
	page, err := os.ReadFile(filepath.Join(options.OutputDirectory, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"/_docgent/editor", "editor.js", "serve.js", "data-server-rebuild"} {
		if strings.Contains(string(page), forbidden) {
			t.Fatalf("static page contains %q", forbidden)
		}
	}
	app, err := os.ReadFile(filepath.Join(options.OutputDirectory, "assets", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(app), "__docgent") || strings.Contains(string(app), "server-rebuild") {
		t.Fatal("static app contains server-only rebuild code")
	}
	for _, asset := range []string{"editor.js", "codemirror.js", "serve.js"} {
		if _, err := os.Stat(filepath.Join(options.OutputDirectory, "assets", asset)); !os.IsNotExist(err) {
			t.Fatalf("static output contains %s", asset)
		}
	}
}

func TestServeSiteIncludesEditor(t *testing.T) {
	server, options, _ := editorTestServer(t)
	page, err := os.ReadFile(filepath.Join(options.OutputDirectory, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"/_docgent/editor/", "assets/serve.js", "data-server-rebuild", `meta name="docgent-revision" content="` + server.revision + `"`} {
		if !strings.Contains(string(page), expected) {
			t.Fatalf("serve page missing %q", expected)
		}
	}
	response := performEditorRequest(server, editorRequest(http.MethodGet, editorUIPath, "", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "data-editor-host") {
		t.Fatalf("editor UI: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestEditorWorkspaceFiles(t *testing.T) {
	server, _, docs := editorTestServer(t)
	writeTestFile(t, docs, "data.json", "{}\n")
	writeTestFile(t, docs, "config.yaml", "name: value\n")
	writeTestFile(t, docs, "other.yml", "enabled: true\n")
	writeTestFile(t, docs, "ignored.txt", "no")
	files, _, err := server.workspace.scan(server.model)
	if err != nil {
		t.Fatal(err)
	}
	paths := []string{}
	for _, file := range files {
		paths = append(paths, file.Path+":"+file.Language)
	}
	joined := strings.Join(paths, "|")
	for _, expected := range []string{"index.md:markdown", "data.json:json", "config.yaml:yaml", "other.yml:yaml"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("workspace missing %s: %s", expected, joined)
		}
	}
	if strings.Contains(joined, "ignored.txt") {
		t.Fatal("unsupported extension included")
	}
}

func TestEditorWorkspaceExclusions(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Root\n")
	writeTestFile(t, docs, ".hidden.md", "# Hidden\n")
	writeTestFile(t, docs, "node_modules/pkg/data.json", "{}")
	writeTestFile(t, docs, "private/secret.md", "# Secret\n")
	writeTestFile(t, docs, "site/generated.json", "{}")
	if err := os.Symlink(filepath.Join(docs, "index.md"), filepath.Join(docs, "linked.md")); err != nil && runtime.GOOS != "windows" {
		t.Fatal(err)
	}
	workspace, err := newEditorWorkspace(Options{InputDirectory: docs, OutputDirectory: filepath.Join(docs, "site"), Excludes: []string{"private"}})
	if err != nil {
		t.Fatal(err)
	}
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, Excludes: []string{"private"}, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	files, _, err := workspace.scan(model)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Path != "index.md" {
		t.Fatalf("excluded files leaked: %#v", files)
	}
}

func TestEditorPathValidation(t *testing.T) {
	invalid := []string{"", ".", "/tmp/a.md", "../a.md", "a/../b.md", `a\b.md`, "a%2fb.md", "a\x00.md", "a//b.md", "a.txt"}
	for _, value := range invalid {
		if err := validateEditorPath(value); err == nil {
			t.Fatalf("accepted path %q", value)
		}
	}
	for _, value := range []string{"index.md", "screens/hotspots.json", "folder/config.yml"} {
		if err := validateEditorPath(value); err != nil {
			t.Fatalf("rejected %q: %v", value, err)
		}
	}
	server, _, _ := editorTestServer(t)
	for _, encoded := range []string{"..%2Findex.md", "%252e%252e%252findex.md", "a%5Cb.md"} {
		response := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/file?path="+encoded, "", nil))
		if response.Code == http.StatusOK {
			t.Fatalf("encoded traversal accepted: %s", encoded)
		}
	}
}

func TestEditorAtomicSave(t *testing.T) {
	server, _, docs := editorTestServer(t)
	path := filepath.Join(docs, "index.md")
	if err := os.Chmod(path, 0640); err != nil {
		t.Fatal(err)
	}
	before, err := server.workspace.read("index.md", server.model, false)
	if err != nil {
		t.Fatal(err)
	}
	after, err := server.workspace.save("index.md", []byte("# Saved\n"), before.Digest)
	if err != nil {
		t.Fatal(err)
	}
	if after.Digest != contentDigest([]byte("# Saved\n")) {
		t.Fatal("digest not updated")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0640 {
		t.Fatalf("mode changed: %o", info.Mode().Perm())
	}
	leftovers, _ := filepath.Glob(filepath.Join(docs, ".docgent-edit-*"))
	if len(leftovers) != 0 {
		t.Fatalf("temporary files left: %v", leftovers)
	}
}

func TestEditorAtomicFailure(t *testing.T) {
	server, _, docs := editorTestServer(t)
	_, err := server.workspace.save("index.md", []byte("# Must not win\n"), strings.Repeat("0", 64))
	if err == nil {
		t.Fatal("stale save succeeded")
	}
	data, readErr := os.ReadFile(filepath.Join(docs, "index.md"))
	if readErr != nil || !strings.Contains(string(data), "Первая версия") {
		t.Fatalf("source changed after failed save: %s %v", data, readErr)
	}
}

func TestEditorStaleDigest(t *testing.T) {
	server, _, docs := editorTestServer(t)
	initial, _ := server.workspace.read("index.md", server.model, false)
	writeTestFile(t, docs, "index.md", "# External\n")
	body := map[string]any{"path": "index.md", "content": "# Local\n", "expectedDigest": initial.Digest, "confirmOverwrite": false}
	response := performEditorRequest(server, editorRequest(http.MethodPut, editorAPIBase+"/file", "save", body))
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), `"code":"stale_digest"`) {
		t.Fatalf("stale response: status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Error struct {
			Details struct {
				Digest string `json:"digest"`
			} `json:"details"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	body["expectedDigest"] = envelope.Error.Details.Digest
	withoutConfirmation := performEditorRequest(server, editorRequest(http.MethodPut, editorAPIBase+"/file", "save", body))
	if withoutConfirmation.Code != http.StatusConflict {
		t.Fatalf("overwrite without confirmation status=%d body=%s", withoutConfirmation.Code, withoutConfirmation.Body.String())
	}
	body["confirmOverwrite"] = true
	writeTestFile(t, docs, "index.md", "# External again\n")
	repeated := performEditorRequest(server, editorRequest(http.MethodPut, editorAPIBase+"/file", "save", body))
	if repeated.Code != http.StatusConflict {
		t.Fatalf("repeated conflict status=%d body=%s", repeated.Code, repeated.Body.String())
	}
	if err := json.Unmarshal(repeated.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	body["expectedDigest"] = envelope.Error.Details.Digest
	confirmed := performEditorRequest(server, editorRequest(http.MethodPut, editorAPIBase+"/file", "save", body))
	if confirmed.Code != http.StatusOK {
		t.Fatalf("confirmed overwrite status=%d body=%s", confirmed.Code, confirmed.Body.String())
	}
}

func TestEditorDiagnostics(t *testing.T) {
	server, _, docs := editorTestServer(t)
	markdown := []byte("# Title\n\n[broken](missing.md)\n")
	diagnostics, err := server.workspace.diagnostics("index.md", markdown)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == "broken-link" && diagnostic.Path == "index.md" && diagnostic.Line > 0 {
			found = true
		}
	}
	if !found {
		t.Fatalf("overlay diagnostics missing: %#v", diagnostics)
	}
	writeTestFile(t, docs, "data.json", "{}")
	jsonDiagnostics, err := server.workspace.diagnostics("data.json", []byte("{\n bad"))
	if err != nil || len(jsonDiagnostics) != 1 || jsonDiagnostics[0].Line != 2 || jsonDiagnostics[0].Column < 1 {
		t.Fatalf("JSON diagnostics: %#v %v", jsonDiagnostics, err)
	}
	yamlDiagnostics, err := server.workspace.diagnostics("config.yaml", []byte("anything: [\n"))
	if err != nil || len(yamlDiagnostics) != 0 {
		t.Fatalf("YAML invented diagnostics: %#v %v", yamlDiagnostics, err)
	}
	screenRoot, screenDocs := createScreenFixture(t)
	screenWorkspace, err := newEditorWorkspace(Options{InputDirectory: screenDocs, OutputDirectory: filepath.Join(screenRoot, "site"), RepositoryRoot: screenRoot, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	hotspotDiagnostics, err := screenWorkspace.diagnostics("screens/hotspots.json", []byte(`{"SC-UNKNOWN":[{"transition":"TR-UNKNOWN","x":99,"y":99,"width":5,"height":5}]}`))
	if err != nil {
		t.Fatal(err)
	}
	hotspotIssue := false
	for _, diagnostic := range hotspotDiagnostics {
		if diagnostic.Code == "unknown-hotspot-screen" && diagnostic.Path == "screens/hotspots.json" {
			hotspotIssue = true
		}
	}
	if !hotspotIssue {
		t.Fatalf("hotspots model diagnostics missing: %#v", hotspotDiagnostics)
	}
}

func TestEditorRebuild(t *testing.T) {
	server, options, _ := editorTestServer(t)
	item, _ := server.workspace.read("index.md", server.model, false)
	body := map[string]any{"path": "index.md", "content": "# Серверный проект\n\nRebuilt content.\n", "expectedDigest": item.Digest, "confirmOverwrite": false}
	response := performEditorRequest(server, editorRequest(http.MethodPut, editorAPIBase+"/file", "save", body))
	if response.Code != http.StatusOK {
		t.Fatalf("save status=%d body=%s", response.Code, response.Body.String())
	}
	page, _ := os.ReadFile(filepath.Join(options.OutputDirectory, "index.html"))
	search, _ := os.ReadFile(filepath.Join(options.OutputDirectory, "assets", "search-index.js"))
	if !strings.Contains(string(page), "Rebuilt content") || !strings.Contains(string(search), "rebuilt content") {
		t.Fatal("save did not rebuild HTML and search")
	}
}

func TestEditorWatcher(t *testing.T) {
	server, options, docs := editorTestServer(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go server.watch(ctx)
	writeTestFile(t, docs, "index.md", "# Серверный проект\n\nWatcher content.\n")
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		page, _ := os.ReadFile(filepath.Join(options.OutputDirectory, "index.html"))
		if strings.Contains(string(page), "Watcher content") {
			return
		}
		time.Sleep(80 * time.Millisecond)
	}
	t.Fatal("watcher did not rebuild stable external change")
}

func TestEditorPollingStateMachine(t *testing.T) {
	for _, expected := range []string{"window.setInterval(() => loadFiles({ conditional: true })", "Файл удалён с диска", "Загрузить внешнюю версию и потерять", "new Blob([currentContent()]"} {
		assertEditorAssetContains(t, "editor.js", expected)
	}
	for _, expected := range []string{`meta[name="docgent-revision"]`, "let etag = baseline"} {
		assertEditorAssetContains(t, "serve.js", expected)
	}
}
func TestEditorKeyboardAndDirtyGuards(t *testing.T) {
	for _, expected := range []string{"beforeunload", "event.ctrlKey || event.metaKey", "stale_digest", "Ваш текст не потерян"} {
		assertEditorAssetContains(t, "editor.js", expected)
	}
}
func TestEditorResponsiveContract(t *testing.T) {
	for _, expected := range []string{"@media (max-width: 900px)", "@media (max-width: 720px)", ".editor-tree.is-open", "data-stage=\"split\""} {
		assertEditorAssetContains(t, "editor.css", expected)
	}
}
func TestEditorAssetsContract(t *testing.T) {
	for _, expected := range []string{"data-file-tree", "data-view=\"editor\"", "data-view=\"preview\"", "data-view=\"split\"", "data-diagnostics", "data-save"} {
		server, _, _ := editorTestServer(t)
		response := performEditorRequest(server, editorRequest(http.MethodGet, editorUIPath, "", nil))
		if !strings.Contains(response.Body.String(), expected) {
			t.Fatalf("editor UI missing %q", expected)
		}
	}
}

func assertEditorAssetContains(t *testing.T, name, expected string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("assets", name))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), expected) {
		t.Fatalf("%s missing %q", name, expected)
	}
}

func TestEditorPreviewAndRaw(t *testing.T) {
	server, _, docs := editorTestServer(t)
	preview := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/preview", "preview", map[string]string{"path": "index.md", "content": "# Preview\n\n<script>alert(1)</script>\n"}))
	var previewBody struct {
		HTML string `json:"html"`
	}
	_ = json.Unmarshal(preview.Body.Bytes(), &previewBody)
	if preview.Code != http.StatusOK || strings.Contains(previewBody.HTML, "<script>alert") || !strings.Contains(previewBody.HTML, "&lt;script&gt;") {
		t.Fatalf("preview response: status=%d body=%s", preview.Code, preview.Body.String())
	}
	writeTestFile(t, docs, "data.json", "{}")
	unsupported := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/preview", "preview", map[string]string{"path": "data.json", "content": "{}"}))
	if unsupported.Code != http.StatusUnsupportedMediaType || !strings.Contains(unsupported.Body.String(), "preview_not_supported") {
		t.Fatalf("unsupported preview: %d %s", unsupported.Code, unsupported.Body.String())
	}
	raw := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/file?raw=1&path=index.md", "", nil))
	if raw.Code != http.StatusOK || raw.Header().Get("Content-Type") != "text/plain; charset=utf-8" || !strings.Contains(raw.Body.String(), "Первая версия") {
		t.Fatalf("raw response: %d %s", raw.Code, raw.Body.String())
	}
}

func TestScaffoldRegistryParity(t *testing.T) {
	expected := []string{"task-init", "module", "use-case", "flow", "screen", "decision", "standard", "runbook"}
	templates := editorTemplates()
	if len(templates) != len(expected) {
		t.Fatalf("templates: %#v", templates)
	}
	for index, key := range expected {
		if templates[index].Key != key {
			t.Fatalf("template %d = %s", index, templates[index].Key)
		}
		if key != "task-init" && !validScaffoldID(key, templates[index].spec.prefix+"AREA-001") {
			t.Fatalf("registry ID rejected for %s", key)
		}
	}
}

func TestEditorCreate(t *testing.T) {
	server, _, docs := editorTestServer(t)
	body := map[string]any{"template": "module", "language": "ru", "fields": map[string]string{"id": "MOD-NEW", "title": "Новый модуль"}}
	response := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/create", "create", body))
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), `"path":"modules/MOD-NEW.md"`) {
		t.Fatalf("create response: status=%d body=%s", response.Code, response.Body.String())
	}
	repeated := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/create", "create", body))
	if repeated.Code != http.StatusConflict || !strings.Contains(repeated.Body.String(), "file_exists") {
		t.Fatalf("repeat create: status=%d body=%s", repeated.Code, repeated.Body.String())
	}
	if runtime.GOOS != "windows" {
		outside := t.TempDir()
		if err := os.Symlink(outside, filepath.Join(docs, "runbooks")); err != nil {
			t.Fatal(err)
		}
		symlinkBody := map[string]any{"template": "runbook", "language": "ru", "fields": map[string]string{"id": "RB-SAFE-001", "title": "Safe"}}
		blocked := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/create", "create", symlinkBody))
		if blocked.Code != http.StatusForbidden {
			t.Fatalf("symlink create directory accepted: %d %s", blocked.Code, blocked.Body.String())
		}
		if _, err := os.Stat(filepath.Join(outside, "RB-SAFE-001.md")); !os.IsNotExist(err) {
			t.Fatal("create escaped through symlink")
		}
	}
}

func TestEditorJSONContract(t *testing.T) {
	server, _, docs := editorTestServer(t)
	unknown := []byte(`{"path":"index.md","content":"x","extra":true}`)
	response := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/validate", "validate", unknown))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"schemaVersion":1`) || !strings.Contains(response.Body.String(), "invalid_json") {
		t.Fatalf("unknown JSON: %d %s", response.Code, response.Body.String())
	}
	trailing := []byte(`{"path":"index.md","content":"x"} {}`)
	response = performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/validate", "validate", trailing))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_json") {
		t.Fatalf("trailing JSON: %d %s", response.Code, response.Body.String())
	}
	writeTestFile(t, docs, "empty.yaml", "")
	fileResponse := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/file?path=empty.yaml", "", nil))
	if fileResponse.Code != http.StatusOK || !strings.Contains(fileResponse.Body.String(), `"content":""`) || !strings.Contains(fileResponse.Body.String(), `"diagnostics":[]`) {
		t.Fatalf("empty file schema: %d %s", fileResponse.Code, fileResponse.Body.String())
	}
	_, currentRevision, err := server.workspace.scan(server.model)
	if err != nil || !strings.Contains(fileResponse.Body.String(), `"revision":"`+currentRevision+`"`) {
		t.Fatalf("GET /file revision is stale: %v %s", err, fileResponse.Body.String())
	}
	filesResponse := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/files", "", nil))
	if strings.Contains(filesResponse.Body.String(), `"content"`) || strings.Contains(filesResponse.Body.String(), `"diagnostics"`) {
		t.Fatalf("GET /files leaked content fields: %s", filesResponse.Body.String())
	}
}

func TestEditorLimits(t *testing.T) {
	server, _, _ := editorTestServer(t)
	content := strings.Repeat("x", editorContentLimit+1)
	response := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/validate", "validate", map[string]string{"path": "index.md", "content": content}))
	if response.Code != http.StatusRequestEntityTooLarge || !strings.Contains(response.Body.String(), "content_too_large") {
		t.Fatalf("content limit: %d %s", response.Code, response.Body.String())
	}
	oversized := bytes.Repeat([]byte{' '}, editorBodyLimit+1)
	response = performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/validate", "validate", oversized))
	if response.Code != http.StatusRequestEntityTooLarge || !strings.Contains(response.Body.String(), "request_too_large") {
		t.Fatalf("body limit: %d %s", response.Code, response.Body.String())
	}
}

func TestEditorWriteGuards(t *testing.T) {
	server, _, _ := editorTestServer(t)
	body := map[string]string{"path": "index.md", "content": "# x"}
	missing := editorRequest(http.MethodPost, editorAPIBase+"/validate", "", body)
	missing.Header.Set("Content-Type", "application/json")
	response := performEditorRequest(server, missing)
	if response.Code != http.StatusForbidden || response.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("missing action/origin accepted: %d", response.Code)
	}
	cross := editorRequest(http.MethodPost, editorAPIBase+"/validate", "validate", body)
	cross.Header.Set("Origin", "https://evil.example")
	response = performEditorRequest(server, cross)
	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "origin_forbidden") {
		t.Fatalf("cross origin accepted: %d %s", response.Code, response.Body.String())
	}
	wrongType := editorRequest(http.MethodPost, editorAPIBase+"/validate", "validate", body)
	wrongType.Header.Set("Content-Type", "text/plain")
	response = performEditorRequest(server, wrongType)
	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("wrong content type accepted: %d", response.Code)
	}
}

func TestEditorCannotExecuteCommands(t *testing.T) {
	server, _, _ := editorTestServer(t)
	body := map[string]any{"template": "module", "language": "ru", "fields": map[string]string{"id": "MOD-SAFE", "title": "Safe", "command": "touch should-not-exist"}}
	response := performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/create", "create", body))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unknown command field accepted: %d %s", response.Code, response.Body.String())
	}
	if _, err := os.Stat("should-not-exist"); !os.IsNotExist(err) {
		t.Fatal("editor executed command")
	}
}

func TestEditorAPIContract(t *testing.T) {
	server, _, _ := editorTestServer(t)
	files := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/files", "", nil))
	if files.Code != http.StatusOK || files.Header().Get("ETag") == "" || files.Header().Get("Cache-Control") != "no-store" || !strings.Contains(files.Body.String(), `"schemaVersion":1`) {
		t.Fatalf("files response: %d %#v %s", files.Code, files.Header(), files.Body.String())
	}
	notModifiedRequest := editorRequest(http.MethodGet, editorAPIBase+"/files", "", nil)
	notModifiedRequest.Header.Set("If-None-Match", files.Header().Get("ETag"))
	notModified := performEditorRequest(server, notModifiedRequest)
	if notModified.Code != http.StatusNotModified || notModified.Body.Len() != 0 {
		t.Fatalf("conditional files: %d %s", notModified.Code, notModified.Body.String())
	}
	for _, route := range []string{"/files", "/file", "/preview", "/validate", "/create"} {
		response := performEditorRequest(server, editorRequest(http.MethodDelete, editorAPIBase+route, "", nil))
		if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") == "" {
			t.Fatalf("method contract %s: %d", route, response.Code)
		}
	}
}

func TestEditorVendoredAssets(t *testing.T) {
	bundle, err := os.ReadFile("assets/codemirror.js")
	if err != nil || len(bundle) < 100000 {
		t.Fatalf("bundle missing or unexpectedly small: %d %v", len(bundle), err)
	}
	sum := sha256.Sum256(bundle)
	checksums, err := os.ReadFile("assets/codemirror.checksums.txt")
	if err != nil || !strings.Contains(string(checksums), hex.EncodeToString(sum[:])) {
		t.Fatalf("bundle checksum missing: %v", err)
	}
	lock, err := os.ReadFile("package-lock.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, version := range []string{`"codemirror": "6.0.2"`, `"@codemirror/lang-markdown": "6.5.1"`, `"@codemirror/lang-json": "6.0.2"`, `"@codemirror/lang-yaml": "6.1.3"`, `"@codemirror/lint": "6.9.7"`} {
		if !strings.Contains(string(lock), version) {
			t.Fatalf("lockfile missing %s", version)
		}
	}
	if _, err := EmbeddedFiles.ReadFile("assets/codemirror.LICENSE.txt"); err != nil {
		t.Fatal(err)
	}
	if _, err := EmbeddedFiles.ReadFile("assets/codemirror.checksums.txt"); err != nil {
		t.Fatal(err)
	}
	makefile, err := os.ReadFile("Makefile")
	if err != nil {
		t.Fatal(err)
	}
	for _, artifact := range []string{"CODEMIRROR-LICENSE.txt", "CODEMIRROR-CHECKSUMS.txt"} {
		if !strings.Contains(string(makefile), artifact) {
			t.Fatalf("release packaging missing %s", artifact)
		}
	}
}
