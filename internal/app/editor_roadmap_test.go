package toudocu

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func roadmapTestServer(t *testing.T, content string) (*documentationServer, string) {
	t.Helper()
	options, docs := serveTestOptions(t)
	if content != "" {
		writeTestFile(t, docs, roadmapSourcePath, content)
	}
	server, _, _, err := newDocumentationServer(options, &strings.Builder{})
	if err != nil {
		t.Fatal(err)
	}
	return server, docs
}

func roadmapStateRequest(t *testing.T, server *documentationServer) editorRoadmapState {
	t.Helper()
	response := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/roadmap", "", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("state status=%d body=%s", response.Code, response.Body.String())
	}
	var state editorRoadmapState
	if err := json.Unmarshal(response.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	return state
}

func addRoadmapRequest(server *documentationServer, body any) *httptest.ResponseRecorder {
	return performEditorRequest(server, editorRequest(http.MethodPost, editorAPIBase+"/roadmap/items", "roadmap-add", body))
}

func TestEditorRoadmapStateAndSuggestedID(t *testing.T) {
	server, _ := roadmapTestServer(t, "# Roadmap\n\n## Next release\n\n- Status: In progress\n\n- [ ] `DLV-ROADMAP-002` First.\n- [ ] `DLV-ROADMAP-010` Later.\n")
	state := roadmapStateRequest(t, server)
	if state.SchemaVersion != 1 || state.Path != roadmapSourcePath || state.Digest == "" || state.Revision == "" || state.SuggestedID != "DLV-ROADMAP-011" {
		t.Fatalf("state: %#v", state)
	}
	if len(state.Stages) != 1 || state.Stages[0].Anchor != "next-release" || state.Stages[0].Title != "Next release" || state.Stages[0].ItemCount != 2 {
		t.Fatalf("stages: %#v", state.Stages)
	}
}

func TestEditorRoadmapAddPreservesMarkdownAndRebuilds(t *testing.T) {
	content := "# Roadmap\r\n\r\nIntro.\r\n\r\n<!-- toudocu:section roadmap-stage -->\r\n<!-- toudocu\r\nstatus: in-progress\r\n-->\r\n\r\n## Planned\r\n\r\n- [ ] `DLV-KEEP-001` Existing.\r\n\r\nClosing note.\r\n\r\n## Later\r\n\r\nText.\r\n"
	server, docs := roadmapTestServer(t, content)
	state := roadmapStateRequest(t, server)
	response := addRoadmapRequest(server, map[string]any{"stageAnchor": "planned", "id": "dlv-roadmap-003", "text": "Added result.", "expectedDigest": state.Digest})
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), `"id":"DLV-ROADMAP-003"`) || !strings.Contains(response.Body.String(), `"rebuild"`) {
		t.Fatalf("add status=%d body=%s", response.Code, response.Body.String())
	}
	updated, err := os.ReadFile(filepath.Join(docs, roadmapSourcePath))
	if err != nil {
		t.Fatal(err)
	}
	want := "- [ ] `DLV-KEEP-001` Existing.\r\n- [ ] `DLV-ROADMAP-003` Added result.\r\n\r\nClosing note."
	if !strings.Contains(string(updated), want) || strings.Contains(strings.ReplaceAll(string(updated), "\r\n", ""), "\n") {
		t.Fatalf("surrounding Markdown or CRLF changed:\n%q", updated)
	}
	page, err := os.ReadFile(filepath.Join(server.options.OutputDirectory, "roadmap.html"))
	if err != nil || !strings.Contains(string(page), "DLV-ROADMAP-003") {
		t.Fatalf("portal was not rebuilt: %v", err)
	}
}

func TestEditorRoadmapAddToEmptyStage(t *testing.T) {
	server, docs := roadmapTestServer(t, "# Roadmap\n\n## Empty\n\nStage note.\n\n## Later\n\n- [ ] `DLV-LATER-001` Later.\n")
	state := roadmapStateRequest(t, server)
	response := addRoadmapRequest(server, map[string]any{"stageAnchor": "empty", "id": "DLV-ROADMAP-001", "text": "First result.", "expectedDigest": state.Digest})
	if response.Code != http.StatusCreated {
		t.Fatalf("add status=%d body=%s", response.Code, response.Body.String())
	}
	updated, _ := os.ReadFile(filepath.Join(docs, roadmapSourcePath))
	if !strings.Contains(string(updated), "Stage note.\n\n- [ ] `DLV-ROADMAP-001` First result.\n\n## Later") {
		t.Fatalf("empty-stage insertion: %s", updated)
	}
}

func TestEditorRoadmapErrorsAndGuards(t *testing.T) {
	server, docs := roadmapTestServer(t, "# Roadmap\n\n## Next\n\n- [ ] `DLV-ROADMAP-001` Existing.\n")
	state := roadmapStateRequest(t, server)
	tests := []struct {
		name   string
		body   any
		status int
		code   string
	}{
		{"duplicate", map[string]any{"stageAnchor": "next", "id": "dlv-roadmap-001", "text": "Duplicate.", "expectedDigest": state.Digest}, http.StatusConflict, "duplicate_roadmap_id"},
		{"invalid id", map[string]any{"stageAnchor": "next", "id": "UC-NO-001", "text": "Wrong kind.", "expectedDigest": state.Digest}, http.StatusBadRequest, "invalid_roadmap_item"},
		{"second id", map[string]any{"stageAnchor": "next", "id": "DLV-NEW-001", "text": "Mentions UC-NO-001.", "expectedDigest": state.Digest}, http.StatusBadRequest, "invalid_roadmap_item"},
		{"multiline", map[string]any{"stageAnchor": "next", "id": "DLV-NEW-001", "text": "First\nSecond", "expectedDigest": state.Digest}, http.StatusBadRequest, "invalid_roadmap_item"},
		{"stage", map[string]any{"stageAnchor": "missing", "id": "DLV-NEW-001", "text": "Valid.", "expectedDigest": state.Digest}, http.StatusNotFound, "stage_not_found"},
		{"unknown field", map[string]any{"stageAnchor": "next", "id": "DLV-NEW-001", "text": "Valid.", "expectedDigest": state.Digest, "extra": true}, http.StatusBadRequest, "invalid_json"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := addRoadmapRequest(server, test.body)
			if response.Code != test.status || !strings.Contains(response.Body.String(), `"code":"`+test.code+`"`) {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}

	writeTestFile(t, docs, roadmapSourcePath, "# Roadmap\n\n## Next\n\nExternally changed.\n")
	stale := addRoadmapRequest(server, map[string]any{"stageAnchor": "next", "id": "DLV-NEW-001", "text": "Valid.", "expectedDigest": state.Digest})
	if stale.Code != http.StatusConflict || !strings.Contains(stale.Body.String(), `"code":"stale_digest"`) || !strings.Contains(stale.Body.String(), `"suggestedId"`) {
		t.Fatalf("stale status=%d body=%s", stale.Code, stale.Body.String())
	}

	for _, request := range []*http.Request{
		editorRequest(http.MethodPost, editorAPIBase+"/roadmap/items", "", map[string]string{}),
		editorRequest(http.MethodPost, editorAPIBase+"/roadmap/items", "wrong", map[string]string{}),
	} {
		response := performEditorRequest(server, request)
		if response.Code != http.StatusUnsupportedMediaType && response.Code != http.StatusForbidden {
			t.Fatalf("guard status=%d body=%s", response.Code, response.Body.String())
		}
	}
	crossOrigin := editorRequest(http.MethodPost, editorAPIBase+"/roadmap/items", "roadmap-add", map[string]string{})
	crossOrigin.Header.Set("Origin", "http://evil.test")
	if response := performEditorRequest(server, crossOrigin); response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin status=%d", response.Code)
	}
}

func TestEditorRoadmapNotFound(t *testing.T) {
	server, _ := roadmapTestServer(t, "")
	response := performEditorRequest(server, editorRequest(http.MethodGet, editorAPIBase+"/roadmap", "", nil))
	if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), `"code":"roadmap_not_found"`) {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}
