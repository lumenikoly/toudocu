package toudocu

import (
	"encoding/json"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var (
	screenIDRE     = regexp.MustCompile(`^SC-[A-Z0-9]+(?:-[A-Z0-9]+)+$`)
	transitionIDRE = regexp.MustCompile(`^TR-[A-Z0-9]+-[0-9]{3,}$`)
	stateIDRE      = regexp.MustCompile(`^[A-Z0-9]+(?:-[A-Z0-9]+)*$`)
	errorIDRE      = regexp.MustCompile(`^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$`)
)

var safePreviewExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".avif": true, ".gif": true,
}

type markdownTable struct {
	Headers   []string
	Rows      []markdownTableRow
	StartLine int
}

type markdownTableRow struct {
	Cells []string
	Line  int
}

func screenTableSection(document *Document, names ...string) (Heading, int, bool) {
	targets := map[string]bool{}
	for _, name := range names {
		targets[canonicalText(name)] = true
	}
	for index, heading := range document.Headings {
		if !targets[canonicalText(heading.Title)] {
			continue
		}
		end := strings.Count(document.Content, "\n") + 1
		for _, candidate := range document.Headings[index+1:] {
			if candidate.Level <= heading.Level {
				end = candidate.Line
				break
			}
		}
		return heading, end, true
	}
	return Heading{}, 0, false
}

func parseScreenTable(document *Document, sectionNames ...string) (markdownTable, bool) {
	heading, end, found := screenTableSection(document, sectionNames...)
	if !found {
		return markdownTable{}, false
	}
	for _, candidate := range document.markdownTables {
		line := candidate.StartLine - 1
		if line <= heading.Line || line >= end {
			continue
		}
		return candidate, true
	}
	return markdownTable{}, false
}

func markdownTablesFromAnalysis(parsed markdownAnalysis) []markdownTable {
	result := []markdownTable{}
	for _, candidate := range parsed.Tables {
		table := markdownTable{Headers: candidate.Headers, StartLine: candidate.Range.Start.Line}
		for _, row := range candidate.Rows {
			table.Rows = append(table.Rows, markdownTableRow{Cells: row.Cells, Line: row.Range.Start.Line})
		}
		result = append(result, table)
	}
	return result
}

func canonicalScreenHeader(value string) string {
	aliases := map[string]string{
		"id": "id", "идентификатор": "id",
		"name": "title", "title": "title", "название": "title",
		"preview": "preview", "превью": "preview",
		"scenario": "useCase", "use case": "useCase", "сценарий": "useCase",
		"action": "action", "действие": "action",
		"condition": "condition", "условие": "condition",
		"result": "target", "target": "target", "to": "target", "результат": "target", "в": "target",
		"state": "state", "состояние": "state",
		"error": "error", "ошибка": "error",
		"message": "message", "сообщение": "message",
		"contract": "contract", "контракт": "contract",
		"type": "kind", "kind": "kind", "тип": "kind",
	}
	return aliases[canonicalText(stripInlineMarkdown(value))]
}

func screenTableColumns(model *Model, document *Document, table markdownTable, required []string) (map[string]int, bool) {
	columns := map[string]int{}
	for index, header := range table.Headers {
		key := canonicalScreenHeader(header)
		if key != "" {
			if _, exists := columns[key]; !exists {
				columns[key] = index
			}
		}
	}
	valid := true
	for _, key := range required {
		if _, exists := columns[key]; exists {
			continue
		}
		addDocumentIssue(model, document, newIssue("error", "invalid-screen-table-columns", "В таблице отсутствует обязательная колонка "+key+".", document.SourcePath, 0))
		valid = false
	}
	return columns, valid
}

func tableCell(row markdownTableRow, columns map[string]int, key string) string {
	index, exists := columns[key]
	if !exists || index >= len(row.Cells) {
		return ""
	}
	value := strings.TrimSpace(row.Cells[index])
	value = strings.TrimSpace(strings.Trim(value, "`"))
	if strings.HasPrefix(value, "**") && strings.HasSuffix(value, "**") {
		value = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(value, "**"), "**"))
	}
	if value == "—" || value == "-" {
		return ""
	}
	return value
}

func normalizeScreenKind(value string) (string, bool) {
	switch canonicalText(value) {
	case "screen", "экран":
		return "screen", true
	case "page", "страница":
		return "page", true
	case "modal", "dialog", "модальное окно":
		return "modal", true
	case "panel", "панель":
		return "panel", true
	case "external page", "внешняя страница":
		return "external", true
	case "system state", "системное состояние":
		return "system", true
	default:
		return "", false
	}
}

func normalizeTransitionKind(value string, hasError bool, targetKind string) (string, bool) {
	if hasError {
		return "error", value == "" || containsString([]string{"error", "ошибка"}, canonicalText(value))
	}
	if targetKind == "external" && strings.TrimSpace(value) == "" {
		return "external", true
	}
	switch canonicalText(value) {
	case "", "navigation", "navigate", "переход", "навигация":
		return "navigation", true
	case "redirect", "редирект", "перенаправление":
		return "redirect", true
	case "return", "back", "возврат":
		return "return", true
	case "external", "внешний переход":
		return "external", true
	case "error", "ошибка":
		return "error", true
	default:
		return "", false
	}
}

func screenTitle(document *Document, id string) string {
	title := strings.TrimSpace(document.Title)
	for _, separator := range []string{":", "—"} {
		if strings.HasPrefix(title, id+separator) {
			return strings.TrimSpace(strings.TrimPrefix(title, id+separator))
		}
	}
	return title
}

func addStandaloneIssue(model *Model, issue Issue) {
	model.Issues = append(model.Issues, issue)
}

func resolveScreenPreview(model *Model, document *Document, value string, line int) string {
	value = strings.TrimSpace(strings.Trim(value, "`"))
	if value == "" || value == "—" {
		return ""
	}
	if filepath.IsAbs(filepath.FromSlash(value)) || destinationHasScheme(value) || strings.ContainsAny(value, "?#") {
		addDocumentIssue(model, document, newIssue("error", "unsafe-screen-preview", "Preview должен быть локальным относительным путём.", document.SourcePath, line))
		return ""
	}
	absolute := filepath.Clean(filepath.Join(filepath.Dir(document.AbsolutePath), filepath.FromSlash(value)))
	if info, statErr := os.Lstat(absolute); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		addDocumentIssue(model, document, newIssue("error", "unsafe-screen-preview", "Preview не может быть символической ссылкой.", document.SourcePath, line))
		return ""
	}
	resolved, err := resolvePathForSafety(absolute)
	if err != nil || !ensureInside(model.RepositoryRoot, resolved) {
		addDocumentIssue(model, document, newIssue("error", "unsafe-screen-preview", "Preview выходит за пределы repository-root.", document.SourcePath, line))
		return ""
	}
	extension := strings.ToLower(filepath.Ext(resolved))
	if !safePreviewExtensions[extension] {
		addDocumentIssue(model, document, newIssue("error", "unsafe-screen-preview-format", "Недопустимый формат preview: "+fallbackDash(extension)+".", document.SourcePath, line))
		return ""
	}
	info, statErr := os.Lstat(resolved)
	if statErr != nil {
		addDocumentIssue(model, document, newIssue("warning", "missing-screen-preview", "Файл preview не найден: "+value+".", document.SourcePath, line))
		return ""
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		addDocumentIssue(model, document, newIssue("error", "unsafe-screen-preview", "Preview должен быть обычным файлом, а не symlink.", document.SourcePath, line))
		return ""
	}
	output, insideDocumentation := relativePathInside(model.RootDirectory, resolved)
	if !insideDocumentation {
		repositoryPath, insideRepository := relativePathInside(model.RepositoryRoot, resolved)
		if !insideRepository {
			addDocumentIssue(model, document, newIssue("error", "unsafe-screen-preview", "Preview выходит за пределы repository-root.", document.SourcePath, line))
			return ""
		}
		output = path.Join("_screen-assets", repositoryPath)
	} else {
		output = path.Clean(output)
	}
	model.Assets[output] = resolved
	return output
}

func parseScreenStates(model *Model, document *Document, defaultPreview string) []ScreenState {
	states := []ScreenState{{ID: "DEFAULT", Preview: defaultPreview}}
	table, found := parseScreenTable(document, "Состояния", "States")
	if !found {
		return states
	}
	columns, valid := screenTableColumns(model, document, table, []string{"id", "title", "preview"})
	if !valid {
		return states
	}
	seen := map[string]int{"DEFAULT": 0}
	for _, row := range table.Rows {
		id := strings.ToUpper(tableCell(row, columns, "id"))
		if !stateIDRE.MatchString(id) {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-state-id", "Некорректный идентификатор состояния "+fallbackDash(id)+".", document.SourcePath, row.Line))
			continue
		}
		preview := resolveScreenPreview(model, document, tableCell(row, columns, "preview"), row.Line)
		if index, exists := seen[id]; exists {
			if id == "DEFAULT" && index == 0 {
				if defaultPreview != "" && preview != "" && defaultPreview != preview {
					addDocumentIssue(model, document, newIssue("error", "screen-default-preview-mismatch", "Preview экрана и состояния DEFAULT должны совпадать.", document.SourcePath, row.Line))
				}
				states[0] = ScreenState{ID: "DEFAULT", Title: tableCell(row, columns, "title"), Preview: fallbackValue(preview, defaultPreview)}
				seen[id] = row.Line
				continue
			}
			addDocumentIssue(model, document, newIssue("error", "duplicate-screen-state-id", "Состояние "+id+" объявлено повторно.", document.SourcePath, row.Line))
			continue
		}
		seen[id] = row.Line
		states = append(states, ScreenState{ID: id, Title: tableCell(row, columns, "title"), Preview: preview})
	}
	return states
}

func parseErrorDefinitions(model *Model) []ErrorDefinition {
	result := []ErrorDefinition{}
	seen := map[string]ErrorDefinition{}
	for _, document := range model.Collections["contract"] {
		table, found := parseScreenTable(document, "Ошибки", "Errors")
		if !found {
			continue
		}
		columns, valid := screenTableColumns(model, document, table, []string{"id", "message"})
		if !valid {
			continue
		}
		for _, row := range table.Rows {
			id := strings.ToUpper(tableCell(row, columns, "id"))
			message := tableCell(row, columns, "message")
			if !errorIDRE.MatchString(id) {
				addDocumentIssue(model, document, newIssue("error", "invalid-error-id", "Некорректный код ошибки "+fallbackDash(id)+".", document.SourcePath, row.Line))
				continue
			}
			if message == "" {
				addDocumentIssue(model, document, newIssue("error", "missing-error-message", "Для ошибки "+id+" не указано сообщение.", document.SourcePath, row.Line))
			}
			if previous, exists := seen[id]; exists {
				addDocumentIssue(model, document, newIssue("error", "duplicate-error-id", "Ошибка "+id+" уже объявлена в "+previous.Document+".", document.SourcePath, row.Line))
				continue
			}
			definition := ErrorDefinition{ID: id, Message: message, Document: document.SourcePath, Line: row.Line}
			seen[id] = definition
			result = append(result, definition)
		}
	}
	return result
}

func parseScreenDocument(model *Model, document *Document) KnowledgeScreen {
	id := strings.TrimSpace(document.Metadata["id"])
	kind, kindValid := normalizeScreenKind(document.Metadata["type"])
	if !screenIDRE.MatchString(id) {
		addDocumentIssue(model, document, newIssue("error", "invalid-screen-id", "Идентификатор экрана должен соответствовать SC-<ОБЛАСТЬ>-<НАЗВАНИЕ>.", document.SourcePath, 0))
	}
	for _, key := range []string{"id", "type", "module", "status"} {
		if strings.TrimSpace(document.Metadata[key]) == "" {
			addDocumentIssue(model, document, newIssue("error", "missing-screen-field", "Для экрана обязательно поле «"+displayFieldNames[key]+"».", document.SourcePath, 0))
		}
	}
	if !kindValid {
		addDocumentIssue(model, document, newIssue("error", "invalid-screen-kind", "Недопустимый тип экрана.", document.SourcePath, 0))
	}
	allowedStatus := map[string]bool{"done": true, "in-progress": true, "planned": true, "blocked": true, "obsolete": true}
	if !document.Status.Recognized || !allowedStatus[document.Status.Kind] {
		addDocumentIssue(model, document, newIssue("error", "invalid-screen-status", "Недопустимый статус экрана «"+document.Metadata["status"]+"».", document.SourcePath, 0))
	}
	preview := resolveScreenPreview(model, document, document.Metadata["preview"], 0)
	states := parseScreenStates(model, document, preview)
	route := strings.TrimSpace(strings.Trim(document.Metadata["route"], "`"))
	if kind == "external" {
		lower := strings.ToLower(route)
		if !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "http://") {
			addDocumentIssue(model, document, newIssue("error", "invalid-external-screen-route", "Внешняя страница требует маршрут HTTP(S).", document.SourcePath, 0))
		}
	} else if destinationHasScheme(route) {
		addDocumentIssue(model, document, newIssue("error", "invalid-screen-route", "Локальный экран не может использовать внешний URL как маршрут.", document.SourcePath, 0))
	}
	component := strings.TrimSpace(strings.Trim(document.Metadata["component"], "`"))
	if component != "" {
		if filepath.IsAbs(filepath.FromSlash(component)) {
			addDocumentIssue(model, document, newIssue("error", "unsafe-screen-component", "Путь компонента должен быть относительным repository-root.", document.SourcePath, 0))
		} else {
			target := filepath.Clean(filepath.Join(model.RepositoryRoot, filepath.FromSlash(component)))
			if !ensureInside(model.RepositoryRoot, target) {
				addDocumentIssue(model, document, newIssue("error", "unsafe-screen-component", "Путь компонента выходит за пределы repository-root.", document.SourcePath, 0))
			} else if _, err := os.Stat(target); err != nil {
				addDocumentIssue(model, document, newIssue("warning", "missing-screen-component", "Путь компонента не существует: "+component+".", document.SourcePath, 0))
			}
		}
	}
	return KnowledgeScreen{
		ID: id, Title: screenTitle(document, id), Description: document.Description,
		ModuleID: strings.TrimSpace(document.Metadata["module"]), Kind: kind,
		Route: route, Status: document.Status, Preview: preview,
		Component: component, Owner: document.Metadata["owner"],
		Updated: document.Metadata["updated"], ParentID: strings.TrimSpace(document.Metadata["parentScreen"]), States: states,
		Document: document.SourcePath, UseCaseIDs: []string{}, WorkItemIDs: []string{}, ContractDocuments: []string{},
		IncomingTransitionIDs: []string{}, OutgoingTransitionIDs: []string{},
	}
}

func resolveTransitionContract(model *Model, document *Document, value string, line int) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	plain := strings.TrimSpace(strings.Trim(value, "`"))
	if strings.HasPrefix(plain, "CON-") {
		for _, contract := range model.Collections["contract"] {
			if contract.Metadata["id"] == plain {
				return contract.SourcePath
			}
		}
		addDocumentIssue(model, document, newIssue("error", "unknown-transition-contract", "Переход ссылается на неизвестный контракт "+plain+".", document.SourcePath, line))
		return ""
	}
	open := strings.Index(value, "](")
	if strings.HasPrefix(value, "[") && open > 1 && strings.HasSuffix(value, ")") {
		destination := value[open+2 : len(value)-1]
		for _, resolved := range document.ResolvedLinks {
			if resolved.Destination == destination && resolved.TargetDocument != nil && resolved.TargetDocument.Type == "contract" {
				return resolved.TargetDocument.SourcePath
			}
		}
	}
	addDocumentIssue(model, document, newIssue("error", "unknown-transition-contract", "Контракт перехода должен быть CON-* или ссылкой на contract document.", document.SourcePath, line))
	return ""
}

func parseTransitionsForScreen(model *Model, document *Document, screen KnowledgeScreen, screensByID map[string]*KnowledgeScreen, errorsByID map[string]ErrorDefinition) []ScreenTransition {
	table, found := parseScreenTable(document, "Переходы", "Transitions")
	if !found {
		return []ScreenTransition{}
	}
	columns, valid := screenTableColumns(model, document, table, []string{"id", "action", "condition", "target"})
	if !valid {
		return []ScreenTransition{}
	}
	result := []ScreenTransition{}
	stateIDs := map[string]bool{}
	for _, state := range screen.States {
		stateIDs[state.ID] = true
	}
	for _, row := range table.Rows {
		id := strings.ToUpper(tableCell(row, columns, "id"))
		useCaseID := strings.ToUpper(tableCell(row, columns, "useCase"))
		targetID := strings.ToUpper(tableCell(row, columns, "target"))
		stateID := strings.ToUpper(tableCell(row, columns, "state"))
		errorID := strings.ToUpper(tableCell(row, columns, "error"))
		action := tableCell(row, columns, "action")
		condition := tableCell(row, columns, "condition")
		message := tableCell(row, columns, "message")
		contract := resolveTransitionContract(model, document, tableCell(row, columns, "contract"), row.Line)
		if !transitionIDRE.MatchString(id) {
			addDocumentIssue(model, document, newIssue("error", "invalid-transition-id", "Идентификатор перехода должен соответствовать TR-<ОБЛАСТЬ>-<НОМЕР>.", document.SourcePath, row.Line))
		}
		if action == "" || condition == "" || targetID == "" {
			addDocumentIssue(model, document, newIssue("error", "incomplete-screen-transition", "Для перехода обязательны ID, действие, условие и результат.", document.SourcePath, row.Line))
		}
		if useCaseID == "" {
			addDocumentIssue(model, document, newIssue("error", "transition-without-use-case", "Для перехода "+fallbackDash(id)+" не указан use case.", document.SourcePath, row.Line))
		}
		target := screensByID[targetID]
		if target == nil {
			addDocumentIssue(model, document, newIssue("error", "dangling-screen-reference", "Переход ссылается на неизвестный экран "+fallbackDash(targetID)+".", document.SourcePath, row.Line))
		}
		if stateID != "" {
			targetStates := map[string]bool{}
			if target != nil {
				for _, state := range target.States {
					targetStates[state.ID] = true
				}
			}
			if !targetStates[stateID] {
				addDocumentIssue(model, document, newIssue("error", "unknown-screen-state", "Переход ссылается на неизвестное состояние "+stateID+" целевого экрана.", document.SourcePath, row.Line))
			}
		}
		if errorID != "" {
			if !errorIDRE.MatchString(errorID) {
				addDocumentIssue(model, document, newIssue("error", "invalid-error-id", "Некорректный код ошибки "+errorID+".", document.SourcePath, row.Line))
			} else if _, exists := errorsByID[errorID]; !exists {
				addDocumentIssue(model, document, newIssue("error", "unknown-transition-error", "Ошибка "+errorID+" не объявлена в contracts.", document.SourcePath, row.Line))
			} else if message == "" {
				message = errorsByID[errorID].Message
			}
		}
		targetKind := ""
		if target != nil {
			targetKind = target.Kind
		}
		kind, kindValid := normalizeTransitionKind(tableCell(row, columns, "kind"), errorID != "", targetKind)
		if !kindValid {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-transition-kind", "Недопустимый тип перехода.", document.SourcePath, row.Line))
		}
		if targetID == screen.ID && stateID == "" && errorID == "" && message == "" {
			addDocumentIssue(model, document, newIssue("error", "unexplained-self-transition", "Переход в тот же экран требует состояния, ошибки или сообщения.", document.SourcePath, row.Line))
		}
		result = append(result, ScreenTransition{
			ID: id, UseCaseID: useCaseID, FromID: screen.ID, ToID: targetID, Action: action, Condition: condition,
			StateID: stateID, ErrorID: errorID, Message: message, Contract: contract, Kind: kind,
			Document: document.SourcePath, Line: row.Line,
		})
	}
	return result
}

func validateScreenParents(model *Model, screens []KnowledgeScreen, byID map[string]*KnowledgeScreen) {
	for _, screen := range screens {
		if screen.ParentID == "" {
			continue
		}
		document := model.DocByPath[screen.Document]
		if screen.ParentID == screen.ID || byID[screen.ParentID] == nil {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-parent", "Родительский экран "+screen.ParentID+" не существует или совпадает с экраном.", screen.Document, 0))
		}
	}
	visiting, visited := map[string]bool{}, map[string]bool{}
	var visit func(string, []string)
	visit = func(id string, stack []string) {
		if visiting[id] {
			screen := byID[id]
			addDocumentIssue(model, model.DocByPath[screen.Document], newIssue("error", "screen-parent-cycle", "Цикл sitemap: "+strings.Join(append(stack, id), " → ")+".", screen.Document, 0))
			return
		}
		if visited[id] || byID[id] == nil {
			return
		}
		visiting[id] = true
		if parent := byID[id].ParentID; parent != "" {
			visit(parent, append(stack, id))
		}
		delete(visiting, id)
		visited[id] = true
	}
	for id := range byID {
		visit(id, nil)
	}
}

func reachableFrom(start string, transitions []ScreenTransition) map[string]bool {
	adjacency := map[string][]string{}
	for _, transition := range transitions {
		adjacency[transition.FromID] = append(adjacency[transition.FromID], transition.ToID)
	}
	result := map[string]bool{}
	queue := []string{start}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if result[id] {
			continue
		}
		result[id] = true
		queue = append(queue, adjacency[id]...)
	}
	return result
}

func reachableFromMany(starts []string, transitions []ScreenTransition) map[string]bool {
	adjacency := map[string][]string{}
	for _, transition := range transitions {
		adjacency[transition.FromID] = append(adjacency[transition.FromID], transition.ToID)
	}
	result := map[string]bool{}
	queue := append([]string{}, starts...)
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if result[id] {
			continue
		}
		result[id] = true
		queue = append(queue, adjacency[id]...)
	}
	return result
}

func screensOnPaths(screens []KnowledgeScreen, transitions []ScreenTransition, start, end string) map[string]bool {
	forward := reachableFrom(start, transitions)
	reversed := make([]ScreenTransition, 0, len(transitions))
	for _, transition := range transitions {
		reversed = append(reversed, ScreenTransition{FromID: transition.ToID, ToID: transition.FromID})
	}
	backward := reachableFrom(end, reversed)
	result := map[string]bool{}
	if !forward[end] {
		return result
	}
	for _, screen := range screens {
		if forward[screen.ID] && backward[screen.ID] {
			result[screen.ID] = true
		}
	}
	return result
}

func cycleNodes(transitions []ScreenTransition) map[string]bool {
	adjacency := map[string][]string{}
	for _, transition := range transitions {
		adjacency[transition.FromID] = append(adjacency[transition.FromID], transition.ToID)
	}
	index := 0
	indices, low := map[string]int{}, map[string]int{}
	onStack := map[string]bool{}
	stack := []string{}
	cyclic := map[string]bool{}
	var strongConnect func(string)
	strongConnect = func(id string) {
		index++
		indices[id], low[id] = index, index
		stack = append(stack, id)
		onStack[id] = true
		for _, next := range adjacency[id] {
			if indices[next] == 0 {
				strongConnect(next)
				if low[next] < low[id] {
					low[id] = low[next]
				}
			} else if onStack[next] && indices[next] < low[id] {
				low[id] = indices[next]
			}
		}
		if low[id] != indices[id] {
			return
		}
		component := []string{}
		for len(stack) > 0 {
			node := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			onStack[node] = false
			component = append(component, node)
			if node == id {
				break
			}
		}
		if len(component) > 1 {
			for _, node := range component {
				cyclic[node] = true
			}
		} else {
			for _, next := range adjacency[id] {
				if next == id {
					cyclic[id] = true
				}
			}
		}
	}
	for id := range adjacency {
		if indices[id] == 0 {
			strongConnect(id)
		}
	}
	return cyclic
}

func buildPlayableFlows(model *Model, screensByID map[string]*KnowledgeScreen, transitions []ScreenTransition) []PlayableFlow {
	result := []PlayableFlow{}
	for index := range model.Knowledge.UseCases {
		useCase := &model.Knowledge.UseCases[index]
		hasTransitions := false
		flowTransitions := []ScreenTransition{}
		for _, transition := range transitions {
			if transition.UseCaseID == "" || transition.UseCaseID == useCase.ID {
				flowTransitions = append(flowTransitions, transition)
			}
			if transition.UseCaseID == useCase.ID {
				hasTransitions = true
			}
		}
		if useCase.StartScreenID == "" && len(useCase.TerminalScreens) == 0 && !hasTransitions {
			continue
		}
		document := model.DocByPath[useCase.Document]
		issueCodes := []string{}
		for _, issue := range model.Issues {
			if issue.Severity == "error" && strings.HasPrefix(issue.DocumentPath, "screens/") && issue.DocumentPath != "screens/hotspots.json" {
				issueCodes = append(issueCodes, issue.Code)
			}
		}
		addFlowError := func(code, message string) {
			addDocumentIssue(model, document, newIssue("error", code, message, useCase.Document, 0))
			issueCodes = append(issueCodes, code)
		}
		if screensByID[useCase.StartScreenID] == nil {
			addFlowError("missing-flow-start-screen", "Для сценария не указан существующий начальный экран.")
		}
		if len(useCase.TerminalScreens) == 0 {
			addFlowError("missing-flow-terminal-screen", "Для сценария не указаны конечные экраны.")
		}
		for _, id := range useCase.TerminalScreens {
			if screensByID[id] == nil {
				addFlowError("unknown-flow-terminal-screen", "Сценарий ссылается на неизвестный конечный экран "+id+".")
			}
		}
		reachable := map[string]bool{}
		if screensByID[useCase.StartScreenID] != nil {
			reachable = reachableFrom(useCase.StartScreenID, flowTransitions)
		}
		terminalReachable := false
		for _, id := range useCase.TerminalScreens {
			terminalReachable = terminalReachable || reachable[id]
		}
		if len(reachable) > 0 && !terminalReachable {
			addFlowError("unreachable-flow-terminal", "Из начального экрана нельзя достичь ни одного конечного экрана.")
		}
		for _, id := range useCase.ScreenIDs {
			if screensByID[id] == nil {
				addFlowError("dangling-screen-reference", "Сценарий ссылается на неизвестный экран "+id+".")
			} else if !reachable[id] {
				addFlowError("unreachable-use-case-screen", "Экран "+id+" недостижим в сценарии.")
			}
		}
		outgoing := map[string]int{}
		outgoingTransitions := map[string][]ScreenTransition{}
		branchLabels := map[string]map[string]bool{}
		for _, transition := range flowTransitions {
			if reachable[transition.FromID] && reachable[transition.ToID] {
				outgoing[transition.FromID]++
				outgoingTransitions[transition.FromID] = append(outgoingTransitions[transition.FromID], transition)
				if branchLabels[transition.FromID] == nil {
					branchLabels[transition.FromID] = map[string]bool{}
				}
				label := canonicalText(transition.Action + " " + transition.Condition)
				if branchLabels[transition.FromID][label] {
					addFlowError("duplicate-flow-branch-label", "У экрана "+transition.FromID+" повторяется подпись ветки «"+transition.Action+" · "+transition.Condition+"».")
				}
				branchLabels[transition.FromID][label] = true
			}
		}
		terminalSet := map[string]bool{}
		for _, id := range useCase.TerminalScreens {
			terminalSet[id] = true
		}
		for id := range reachable {
			if !terminalSet[id] && outgoing[id] == 0 {
				addFlowError("flow-dead-end", "Неконечный экран "+id+" не имеет исходящего перехода.")
			}
		}
		cyclic := cycleNodes(flowTransitions)
		if len(cyclic) > 0 && !useCase.AllowCycle {
			addFlowError("forbidden-flow-cycle", "Сценарий содержит цикл без «Разрешить цикл: Да».")
		}
		reversed := make([]ScreenTransition, 0, len(flowTransitions))
		for _, transition := range flowTransitions {
			reversed = append(reversed, ScreenTransition{FromID: transition.ToID, ToID: transition.FromID})
		}
		canReachTerminal := reachableFromMany(useCase.TerminalScreens, reversed)
		for id := range cyclic {
			if reachable[id] && !canReachTerminal[id] {
				addFlowError("flow-cycle-without-exit", "Цикл с экраном "+id+" не имеет выхода к конечному экрану.")
			}
		}
		for _, transition := range flowTransitions {
			if !reachable[transition.FromID] || transition.ErrorID == "" {
				continue
			}
			hasExit := terminalSet[transition.ToID]
			for _, candidate := range outgoingTransitions[transition.ToID] {
				if candidate.ID != transition.ID && candidate.ErrorID != transition.ErrorID {
					hasExit = true
				}
			}
			if !hasExit {
				addFlowError("error-state-without-exit", "После ошибки "+transition.ErrorID+" на экране "+transition.ToID+" нет выхода.")
			}
		}
		screenIDs := []string{}
		for id := range reachable {
			screenIDs = append(screenIDs, id)
			if screen := screensByID[id]; screen != nil {
				screen.UseCaseIDs = append(screen.UseCaseIDs, useCase.ID)
				screen.Reachable = true
			}
		}
		sort.SliceStable(screenIDs, func(i, j int) bool { return naturalCompare(screenIDs[i], screenIDs[j]) < 0 })
		transitionIDs := []string{}
		for _, transition := range flowTransitions {
			if reachable[transition.FromID] && reachable[transition.ToID] {
				transitionIDs = append(transitionIDs, transition.ID)
			}
		}
		useCase.ScreenIDs = screenIDs
		result = append(result, PlayableFlow{
			UseCaseID: useCase.ID, StartScreenID: useCase.StartScreenID, ReachableScreens: screenIDs,
			TerminalScreens: append([]string{}, useCase.TerminalScreens...), TransitionIDs: transitionIDs,
			Result: flowResult(document), Valid: len(issueCodes) == 0, IssueCodes: uniqueStrings(issueCodes),
		})
	}
	return result
}

func flowResult(document *Document) string {
	if document == nil {
		return ""
	}
	if section := sectionByNames(document, []string{"Постусловия", "Postconditions"}); section != nil {
		return strings.TrimSpace(section.Text)
	}
	return ""
}

func parseHotspots(model *Model, transitionsByID map[string]ScreenTransition, screensByID map[string]*KnowledgeScreen) []Hotspot {
	file := filepath.Join(model.RootDirectory, "screens", "hotspots.json")
	data, exists := model.sourceOverlay["screens/hotspots.json"]
	var err error
	if !exists {
		data, err = os.ReadFile(file)
	}
	if os.IsNotExist(err) {
		return []Hotspot{}
	}
	if err != nil {
		addStandaloneIssue(model, newIssue("error", "hotspots-read-failed", err.Error(), "screens/hotspots.json", 0))
		return []Hotspot{}
	}
	var raw map[string][]struct {
		Transition     string  `json:"transition"`
		X              float64 `json:"x"`
		Y              float64 `json:"y"`
		Width          float64 `json:"width"`
		Height         float64 `json:"height"`
		AllowDuplicate bool    `json:"allowDuplicate"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		addStandaloneIssue(model, newIssue("error", "invalid-hotspots-json", "Некорректный hotspots.json: "+err.Error(), "screens/hotspots.json", 0))
		return []Hotspot{}
	}
	result := []Hotspot{}
	screenIDs := make([]string, 0, len(raw))
	for screenID := range raw {
		screenIDs = append(screenIDs, screenID)
	}
	sort.SliceStable(screenIDs, func(i, j int) bool { return naturalCompare(screenIDs[i], screenIDs[j]) < 0 })
	for _, screenID := range screenIDs {
		items := raw[screenID]
		if screensByID[screenID] == nil {
			addStandaloneIssue(model, newIssue("error", "unknown-hotspot-screen", "Hotspot ссылается на неизвестный экран "+screenID+".", "screens/hotspots.json", 0))
			continue
		}
		seen := map[string]bool{}
		for _, item := range items {
			transition := transitionsByID[item.Transition]
			valid := true
			if transition.ID == "" || transition.FromID != screenID {
				addStandaloneIssue(model, newIssue("error", "unknown-hotspot-transition", "Hotspot ссылается на неизвестный или чужой переход "+item.Transition+".", "screens/hotspots.json", 0))
				valid = false
			}
			if item.X < 0 || item.Y < 0 || item.Width <= 0 || item.Height <= 0 || item.X+item.Width > 100 || item.Y+item.Height > 100 {
				addStandaloneIssue(model, newIssue("error", "invalid-hotspot-bounds", "Координаты hotspot должны оставаться внутри 0–100.", "screens/hotspots.json", 0))
				valid = false
			}
			if seen[item.Transition] && !item.AllowDuplicate {
				addStandaloneIssue(model, newIssue("error", "duplicate-hotspot-transition", "Hotspot перехода "+item.Transition+" повторяется без allowDuplicate.", "screens/hotspots.json", 0))
				valid = false
			}
			seen[item.Transition] = true
			if valid {
				result = append(result, Hotspot{
					ScreenID: screenID, TransitionID: item.Transition, X: item.X, Y: item.Y,
					Width: item.Width, Height: item.Height, AllowDuplicate: item.AllowDuplicate,
				})
			}
		}
	}
	return result
}

func buildTraceability(model *Model, transitionsByID map[string]ScreenTransition, screensByID map[string]*KnowledgeScreen) []TraceabilityRow {
	rows := []TraceabilityRow{}
	covered := map[string]bool{}
	for itemIndex := range model.Knowledge.WorkItems {
		item := &model.Knowledge.WorkItems[itemIndex]
		declared := map[string]bool{}
		for _, transitionID := range item.TransitionIDs {
			declared[transitionID] = true
			if transitionsByID[transitionID].ID == "" {
				addDocumentIssue(model, item.ownerDoc, newIssue("error", "dangling-transition-reference", "Задача "+item.ID+" ссылается на неизвестный переход "+transitionID+".", item.Document, item.line))
			}
		}
		traced := map[string]bool{}
		for _, criterion := range item.Verification {
			for index, transitionID := range criterion.Transitions {
				transition := transitionsByID[transitionID]
				if transition.ID == "" {
					addDocumentIssue(model, item.ownerDoc, newIssue("error", "unknown-criterion-transition", "Критерий "+criterion.CriterionID+" ссылается на неизвестный переход "+transitionID+".", item.Document, item.line))
					continue
				}
				if !declared[transitionID] {
					addDocumentIssue(model, item.ownerDoc, newIssue("error", "undeclared-task-transition", "Переход "+transitionID+" из traceability не указан в metadata задачи.", item.Document, item.line))
				}
				reference := ""
				if index < len(criterion.References) {
					reference = criterion.References[index]
				} else if len(criterion.References) > 0 {
					reference = criterion.References[0]
				}
				if reference == "" {
					addDocumentIssue(model, item.ownerDoc, newIssue("error", "missing-traceability-verification", "Для "+criterion.CriterionID+" и "+transitionID+" не указана проверка.", item.Document, item.line))
				}
				traced[transitionID], covered[transitionID] = true, true
				rows = append(rows, TraceabilityRow{
					UseCaseID: transition.UseCaseID, ScreenID: transition.FromID, TransitionID: transitionID,
					TaskID: item.ID, CriterionID: criterion.CriterionID, Verification: reference,
				})
			}
		}
		for transitionID := range declared {
			if transitionsByID[transitionID].ID != "" && !traced[transitionID] {
				addDocumentIssue(model, item.ownerDoc, newIssue("error", "task-transition-without-criterion", "Переход "+transitionID+" не связан с критерием приёмки.", item.Document, item.line))
			}
		}
		for _, screenID := range item.ScreenIDs {
			if screensByID[screenID] == nil {
				addDocumentIssue(model, item.ownerDoc, newIssue("error", "dangling-screen-reference", "Задача "+item.ID+" ссылается на неизвестный экран "+screenID+".", item.Document, item.line))
			} else {
				screensByID[screenID].WorkItemIDs = append(screensByID[screenID].WorkItemIDs, item.ID)
			}
		}
	}
	transitionIDs := make([]string, 0, len(transitionsByID))
	for transitionID := range transitionsByID {
		transitionIDs = append(transitionIDs, transitionID)
	}
	sort.SliceStable(transitionIDs, func(i, j int) bool { return naturalCompare(transitionIDs[i], transitionIDs[j]) < 0 })
	for _, transitionID := range transitionIDs {
		transition := transitionsByID[transitionID]
		if !covered[transition.ID] {
			document := model.DocByPath[transition.Document]
			addDocumentIssue(model, document, newIssue("warning", "transition-without-test", "Переход "+transition.ID+" не связан с проверкой.", transition.Document, transition.Line))
		}
	}
	return rows
}

func buildScreenKnowledge(model *Model) {
	if legacy := model.DocByPath["screens/map.md"]; legacy != nil {
		addDocumentIssue(model, legacy, newIssue("error", "legacy-screen-map-not-supported", "screens/map.md больше не поддерживается; перенесите экраны и переходы в SC-*.md.", legacy.SourcePath, 0))
	}
	if len(model.Collections["screen"]) == 0 {
		hasReferences := false
		for _, useCase := range model.Knowledge.UseCases {
			hasReferences = hasReferences || useCase.StartScreenID != "" || len(useCase.TerminalScreens) > 0 || len(useCase.ScreenIDs) > 0
		}
		for _, item := range model.Knowledge.WorkItems {
			hasReferences = hasReferences || len(item.ScreenIDs) > 0 || len(item.TransitionIDs) > 0
		}
		if hasReferences {
			addStandaloneIssue(model, newIssue("error", "missing-screen-documents", "Ссылки на экраны требуют документов screens/SC-*.md.", "", 0))
		}
		return
	}
	errors := parseErrorDefinitions(model)
	errorsByID := map[string]ErrorDefinition{}
	for _, definition := range errors {
		errorsByID[definition.ID] = definition
	}
	screens := []KnowledgeScreen{}
	screensByID := map[string]*KnowledgeScreen{}
	routes := map[string]string{}
	for _, document := range model.Collections["screen"] {
		screen := parseScreenDocument(model, document)
		if previous := screensByID[screen.ID]; screen.ID != "" && previous != nil {
			addDocumentIssue(model, document, newIssue("error", "duplicate-screen-id", "Экран "+screen.ID+" уже объявлен в "+previous.Document+".", document.SourcePath, 0))
		}
		screens = append(screens, screen)
		if screen.ID != "" {
			screensByID[screen.ID] = &screens[len(screens)-1]
		}
		if screen.Route != "" {
			if previous := routes[screen.Route]; previous != "" {
				addDocumentIssue(model, document, newIssue("error", "duplicate-screen-route", "Маршрут "+screen.Route+" уже используется экраном "+previous+".", document.SourcePath, 0))
			}
			routes[screen.Route] = screen.ID
		}
	}
	moduleByID := map[string]*KnowledgeModule{}
	for index := range model.Knowledge.Modules {
		model.Knowledge.Modules[index].ScreenIDs = []string{}
		moduleByID[model.Knowledge.Modules[index].ID] = &model.Knowledge.Modules[index]
	}
	for index := range screens {
		screen := &screens[index]
		screensByID[screen.ID] = screen
		if module := moduleByID[screen.ModuleID]; module != nil {
			module.ScreenIDs = append(module.ScreenIDs, screen.ID)
		} else {
			addDocumentIssue(model, model.DocByPath[screen.Document], newIssue("error", "dangling-module-reference", "Экран "+screen.ID+" ссылается на неизвестный модуль "+screen.ModuleID+".", screen.Document, 0))
		}
	}
	validateScreenParents(model, screens, screensByID)
	transitions := []ScreenTransition{}
	transitionsByID := map[string]ScreenTransition{}
	useCasesByID := map[string]bool{}
	for _, useCase := range model.Knowledge.UseCases {
		useCasesByID[useCase.ID] = true
	}
	for _, screen := range screens {
		document := model.DocByPath[screen.Document]
		for _, transition := range parseTransitionsForScreen(model, document, screen, screensByID, errorsByID) {
			if previous := transitionsByID[transition.ID]; transition.ID != "" && previous.ID != "" {
				addDocumentIssue(model, document, newIssue("error", "duplicate-transition-id", "Переход "+transition.ID+" уже объявлен в "+previous.Document+".", document.SourcePath, transition.Line))
			}
			if transition.UseCaseID != "" && !useCasesByID[transition.UseCaseID] {
				addDocumentIssue(model, document, newIssue("error", "dangling-use-case-reference", "Переход ссылается на неизвестный сценарий "+transition.UseCaseID+".", document.SourcePath, transition.Line))
			}
			transitions = append(transitions, transition)
			transitionsByID[transition.ID] = transition
		}
	}
	for _, transition := range transitions {
		if source := screensByID[transition.FromID]; source != nil {
			source.OutgoingTransitionIDs = append(source.OutgoingTransitionIDs, transition.ID)
			if transition.Contract != "" {
				source.ContractDocuments = append(source.ContractDocuments, transition.Contract)
			}
			if definition, exists := errorsByID[transition.ErrorID]; exists {
				source.ContractDocuments = append(source.ContractDocuments, definition.Document)
			}
		}
		if target := screensByID[transition.ToID]; target != nil {
			target.IncomingTransitionIDs = append(target.IncomingTransitionIDs, transition.ID)
		}
	}
	model.Knowledge.Screens = screens
	model.Knowledge.Transitions = transitions
	model.Knowledge.Errors = errors
	model.Knowledge.PlayableFlows = buildPlayableFlows(model, screensByID, transitions)
	model.Knowledge.Hotspots = parseHotspots(model, transitionsByID, screensByID)
	model.Knowledge.Traceability = buildTraceability(model, transitionsByID, screensByID)
	for index := range model.Knowledge.Screens {
		screen := &model.Knowledge.Screens[index]
		if len(screen.IncomingTransitionIDs) == 0 && len(screen.OutgoingTransitionIDs) == 0 {
			addDocumentIssue(model, model.DocByPath[screen.Document], newIssue("warning", "isolated-screen", "Экран "+screen.ID+" изолирован от карты.", screen.Document, 0))
		}
		if len(model.Knowledge.PlayableFlows) > 0 && !screen.Reachable {
			addDocumentIssue(model, model.DocByPath[screen.Document], newIssue("warning", "unreachable-screen", "Экран "+screen.ID+" недостижим ни в одном playable flow.", screen.Document, 0))
		}
		screen.UseCaseIDs = uniqueStrings(screen.UseCaseIDs)
		screen.WorkItemIDs = uniqueStrings(screen.WorkItemIDs)
		screen.ContractDocuments = uniqueStrings(screen.ContractDocuments)
		sort.SliceStable(screen.UseCaseIDs, func(i, j int) bool { return naturalCompare(screen.UseCaseIDs[i], screen.UseCaseIDs[j]) < 0 })
		sort.SliceStable(screen.WorkItemIDs, func(i, j int) bool { return naturalCompare(screen.WorkItemIDs[i], screen.WorkItemIDs[j]) < 0 })
		sort.SliceStable(screen.IncomingTransitionIDs, func(i, j int) bool {
			return naturalCompare(screen.IncomingTransitionIDs[i], screen.IncomingTransitionIDs[j]) < 0
		})
		sort.SliceStable(screen.OutgoingTransitionIDs, func(i, j int) bool {
			return naturalCompare(screen.OutgoingTransitionIDs[i], screen.OutgoingTransitionIDs[j]) < 0
		})
	}
	for index := range model.Knowledge.Modules {
		sort.SliceStable(model.Knowledge.Modules[index].ScreenIDs, func(i, j int) bool {
			return naturalCompare(model.Knowledge.Modules[index].ScreenIDs[i], model.Knowledge.Modules[index].ScreenIDs[j]) < 0
		})
	}
}
