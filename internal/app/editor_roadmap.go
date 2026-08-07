package docudocu

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

const roadmapSourcePath = "roadmap.md"

var (
	roadmapDeliverableIDRE = regexp.MustCompile(`^DLV-[A-Z0-9]+(?:-[A-Z0-9]+)*$`)
	roadmapSuggestedIDRE   = regexp.MustCompile(`(?i)\bDLV-ROADMAP-([0-9]+)\b`)
)

type editorRoadmapStage struct {
	Anchor    string     `json:"anchor"`
	Title     string     `json:"title"`
	Status    StatusInfo `json:"status"`
	ItemCount int        `json:"itemCount"`
}

type editorRoadmapState struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Revision      string               `json:"revision"`
	Path          string               `json:"path"`
	Digest        string               `json:"digest"`
	SuggestedID   string               `json:"suggestedId"`
	Stages        []editorRoadmapStage `json:"stages"`
}

type editorRoadmapCreatedItem struct {
	StageAnchor string `json:"stageAnchor"`
	ID          string `json:"id"`
	Text        string `json:"text"`
	Completed   bool   `json:"completed"`
}

func suggestedRoadmapID(content string) string {
	maximum := 0
	for _, match := range roadmapSuggestedIDRE.FindAllStringSubmatch(content, -1) {
		value, err := strconv.Atoi(match[1])
		if err == nil && value > maximum {
			maximum = value
		}
	}
	return fmt.Sprintf("DLV-ROADMAP-%03d", maximum+1)
}

func (s *documentationServer) roadmapState() (editorRoadmapState, editorFile, error) {
	document := s.model.DocByPath[roadmapSourcePath]
	if document == nil || document.Type != "roadmap" {
		return editorRoadmapState{}, editorFile{}, workspaceFailure("roadmap_not_found", "roadmap.md не найден")
	}
	file, err := s.workspace.read(roadmapSourcePath, s.model, false)
	if err != nil {
		if workspaceErrorCode(err) == "file_not_found" {
			return editorRoadmapState{}, editorFile{}, workspaceFailure("roadmap_not_found", "roadmap.md не найден")
		}
		return editorRoadmapState{}, editorFile{}, err
	}
	analysis := analyzeMarkdown(file.Content)
	stages := make([]editorRoadmapStage, 0, len(analysis.Sections))
	for _, section := range analysis.Sections {
		stages = append(stages, editorRoadmapStage{Anchor: section.ID, Title: section.Title, Status: StatusFor(section.Metadata["status"]), ItemCount: len(section.Tasks)})
	}
	return editorRoadmapState{SchemaVersion: 1, Revision: s.revision, Path: roadmapSourcePath, Digest: file.Digest, SuggestedID: suggestedRoadmapID(file.Content), Stages: stages}, file, nil
}

func (s *documentationServer) serveEditorRoadmap(w http.ResponseWriter, _ *http.Request) {
	state, _, err := s.roadmapState()
	if err != nil {
		status := http.StatusInternalServerError
		code := workspaceErrorCode(err)
		if code == "roadmap_not_found" {
			status = http.StatusNotFound
		}
		writeEditorError(w, status, code, err.Error(), nil)
		return
	}
	writeEditorJSON(w, http.StatusOK, state)
}

func validRoadmapDeliverable(id, text string) bool {
	if !roadmapDeliverableIDRE.MatchString(id) || text == "" || strings.ContainsAny(text, "\r\n") {
		return false
	}
	found, ok := roadmapItemID(id + " " + text)
	return ok && found == id
}

func stageSection(document *Document, anchor string) (*Section, bool) {
	for index := range document.Sections {
		if document.Sections[index].ID == anchor {
			return &document.Sections[index], true
		}
	}
	return nil, false
}

func lineStartOffset(content string, zeroBasedLine int) int {
	if zeroBasedLine <= 0 {
		return 0
	}
	line := 0
	for offset := 0; offset < len(content); offset++ {
		if content[offset] == '\n' {
			line++
			if line == zeroBasedLine {
				return offset + 1
			}
		}
	}
	return len(content)
}

func lineEndOffset(content string, oneBasedLine int) int {
	if oneBasedLine < 1 {
		return 0
	}
	start := lineStartOffset(content, oneBasedLine-1)
	if relative := strings.IndexByte(content[start:], '\n'); relative >= 0 {
		return start + relative + 1
	}
	return len(content)
}

func sourceLineEnding(content string) string {
	if strings.Contains(content, "\r\n") {
		return "\r\n"
	}
	return "\n"
}

func insertRoadmapItem(content string, document *Document, anchor, id, text string) (string, error) {
	section, ok := stageSection(document, anchor)
	if !ok {
		return "", workspaceFailure("stage_not_found", "этап roadmap не найден")
	}
	eol := sourceLineEnding(content)
	offset := len(content)
	afterChecklist := len(section.Tasks) > 0
	if afterChecklist {
		lastLine := section.Tasks[0].Line
		for _, task := range section.Tasks[1:] {
			if task.Line > lastLine {
				lastLine = task.Line
			}
		}
		offset = lineEndOffset(content, lastLine)
	} else {
		for _, candidate := range document.Sections {
			if candidate.StartLine > section.StartLine {
				offset = lineStartOffset(content, candidate.StartLine)
				break
			}
		}
	}
	prefix, suffix := content[:offset], content[offset:]
	before := ""
	if prefix != "" && !strings.HasSuffix(prefix, "\n") && !strings.HasSuffix(prefix, "\r") {
		before = eol
	}
	if !afterChecklist && prefix != "" && before == "" && !strings.HasSuffix(prefix, eol+eol) {
		before = eol
	}
	after := eol
	if !afterChecklist && suffix != "" && !strings.HasPrefix(suffix, eol) {
		after += eol
	}
	return prefix + before + "- [ ] `" + id + "` " + text + after + suffix, nil
}

func (s *documentationServer) serveEditorRoadmapItems(w http.ResponseWriter, r *http.Request) {
	if !requireEditorJSONAction(w, r, "roadmap-add") {
		return
	}
	var request struct {
		StageAnchor    string `json:"stageAnchor"`
		ID             string `json:"id"`
		Text           string `json:"text"`
		ExpectedDigest string `json:"expectedDigest"`
	}
	if !decodeEditorJSON(w, r, &request) {
		return
	}
	request.StageAnchor = strings.TrimSpace(request.StageAnchor)
	request.ID = strings.ToUpper(strings.TrimSpace(request.ID))
	request.Text = strings.TrimSpace(request.Text)
	if !validRoadmapDeliverable(request.ID, request.Text) {
		writeEditorError(w, http.StatusBadRequest, "invalid_roadmap_item", "Результат должен содержать корректный уникальный DLV-* ID и непустую однострочную формулировку", nil)
		return
	}
	state, file, err := s.roadmapState()
	if err != nil {
		code := workspaceErrorCode(err)
		status := http.StatusInternalServerError
		if code == "roadmap_not_found" {
			status = http.StatusNotFound
		}
		writeEditorError(w, status, code, err.Error(), nil)
		return
	}
	if request.ExpectedDigest == "" || request.ExpectedDigest != file.Digest {
		writeEditorError(w, http.StatusConflict, "stale_digest", "roadmap.md изменён внешним процессом", state)
		return
	}
	analysis := analyzeMarkdown(file.Content)
	for _, task := range analysis.Tasks {
		if existing, ok := roadmapItemID(task.Text); ok && strings.EqualFold(existing, request.ID) {
			writeEditorError(w, http.StatusConflict, "duplicate_roadmap_id", "ID roadmap уже существует", map[string]string{"id": request.ID})
			return
		}
	}
	document := &Document{Sections: analysis.Sections}
	updated, err := insertRoadmapItem(file.Content, document, request.StageAnchor, request.ID, request.Text)
	if err != nil {
		writeEditorError(w, http.StatusNotFound, "stage_not_found", err.Error(), nil)
		return
	}
	if _, err = s.workspace.save(roadmapSourcePath, []byte(updated), request.ExpectedDigest); err != nil {
		var stale *staleFileError
		if errors.As(err, &stale) {
			currentState, _, stateErr := s.roadmapState()
			if stateErr == nil {
				writeEditorError(w, http.StatusConflict, "stale_digest", "roadmap.md изменён внешним процессом", currentState)
				return
			}
		}
		status, code := editorStatusForError(err)
		writeEditorError(w, status, code, err.Error(), nil)
		return
	}
	if _, _, err = s.rebuild(); err != nil {
		writeEditorError(w, http.StatusInternalServerError, "rebuild_failed", err.Error(), nil)
		return
	}
	state, _, err = s.roadmapState()
	if err != nil {
		writeEditorError(w, http.StatusInternalServerError, "workspace_error", err.Error(), nil)
		return
	}
	writeEditorJSON(w, http.StatusCreated, struct {
		SchemaVersion int                      `json:"schemaVersion"`
		Item          editorRoadmapCreatedItem `json:"item"`
		Roadmap       editorRoadmapState       `json:"roadmap"`
		Rebuild       editorRebuild            `json:"rebuild"`
	}{1, editorRoadmapCreatedItem{StageAnchor: request.StageAnchor, ID: request.ID, Text: request.Text, Completed: false}, state, s.rebuildPayload()})
}
