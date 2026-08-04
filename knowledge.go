package docgent

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

var (
	businessRuleHeadingRE   = regexp.MustCompile(`^(BR-[A-Z0-9-]+)\s*[:—-]\s*(.+)$`)
	workItemHeadingRE       = regexp.MustCompile(`^(TASK-[A-Z0-9-]+)\s*[:—-]\s*(.+)$`)
	riskHeadingRE           = regexp.MustCompile(`^([A-Za-zА-Яа-я]+[-_ ]?\d+)\s*[:—-]\s*(.+)$`)
	businessRuleReferenceRE = regexp.MustCompile(`\bBR-[A-Z0-9-]+\b`)
)

func splitReferences(value string) []string {
	fields := strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ';' || r == ' ' || r == '\t' || r == '\n' })
	return uniqueStrings(fields)
}

func repositoryPathsFor(document *Document) []string {
	values := []string{}
	for _, link := range document.ResolvedLinks {
		if link.RepositoryPath != "" {
			values = append(values, link.RepositoryPath)
		}
	}
	values = uniqueStrings(values)
	sort.SliceStable(values, func(i, j int) bool { return naturalCompare(values[i], values[j]) < 0 })
	return values
}

func subheadingNames(document *Document, section Section) []string {
	result := []string{}
	for _, heading := range document.Headings {
		if heading.Level >= 3 && heading.Line > section.StartLine && heading.Line < section.EndLine {
			result = append(result, canonicalText(heading.Title))
		}
	}
	return result
}

func validateWorkItemShape(model *Model, document *Document, section Section) {
	headings := map[string]struct{}{}
	for _, name := range subheadingNames(document, section) {
		headings[name] = struct{}{}
	}
	required := []struct{ Canonical, Label string }{
		{"результат", "Result"}, {"область изменения", "Scope"}, {"не входит в задачу", "Out of scope"},
		{"критерии готовности", "Criteria of done"}, {"проверка", "Verification"},
	}
	for _, item := range required {
		if _, ok := headings[item.Canonical]; !ok {
			addDocumentIssue(model, document, newIssue("warning", "missing-work-section", fmt.Sprintf("Задача %s не содержит раздел «%s».", section.Title, item.Label), document.SourcePath, section.StartLine+1))
		}
	}
}

func addKnowledgeIssue(model *Model, document *Document, severity, code, message string, line int) {
	addDocumentIssue(model, document, newIssue(severity, code, message, document.SourcePath, line))
}

func detectTaskDependencyCycles(model *Model, workItems []WorkItem, workByID map[string]*WorkItem) {
	visiting := map[string]bool{}
	visited := map[string]bool{}
	var visit func(*WorkItem, []string)
	visit = func(item *WorkItem, stack []string) {
		if visited[item.ID] {
			return
		}
		if visiting[item.ID] {
			start := 0
			for i, id := range stack {
				if id == item.ID {
					start = i
					break
				}
			}
			cycle := append(append([]string{}, stack[start:]...), item.ID)
			addKnowledgeIssue(model, item.ownerDoc, "error", "task-dependency-cycle", "Циклическая зависимость задач: "+strings.Join(cycle, " → ")+".", item.line)
			return
		}
		visiting[item.ID] = true
		for _, dependencyID := range item.DependsOn {
			if dependency := workByID[dependencyID]; dependency != nil {
				visit(dependency, append(stack, item.ID))
			}
		}
		delete(visiting, item.ID)
		visited[item.ID] = true
	}
	for i := range workItems {
		visit(&workItems[i], nil)
	}
}

func buildKnowledgeModel(model *Model) KnowledgeModel {
	documentIDs := map[string]*Document{}
	modules := []KnowledgeModule{}
	useCases := []KnowledgeUseCase{}
	businessRules := []BusinessRule{}
	workItems := []WorkItem{}

	for _, document := range model.Documents {
		requiredPrefix := map[string]string{"module": "MOD-", "use-case": "UC-", "decision": "ADR-"}[document.Type]
		stableID := document.Metadata["id"]
		if requiredPrefix != "" && stableID == "" {
			addKnowledgeIssue(model, document, "error", "missing-document-id", fmt.Sprintf("Для типа «%s» требуется поле «Идентификатор».", document.TypeLabel), 0)
		} else if requiredPrefix != "" && !strings.HasPrefix(stableID, requiredPrefix) {
			addKnowledgeIssue(model, document, "error", "invalid-document-id", "Идентификатор должен начинаться с "+requiredPrefix+".", 0)
		}
		if stableID != "" {
			if previous := documentIDs[stableID]; previous != nil {
				addKnowledgeIssue(model, document, "error", "duplicate-id", fmt.Sprintf("Идентификатор %s уже используется в %s.", stableID, previous.SourcePath), 0)
			} else {
				documentIDs[stableID] = document
			}
		}
		repositoryPaths := repositoryPathsFor(document)
		switch document.Type {
		case "module":
			modules = append(modules, KnowledgeModule{ID: stableID, Title: document.Title, Status: document.Status, Document: document.SourcePath, RepositoryPaths: repositoryPaths})
		case "use-case":
			useCases = append(useCases, KnowledgeUseCase{ID: stableID, Title: document.Title, Status: document.Status, ModuleID: document.Metadata["module"], Document: document.SourcePath, RepositoryPaths: repositoryPaths})
		}
		if document.Type == "module" {
			for _, heading := range document.Headings {
				match := businessRuleHeadingRE.FindStringSubmatch(heading.Title)
				if match != nil {
					businessRules = append(businessRules, BusinessRule{ID: match[1], Title: match[2], ModuleID: stableID, Document: document.SourcePath, Anchor: heading.ID, Line: heading.Line + 1, ownerDoc: document})
				}
			}
		}
		if document.Type == "work" {
			for _, section := range document.Sections {
				match := workItemHeadingRE.FindStringSubmatch(section.Title)
				if match == nil {
					continue
				}
				validateWorkItemShape(model, document, section)
				workItems = append(workItems, WorkItem{ID: match[1], Title: match[2], Status: StatusFor(section.Metadata["status"]), Priority: section.Metadata["priority"], Owner: section.Metadata["owner"], ModuleID: section.Metadata["module"], UseCaseID: section.Metadata["useCase"], DependsOn: splitReferences(section.Metadata["dependsOn"]), Document: document.SourcePath, Anchor: section.ID, Criteria: section.Tasks, RepositoryPaths: repositoryPaths, line: section.StartLine + 1, ownerDoc: document})
			}
		}
	}

	ruleByID := map[string]*BusinessRule{}
	for i := range businessRules {
		rule := &businessRules[i]
		if previous := ruleByID[rule.ID]; previous != nil {
			addKnowledgeIssue(model, rule.ownerDoc, "error", "duplicate-id", fmt.Sprintf("Бизнес-правило %s уже объявлено в %s.", rule.ID, previous.Document), rule.Line)
		} else {
			ruleByID[rule.ID] = rule
		}
	}
	moduleByID := map[string]*KnowledgeModule{}
	for i := range modules {
		if modules[i].ID != "" {
			moduleByID[modules[i].ID] = &modules[i]
		}
	}
	useCaseByID := map[string]*KnowledgeUseCase{}
	for i := range useCases {
		if useCases[i].ID != "" {
			useCaseByID[useCases[i].ID] = &useCases[i]
		}
	}
	workByID := map[string]*WorkItem{}
	for i := range workItems {
		item := &workItems[i]
		if previous := workByID[item.ID]; previous != nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "duplicate-id", fmt.Sprintf("Рабочая задача %s уже объявлена в %s.", item.ID, previous.Document), item.line)
		} else {
			workByID[item.ID] = item
		}
	}
	for _, rule := range businessRules {
		if module := moduleByID[rule.ModuleID]; module != nil {
			module.BusinessRuleIDs = append(module.BusinessRuleIDs, rule.ID)
		}
	}
	for i := range useCases {
		useCase := &useCases[i]
		document := model.DocByPath[useCase.Document]
		module := moduleByID[useCase.ModuleID]
		if module == nil {
			addKnowledgeIssue(model, document, "error", "dangling-module-reference", fmt.Sprintf("Сценарий ссылается на неизвестный модуль %s.", fallbackDash(useCase.ModuleID)), 0)
		} else if useCase.ID != "" {
			module.UseCaseIDs = append(module.UseCaseIDs, useCase.ID)
		}
		useCase.BusinessRuleIDs = uniqueStrings(businessRuleReferenceRE.FindAllString(document.Content, -1))
		for _, ruleID := range useCase.BusinessRuleIDs {
			if ruleByID[ruleID] == nil {
				addKnowledgeIssue(model, document, "error", "dangling-rule-reference", "Сценарий ссылается на неизвестное правило "+ruleID+".", 0)
			}
		}
		sort.SliceStable(useCase.BusinessRuleIDs, func(i, j int) bool { return naturalCompare(useCase.BusinessRuleIDs[i], useCase.BusinessRuleIDs[j]) < 0 })
	}
	for i := range workItems {
		item := &workItems[i]
		if moduleByID[item.ModuleID] == nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-module-reference", fmt.Sprintf("Задача %s ссылается на неизвестный модуль %s.", item.ID, fallbackDash(item.ModuleID)), item.line)
		}
		if useCaseByID[item.UseCaseID] == nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-use-case-reference", fmt.Sprintf("Задача %s ссылается на неизвестный сценарий %s.", item.ID, fallbackDash(item.UseCaseID)), item.line)
		}
		for _, dependencyID := range item.DependsOn {
			if workByID[dependencyID] == nil {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-task-reference", fmt.Sprintf("Задача %s зависит от неизвестной задачи %s.", item.ID, dependencyID), item.line)
			}
		}
	}
	detectTaskDependencyCycles(model, workItems, workByID)
	for i := range modules {
		modules[i].UseCaseIDs = uniqueStrings(modules[i].UseCaseIDs)
		modules[i].BusinessRuleIDs = uniqueStrings(modules[i].BusinessRuleIDs)
		sort.SliceStable(modules[i].UseCaseIDs, func(a, b int) bool { return naturalCompare(modules[i].UseCaseIDs[a], modules[i].UseCaseIDs[b]) < 0 })
		sort.SliceStable(modules[i].BusinessRuleIDs, func(a, b int) bool {
			return naturalCompare(modules[i].BusinessRuleIDs[a], modules[i].BusinessRuleIDs[b]) < 0
		})
	}
	return KnowledgeModel{Modules: modules, UseCases: useCases, BusinessRules: businessRules, WorkItems: workItems}
}

func fallbackDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}

func buildRisks(model *Model) []Risk {
	result := []Risk{}
	for _, document := range model.Collections["risks"] {
		for _, section := range document.Sections {
			match := riskHeadingRE.FindStringSubmatch(section.Title)
			id, title := section.Title, section.Title
			if match != nil {
				id, title = match[1], match[2]
			}
			completed := 0
			for _, task := range section.Tasks {
				if task.Completed {
					completed++
				}
			}
			result = append(result, Risk{ID: id, Title: title, FullTitle: section.Title, Status: StatusFor(section.Metadata["status"]), Probability: fallbackValue(section.Metadata["probability"], "Не указана"), Impact: fallbackValue(section.Metadata["impact"], "Не указано"), Owner: fallbackValue(section.Metadata["owner"], "Не указан"), TaskStats: TaskStats{Total: len(section.Tasks), Completed: completed, Remaining: len(section.Tasks) - completed, Percent: progress(completed, len(section.Tasks))}, Document: document, Anchor: section.ID, Text: section.Text})
		}
	}
	return result
}

func fallbackValue(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func buildRoadmapStages(model *Model) []RoadmapStage {
	result := []RoadmapStage{}
	for _, document := range model.Collections["roadmap"] {
		for _, section := range document.Sections {
			completed := 0
			for _, task := range section.Tasks {
				if task.Completed {
					completed++
				}
			}
			result = append(result, RoadmapStage{Title: section.Title, Status: StatusFor(section.Metadata["status"]), PlannedDate: section.Metadata["plannedDate"], Owner: section.Metadata["owner"], TaskStats: TaskStats{Total: len(section.Tasks), Completed: completed, Remaining: len(section.Tasks) - completed, Percent: progress(completed, len(section.Tasks))}, Document: document, Anchor: section.ID, Text: section.Text})
		}
	}
	return result
}

func countStatuses(documents []*Document) map[string]int {
	result := map[string]int{}
	for _, document := range documents {
		result[document.Status.Kind]++
	}
	return result
}

func buildStats(model *Model) Stats {
	total, completed := 0, 0
	if roadmap := model.DocByPath["roadmap.md"]; roadmap != nil {
		total = roadmap.TaskStats.Total
		completed = roadmap.TaskStats.Completed
	}
	stats := Stats{Documents: len(model.Documents), TotalTasks: total, CompletedTasks: completed, RemainingTasks: total - completed, TaskProgress: progress(completed, total), ModuleStatuses: countStatuses(model.Collections["module"]), UseCaseStatuses: countStatuses(model.Collections["use-case"]), Modules: len(model.Collections["module"]), UseCases: len(model.Collections["use-case"]), Risks: len(model.Risks), Decisions: len(model.Collections["decision"])}
	for _, document := range model.Documents {
		switch {
		case document.TaskStats.Total == 0:
			stats.DocumentsWithoutTasks++
		case document.TaskStats.Remaining == 0:
			stats.DocumentsComplete++
		case document.TaskStats.Completed == 0:
			stats.DocumentsNotStarted++
		default:
			stats.DocumentsInProgress++
		}
		if document.Stale {
			stats.StaleDocuments++
		}
		if document.Description == "" {
			stats.DocumentsWithoutDescription++
		}
		if containsType([]string{"status", "module", "use-case", "decision"}, document.Type) && document.Metadata["status"] == "" {
			stats.DocumentsWithoutStatus++
		}
	}
	for _, issue := range model.Issues {
		if issue.Severity == "error" {
			stats.Errors++
		} else {
			stats.Warnings++
		}
		if issue.Code == "broken-link" {
			stats.BrokenLinks++
		}
	}
	for _, risk := range model.Risks {
		if !containsType([]string{"done", "accepted", "risk-accepted"}, risk.Status.Kind) {
			stats.OpenRisks++
		}
	}
	return stats
}

func buildProjectInfo(model *Model, requestedTitle string) ProjectInfo {
	overview := model.DocByPath["index.md"]
	statusDoc := model.DocByPath["status.md"]
	merged := Metadata{}
	if overview != nil {
		for k, v := range overview.Metadata {
			merged[k] = v
		}
	}
	if statusDoc != nil {
		for k, v := range statusDoc.Metadata {
			merged[k] = v
		}
	}
	title := requestedTitle
	if title == "" && overview != nil {
		title = overview.Title
	}
	if title == "" {
		title = pathBase(model.RootDirectory)
	}
	description := ""
	if overview != nil {
		description = overview.Description
	}
	summary := ""
	if statusDoc != nil {
		if section := sectionByNames(statusDoc, []string{"Краткое состояние", "Summary", "Текущее состояние"}); section != nil {
			summary = section.Text
		}
		if summary == "" {
			summary = statusDoc.Description
		}
	}
	updated := merged["updated"]
	if updated == "" {
		if statusDoc != nil {
			updated = statusDoc.UpdatedAt.Format("2006-01-02")
		} else if overview != nil {
			updated = overview.UpdatedAt.Format("2006-01-02")
		}
	}
	return ProjectInfo{Title: title, Description: description, Status: StatusFor(merged["status"]), Stage: merged["stage"], Version: merged["version"], Owner: merged["owner"], Updated: updated, Summary: summary, OverviewDocument: overview, StatusDocument: statusDoc}
}

func pathBase(value string) string {
	value = strings.TrimRight(normalizeSlashes(value), "/")
	if i := strings.LastIndex(value, "/"); i >= 0 {
		return value[i+1:]
	}
	return value
}

func buildSearchIndex(model *Model) []SearchItem {
	result := make([]SearchItem, 0, len(model.Documents))
	for _, document := range model.Documents {
		metadata := []string{}
		for _, v := range document.Metadata {
			metadata = append(metadata, v)
		}
		tasks := []string{}
		for _, task := range document.Tasks {
			tasks = append(tasks, task.Text)
		}
		headings := []string{}
		for _, heading := range document.Headings {
			headings = append(headings, heading.Title)
		}
		text := canonicalText(strings.Join([]string{document.Title, document.SourcePath, strings.Join(metadata, " "), strings.Join(headings, " "), strings.Join(tasks, " "), document.PlainText}, " "))
		description := document.Description
		if description == "" {
			description = document.PlainText
		}
		result = append(result, SearchItem{Title: document.Title, Path: document.SourcePath, URL: document.OutputPath, Type: document.Type, TypeLabel: document.TypeLabel, Status: document.Metadata["status"], Owner: document.Metadata["owner"], Description: truncate(description, 220), Text: text})
	}
	return result
}
