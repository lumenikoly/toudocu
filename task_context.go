package docgent

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func findWorkItem(model *Model, taskID string) (*WorkItem, error) {
	var found *WorkItem
	for index := range model.Knowledge.WorkItems {
		item := &model.Knowledge.WorkItems[index]
		if item.ID != taskID {
			continue
		}
		if found != nil {
			return nil, fmt.Errorf("идентификатор задачи %s неоднозначен", taskID)
		}
		found = item
	}
	if found == nil {
		return nil, fmt.Errorf("задача %s не найдена", taskID)
	}
	return found, nil
}

func taskContextDocument(document *Document) TaskContextDocument {
	sections := []TaskContextSection{}
	full := document.Type == "work" || document.Type == "contract" || document.Type == "guide" || document.Type == "reference" || document.Type == "document"
	if full {
		sections = append(sections, TaskContextSection{Title: document.Title, Markdown: document.Content})
	} else {
		selected := map[string]bool{}
		switch document.Type {
		case "module":
			for _, name := range []string{"business rules", "бизнес-правила", "invariants", "инварианты", "interfaces", "интерфейсы", "stable interfaces", "стабильные интерфейсы"} {
				selected[canonicalText(name)] = true
			}
		case "use-case":
			for _, name := range []string{"main scenario", "основной сценарий", "alternative scenarios", "альтернативные сценарии", "error scenarios", "ошибочные сценарии", "postconditions", "постусловия", "business rules", "бизнес-правила"} {
				selected[canonicalText(name)] = true
			}
		case "flow":
			selected[canonicalText("process")] = true
			selected[canonicalText("процесс")] = true
		case "screen":
			for _, name := range []string{"states", "состояния", "transitions", "переходы"} {
				selected[canonicalText(name)] = true
			}
		case "standard":
			for _, name := range []string{"rules", "правила", "automated checks", "automatic checks", "автоматические проверки"} {
				selected[canonicalText(name)] = true
			}
		case "runbook":
			for _, name := range []string{"prerequisites", "предварительные условия", "предпосылки", "procedure", "процедура", "verification", "проверка", "rollback", "откат", "stop conditions", "условия остановки"} {
				selected[canonicalText(name)] = true
			}
		}
		for _, section := range document.Sections {
			if selected[canonicalText(section.Title)] {
				sections = append(sections, TaskContextSection{Title: section.Title, Markdown: section.Markdown})
			}
		}
	}
	return TaskContextDocument{
		ID: document.Metadata["id"], Path: document.SourcePath, Type: document.Type,
		Title: document.Title, Description: document.Description, Status: document.Status, Sections: sections,
	}
}

func taskContextExternalDocument(model *Model, relativePath string) (TaskContextDocument, bool) {
	absolute := filepath.Join(model.RepositoryRoot, filepath.FromSlash(relativePath))
	if !ensureInside(model.RepositoryRoot, absolute) || ensureInside(model.RootDirectory, absolute) {
		return TaskContextDocument{}, false
	}
	resolvedRoot, rootErr := resolvePathForSafety(model.RepositoryRoot)
	resolvedPath, pathErr := resolvePathForSafety(absolute)
	if rootErr != nil || pathErr != nil || !ensureInside(resolvedRoot, resolvedPath) {
		return TaskContextDocument{}, false
	}
	content, err := os.ReadFile(absolute)
	if err != nil {
		return TaskContextDocument{}, false
	}
	parsed := AnalyzeMarkdown(string(content))
	return TaskContextDocument{
		Path: relativePath, Type: "document", Title: parsed.Title, Description: parsed.Description,
		Status:   StatusFor(parsed.Metadata["status"]),
		Sections: []TaskContextSection{{Title: parsed.Title, Markdown: string(content)}},
	}, true
}

// BuildTaskContext returns compact, read-only implementation context for one task.
func BuildTaskContext(model *Model, taskID string) (TaskContextReport, error) {
	item, err := findWorkItem(model, taskID)
	if err != nil {
		return TaskContextReport{}, err
	}
	if item.statusName != "ready" && item.statusName != "in-progress" && item.statusName != "blocked" && item.statusName != "done" {
		return TaskContextReport{}, fmt.Errorf("task context доступен только для Ready, In Progress, Blocked или Done")
	}
	report := TaskContextReport{
		SchemaVersion: 1, Kind: "task-context",
		Generator:         GeneratorInfo{Name: "Docgent", Version: Version},
		Task:              *item,
		Screens:           []KnowledgeScreen{},
		ScreenTransitions: []ScreenTransition{},
		BusinessRules:     []BusinessRule{},
		Standards:         []KnowledgeStandard{},
		Runbooks:          []KnowledgeRunbook{},
		Dependencies:      []WorkItem{},
		Dependents:        []WorkItem{},
		Documents:         []TaskContextDocument{},
		Issues:            []Issue{},
		RequiredReads:     []string{},
	}
	_, report.FullVerification = planTaskCommands(*item)

	ruleIDs := map[string]bool{}
	if item.ModuleID != "" {
		for index := range model.Knowledge.Modules {
			module := &model.Knowledge.Modules[index]
			if module.ID == item.ModuleID {
				report.Module = module
				for _, id := range module.BusinessRuleIDs {
					ruleIDs[id] = true
				}
				break
			}
		}
	}
	if item.UseCaseID != "" {
		for index := range model.Knowledge.UseCases {
			useCase := &model.Knowledge.UseCases[index]
			if useCase.ID == item.UseCaseID {
				report.UseCase = useCase
				for _, id := range useCase.BusinessRuleIDs {
					ruleIDs[id] = true
				}
				break
			}
		}
	}
	for _, rule := range model.Knowledge.BusinessRules {
		if ruleIDs[rule.ID] {
			report.BusinessRules = append(report.BusinessRules, rule)
		}
	}
	for _, candidate := range model.Knowledge.WorkItems {
		if containsString(item.DependsOn, candidate.ID) {
			report.Dependencies = append(report.Dependencies, candidate)
		}
		if containsString(candidate.DependsOn, item.ID) {
			report.Dependents = append(report.Dependents, candidate)
		}
	}

	documentPaths := map[string]bool{item.Document: true}
	if report.Module != nil {
		documentPaths[report.Module.Document] = true
	}
	if report.UseCase != nil {
		documentPaths[report.UseCase.Document] = true
	}
	if item.FlowID != "" {
		for index := range model.Knowledge.Flows {
			flow := &model.Knowledge.Flows[index]
			if flow.ID == item.FlowID {
				report.Flow = flow
				documentPaths[flow.Document] = true
				break
			}
		}
	}
	for _, screenID := range item.ScreenIDs {
		for _, screen := range model.Knowledge.Screens {
			if screen.ID != screenID {
				continue
			}
			report.Screens = append(report.Screens, screen)
			if screen.Document != "" {
				documentPaths[screen.Document] = true
			}
			break
		}
	}
	selectedScreens := map[string]bool{}
	for _, screenID := range item.ScreenIDs {
		selectedScreens[screenID] = true
	}
	selectedTransitions := map[string]bool{}
	for _, transitionID := range item.TransitionIDs {
		selectedTransitions[transitionID] = true
	}
	for _, transition := range model.Knowledge.Transitions {
		if selectedTransitions[transition.ID] || selectedScreens[transition.FromID] || selectedScreens[transition.ToID] {
			report.ScreenTransitions = append(report.ScreenTransitions, transition)
			if transition.Document != "" {
				documentPaths[transition.Document] = true
			}
		}
	}
	for _, rule := range report.BusinessRules {
		documentPaths[rule.Document] = true
	}
	for _, standard := range model.Knowledge.Standards {
		if containsString(item.StandardIDs, standard.ID) {
			report.Standards = append(report.Standards, standard)
			documentPaths[standard.Document] = true
		}
	}
	for _, runbook := range model.Knowledge.Runbooks {
		if containsString(item.RunbookIDs, runbook.ID) {
			report.Runbooks = append(report.Runbooks, runbook)
			documentPaths[runbook.Document] = true
		}
	}
	for _, path := range item.DocumentationPaths {
		documentPaths[path] = true
	}
	for _, document := range model.Documents {
		if documentPaths[document.SourcePath] {
			report.Documents = append(report.Documents, taskContextDocument(document))
			report.RequiredReads = append(report.RequiredReads, document.SourcePath)
		}
	}
	for _, path := range item.DocumentationPaths {
		if model.DocByPath[path] != nil {
			continue
		}
		if document, ok := taskContextExternalDocument(model, path); ok {
			report.Documents = append(report.Documents, document)
			report.RequiredReads = append(report.RequiredReads, path)
		}
	}
	_, report.Issues = taskReadiness(model, taskID, false)
	sort.SliceStable(report.BusinessRules, func(i, j int) bool {
		return naturalCompare(report.BusinessRules[i].ID, report.BusinessRules[j].ID) < 0
	})
	sort.SliceStable(report.Dependencies, func(i, j int) bool {
		return naturalCompare(report.Dependencies[i].ID, report.Dependencies[j].ID) < 0
	})
	sort.SliceStable(report.Dependents, func(i, j int) bool {
		return naturalCompare(report.Dependents[i].ID, report.Dependents[j].ID) < 0
	})
	sort.SliceStable(report.RequiredReads, func(i, j int) bool {
		if report.RequiredReads[i] == item.Document {
			return true
		}
		if report.RequiredReads[j] == item.Document {
			return false
		}
		return naturalCompare(report.RequiredReads[i], report.RequiredReads[j]) < 0
	})
	return report, nil
}

func printTaskContextText(w io.Writer, report TaskContextReport) {
	fmt.Fprintf(w, "Задача: %s — %s\nДокумент: %s\nСтатус: %s\n", report.Task.ID, report.Task.Title, report.Task.Document, report.Task.Status.Label)
	if report.Module != nil {
		fmt.Fprintf(w, "Модуль: %s — %s\n", report.Module.ID, report.Module.Title)
	}
	if report.UseCase != nil {
		fmt.Fprintf(w, "Сценарий: %s — %s\n", report.UseCase.ID, report.UseCase.Title)
	}
	if report.Task.FlowID != "" {
		fmt.Fprintf(w, "Процесс: %s\n", report.Task.FlowID)
	}
	if len(report.Task.ScreenIDs) > 0 {
		fmt.Fprintf(w, "Экраны: %s\n", strings.Join(report.Task.ScreenIDs, ", "))
	}
	if len(report.Task.RepositoryPaths) > 0 {
		fmt.Fprintf(w, "Область изменения: %s\n", strings.Join(report.Task.RepositoryPaths, ", "))
	}
	fmt.Fprintf(w, "Критериев: %d\nПроверок: %d\nЗависимостей: %d\nЗависимых задач: %d\nЗамечаний контекста: %d\n",
		len(report.Task.Criteria), len(report.Task.Checks), len(report.Dependencies), len(report.Dependents), len(report.Issues))
	fmt.Fprintf(w, "Обязательные документы: %s\n", strings.Join(report.RequiredReads, ", "))
}
