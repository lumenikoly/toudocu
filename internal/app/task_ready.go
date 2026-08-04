package docudocu

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func readinessIssue(code, message string, item *WorkItem) Issue {
	issue := Issue{Severity: "error", Code: code, Message: message}
	if item != nil {
		issue.DocumentPath = item.Document
		issue.Line = item.line
	}
	return issue
}

func taskRelatedDocumentPaths(model *Model, item *WorkItem) map[string]bool {
	paths := map[string]bool{item.Document: true}
	for _, module := range model.Knowledge.Modules {
		if module.ID == item.ModuleID {
			paths[module.Document] = true
		}
	}
	for _, useCase := range model.Knowledge.UseCases {
		if useCase.ID == item.UseCaseID {
			paths[useCase.Document] = true
		}
	}
	for _, flow := range model.Knowledge.Flows {
		if flow.ID == item.FlowID {
			paths[flow.Document] = true
		}
	}
	for _, standard := range model.Knowledge.Standards {
		if containsString(item.StandardIDs, standard.ID) {
			paths[standard.Document] = true
		}
	}
	for _, runbook := range model.Knowledge.Runbooks {
		if containsString(item.RunbookIDs, runbook.ID) {
			paths[runbook.Document] = true
		}
	}
	for _, screen := range model.Knowledge.Screens {
		if containsString(item.ScreenIDs, screen.ID) {
			paths[screen.Document] = true
		}
	}
	referencedTransitions := append([]string{}, item.TransitionIDs...)
	for _, criterion := range item.Verification {
		referencedTransitions = append(referencedTransitions, criterion.Transitions...)
	}
	for _, transition := range model.Knowledge.Transitions {
		if containsString(referencedTransitions, transition.ID) {
			paths[transition.Document] = true
		}
	}
	for _, path := range item.DocumentationPaths {
		paths[path] = true
	}
	return paths
}

func referencedEntityIssues(model *Model, item *WorkItem) []Issue {
	issues := []Issue{}
	exists := func(values []string, expected string) bool {
		if expected == "" {
			return true
		}
		return containsString(values, expected)
	}
	moduleIDs, useCaseIDs, flowIDs, screenIDs, transitionIDs := []string{}, []string{}, []string{}, []string{}, []string{}
	standardIDs, runbookIDs := []string{}, []string{}
	for _, value := range model.Knowledge.Modules {
		moduleIDs = append(moduleIDs, value.ID)
	}
	for _, value := range model.Knowledge.UseCases {
		useCaseIDs = append(useCaseIDs, value.ID)
	}
	for _, value := range model.Knowledge.Flows {
		flowIDs = append(flowIDs, value.ID)
	}
	for _, value := range model.Knowledge.Screens {
		screenIDs = append(screenIDs, value.ID)
	}
	for _, value := range model.Knowledge.Transitions {
		transitionIDs = append(transitionIDs, value.ID)
	}
	for _, value := range model.Knowledge.Standards {
		standardIDs = append(standardIDs, value.ID)
	}
	for _, value := range model.Knowledge.Runbooks {
		runbookIDs = append(runbookIDs, value.ID)
	}
	check := func(kind, id string, values []string) {
		if id != "" && !exists(values, id) {
			issues = append(issues, readinessIssue("missing-task-"+kind, "Связанная сущность не найдена: "+id+".", item))
		}
	}
	check("module", item.ModuleID, moduleIDs)
	check("use-case", item.UseCaseID, useCaseIDs)
	check("flow", item.FlowID, flowIDs)
	for _, id := range item.ScreenIDs {
		check("screen", id, screenIDs)
	}
	for _, id := range item.TransitionIDs {
		check("transition", id, transitionIDs)
	}
	for _, id := range item.StandardIDs {
		check("standard", id, standardIDs)
	}
	for _, id := range item.RunbookIDs {
		check("runbook", id, runbookIDs)
	}
	for _, criterion := range item.Verification {
		for _, id := range criterion.Transitions {
			check("transition", id, transitionIDs)
		}
	}
	return issues
}

func documentationImpactIssues(model *Model, item *WorkItem) []Issue {
	document := model.DocByPath[item.Document]
	if document == nil {
		return nil
	}
	parsedItems := parseWorkItems(document)
	var parsed *parsedWorkItem
	for index := range parsedItems {
		match := workItemHeadingRE.FindStringSubmatch(parsedItems[index].Heading.Title)
		if match != nil && match[1] == item.ID {
			parsed = &parsedItems[index]
			break
		}
	}
	if parsed == nil {
		return nil
	}
	section, found := workSection(*parsed, "влияние на документацию", "documentation impact")
	if !found {
		return nil
	}
	values := []string{}
	for _, match := range codeSpanRE.FindAllStringSubmatch(section.Markdown, -1) {
		value := strings.TrimSpace(match[1])
		if !strings.ContainsAny(value, " \t\r\n") && (strings.Contains(value, "/") || strings.EqualFold(filepath.Ext(value), ".md")) {
			values = append(values, value)
		}
	}
	for _, link := range document.Links {
		if link.Line > section.Heading.Line && link.Line <= section.EndLine && !link.Image {
			values = append(values, strings.Split(link.Destination, "#")[0])
		}
	}
	issues := []Issue{}
	for _, value := range uniqueStrings(values) {
		if value == "" || strings.Contains(value, "://") || strings.HasPrefix(value, "#") {
			continue
		}
		if filepath.IsAbs(filepath.FromSlash(value)) {
			issues = append(issues, readinessIssue("unsafe-documentation-impact-path", "Documentation-impact путь должен быть относительным: "+value+".", item))
			continue
		}
		candidates := []string{
			filepath.Join(model.RepositoryRoot, filepath.FromSlash(value)),
			filepath.Join(model.RootDirectory, filepath.FromSlash(value)),
			filepath.Join(filepath.Dir(document.AbsolutePath), filepath.FromSlash(value)),
		}
		found := false
		unsafe := false
		resolvedRoot, _ := resolvePathForSafety(model.RepositoryRoot)
		for _, candidate := range candidates {
			if _, err := os.Stat(candidate); err == nil {
				resolved, resolveErr := resolvePathForSafety(candidate)
				if resolveErr != nil || !ensureInside(resolvedRoot, resolved) {
					unsafe = true
					continue
				}
				found = true
				break
			}
		}
		if unsafe && !found {
			issues = append(issues, readinessIssue("unsafe-documentation-impact-path", "Documentation-impact путь выходит за repository-root: "+value+".", item))
			continue
		}
		if !found {
			issues = append(issues, readinessIssue("missing-documentation-impact-path", "Указанный documentation-impact путь не существует: "+value+".", item))
		}
	}
	return issues
}

func taskReadiness(model *Model, taskID string, strict bool) (*WorkItem, []Issue) {
	item, err := findWorkItem(model, taskID)
	if err != nil {
		return nil, []Issue{{Severity: "error", Code: "task-selection-failed", Message: err.Error()}}
	}
	issues := []Issue{}
	paths := taskRelatedDocumentPaths(model, item)
	for _, issue := range model.Issues {
		if !paths[issue.DocumentPath] {
			continue
		}
		if issue.Severity == "error" || issue.Severity == "warning" {
			issues = append(issues, issue)
		}
	}
	required := []struct {
		value string
		code  string
		label string
	}{
		{item.Result, "missing-task-result", "Result"},
		{strings.Join(item.RepositoryPaths, " "), "missing-task-scope", "Scope"},
		{item.OutOfScope, "missing-task-out-of-scope", "Out of scope"},
		{item.Plan, "missing-task-plan", "Plan"},
		{item.DocumentationImpact, "missing-task-documentation-impact", "Documentation impact"},
	}
	for _, field := range required {
		if strings.TrimSpace(field.value) == "" {
			issues = append(issues, readinessIssue(field.code, "Обязательное поле задачи не заполнено: "+field.label+".", item))
		}
	}
	if strings.TrimSpace(item.ModuleID) == "" {
		issues = append(issues, readinessIssue("missing-task-module", "Для готовой к работе задачи требуется связанный module.", item))
	}
	if item.Type == "Feature" || item.Type == "Bug" {
		if strings.TrimSpace(item.BehaviorChange) == "" || item.Before == "" || item.After == "" {
			issues = append(issues, readinessIssue("missing-behavior-change", "Для Feature/Bug требуются «Изменение поведения», «Было» и «Станет».", item))
		}
		if item.UseCaseID == "" {
			issues = append(issues, readinessIssue("missing-task-use-case", "Для Feature/Bug требуется связанный use case.", item))
		}
	} else if item.Type != "" && item.UseCaseID == "" {
		document := model.DocByPath[item.Document]
		found := false
		if document != nil {
			for _, parsed := range parseWorkItems(document) {
				match := workItemHeadingRE.FindStringSubmatch(parsed.Heading.Title)
				if match == nil || match[1] != item.ID {
					continue
				}
				section, exists := workSection(parsed, "обоснование отсутствия сценария", "use case omission reason")
				found = exists && strings.TrimSpace(section.Text) != ""
				break
			}
		}
		if !found {
			issues = append(issues, readinessIssue("missing-use-case-omission-reason", "Техническая задача без use case требует обоснование отсутствия сценария.", item))
		}
	}
	if len(item.Criteria) == 0 {
		issues = append(issues, readinessIssue("missing-acceptance-criterion", "Требуется хотя бы один AC-*.", item))
	}
	seen := map[string]int{}
	for _, check := range item.Checks {
		seen[check.Target]++
	}
	for _, criterion := range item.Verification {
		if seen[criterion.CriterionID] != 1 || len(criterion.Commands) == 0 {
			issues = append(issues, readinessIssue("invalid-criterion-verification", "Для "+criterion.CriterionID+" требуется ровно одна исполняемая verification mapping.", item))
		}
	}
	requiredTargets := []string{"ALL", "DOCS"}
	if len(item.StandardIDs) > 0 {
		requiredTargets = append(requiredTargets, "QUALITY")
	}
	for _, target := range requiredTargets {
		if seen[target] != 1 {
			issues = append(issues, readinessIssue("missing-verification-target", "Требуется ровно одна verification mapping для "+target+".", item))
		}
	}
	issues = append(issues, referencedEntityIssues(model, item)...)
	issues = append(issues, documentationImpactIssues(model, item)...)
	return item, uniqueIssues(issues)
}

func blockingReadinessIssues(issues []Issue, strict bool) []Issue {
	result := []Issue{}
	for _, issue := range issues {
		if issue.Severity == "error" || strict && issue.Severity == "warning" {
			result = append(result, issue)
		}
	}
	return result
}

func uniqueIssues(issues []Issue) []Issue {
	result := []Issue{}
	seen := map[string]bool{}
	for _, issue := range issues {
		key := fmt.Sprintf("%s|%s|%s|%d", issue.Code, issue.Message, issue.DocumentPath, issue.Line)
		if !seen[key] {
			seen[key] = true
			result = append(result, issue)
		}
	}
	return result
}

func BuildTaskReady(model *Model, taskID string, strict bool) TaskReadyReport {
	item, issues := taskReadiness(model, taskID, strict)
	report := TaskReadyReport{
		SchemaVersion: 1, Kind: "task-ready", Generator: GeneratorInfo{Name: "Docu-docu", Version: Version},
		Task: taskSnapshot(item, taskID), Status: "contract_incomplete", Issues: issues,
	}
	if item == nil {
		return report
	}
	blocking := blockingReadinessIssues(issues, strict)
	switch item.statusName {
	case "draft":
		if len(blocking) == 0 {
			report.Status, report.ContractComplete = "contract_ready", true
		}
	case "ready":
		if len(blocking) == 0 {
			report.Status, report.ContractComplete, report.ReadyForWork = "ready", true, true
		}
	default:
		report.Status = "invalid_state"
		report.Issues = append(report.Issues, readinessIssue("invalid-task-ready-state", "task ready разрешён только для Draft или Ready.", item))
	}
	return report
}

func printTaskReadyText(w io.Writer, report TaskReadyReport) {
	fmt.Fprintf(w, "Задача: %s\nСтатус готовности: %s\nКонтракт заполнен: %t\nГотова к работе: %t\n",
		report.Task.ID, report.Status, report.ContractComplete, report.ReadyForWork)
	for _, issue := range report.Issues {
		fmt.Fprintf(w, "[%s] %s — %s\n", strings.ToUpper(issue.Severity), issue.Code, issue.Message)
	}
}
