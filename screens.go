package docgent

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

var (
	screenIDRE = regexp.MustCompile(`^SC-[A-Z0-9]+(?:-[A-Z0-9]+)+$`)
	errorIDRE  = regexp.MustCompile(`^ERR-[A-Z0-9]+(?:-[A-Z0-9]+)*$`)
)

type markdownTable struct {
	Headers []string
	Rows    []markdownTableRow
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
		end := len(document.Lines)
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
	start := heading.Line + 1
	for start < end && strings.TrimSpace(document.Lines[start]) == "" {
		start++
	}
	if start+1 >= end || !strings.Contains(document.Lines[start], "|") || !isTableDelimiter(document.Lines[start+1]) {
		return markdownTable{}, false
	}
	table := markdownTable{Headers: parseTableRow(document.Lines[start])}
	for line := start + 2; line < end; line++ {
		if strings.TrimSpace(document.Lines[line]) == "" || !strings.Contains(document.Lines[line], "|") {
			break
		}
		table.Rows = append(table.Rows, markdownTableRow{Cells: parseTableRow(document.Lines[line]), Line: line + 1})
	}
	return table, true
}

func canonicalScreenHeader(value string) string {
	aliases := map[string]string{
		"id": "id", "идентификатор": "id",
		"screen": "title", "name": "title", "экран": "title", "название": "title",
		"module": "module", "модуль": "module",
		"type": "kind", "kind": "kind", "тип": "kind",
		"role": "role", "роль": "role",
		"route": "route", "маршрут": "route",
		"status": "status", "статус": "status",
		"errors": "errors", "ошибки": "errors",
		"from": "from", "из": "from",
		"action": "action", "действие": "action",
		"condition": "condition", "условие": "condition",
		"to": "to", "в": "to",
	}
	return aliases[canonicalText(stripInlineMarkdown(value))]
}

func screenTableColumns(model *Model, document *Document, table markdownTable, required []string) (map[string]int, bool) {
	columns := map[string]int{}
	for index, header := range table.Headers {
		key := canonicalScreenHeader(header)
		if key == "" {
			continue
		}
		if _, exists := columns[key]; !exists {
			columns[key] = index
		}
	}
	valid := true
	for _, key := range required {
		if _, exists := columns[key]; exists {
			continue
		}
		addDocumentIssue(model, document, newIssue(
			"error", "invalid-screen-table-columns",
			"В таблице отсутствует обязательная колонка "+key+".",
			document.SourcePath, 0,
		))
		valid = false
	}
	return columns, valid
}

func tableCell(row markdownTableRow, columns map[string]int, key string) string {
	index, exists := columns[key]
	if !exists || index >= len(row.Cells) {
		return ""
	}
	value := strings.TrimSpace(stripInlineMarkdown(row.Cells[index]))
	if value == "—" || value == "-" {
		return ""
	}
	return value
}

func normalizeScreenKind(value string) (string, bool) {
	switch canonicalText(value) {
	case "page", "screen", "страница", "экран":
		return "page", true
	case "modal", "dialog", "модальное окно", "модальный":
		return "modal", true
	default:
		return "", false
	}
}

func normalizeScreenRole(value string) (string, bool) {
	switch canonicalText(value) {
	case "normal", "ordinary", "обычный", "обычная":
		return "normal", true
	case "entry", "start", "начальный", "начальная":
		return "entry", true
	case "terminal", "end", "конечный", "конечная":
		return "terminal", true
	case "entry terminal", "start end", "начальный конечный", "начальная конечная":
		return "entry-terminal", true
	default:
		return "", false
	}
}

func normalizeTransitionKind(value string) (string, bool) {
	switch canonicalText(value) {
	case "navigation", "navigate", "переход", "навигация":
		return "navigation", true
	case "redirect", "редирект", "перенаправление":
		return "redirect", true
	default:
		return "", false
	}
}

func roleIsEntry(role string) bool {
	return role == "entry" || role == "entry-terminal"
}

func roleIsTerminal(role string) bool {
	return role == "terminal" || role == "entry-terminal"
}

func screensOnPaths(screens []KnowledgeScreen, transitions []ScreenTransition, start, end string) map[string]bool {
	forwardEdges := map[string][]string{}
	reverseEdges := map[string][]string{}
	for _, transition := range transitions {
		forwardEdges[transition.FromID] = append(forwardEdges[transition.FromID], transition.ToID)
		reverseEdges[transition.ToID] = append(reverseEdges[transition.ToID], transition.FromID)
	}
	reachable := func(origin string, edges map[string][]string) map[string]bool {
		result := map[string]bool{}
		queue := []string{origin}
		for len(queue) > 0 {
			id := queue[0]
			queue = queue[1:]
			if result[id] {
				continue
			}
			result[id] = true
			queue = append(queue, edges[id]...)
		}
		return result
	}
	forward := reachable(start, forwardEdges)
	if !forward[end] {
		return map[string]bool{}
	}
	backward := reachable(end, reverseEdges)
	result := map[string]bool{}
	for _, screen := range screens {
		if forward[screen.ID] && backward[screen.ID] {
			result[screen.ID] = true
		}
	}
	return result
}

func parseScreenCatalog(model *Model, document *Document) []KnowledgeScreen {
	table, found := parseScreenTable(document, "Каталог экранов", "Screen catalog")
	if !found {
		addDocumentIssue(model, document, newIssue("error", "missing-screen-catalog", "screens/map.md должен содержать таблицу «Каталог экранов».", document.SourcePath, 0))
		return []KnowledgeScreen{}
	}
	required := []string{"id", "title", "module", "kind", "role", "route", "status", "errors"}
	columns, valid := screenTableColumns(model, document, table, required)
	if !valid {
		return []KnowledgeScreen{}
	}
	screens := []KnowledgeScreen{}
	seen := map[string]int{}
	routes := map[string]KnowledgeScreen{}
	for _, row := range table.Rows {
		id := tableCell(row, columns, "id")
		title := tableCell(row, columns, "title")
		moduleID := tableCell(row, columns, "module")
		kind, kindValid := normalizeScreenKind(tableCell(row, columns, "kind"))
		role, roleValid := normalizeScreenRole(tableCell(row, columns, "role"))
		route := tableCell(row, columns, "route")
		statusText := tableCell(row, columns, "status")
		errorIDs := splitReferences(tableCell(row, columns, "errors"))

		if !screenIDRE.MatchString(id) {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-id", "Идентификатор экрана должен соответствовать SC-<ОБЛАСТЬ>-<НАЗВАНИЕ>.", document.SourcePath, row.Line))
		}
		if previousLine := seen[id]; id != "" && previousLine > 0 {
			addDocumentIssue(model, document, newIssue("error", "duplicate-screen-id", fmt.Sprintf("Экран %s уже объявлен в строке %d.", id, previousLine), document.SourcePath, row.Line))
		} else if id != "" {
			seen[id] = row.Line
		}
		if title == "" || moduleID == "" || statusText == "" {
			addDocumentIssue(model, document, newIssue("error", "incomplete-screen-row", "Для экрана обязательны ID, название, модуль, тип, роль и статус.", document.SourcePath, row.Line))
		}
		if !kindValid {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-kind", "Тип экрана должен быть page или modal.", document.SourcePath, row.Line))
		}
		if !roleValid {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-role", "Роль экрана должна быть normal, entry, terminal или entry-terminal.", document.SourcePath, row.Line))
		}
		status := StatusFor(statusText)
		if !status.Recognized {
			addDocumentIssue(model, document, newIssue("warning", "unknown-screen-status", "Неизвестный статус экрана «"+statusText+"».", document.SourcePath, row.Line))
		}
		for _, errorID := range errorIDs {
			if !errorIDRE.MatchString(errorID) {
				addDocumentIssue(model, document, newIssue("error", "invalid-screen-error-id", "Идентификатор ошибки должен начинаться с ERR-: "+errorID+".", document.SourcePath, row.Line))
			}
		}
		screen := KnowledgeScreen{
			ID: id, Title: title, ModuleID: moduleID, Kind: kind, Role: role, Route: route,
			Status: status, ErrorIDs: errorIDs, UseCaseIDs: []string{}, WorkItemIDs: []string{},
			Line: row.Line,
		}
		if route != "" {
			if previous, exists := routes[route]; exists {
				addDocumentIssue(model, document, newIssue("warning", "duplicate-screen-route", fmt.Sprintf("Маршрут %s уже используется экраном %s.", route, previous.ID), document.SourcePath, row.Line))
			} else {
				routes[route] = screen
			}
		}
		screens = append(screens, screen)
	}
	return screens
}

func parseScreenTransitions(model *Model, document *Document, screensByID map[string]*KnowledgeScreen) []ScreenTransition {
	table, found := parseScreenTable(document, "Переходы", "Transitions")
	if !found {
		addDocumentIssue(model, document, newIssue("error", "missing-screen-transitions", "screens/map.md должен содержать таблицу «Переходы».", document.SourcePath, 0))
		return []ScreenTransition{}
	}
	required := []string{"from", "action", "condition", "to", "kind"}
	columns, valid := screenTableColumns(model, document, table, required)
	if !valid {
		return []ScreenTransition{}
	}
	transitions := []ScreenTransition{}
	for _, row := range table.Rows {
		fromID := tableCell(row, columns, "from")
		toID := tableCell(row, columns, "to")
		action := tableCell(row, columns, "action")
		condition := tableCell(row, columns, "condition")
		kind, kindValid := normalizeTransitionKind(tableCell(row, columns, "kind"))
		if action == "" || fromID == "" || toID == "" {
			addDocumentIssue(model, document, newIssue("error", "incomplete-screen-transition", "Для перехода обязательны источник, действие, цель и тип.", document.SourcePath, row.Line))
		}
		if screensByID[fromID] == nil {
			addDocumentIssue(model, document, newIssue("error", "dangling-screen-reference", "Переход ссылается на неизвестный экран "+fallbackDash(fromID)+".", document.SourcePath, row.Line))
		}
		if screensByID[toID] == nil {
			addDocumentIssue(model, document, newIssue("error", "dangling-screen-reference", "Переход ссылается на неизвестный экран "+fallbackDash(toID)+".", document.SourcePath, row.Line))
		}
		if !kindValid {
			addDocumentIssue(model, document, newIssue("error", "invalid-screen-transition-kind", "Тип перехода должен быть navigation или redirect.", document.SourcePath, row.Line))
		}
		transitions = append(transitions, ScreenTransition{
			FromID: fromID, ToID: toID, Action: action, Condition: condition,
			Kind: kind, Document: document.SourcePath, Line: row.Line,
		})
	}
	return transitions
}

func validateScreenDocuments(model *Model, screensByID map[string]*KnowledgeScreen) {
	documentsByID := map[string]*Document{}
	for _, document := range model.Collections["screen"] {
		id := strings.TrimSpace(document.Metadata["id"])
		screen := screensByID[id]
		if screen == nil {
			addDocumentIssue(model, document, newIssue("error", "screen-document-not-in-catalog", "Документ ссылается на экран, отсутствующий в screens/map.md: "+fallbackDash(id)+".", document.SourcePath, 0))
			continue
		}
		if previous := documentsByID[id]; previous != nil {
			addDocumentIssue(model, document, newIssue("error", "duplicate-screen-document", fmt.Sprintf("Экран %s уже описан в %s.", id, previous.SourcePath), document.SourcePath, 0))
			continue
		}
		documentsByID[id] = document
		screen.Document = document.SourcePath
		for key, expected := range map[string]string{
			"module": screen.ModuleID,
			"route":  screen.Route,
			"status": screen.Status.Label,
		} {
			if actual := strings.TrimSpace(document.Metadata[key]); actual != "" && canonicalText(actual) != canonicalText(expected) {
				addDocumentIssue(model, document, newIssue("error", "screen-document-mismatch", fmt.Sprintf("Поле %s не совпадает с screens/map.md.", displayFieldNames[key]), document.SourcePath, 0))
			}
		}
	}
}

func validateScreenGraph(model *Model, document *Document, screens []KnowledgeScreen, transitions []ScreenTransition) {
	byID := map[string]*KnowledgeScreen{}
	for index := range screens {
		byID[screens[index].ID] = &screens[index]
	}
	incoming := map[string]int{}
	outgoing := map[string]int{}
	adjacency := map[string][]string{}
	entries := []string{}
	for _, screen := range screens {
		if roleIsEntry(screen.Role) {
			entries = append(entries, screen.ID)
		}
	}
	if len(screens) > 0 && len(entries) == 0 {
		addDocumentIssue(model, document, newIssue("error", "missing-entry-screen", "Карта должна содержать хотя бы один экран с ролью entry.", document.SourcePath, 0))
	}
	for _, transition := range transitions {
		if byID[transition.FromID] == nil || byID[transition.ToID] == nil {
			continue
		}
		outgoing[transition.FromID]++
		incoming[transition.ToID]++
		adjacency[transition.FromID] = append(adjacency[transition.FromID], transition.ToID)
	}
	reachable := map[string]bool{}
	queue := append([]string{}, entries...)
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if reachable[id] {
			continue
		}
		reachable[id] = true
		queue = append(queue, adjacency[id]...)
	}
	for index := range screens {
		screen := &screens[index]
		screen.Reachable = reachable[screen.ID]
		switch {
		case incoming[screen.ID] == 0 && outgoing[screen.ID] == 0 && !roleIsEntry(screen.Role) && !roleIsTerminal(screen.Role):
			addDocumentIssue(model, document, newIssue("warning", "isolated-screen", "Экран "+screen.ID+" изолирован от карты.", document.SourcePath, screen.Line))
		default:
			if incoming[screen.ID] == 0 && !roleIsEntry(screen.Role) {
				addDocumentIssue(model, document, newIssue("warning", "screen-without-incoming-transition", "У экрана "+screen.ID+" нет входящего перехода.", document.SourcePath, screen.Line))
			}
			if outgoing[screen.ID] == 0 && !roleIsTerminal(screen.Role) {
				addDocumentIssue(model, document, newIssue("warning", "screen-without-outgoing-transition", "У экрана "+screen.ID+" нет исходящего перехода.", document.SourcePath, screen.Line))
			}
		}
		if len(entries) > 0 && !screen.Reachable {
			addDocumentIssue(model, document, newIssue("warning", "unreachable-screen", "Экран "+screen.ID+" недостижим от начальных экранов.", document.SourcePath, screen.Line))
		}
	}
}

func connectScreenReferences(model *Model, screensByID map[string]*KnowledgeScreen) {
	moduleByID := map[string]*KnowledgeModule{}
	for index := range model.Knowledge.Modules {
		module := &model.Knowledge.Modules[index]
		module.ScreenIDs = []string{}
		moduleByID[module.ID] = module
	}
	for index := range model.Knowledge.Screens {
		screen := &model.Knowledge.Screens[index]
		if module := moduleByID[screen.ModuleID]; module != nil {
			module.ScreenIDs = append(module.ScreenIDs, screen.ID)
		} else {
			document := model.DocByPath["screens/map.md"]
			addDocumentIssue(model, document, newIssue("error", "dangling-module-reference", "Экран "+screen.ID+" ссылается на неизвестный модуль "+fallbackDash(screen.ModuleID)+".", "screens/map.md", screen.Line))
		}
	}
	for index := range model.Knowledge.UseCases {
		useCase := &model.Knowledge.UseCases[index]
		useCase.ScreenIDs = uniqueStrings(useCase.ScreenIDs)
		for _, screenID := range useCase.ScreenIDs {
			screen := screensByID[screenID]
			if screen == nil {
				document := model.DocByPath[useCase.Document]
				addDocumentIssue(model, document, newIssue("error", "dangling-screen-reference", "Сценарий ссылается на неизвестный экран "+screenID+".", useCase.Document, 0))
				continue
			}
			screen.UseCaseIDs = append(screen.UseCaseIDs, useCase.ID)
		}
	}
	for index := range model.Knowledge.WorkItems {
		item := &model.Knowledge.WorkItems[index]
		item.ScreenIDs = uniqueStrings(item.ScreenIDs)
		for _, screenID := range item.ScreenIDs {
			screen := screensByID[screenID]
			if screen == nil {
				addDocumentIssue(model, item.ownerDoc, newIssue("error", "dangling-screen-reference", "Задача "+item.ID+" ссылается на неизвестный экран "+screenID+".", item.Document, item.line))
				continue
			}
			screen.WorkItemIDs = append(screen.WorkItemIDs, item.ID)
		}
	}
	for index := range model.Knowledge.Screens {
		screen := &model.Knowledge.Screens[index]
		screen.UseCaseIDs = uniqueStrings(screen.UseCaseIDs)
		screen.WorkItemIDs = uniqueStrings(screen.WorkItemIDs)
		sort.SliceStable(screen.UseCaseIDs, func(i, j int) bool { return naturalCompare(screen.UseCaseIDs[i], screen.UseCaseIDs[j]) < 0 })
		sort.SliceStable(screen.WorkItemIDs, func(i, j int) bool { return naturalCompare(screen.WorkItemIDs[i], screen.WorkItemIDs[j]) < 0 })
	}
	for index := range model.Knowledge.Modules {
		module := &model.Knowledge.Modules[index]
		module.ScreenIDs = uniqueStrings(module.ScreenIDs)
		sort.SliceStable(module.ScreenIDs, func(i, j int) bool { return naturalCompare(module.ScreenIDs[i], module.ScreenIDs[j]) < 0 })
	}
}

func buildScreenKnowledge(model *Model) {
	mapDocument := model.DocByPath["screens/map.md"]
	hasReferences := len(model.Collections["screen"]) > 0
	for _, useCase := range model.Knowledge.UseCases {
		hasReferences = hasReferences || len(useCase.ScreenIDs) > 0
	}
	for _, item := range model.Knowledge.WorkItems {
		hasReferences = hasReferences || len(item.ScreenIDs) > 0
	}
	if mapDocument == nil {
		if hasReferences {
			model.Issues = append(model.Issues, newIssue("error", "missing-screen-map", "Документы или связи экранов требуют файла screens/map.md.", "", 0))
		}
		return
	}
	screens := parseScreenCatalog(model, mapDocument)
	screensByID := map[string]*KnowledgeScreen{}
	for index := range screens {
		if screens[index].ID != "" {
			screensByID[screens[index].ID] = &screens[index]
		}
	}
	transitions := parseScreenTransitions(model, mapDocument, screensByID)
	validateScreenDocuments(model, screensByID)
	validateScreenGraph(model, mapDocument, screens, transitions)
	model.Knowledge.Screens = screens
	model.Knowledge.Transitions = transitions
	screensByID = map[string]*KnowledgeScreen{}
	for index := range model.Knowledge.Screens {
		screensByID[model.Knowledge.Screens[index].ID] = &model.Knowledge.Screens[index]
	}
	connectScreenReferences(model, screensByID)
}
