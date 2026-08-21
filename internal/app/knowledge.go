package toudocu

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var (
	businessRuleHeadingRE   = regexp.MustCompile(`^(BR-[A-Z0-9-]+)\s*[:—-]\s*(.+)$`)
	workItemHeadingRE       = regexp.MustCompile(`^((?:TASK|BUG)-[A-Z0-9-]+)\s*[:—-]\s*(.+)$`)
	riskHeadingRE           = regexp.MustCompile(`^([A-Za-zА-Яа-я]+[-_ ]?\d+)\s*[:—-]\s*(.+)$`)
	businessRuleReferenceRE = regexp.MustCompile(`\bBR-[A-Z0-9-]+\b`)
	criterionIDRE           = regexp.MustCompile(`\bAC-[A-Z0-9-]+\b`)
	verificationTargetRE    = regexp.MustCompile(`\b(?:AC-[A-Z0-9-]+|ALL|DOCS|QUALITY)\b`)
	roadmapIDRE             = regexp.MustCompile(`\b(?:UC|CON|CONTRACT|DLV|DELIVERABLE)-[A-Z0-9-]+\b`)
	codeSpanRE              = regexp.MustCompile("`+([^`\\n]+?)`+")
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

type workSubsection struct {
	Heading  Heading
	EndLine  int
	Markdown string
	Text     string
	Tasks    []Task
	Nested   map[string]string
}

type parsedWorkItem struct {
	Heading     Heading
	EndLine     int
	Metadata    Metadata
	Subsections map[string]workSubsection
}

type useCaseAcceptanceState struct {
	Found         bool
	Total         int
	Completed     int
	Remaining     int
	HeadingLine   int
	FirstOpenLine int
}

type useCaseReadiness struct {
	StatusDone         bool
	EffectiveCompleted bool
	Acceptance         useCaseAcceptanceState
}

func calculateUseCaseReadiness(document *Document) useCaseReadiness {
	state := useCaseAcceptanceState{}
	heading, end, found := headingSectionRange(document, "критерии приёмки", "критерии приемки", "acceptance criteria")
	if found {
		state.Found = true
		state.HeadingLine = heading.Line + 1
		for _, task := range tasksInRange(document.Tasks, heading.Line+2, end) {
			state.Total++
			if task.Completed {
				state.Completed++
			} else if state.FirstOpenLine == 0 {
				state.FirstOpenLine = task.Line
			}
		}
		state.Remaining = state.Total - state.Completed
	}
	done := document.Status.Kind == "done"
	return useCaseReadiness{StatusDone: done, EffectiveCompleted: done && state.Found && state.Total > 0 && state.Remaining == 0, Acceptance: state}
}

func useCaseHeadingLine(document *Document) int {
	for _, heading := range document.Headings {
		if heading.Level == 1 {
			return heading.Line + 1
		}
	}
	return 1
}

func validateDoneUseCaseReadiness(model *Model, document *Document) {
	readiness := calculateUseCaseReadiness(document)
	if !readiness.StatusDone {
		return
	}
	if !readiness.Acceptance.Found || readiness.Acceptance.Total == 0 {
		line := readiness.Acceptance.HeadingLine
		if line == 0 {
			line = useCaseHeadingLine(document)
		}
		addKnowledgeIssue(model, document, "error", "done-use-case-missing-acceptance-criteria", "A done use case must have a non-empty Acceptance criteria section.", line)
	} else if readiness.Acceptance.Remaining > 0 {
		addKnowledgeIssue(model, document, "error", "done-use-case-has-open-acceptance-criteria", "A done use case must not have open acceptance criteria.", readiness.Acceptance.FirstOpenLine)
	}
}

func parseWorkItems(document *Document) []parsedWorkItem {
	result := []parsedWorkItem{}
	for headingIndex, heading := range document.Headings {
		if workItemHeadingRE.FindStringSubmatch(heading.Title) == nil {
			continue
		}
		end := strings.Count(document.Content, "\n") + 1
		itemEndOffset := len(document.Content)
		for _, candidate := range document.Headings[headingIndex+1:] {
			if candidate.Level <= heading.Level {
				end = candidate.Line
				itemEndOffset = candidate.startOffset
				break
			}
		}
		metadata := Metadata{}
		if heading.Level == 1 {
			for key, value := range document.Metadata {
				metadata[key] = value
			}
		}
		subsections := map[string]workSubsection{}
		for childIndex, child := range document.Headings {
			if child.Line <= heading.Line || child.Line >= end || child.Level != heading.Level+1 {
				continue
			}
			childEnd := end
			childEndOffset := itemEndOffset
			for _, candidate := range document.Headings[childIndex+1:] {
				if candidate.Line >= end {
					break
				}
				if candidate.Level <= child.Level {
					childEnd = candidate.Line
					childEndOffset = candidate.startOffset
					break
				}
			}
			content := strings.TrimSpace(document.Content[child.endOffset:childEndOffset])
			nested := map[string]string{}
			sectionText := ""
			for _, section := range document.Sections {
				if section.StartLine == child.Line {
					sectionText = strings.TrimSpace(section.Text)
					for _, candidate := range section.children {
						nested[canonicalText(candidate.Title)] = strings.TrimSpace(candidate.Text)
					}
				}
			}
			subsections[canonicalText(child.Title)] = workSubsection{
				Heading:  child,
				EndLine:  childEnd,
				Markdown: content,
				Text:     sectionText,
				Tasks:    tasksInRange(document.Tasks, child.Line+2, childEnd),
				Nested:   nested,
			}
		}
		result = append(result, parsedWorkItem{Heading: heading, EndLine: end, Metadata: metadata, Subsections: subsections})
	}
	return result
}

func tasksInRange(tasks []Task, startLine, endLine int) []Task {
	result := []Task{}
	for _, task := range tasks {
		if task.Line >= startLine && task.Line <= endLine {
			result = append(result, task)
		}
	}
	return result
}

func workSection(item parsedWorkItem, names ...string) (workSubsection, bool) {
	for _, name := range names {
		if section, ok := item.Subsections[canonicalText(name)]; ok {
			return section, true
		}
	}
	return workSubsection{}, false
}

func taskStatus(value string) (name string, valid bool) {
	aliases := map[string]string{
		"черновик": "draft", "draft": "draft",
		"готово к работе": "ready", "ready": "ready",
		"в работе": "in-progress", "in progress": "in-progress",
		"заблокировано": "blocked", "blocked": "blocked",
		"выполнено": "done", "done": "done", "completed": "done",
		"отменено": "cancelled", "cancelled": "cancelled", "canceled": "cancelled",
	}
	name, valid = aliases[canonicalText(value)]
	return name, valid
}

func taskType(value string) (name string, valid bool) {
	aliases := map[string]string{
		"feature": "Feature", "функциональность": "Feature",
		"bug": "Bug", "ошибка": "Bug",
		"maintenance": "Maintenance", "обслуживание": "Maintenance",
		"documentation": "Documentation", "документация": "Documentation",
		"research": "Research", "исследование": "Research",
	}
	name, valid = aliases[canonicalText(value)]
	return name, valid
}

func workSectionContentRequired(model *Model, document *Document, item parsedWorkItem, section workSubsection, found bool, label string) {
	if !found {
		addKnowledgeIssue(model, document, "error", "missing-work-section", fmt.Sprintf("Task %s has no %s section.", item.Heading.Title, label), item.Heading.Line+1)
		return
	}
	if strings.TrimSpace(section.Text) == "" {
		addKnowledgeIssue(model, document, "error", "empty-work-section", fmt.Sprintf("Section %s in task %s must not be empty.", label, item.Heading.Title), section.Heading.Line+1)
	}
}

func commandsForVerificationLine(line, criterionID string) []string {
	commands := []string{}
	for _, match := range codeSpanRE.FindAllStringSubmatch(line, -1) {
		value := strings.TrimSpace(match[1])
		if value != "" && value != criterionID {
			commands = append(commands, value)
		}
	}
	if len(commands) > 0 {
		return uniqueStrings(commands)
	}
	for _, delimiter := range []string{"→", "->", "=>"} {
		if index := strings.Index(line, delimiter); index >= 0 {
			value := strings.TrimSpace(stripInlineMarkdown(line[index+len(delimiter):]))
			if value != "" {
				return []string{value}
			}
		}
	}
	return nil
}

func targetsForVerificationLine(line string) []string {
	text := strings.ToUpper(stripInlineMarkdown(line))
	delimiterIndex := -1
	for _, delimiter := range []string{"→", "->", "=>"} {
		if index := strings.Index(text, delimiter); index >= 0 && (delimiterIndex < 0 || index < delimiterIndex) {
			delimiterIndex = index
		}
	}
	if delimiterIndex >= 0 {
		text = text[:delimiterIndex]
	} else {
		text = strings.TrimSpace(strings.TrimLeft(text, "-*+ "))
		if fields := strings.Fields(text); len(fields) > 0 {
			text = fields[0]
		}
	}
	return uniqueStrings(verificationTargetRE.FindAllString(text, -1))
}

func traceabilityForVerificationLine(line, criterionID string) ([]string, string, bool) {
	text := strings.TrimSpace(stripInlineMarkdown(line))
	text = strings.TrimSpace(strings.TrimLeft(text, "-*+ "))
	parts := []string{}
	for _, part := range regexp.MustCompile(`\s*(?:→|->|=>)\s*`).Split(text, -1) {
		if value := strings.TrimSpace(part); value != "" {
			parts = append(parts, value)
		}
	}
	if len(parts) < 3 || !strings.EqualFold(parts[0], criterionID) {
		return nil, "", false
	}
	transitionIDs := []string{}
	for _, value := range splitReferences(parts[1]) {
		if strings.HasPrefix(strings.ToUpper(value), "TR-") {
			transitionIDs = append(transitionIDs, strings.ToUpper(value))
		}
	}
	if len(transitionIDs) == 0 {
		return nil, "", false
	}
	return uniqueStrings(transitionIDs), strings.TrimSpace(strings.Join(parts[2:], " → ")), true
}

func parseCriteriaAndVerification(model *Model, document *Document, item parsedWorkItem, required bool) ([]Task, []CriterionVerification, []VerificationCheck) {
	criteriaSection, criteriaFound := workSection(item, "критерии приёмки", "критерии приемки", "acceptance criteria")
	if !criteriaFound {
		return []Task{}, []CriterionVerification{}, []VerificationCheck{}
	}
	if required && len(criteriaSection.Tasks) == 0 {
		addKnowledgeIssue(model, document, "error", "missing-acceptance-criterion", "The task must contain at least one acceptance criterion.", criteriaSection.Heading.Line+1)
	}
	type criterionData struct {
		task Task
		id   string
	}
	criteria := []criterionData{}
	byID := map[string]criterionData{}
	for _, task := range criteriaSection.Tasks {
		ids := criterionIDRE.FindAllString(strings.ToUpper(task.Text), -1)
		if len(ids) != 1 || !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(task.Text)), ids[0]) {
			addKnowledgeIssue(model, document, "error", "invalid-acceptance-criterion-id", "Every acceptance criterion must start with a unique AC-* identifier.", task.Line)
			continue
		}
		id := ids[0]
		if _, exists := byID[id]; exists {
			addKnowledgeIssue(model, document, "error", "duplicate-acceptance-criterion-id", "Criterion identifier "+id+" is duplicated within the task.", task.Line)
			continue
		}
		data := criterionData{task: task, id: id}
		criteria = append(criteria, data)
		byID[id] = data
	}

	verificationSection, verificationFound := workSection(item, "проверка", "verification")
	commandsByID := map[string][]string{}
	transitionsByID := map[string][]string{}
	referencesByID := map[string][]string{}
	checks := []VerificationCheck{}
	seenTargets := map[string]bool{}
	if verificationFound {
		for localIndex, line := range strings.Split(verificationSection.Markdown, "\n") {
			lineIndex := verificationSection.Heading.Line + 1 + localIndex
			targets := targetsForVerificationLine(line)
			if len(targets) == 0 {
				continue
			}
			if len(targets) > 1 {
				addKnowledgeIssue(model, document, "error", "ambiguous-verification-target", "A verification entry must reference exactly one AC-*, ALL, DOCS, or QUALITY target.", lineIndex+1)
				continue
			}
			target := targets[0]
			if strings.HasPrefix(target, "AC-") {
				if _, exists := byID[target]; !exists {
					addKnowledgeIssue(model, document, "error", "unknown-criterion-verification", "Verification references unknown criterion "+target+".", lineIndex+1)
					continue
				}
			}
			if strings.HasPrefix(target, "AC-") {
				if transitionIDs, reference, trace := traceabilityForVerificationLine(line, target); trace {
					transitionsByID[target] = append(transitionsByID[target], transitionIDs...)
					if reference == "" {
						addKnowledgeIssue(model, document, "error", "empty-traceability-verification", "No verification is defined for the relationship between "+target+" and the transition.", lineIndex+1)
					} else {
						referencesByID[target] = append(referencesByID[target], reference)
					}
					continue
				}
			}
			commands := commandsForVerificationLine(line, target)
			if len(commands) == 0 {
				addKnowledgeIssue(model, document, "error", "empty-criterion-verification", "No verification command is defined for target "+target+".", lineIndex+1)
				continue
			}
			if seenTargets[target] {
				code := "duplicate-verification-target"
				if strings.HasPrefix(target, "AC-") {
					code = "duplicate-criterion-verification"
				}
				addKnowledgeIssue(model, document, "error", code, "Multiple verification entries are defined for target "+target+".", lineIndex+1)
			}
			seenTargets[target] = true
			checks = append(checks, VerificationCheck{Target: target, Commands: commands, Line: lineIndex + 1})
			if strings.HasPrefix(target, "AC-") {
				commandsByID[target] = append(commandsByID[target], commands...)
			}
		}
	}

	tasks := make([]Task, 0, len(criteria))
	matrix := make([]CriterionVerification, 0, len(criteria))
	for _, criterion := range criteria {
		tasks = append(tasks, criterion.task)
		commands := append([]string{}, uniqueStrings(commandsByID[criterion.id])...)
		if required && len(commands) == 0 {
			addKnowledgeIssue(model, document, "error", "missing-criterion-verification", "Criterion "+criterion.id+" has no command in the Verification section.", criterion.task.Line)
		}
		text := strings.TrimSpace(criterionIDRE.ReplaceAllString(criterion.task.Text, ""))
		matrix = append(matrix, CriterionVerification{
			CriterionID: criterion.id, Criterion: text, Completed: criterion.task.Completed, Commands: commands,
			Transitions: uniqueStrings(transitionsByID[criterion.id]), References: uniqueStrings(referencesByID[criterion.id]),
		})
	}
	return tasks, matrix, checks
}

func validateScopePaths(model *Model, document *Document, item parsedWorkItem, terminal bool) []string {
	scope, found := workSection(item, "область изменения", "scope")
	if !found {
		return nil
	}
	result := []string{}
	for _, match := range codeSpanRE.FindAllStringSubmatch(scope.Markdown, -1) {
		value := normalizeSlashes(strings.TrimSpace(match[1]))
		if value == "" || strings.ContainsAny(value, "\n\r") {
			continue
		}
		if filepath.IsAbs(filepath.FromSlash(value)) {
			addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Scope path must be relative to the repository root: "+value+".", scope.Heading.Line+1)
			continue
		}
		absolute := filepath.Clean(filepath.Join(model.RepositoryRoot, filepath.FromSlash(value)))
		if !ensureInside(model.RepositoryRoot, absolute) {
			addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Scope path escapes the repository root: "+value+".", scope.Heading.Line+1)
			continue
		}
		resolvedRoot, rootErr := resolvePathForSafety(model.RepositoryRoot)
		resolvedPath, pathErr := resolvePathForSafety(absolute)
		if rootErr != nil || pathErr != nil || !ensureInside(resolvedRoot, resolvedPath) {
			addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Scope path escapes the repository root through a symbolic link: "+value+".", scope.Heading.Line+1)
			continue
		}
		if strings.ContainsAny(value, "*?[") {
			matches, _ := filepath.Glob(absolute)
			if len(matches) == 0 {
				if terminal {
					result = append(result, value)
					continue
				}
				addKnowledgeIssue(model, document, "error", "missing-scope-path", "Scope path does not exist: "+value+".", scope.Heading.Line+1)
				continue
			}
			unsafe := false
			for _, match := range matches {
				resolved, err := resolvePathForSafety(match)
				if err != nil || !ensureInside(resolvedRoot, resolved) {
					unsafe = true
					break
				}
			}
			if unsafe {
				addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Scope match escapes the repository root: "+value+".", scope.Heading.Line+1)
				continue
			}
		} else if _, err := os.Stat(absolute); err != nil {
			if os.IsNotExist(err) && terminal {
				result = append(result, value)
				continue
			}
			if os.IsNotExist(err) && strings.HasSuffix(value, "/") {
				addKnowledgeIssue(model, document, "error", "missing-scope-path", "A new missing scope path must be a file, not a directory: "+value+".", scope.Heading.Line+1)
				continue
			}
			parent := filepath.Dir(absolute)
			info, parentErr := os.Stat(parent)
			if !os.IsNotExist(err) || parentErr != nil || !info.IsDir() {
				addKnowledgeIssue(model, document, "error", "missing-scope-path", "The parent directory of the new scope file does not exist: "+value+".", scope.Heading.Line+1)
				continue
			}
		}
		result = append(result, value)
	}
	result = uniqueStrings(result)
	sort.SliceStable(result, func(i, j int) bool { return naturalCompare(result[i], result[j]) < 0 })
	return result
}

func nestedWorkSection(section workSubsection, names ...string) string {
	for _, name := range names {
		if value := section.Nested[canonicalText(name)]; value != "" {
			return value
		}
	}
	return ""
}

func documentationPathsFor(model *Model, document *Document, item parsedWorkItem) []string {
	section, found := workSection(item, "влияние на документацию", "documentation impact")
	if !found {
		return []string{}
	}
	candidates := []string{}
	for _, match := range codeSpanRE.FindAllStringSubmatch(section.Markdown, -1) {
		candidates = append(candidates, strings.TrimSpace(match[1]))
	}
	for _, link := range document.Links {
		if link.Line <= section.Heading.Line || link.Line > section.EndLine || link.Image {
			continue
		}
		candidates = append(candidates, strings.Split(link.Destination, "#")[0])
	}
	result := []string{}
	for _, value := range candidates {
		value = normalizeSlashes(strings.TrimSpace(value))
		if value == "" || strings.ContainsAny(value, "*?[") || strings.Contains(value, "://") {
			continue
		}
		repositoryCandidate := filepath.Join(model.RepositoryRoot, filepath.FromSlash(value))
		docsCandidate := filepath.Join(model.RootDirectory, filepath.FromSlash(value))
		if strings.HasPrefix(value, "../") {
			docsCandidate = filepath.Join(filepath.Dir(document.AbsolutePath), filepath.FromSlash(value))
		}
		for _, absolute := range []string{repositoryCandidate, docsCandidate} {
			if info, err := os.Stat(absolute); err == nil && !info.IsDir() {
				if ensureInside(model.RootDirectory, absolute) {
					result = append(result, toPosixRelative(model.RootDirectory, absolute))
				} else if ensureInside(model.RepositoryRoot, absolute) {
					result = append(result, toPosixRelative(model.RepositoryRoot, absolute))
				}
				break
			}
		}
	}
	result = uniqueStrings(result)
	sort.SliceStable(result, func(i, j int) bool { return naturalCompare(result[i], result[j]) < 0 })
	return result
}

func normalizedEnum(value string, aliases map[string]string) (string, bool) {
	normalized, ok := aliases[canonicalText(value)]
	return normalized, ok
}

func validateRequiredBugMetadata(model *Model, document *Document, item parsedWorkItem) {
	fields := []struct {
		key   string
		label string
	}{
		{"severity", "Severity"},
		{"priority", "Priority"},
		{"reproducibility", "Reproducibility"},
		{"regression", "Regression"},
		{"module", "Module"},
		{"useCase", "Use case"},
		{"updated", "Updated"},
	}
	for _, field := range fields {
		if strings.TrimSpace(item.Metadata[field.key]) == "" {
			addKnowledgeIssue(model, document, "error", "missing-bug-field", "A bug requires the "+field.label+" field.", item.Heading.Line+1)
		}
	}

	if _, ok := normalizedEnum(item.Metadata["severity"], map[string]string{
		"критическая": "critical", "critical": "critical",
		"высокая": "high", "high": "high",
		"средняя": "medium", "medium": "medium",
		"низкая": "low", "low": "low",
	}); item.Metadata["severity"] != "" && !ok {
		addKnowledgeIssue(model, document, "error", "invalid-bug-severity", "Bug severity must be Critical, High, Medium, or Low.", item.Heading.Line+1)
	}
	if _, ok := normalizedEnum(item.Metadata["priority"], map[string]string{
		"срочный": "urgent", "urgent": "urgent",
		"высокий": "high", "high": "high",
		"обычный": "normal", "normal": "normal",
		"низкий": "low", "low": "low",
	}); item.Metadata["priority"] != "" && !ok {
		addKnowledgeIssue(model, document, "error", "invalid-bug-priority", "Bug priority must be Urgent, High, Normal, or Low.", item.Heading.Line+1)
	}
	if _, ok := normalizedEnum(item.Metadata["reproducibility"], map[string]string{
		"всегда": "always", "always": "always",
		"часто": "often", "often": "often",
		"иногда": "sometimes", "sometimes": "sometimes",
		"редко": "rarely", "rarely": "rarely",
		"не воспроизводится": "not-reproduced", "not reproduced": "not-reproduced",
		"неизвестно": "unknown", "unknown": "unknown",
	}); item.Metadata["reproducibility"] != "" && !ok {
		addKnowledgeIssue(model, document, "error", "invalid-bug-reproducibility", "Invalid bug reproducibility value.", item.Heading.Line+1)
	}
	regression, regressionValid := normalizedEnum(item.Metadata["regression"], map[string]string{
		"да": "yes", "yes": "yes", "true": "yes",
		"нет": "no", "no": "no", "false": "no",
	})
	if item.Metadata["regression"] != "" && !regressionValid {
		addKnowledgeIssue(model, document, "error", "invalid-bug-regression", "The Regression field must be Yes or No.", item.Heading.Line+1)
	}
	if item.Metadata["updated"] != "" {
		if _, ok := parseDate(item.Metadata["updated"]); !ok {
			addKnowledgeIssue(model, document, "error", "invalid-bug-updated-date", "The Updated field must contain a YYYY-MM-DD date.", item.Heading.Line+1)
		}
	}
	if regression == "yes" {
		bodyParts := []string{}
		for _, section := range item.Subsections {
			bodyParts = append(bodyParts, section.Markdown)
		}
		body := strings.ToLower(strings.Join(bodyParts, "\n"))
		versionOrPeriod := regexp.MustCompile(`(?m)^\s*[-*+]\s*(?:версия|version|период|period)\s*[:：]\s*\S+`).MatchString(body)
		if !versionOrPeriod {
			addKnowledgeIssue(model, document, "error", "missing-regression-version", "A regression requires the version or period in which the defect was observed.", item.Heading.Line+1)
		}
	}
}

func bugHasRegressionCoverage(item parsedWorkItem, criteria []Task) bool {
	for _, criterion := range criteria {
		text := canonicalText(criterion.Text)
		if strings.Contains(text, "регрессион") || strings.Contains(text, "regression") {
			return true
		}
	}
	section, found := workSection(item, "регрессионный тест", "regression test")
	if !found || strings.TrimSpace(section.Text) == "" {
		return false
	}
	explanation := canonicalText(section.Text)
	for _, marker := range []string{"невозмож", "cannot", "not possible", "impossible", "not feasible"} {
		if strings.Contains(explanation, marker) {
			return true
		}
	}
	return false
}

func bugUseCaseNotApplicable(value string) bool {
	value = canonicalText(value)
	return value == "не применяется" || value == "not applicable" || value == "n/a"
}

func validateWorkItem(model *Model, document *Document, item parsedWorkItem) WorkItem {
	match := workItemHeadingRE.FindStringSubmatch(item.Heading.Title)
	statusName, statusValid := taskStatus(item.Metadata["status"])
	if !statusValid {
		addKnowledgeIssue(model, document, "error", "invalid-task-status", "Invalid task status: "+fallbackDash(item.Metadata["status"])+".", item.Heading.Line+1)
	}
	typeName, typeValid := taskType(item.Metadata["type"])
	if !typeValid {
		addKnowledgeIssue(model, document, "error", "invalid-task-type", "Task type must be Feature, Bug, Maintenance, Documentation, or Research.", item.Heading.Line+1)
	}
	isBug := typeValid && typeName == "Bug"
	if isBug && !strings.HasPrefix(match[1], "BUG-") {
		addKnowledgeIssue(model, document, "error", "invalid-bug-id", "A Bug work item identifier must start with BUG-.", item.Heading.Line+1)
	}
	if !isBug && strings.HasPrefix(match[1], "BUG-") {
		addKnowledgeIssue(model, document, "error", "bug-id-type-mismatch", "A BUG-* identifier requires `Type: Bug`.", item.Heading.Line+1)
	}
	if isBug {
		validateRequiredBugMetadata(model, document, item)
	}

	type requiredWorkSection struct {
		names []string
		label string
	}
	requiredSections := []requiredWorkSection{}
	if isBug {
		requiredSections = append(requiredSections,
			requiredWorkSection{[]string{"симптом", "symptom"}, "Symptom"},
			requiredWorkSection{[]string{"ожидаемое поведение", "expected behavior"}, "Expected behavior"},
			requiredWorkSection{[]string{"фактическое поведение", "actual behavior"}, "Actual behavior"},
		)
	} else {
		requiredSections = append(requiredSections, requiredWorkSection{[]string{"результат", "result", "outcome"}, "Result"})
	}
	strictWorkflow := statusValid && statusName != "draft"
	if strictWorkflow {
		requiredSections = append(requiredSections,
			requiredWorkSection{[]string{"область изменения", "scope"}, "Scope"},
			requiredWorkSection{[]string{"не входит в задачу", "не входит в исправление", "out of scope"}, "Out of scope"},
			requiredWorkSection{[]string{"критерии приёмки", "критерии приемки", "acceptance criteria"}, "Acceptance criteria"},
			requiredWorkSection{[]string{"план", "plan"}, "Plan"},
			requiredWorkSection{[]string{"проверка", "verification"}, "Verification"},
			requiredWorkSection{[]string{"влияние на документацию", "documentation impact"}, "Documentation impact"},
		)
		if isBug {
			requiredSections = append(requiredSections,
				requiredWorkSection{[]string{"причина", "cause", "root cause"}, "Root cause"},
			)
		} else if typeValid && typeName == "Feature" {
			requiredSections = append(requiredSections,
				requiredWorkSection{[]string{"изменение поведения", "behavior change"}, "Behavior change"},
			)
		}
	}
	for _, required := range requiredSections {
		section, found := workSection(item, required.names...)
		workSectionContentRequired(model, document, item, section, found, required.label)
	}

	criteria, verification, checks := parseCriteriaAndVerification(model, document, item, strictWorkflow)
	if strictWorkflow && typeValid && typeName == "Feature" {
		behavior, found := workSection(item, "изменение поведения", "behavior change")
		if found {
			if nestedWorkSection(behavior, "было", "before") == "" || nestedWorkSection(behavior, "станет", "after") == "" {
				addKnowledgeIssue(model, document, "error", "incomplete-behavior-change", "The Behavior change section must contain non-empty Before and After subsections.", behavior.Heading.Line+1)
			}
		}
	}
	checklistLines := map[int]struct{}{}
	if criteriaSection, found := workSection(item, "критерии приёмки", "критерии приемки", "acceptance criteria"); found {
		for _, criterion := range criteriaSection.Tasks {
			checklistLines[criterion.Line] = struct{}{}
		}
	}
	if planSection, found := workSection(item, "план", "plan"); found {
		for _, step := range planSection.Tasks {
			if isBug {
				addKnowledgeIssue(model, document, "error", "bug-plan-checkbox", "A bug plan must be a numbered list without checkboxes.", step.Line)
			}
			checklistLines[step.Line] = struct{}{}
		}
	}
	for _, task := range tasksInRange(document.Tasks, item.Heading.Line+2, item.EndLine) {
		if _, allowed := checklistLines[task.Line]; !allowed {
			message := "Task checkboxes are allowed only in the Acceptance criteria and Plan sections."
			if isBug {
				message = "In a bug document, checkboxes are allowed only in the Acceptance criteria section."
			}
			addKnowledgeIssue(model, document, "error", "task-checkbox-outside-criteria", message, task.Line)
		}
	}

	if isBug {
		steps, stepsFound := workSection(item, "шаги воспроизведения", "steps to reproduce", "reproduction steps")
		evidence, evidenceFound := workSection(item, "доказательства", "evidence", "подтверждение", "confirmation")
		if (!stepsFound || strings.TrimSpace(steps.Text) == "") && (!evidenceFound || strings.TrimSpace(evidence.Text) == "") {
			addKnowledgeIssue(model, document, "error", "missing-bug-reproduction-evidence", "A bug must contain reproduction steps or non-empty evidence.", item.Heading.Line+1)
		}
		if strictWorkflow && !bugHasRegressionCoverage(item, criteria) {
			addKnowledgeIssue(model, document, "error", "missing-bug-regression-test", "A bug requires a regression-test criterion or a Regression test section explaining why automation is not possible.", item.Heading.Line+1)
		}
		if statusName == "done" {
			cause, found := workSection(item, "причина", "cause", "root cause")
			unknown := canonicalText(cause.Text)
			if !found || unknown == "" || unknown == "не установлена" || unknown == "unknown" || unknown == "not established" {
				addKnowledgeIssue(model, document, "error", "missing-completed-bug-cause", "A completed bug must have an established root cause.", item.Heading.Line+1)
			}
		}
	}

	if statusName == "blocked" {
		blocker, found := workSection(item, "блокер", "blocker")
		workSectionContentRequired(model, document, item, blocker, found, "Blocker")
	}
	if statusName == "cancelled" {
		reason, found := workSection(item, "причина отмены", "cancellation reason")
		workSectionContentRequired(model, document, item, reason, found, "Cancellation reason")
	}
	if strictWorkflow {
		declared := map[string]bool{}
		for _, check := range checks {
			declared[check.Target] = true
		}
		requiredTargets := []string{"ALL", "DOCS"}
		if len(splitReferences(item.Metadata["standards"])) > 0 {
			requiredTargets = append(requiredTargets, "QUALITY")
		}
		for _, target := range requiredTargets {
			if !declared[target] {
				code := "missing-task-check"
				if statusName == "done" {
					code = "missing-completed-task-check"
				}
				addKnowledgeIssue(model, document, "error", code, "The task must contain verification for "+target+".", item.Heading.Line+1)
			}
		}
	}
	terminalScopeHistory := statusName == "cancelled"
	if statusName == "done" {
		terminalScopeHistory = true
		if criteriaSection, found := workSection(item, "критерии приёмки", "критерии приемки", "acceptance criteria"); found {
			for _, criterion := range criteriaSection.Tasks {
				if !criterion.Completed {
					terminalScopeHistory = false
					addKnowledgeIssue(model, document, "error", "incomplete-completed-task", "Every acceptance criterion in a completed task must be marked [x].", criterion.Line)
				}
			}
		} else {
			terminalScopeHistory = false
		}
	}

	useCaseID := strings.TrimSpace(item.Metadata["useCase"])
	useCaseOmitted := isBug && bugUseCaseNotApplicable(useCaseID)
	if useCaseOmitted {
		useCaseID = ""
		relation, found := workSection(item, "связь с пользовательским поведением", "relationship to user behavior")
		if !found || strings.TrimSpace(relation.Text) == "" {
			addKnowledgeIssue(model, document, "error", "missing-bug-use-case-explanation", "A not-applicable Use case value requires a Relationship to user behavior section.", item.Heading.Line+1)
		}
	}
	if strictWorkflow && typeValid && (typeName == "Feature" || typeName == "Bug") && useCaseID == "" {
		if !useCaseOmitted {
			addKnowledgeIssue(model, document, "error", "missing-task-use-case", "A "+typeName+" task requires a linked use case.", item.Heading.Line+1)
		}
	}
	if strictWorkflow && typeValid && typeName != "Feature" && typeName != "Bug" && useCaseID == "" {
		reason, found := workSection(item, "обоснование отсутствия сценария", "use case omission reason")
		if !found || strings.TrimSpace(reason.Text) == "" {
			addKnowledgeIssue(model, document, "error", "missing-use-case-omission-reason", "A technical task without a use case must contain a Use case omission reason section.", item.Heading.Line+1)
		}
	}

	resultSection, _ := workSection(item, "результат", "result")
	behaviorSection, _ := workSection(item, "изменение поведения", "behavior change")
	outOfScopeSection, _ := workSection(item, "не входит в задачу", "не входит в исправление", "out of scope")
	planSection, _ := workSection(item, "план", "plan")
	documentationImpactSection, _ := workSection(item, "влияние на документацию", "documentation impact")
	blockerSection, _ := workSection(item, "блокер", "blocker")
	repositoryPaths := append([]string{}, validateScopePaths(model, document, item, terminalScopeHistory)...)
	return WorkItem{
		ID: match[1], Title: match[2], Status: StatusFor(item.Metadata["status"]), Type: typeName,
		Priority: item.Metadata["priority"], Severity: item.Metadata["severity"],
		Reproducibility: item.Metadata["reproducibility"], Regression: item.Metadata["regression"],
		Updated: item.Metadata["updated"], ModuleID: item.Metadata["module"],
		UseCaseID: useCaseID, FlowID: strings.TrimSpace(item.Metadata["flow"]),
		ScreenIDs:     splitReferences(item.Metadata["screens"]),
		TransitionIDs: splitReferences(item.Metadata["transitions"]),
		StandardIDs:   splitReferences(item.Metadata["standards"]),
		RunbookIDs:    splitReferences(item.Metadata["runbooks"]),
		DependsOn:     splitReferences(item.Metadata["dependsOn"]), ParentID: optionalString(strings.TrimSpace(item.Metadata["parentTask"])), ChildIDs: []string{}, Document: document.SourcePath,
		Anchor: item.Heading.ID, Criteria: criteria, Verification: verification, Checks: checks,
		RepositoryPaths: repositoryPaths, line: item.Heading.Line + 1, parentLine: document.metadataLocations["parentTask"], parentCount: document.metadataCounts["parentTask"],
		Result:              strings.TrimSpace(resultSection.Text),
		BehaviorChange:      strings.TrimSpace(behaviorSection.Text),
		Before:              nestedWorkSection(behaviorSection, "было", "before"),
		After:               nestedWorkSection(behaviorSection, "станет", "after"),
		OutOfScope:          strings.TrimSpace(outOfScopeSection.Text),
		Plan:                strings.TrimSpace(planSection.Text),
		DocumentationImpact: strings.TrimSpace(documentationImpactSection.Text),
		DocumentationPaths:  documentationPathsFor(model, document, item),
		Blocker:             strings.TrimSpace(blockerSection.Text),
		ownerDoc:            document, statusName: statusName, useCaseOmitted: useCaseOmitted,
	}
}

func validateStatusDocument(model *Model) {
	document := model.DocByPath["status.md"]
	if document == nil {
		return
	}
	for _, task := range document.Tasks {
		addKnowledgeIssue(model, document, "error", "status-requirement-checklist", "status.md must not contain its own requirements checklist; link to the roadmap or a work item instead.", task.Line)
	}
}

func validateRoadmap(model *Model, documentIDs map[string]*Document) {
	document := model.DocByPath["roadmap.md"]
	if document == nil {
		return
	}
	seenDeliverables := map[string]int{}
	for _, task := range document.Tasks {
		id, valid := roadmapItemID(task.Text)
		if !valid {
			addKnowledgeIssue(model, document, "error", "invalid-roadmap-item-id", "Every roadmap item must contain exactly one stable use-case, contract, or deliverable ID.", task.Line)
			continue
		}
		if strings.HasPrefix(id, "DLV-") || strings.HasPrefix(id, "DELIVERABLE-") {
			if previousLine := seenDeliverables[id]; previousLine > 0 {
				addKnowledgeIssue(model, document, "error", "duplicate-roadmap-id", fmt.Sprintf("Deliverable %s is already declared on line %d.", id, previousLine), task.Line)
			} else {
				seenDeliverables[id] = task.Line
			}
			continue
		}
		target := documentIDs[id]
		if target == nil || (target.Type != "use-case" && target.Type != "contract") {
			addKnowledgeIssue(model, document, "error", "dangling-roadmap-reference", "The roadmap references unknown use case or contract "+id+".", task.Line)
			continue
		}
	}
}

func roadmapItemID(text string) (string, bool) {
	ids := uniqueStrings(roadmapIDRE.FindAllString(strings.ToUpper(text), -1))
	if len(ids) != 1 {
		return "", false
	}
	return ids[0], true
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
			addKnowledgeIssue(model, item.ownerDoc, "error", "task-dependency-cycle", "Task dependency cycle: "+strings.Join(cycle, " → ")+".", item.line)
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

func taskParentID(item *WorkItem) string {
	if item == nil || item.ParentID == nil {
		return ""
	}
	return *item.ParentID
}

func addTaskHierarchyIssue(model *Model, item *WorkItem, code, message, relatedID string, line int) {
	issue := newIssue("error", code, message, item.Document, line)
	issue.TaskID, issue.RelatedID = item.ID, relatedID
	addDocumentIssue(model, item.ownerDoc, issue)
}

func sortedWorkItems(workItems []WorkItem) []*WorkItem {
	items := make([]*WorkItem, len(workItems))
	for index := range workItems {
		items[index] = &workItems[index]
	}
	sort.Slice(items, func(i, j int) bool { return naturalCompare(items[i].ID, items[j].ID) < 0 })
	return items
}

func validateTaskHierarchy(model *Model, workItems []WorkItem, workByID map[string]*WorkItem) {
	for _, item := range sortedWorkItems(workItems) {
		parentID := taskParentID(item)
		if parentID == "" {
			continue
		}
		line := item.parentLine
		if line == 0 {
			line = item.line
		}
		if item.parentCount > 1 {
			addTaskHierarchyIssue(model, item, "TASK_PARENT_INVALID", fmt.Sprintf("Task %s declares Parent more than once; exactly one TASK-* identifier is allowed.", item.ID), parentID, line)
			continue
		}
		if !taskIDRE.MatchString(parentID) {
			addTaskHierarchyIssue(model, item, "TASK_PARENT_INVALID", fmt.Sprintf("Task %s has invalid Parent value %s; exactly one TASK-* identifier is required.", item.ID, parentID), parentID, line)
			continue
		}
		if item.ID == parentID {
			addTaskHierarchyIssue(model, item, "TASK_PARENT_SELF", fmt.Sprintf("Task %s cannot be its own parent.", item.ID), parentID, line)
			continue
		}
		parent := workByID[parentID]
		if parent == nil {
			addTaskHierarchyIssue(model, item, "TASK_PARENT_UNKNOWN", fmt.Sprintf("Task %s references unknown parent %s.", item.ID, parentID), parentID, line)
			continue
		}
		if !strings.HasPrefix(item.ID, "TASK-") || !strings.HasPrefix(parent.ID, "TASK-") {
			addTaskHierarchyIssue(model, item, "TASK_PARENT_TYPE_UNSUPPORTED", fmt.Sprintf("Parent relation %s → %s is supported only between TASK-* work items.", item.ID, parentID), parentID, line)
			continue
		}
		parent.ChildIDs = append(parent.ChildIDs, item.ID)
	}
	for _, item := range sortedWorkItems(workItems) {
		sort.Slice(item.ChildIDs, func(i, j int) bool { return naturalCompare(item.ChildIDs[i], item.ChildIDs[j]) < 0 })
	}

	state := map[string]int{}
	stack := []string{}
	var visit func(*WorkItem)
	visit = func(item *WorkItem) {
		if state[item.ID] == 2 {
			return
		}
		if state[item.ID] == 1 {
			start := 0
			for stack[start] != item.ID {
				start++
			}
			cycle := append(append([]string{}, stack[start:]...), item.ID)
			message := "Task hierarchy cycle: " + strings.Join(cycle, " → ") + "."
			for _, id := range cycle[:len(cycle)-1] {
				member := workByID[id]
				addTaskHierarchyIssue(model, member, "TASK_PARENT_CYCLE", message, taskParentID(member), member.parentLine)
			}
			return
		}
		state[item.ID] = 1
		stack = append(stack, item.ID)
		if parent := workByID[taskParentID(item)]; parent != nil {
			visit(parent)
		}
		stack = stack[:len(stack)-1]
		state[item.ID] = 2
	}
	for _, item := range sortedWorkItems(workItems) {
		visit(item)
	}

	for _, item := range sortedWorkItems(workItems) {
		if item.statusName == "done" {
			for _, childID := range item.ChildIDs {
				if child := workByID[childID]; child != nil && child.statusName != "done" {
					addTaskHierarchyIssue(model, item, "TASK_CHILD_INCOMPLETE", fmt.Sprintf("Done task %s has incomplete child %s (%s).", item.ID, child.ID, child.Status.Label), child.ID, item.line)
				}
			}
		}
		if item.statusName == "cancelled" {
			for _, childID := range item.ChildIDs {
				if child := workByID[childID]; child != nil && child.statusName != "done" && child.statusName != "cancelled" {
					addTaskHierarchyIssue(model, item, "TASK_CANCELLED_PARENT_ACTIVE_CHILD", fmt.Sprintf("Cancelled task %s has active child %s (%s).", item.ID, child.ID, child.Status.Label), child.ID, item.line)
				}
			}
		}
	}
}

func detectTaskCompletionCycles(model *Model, workItems []WorkItem, workByID map[string]*WorkItem) {
	state := map[string]int{}
	stack := []string{}
	reported := map[string]bool{}
	var visit func(*WorkItem)
	visit = func(item *WorkItem) {
		if state[item.ID] == 2 {
			return
		}
		if state[item.ID] == 1 {
			start := 0
			for stack[start] != item.ID {
				start++
			}
			cycle := append(append([]string{}, stack[start:]...), item.ID)
			key := strings.Join(cycle, "|")
			if !reported[key] {
				reported[key] = true
				message := "Task completion cycle: " + strings.Join(cycle, " → ") + "."
				for index, id := range cycle[:len(cycle)-1] {
					member := workByID[id]
					related := cycle[index+1]
					addTaskHierarchyIssue(model, member, "TASK_COMPLETION_CYCLE", message, related, member.line)
				}
			}
			return
		}
		state[item.ID] = 1
		stack = append(stack, item.ID)
		edges := append(append([]string{}, item.DependsOn...), item.ChildIDs...)
		edges = uniqueStrings(edges)
		sort.Slice(edges, func(i, j int) bool { return naturalCompare(edges[i], edges[j]) < 0 })
		for _, id := range edges {
			if next := workByID[id]; next != nil {
				visit(next)
			}
		}
		stack = stack[:len(stack)-1]
		state[item.ID] = 2
	}
	for _, item := range sortedWorkItems(workItems) {
		visit(item)
	}
}

func buildKnowledgeModel(model *Model) KnowledgeModel {
	documentIDs := map[string]*Document{}
	modules := []KnowledgeModule{}
	useCases := []KnowledgeUseCase{}
	flows := []KnowledgeFlow{}
	businessRules := []BusinessRule{}
	workItems := []WorkItem{}

	for _, document := range model.Documents {
		requiredPrefix := map[string]string{"module": "MOD-", "use-case": "UC-", "decision": "ADR-", "flow": "FLOW-", "screen": "SC-"}[document.Type]
		stableID := document.Metadata["id"]
		if requiredPrefix != "" && stableID == "" {
			addKnowledgeIssue(model, document, "error", "missing-document-id", fmt.Sprintf("Document type %s requires an Identifier field.", document.Type), 0)
		} else if requiredPrefix != "" && !strings.HasPrefix(stableID, requiredPrefix) {
			addKnowledgeIssue(model, document, "error", "invalid-document-id", "The identifier must start with "+requiredPrefix+".", 0)
		}
		if stableID != "" {
			if previous := documentIDs[stableID]; previous != nil {
				addKnowledgeIssue(model, document, "error", "duplicate-id", fmt.Sprintf("Identifier %s is already used in %s.", stableID, previous.SourcePath), 0)
			} else {
				documentIDs[stableID] = document
			}
		}
		switch document.Type {
		case "module":
			modules = append(modules, KnowledgeModule{ID: stableID, Title: document.Title, Status: document.Status, Document: document.SourcePath, RepositoryPaths: repositoryPathsFor(document), UseCaseIDs: []string{}, ScreenIDs: []string{}, BusinessRuleIDs: []string{}})
		case "use-case":
			useCases = append(useCases, KnowledgeUseCase{
				ID: stableID, Title: document.Title, Status: document.Status, ModuleID: document.Metadata["module"],
				Document: document.SourcePath, RepositoryPaths: repositoryPathsFor(document), BusinessRuleIDs: []string{}, FlowIDs: []string{},
				ScreenIDs: splitReferences(document.Metadata["screens"]), StartScreenID: strings.TrimSpace(document.Metadata["startScreen"]),
				TerminalScreens: splitReferences(document.Metadata["terminalScreens"]),
				AllowCycle:      containsString([]string{"да", "yes", "true", "1"}, canonicalText(document.Metadata["allowCycle"])),
			})
			validateDoneUseCaseReadiness(model, document)
		case "flow":
			flows = append(flows, KnowledgeFlow{
				ID: stableID, Title: document.Title, ModuleID: document.Metadata["module"],
				UseCaseIDs: splitReferences(document.Metadata["useCase"]), Document: document.SourcePath,
			})
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
			items := parseWorkItems(document)
			if len(items) != 1 {
				addKnowledgeIssue(model, document, "error", "work-item-count", fmt.Sprintf("A work document must contain exactly one TASK-* or BUG-* work item; found %d.", len(items)), 0)
			}
			for _, item := range items {
				validated := validateWorkItem(model, document, item)
				archived, archiveYear, archivePathValid := taskArchivePathInfo(document.SourcePath)
				validated.Archived = archived
				validated.ArchiveYear = archiveYear
				if archived && !archivePathValid {
					addKnowledgeIssue(model, document, "error", "invalid-task-archive-path", "An archived task must be stored under work/archive/YYYY/*.md.", item.Heading.Line+1)
				}
				if archived && validated.statusName != "done" && validated.statusName != "cancelled" {
					addKnowledgeIssue(model, document, "error", "nonterminal-archived-task", "Only Done and Cancelled tasks may be archived.", item.Heading.Line+1)
				}
				workItems = append(workItems, validated)
			}
		}
	}

	ruleByID := map[string]*BusinessRule{}
	for i := range businessRules {
		rule := &businessRules[i]
		if previous := ruleByID[rule.ID]; previous != nil {
			addKnowledgeIssue(model, rule.ownerDoc, "error", "duplicate-id", fmt.Sprintf("Business rule %s is already declared in %s.", rule.ID, previous.Document), rule.Line)
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
			addKnowledgeIssue(model, item.ownerDoc, "error", "duplicate-id", fmt.Sprintf("Work item %s is already declared in %s.", item.ID, previous.Document), item.line)
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
			addKnowledgeIssue(model, document, "error", "dangling-module-reference", fmt.Sprintf("The use case references unknown module %s.", fallbackDash(useCase.ModuleID)), 0)
		} else if useCase.ID != "" {
			module.UseCaseIDs = append(module.UseCaseIDs, useCase.ID)
		}
		useCase.BusinessRuleIDs = uniqueStrings(businessRuleReferenceRE.FindAllString(document.Content, -1))
		for _, ruleID := range useCase.BusinessRuleIDs {
			if ruleByID[ruleID] == nil {
				addKnowledgeIssue(model, document, "error", "dangling-rule-reference", "The use case references unknown rule "+ruleID+".", 0)
			}
		}
		sort.SliceStable(useCase.BusinessRuleIDs, func(i, j int) bool { return naturalCompare(useCase.BusinessRuleIDs[i], useCase.BusinessRuleIDs[j]) < 0 })
	}
	for flowIndex := range flows {
		flow := &flows[flowIndex]
		flow.UseCaseIDs = uniqueStrings(flow.UseCaseIDs)
		sort.SliceStable(flow.UseCaseIDs, func(i, j int) bool {
			return naturalCompare(flow.UseCaseIDs[i], flow.UseCaseIDs[j]) < 0
		})
		for _, useCaseID := range flow.UseCaseIDs {
			if useCase := useCaseByID[useCaseID]; useCase != nil {
				useCase.FlowIDs = append(useCase.FlowIDs, flow.ID)
			}
		}
	}
	for useCaseIndex := range useCases {
		useCases[useCaseIndex].FlowIDs = uniqueStrings(useCases[useCaseIndex].FlowIDs)
		sort.SliceStable(useCases[useCaseIndex].FlowIDs, func(i, j int) bool {
			return naturalCompare(useCases[useCaseIndex].FlowIDs[i], useCases[useCaseIndex].FlowIDs[j]) < 0
		})
	}
	for i := range workItems {
		item := &workItems[i]
		if item.ModuleID == "" && item.statusName != "draft" {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-module-reference", fmt.Sprintf("Task %s references unknown module %s.", item.ID, fallbackDash(item.ModuleID)), item.line)
		} else if item.ModuleID != "" && moduleByID[item.ModuleID] == nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-module-reference", fmt.Sprintf("Task %s references unknown module %s.", item.ID, fallbackDash(item.ModuleID)), item.line)
		}
		if item.UseCaseID != "" && useCaseByID[item.UseCaseID] == nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-use-case-reference", fmt.Sprintf("Task %s references unknown use case %s.", item.ID, fallbackDash(item.UseCaseID)), item.line)
		}
		if item.FlowID != "" {
			target := documentIDs[item.FlowID]
			if target == nil || target.Type != "flow" {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-flow-reference", fmt.Sprintf("Task %s references unknown flow %s.", item.ID, fallbackDash(item.FlowID)), item.line)
			}
		}
		for _, dependencyID := range item.DependsOn {
			if workByID[dependencyID] == nil {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-task-reference", fmt.Sprintf("Task %s depends on unknown task %s.", item.ID, dependencyID), item.line)
			}
		}
		if item.statusName == "done" {
			for _, dependencyID := range item.DependsOn {
				if dependency := workByID[dependencyID]; dependency != nil && dependency.statusName != "done" {
					addKnowledgeIssue(model, item.ownerDoc, "error", "incomplete-task-dependency", fmt.Sprintf("Completed task %s depends on incomplete task %s.", item.ID, dependencyID), item.line)
				}
			}
		}
	}
	validateTaskHierarchy(model, workItems, workByID)
	detectTaskDependencyCycles(model, workItems, workByID)
	detectTaskCompletionCycles(model, workItems, workByID)
	validateStatusDocument(model)
	validateRoadmap(model, documentIDs)
	for i := range modules {
		modules[i].UseCaseIDs = uniqueStrings(modules[i].UseCaseIDs)
		modules[i].BusinessRuleIDs = uniqueStrings(modules[i].BusinessRuleIDs)
		sort.SliceStable(modules[i].UseCaseIDs, func(a, b int) bool { return naturalCompare(modules[i].UseCaseIDs[a], modules[i].UseCaseIDs[b]) < 0 })
		sort.SliceStable(modules[i].BusinessRuleIDs, func(a, b int) bool {
			return naturalCompare(modules[i].BusinessRuleIDs[a], modules[i].BusinessRuleIDs[b]) < 0
		})
	}
	return KnowledgeModel{
		Modules: modules, UseCases: useCases, Flows: flows, Screens: []KnowledgeScreen{}, Transitions: []ScreenTransition{},
		BusinessRules: businessRules, WorkItems: workItems, PlayableFlows: []PlayableFlow{}, Hotspots: []Hotspot{},
		Errors: []ErrorDefinition{}, Traceability: []TraceabilityRow{},
	}
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
			result = append(result, Risk{ID: id, Title: title, FullTitle: section.Title, Status: StatusFor(section.Metadata["status"]), Probability: fallbackValue(section.Metadata["probability"], "Не указана"), Impact: fallbackValue(section.Metadata["impact"], "Не указано"), TaskStats: TaskStats{Total: len(section.Tasks), Completed: completed, Remaining: len(section.Tasks) - completed, Percent: progress(completed, len(section.Tasks))}, Document: document, Anchor: section.ID, Text: section.Text})
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
	useCases := map[string]KnowledgeUseCase{}
	for _, useCase := range model.Knowledge.UseCases {
		useCases[useCase.ID] = useCase
	}
	documentsByID := map[string]*Document{}
	for _, document := range model.Documents {
		if id := document.Metadata["id"]; id != "" {
			documentsByID[id] = document
		}
	}
	for _, document := range model.Collections["roadmap"] {
		for _, section := range document.Sections {
			items := []RoadmapItem{}
			completed := 0
			for _, task := range section.Tasks {
				ids := uniqueStrings(roadmapIDRE.FindAllString(strings.ToUpper(task.Text), -1))
				id := ""
				if len(ids) == 1 {
					id = ids[0]
				}
				kind := "unknown"
				switch {
				case strings.HasPrefix(id, "UC-"):
					kind = "use-case"
				case strings.HasPrefix(id, "CON-") || strings.HasPrefix(id, "CONTRACT-"):
					kind = "contract"
				case strings.HasPrefix(id, "DLV-") || strings.HasPrefix(id, "DELIVERABLE-"):
					kind = "deliverable"
				}
				item := RoadmapItem{
					ID: id, Text: task.Text, Kind: kind, DeclaredCompleted: task.Completed,
					EffectiveCompleted: task.Completed, CompletionSource: "roadmap-checkbox",
					Document: document.SourcePath, Line: task.Line,
				}
				if useCase, exists := useCases[id]; exists {
					status := useCase.Status
					item.EffectiveCompleted = calculateUseCaseReadiness(model.DocByPath[useCase.Document]).EffectiveCompleted
					item.CompletionSource = "use-case-status"
					item.TargetDocument = useCase.Document
					item.TargetStatus = &status
				} else if target := documentsByID[id]; target != nil {
					item.TargetDocument = target.SourcePath
					status := target.Status
					item.TargetStatus = &status
				}
				if item.EffectiveCompleted {
					completed++
				}
				items = append(items, item)
			}
			result = append(result, RoadmapStage{
				Title: section.Title, Status: StatusFor(section.Metadata["status"]),
				PlannedDate: section.Metadata["plannedDate"],
				TaskStats:   TaskStats{Total: len(items), Completed: completed, Remaining: len(items) - completed, Percent: progress(completed, len(items))},
				Items:       items, Document: document, Anchor: section.ID, Text: section.Text,
			})
		}
	}
	for _, document := range model.Collections["roadmap"] {
		total, completed := 0, 0
		for _, stage := range result {
			if stage.Document != document {
				continue
			}
			total += stage.TaskStats.Total
			completed += stage.TaskStats.Completed
		}
		document.TaskStats = TaskStats{Total: total, Completed: completed, Remaining: total - completed, Percent: progress(completed, total)}
	}
	return result
}

func useCaseReadinessReason(readiness useCaseReadiness) string {
	switch {
	case !readiness.StatusDone:
		return "the use-case status is not done"
	case !readiness.Acceptance.Found || readiness.Acceptance.Total == 0:
		return "acceptance criteria are missing"
	case readiness.Acceptance.Remaining > 0:
		return "open acceptance criteria remain"
	default:
		return "the use case is ready"
	}
}

func validateRoadmapCompletion(model *Model) {
	for _, stage := range model.RoadmapStages {
		for _, item := range stage.Items {
			if item.Kind != "use-case" || item.TargetDocument == "" || item.DeclaredCompleted == item.EffectiveCompleted {
				continue
			}
			readiness := calculateUseCaseReadiness(model.DocByPath[item.TargetDocument])
			message := fmt.Sprintf("Roadmap item %s completion does not match the linked use case: %s.", item.ID, useCaseReadinessReason(readiness))
			addKnowledgeIssue(model, stage.Document, "error", "roadmap-item-completion-mismatch", message, item.Line)
		}
		if stage.Status.Kind != "done" || stage.TaskStats.Remaining == 0 {
			continue
		}
		line := 1
		for _, section := range stage.Document.Sections {
			if section.ID == stage.Anchor {
				line = section.StartLine + 1
				break
			}
		}
		addKnowledgeIssue(model, stage.Document, "error", "roadmap-section-status-mismatch", fmt.Sprintf("Done roadmap section %s contains incomplete items.", stage.Title), line)
	}
}

func buildCurrentStatus(model *Model) CurrentStatus {
	current := CurrentStatus{ActiveWork: []CurrentWorkItem{}, Blockers: []CurrentBlocker{}}
	for _, item := range model.Knowledge.WorkItems {
		if item.Status.Kind != "planned" && item.Status.Kind != "in-progress" && item.Status.Kind != "blocked" {
			continue
		}
		current.ActiveWork = append(current.ActiveWork, CurrentWorkItem{
			ID: item.ID, Title: item.Title, Status: item.Status, ModuleID: item.ModuleID,
			Document: item.Document, Anchor: item.Anchor,
		})
		if item.Status.Kind == "blocked" {
			current.Blockers = append(current.Blockers, CurrentBlocker{
				TaskID: item.ID, Text: item.Blocker, Document: item.Document, Anchor: item.Anchor,
			})
		}
	}
	for stageIndex := range model.RoadmapStages {
		for itemIndex := range model.RoadmapStages[stageIndex].Items {
			item := &model.RoadmapStages[stageIndex].Items[itemIndex]
			if !item.EffectiveCompleted {
				copy := *item
				current.NextResult = &copy
				return current
			}
		}
	}
	return current
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
	for _, stage := range model.RoadmapStages {
		total += stage.TaskStats.Total
		completed += stage.TaskStats.Completed
	}
	stats := Stats{Documents: len(model.Documents), TotalTasks: total, CompletedTasks: completed, RemainingTasks: total - completed, TaskProgress: progress(completed, total), ModuleStatuses: countStatuses(model.Collections["module"]), UseCaseStatuses: countStatuses(model.Collections["use-case"]), Modules: len(model.Collections["module"]), UseCases: len(model.Collections["use-case"]), Screens: len(model.Knowledge.Screens), Risks: len(model.Risks), Decisions: len(model.Collections["decision"])}
	stats.RunbooksTotal = len(model.Knowledge.Runbooks)
	for _, runbook := range model.Knowledge.Runbooks {
		switch runbook.Freshness {
		case "recent":
			stats.RunbooksRecent++
		case "overdue":
			stats.RunbooksOverdue++
		case "review-required":
			stats.RunbooksReviewRequired++
		}
	}
	for _, screen := range model.Knowledge.Screens {
		switch screen.Status.Kind {
		case "done":
			stats.ScreensDone++
		case "in-progress":
			stats.ScreensInProgress++
		case "planned":
			stats.ScreensPlanned++
		}
		if !screen.Reachable {
			stats.ScreensUnreachable++
		}
	}
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
	for _, item := range model.Knowledge.WorkItems {
		if item.Type != "Bug" || item.Archived {
			continue
		}
		if item.statusName != "done" && item.statusName != "cancelled" {
			stats.OpenBugs++
		}
		switch canonicalText(item.Severity) {
		case "критическая", "critical":
			stats.CriticalBugs++
		case "высокая", "high":
			stats.HighSeverityBugs++
		}
		if regression, ok := normalizedEnum(item.Regression, map[string]string{"да": "yes", "yes": "yes", "true": "yes"}); ok && regression == "yes" {
			stats.RegressionBugs++
		}
		if containsString([]string{"не воспроизводится", "неизвестно", "not reproduced", "unknown"}, canonicalText(item.Reproducibility)) {
			stats.UnreproducedBugs++
		}
		if item.statusName == "blocked" {
			stats.BlockedBugs++
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
	return ProjectInfo{Title: title, Description: description, Status: StatusFor(merged["status"]), Stage: merged["stage"], Version: merged["version"], Updated: updated, Summary: summary, OverviewDocument: overview, StatusDocument: statusDoc}
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
		metadata := metadataSearchTerms(document, false)
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
		archived, archiveYear, _ := taskArchivePathInfo(document.SourcePath)
		result = append(result, SearchItem{
			Title: document.Title, Path: document.SourcePath, URL: document.OutputPath,
			Type: document.Type, TypeLabel: document.TypeLabel, Status: document.Metadata["status"],
			Archived: archived, ArchiveYear: archiveYear,
			Description: truncate(description, 220), Text: text,
		})
	}
	return result
}
