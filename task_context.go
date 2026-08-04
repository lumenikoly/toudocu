package docgent

import (
	"fmt"
	"io"
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
	return TaskContextDocument{
		ID: document.Metadata["id"], Path: document.SourcePath, Type: document.Type,
		Title: document.Title, Description: document.Description, Status: document.Status,
	}
}

// BuildTaskContext returns compact, read-only implementation context for one task.
func BuildTaskContext(model *Model, taskID string) (TaskContextReport, error) {
	item, err := findWorkItem(model, taskID)
	if err != nil {
		return TaskContextReport{}, err
	}
	report := TaskContextReport{
		SchemaVersion: 1, Kind: "task-context",
		Generator:     GeneratorInfo{Name: "Docgent", Version: Version},
		Task:          *item,
		BusinessRules: []BusinessRule{},
		Dependencies:  []WorkItem{},
		Dependents:    []WorkItem{},
		Documents:     []TaskContextDocument{},
		Issues:        []Issue{},
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
	for _, rule := range report.BusinessRules {
		documentPaths[rule.Document] = true
	}
	for _, document := range model.Documents {
		if documentPaths[document.SourcePath] {
			report.Documents = append(report.Documents, taskContextDocument(document))
		}
	}
	for _, issue := range model.Issues {
		if documentPaths[issue.DocumentPath] {
			report.Issues = append(report.Issues, issue)
		}
	}
	sort.SliceStable(report.BusinessRules, func(i, j int) bool {
		return naturalCompare(report.BusinessRules[i].ID, report.BusinessRules[j].ID) < 0
	})
	sort.SliceStable(report.Dependencies, func(i, j int) bool {
		return naturalCompare(report.Dependencies[i].ID, report.Dependencies[j].ID) < 0
	})
	sort.SliceStable(report.Dependents, func(i, j int) bool {
		return naturalCompare(report.Dependents[i].ID, report.Dependents[j].ID) < 0
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
	if len(report.Task.RepositoryPaths) > 0 {
		fmt.Fprintf(w, "Область изменения: %s\n", strings.Join(report.Task.RepositoryPaths, ", "))
	}
	fmt.Fprintf(w, "Критериев: %d\nПроверок: %d\nЗависимостей: %d\nЗависимых задач: %d\nЗамечаний контекста: %d\n",
		len(report.Task.Criteria), len(report.Task.Checks), len(report.Dependencies), len(report.Dependents), len(report.Issues))
}
