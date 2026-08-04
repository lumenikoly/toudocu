package docgent

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
}

type parsedWorkItem struct {
	Heading     Heading
	EndLine     int
	Metadata    Metadata
	Subsections map[string]workSubsection
}

func parseWorkItems(document *Document) []parsedWorkItem {
	result := []parsedWorkItem{}
	for headingIndex, heading := range document.Headings {
		if workItemHeadingRE.FindStringSubmatch(heading.Title) == nil {
			continue
		}
		end := len(document.Lines)
		for _, candidate := range document.Headings[headingIndex+1:] {
			if candidate.Level <= heading.Level {
				end = candidate.Line
				break
			}
		}
		metadata := extractMetadata(document.Lines, heading.Line+1, end, false)
		subsections := map[string]workSubsection{}
		for childIndex, child := range document.Headings {
			if child.Line <= heading.Line || child.Line >= end || child.Level != heading.Level+1 {
				continue
			}
			childEnd := end
			for _, candidate := range document.Headings[childIndex+1:] {
				if candidate.Line >= end {
					break
				}
				if candidate.Level <= child.Level {
					childEnd = candidate.Line
					break
				}
			}
			lines := document.Lines[child.Line+1 : childEnd]
			subsections[canonicalText(child.Title)] = workSubsection{
				Heading:  child,
				EndLine:  childEnd,
				Markdown: strings.TrimSpace(strings.Join(lines, "\n")),
				Text:     stripMarkdown(strings.Join(lines, "\n")),
				Tasks:    extractTasks(lines, nil, child.Line+1),
			}
		}
		result = append(result, parsedWorkItem{Heading: heading, EndLine: end, Metadata: metadata.Values, Subsections: subsections})
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
		addKnowledgeIssue(model, document, "error", "missing-work-section", fmt.Sprintf("Задача %s не содержит раздел «%s».", item.Heading.Title, label), item.Heading.Line+1)
		return
	}
	if strings.TrimSpace(section.Text) == "" {
		addKnowledgeIssue(model, document, "error", "empty-work-section", fmt.Sprintf("Раздел «%s» задачи %s не может быть пустым.", label, item.Heading.Title), section.Heading.Line+1)
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
		addKnowledgeIssue(model, document, "error", "missing-acceptance-criterion", "Задача должна содержать хотя бы один критерий приёмки.", criteriaSection.Heading.Line+1)
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
			addKnowledgeIssue(model, document, "error", "invalid-acceptance-criterion-id", "Каждый критерий приёмки должен начинаться с уникального идентификатора AC-*.", task.Line)
			continue
		}
		id := ids[0]
		if _, exists := byID[id]; exists {
			addKnowledgeIssue(model, document, "error", "duplicate-acceptance-criterion-id", "Идентификатор критерия "+id+" повторяется внутри задачи.", task.Line)
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
		for lineIndex := verificationSection.Heading.Line + 1; lineIndex < verificationSection.EndLine; lineIndex++ {
			line := document.Lines[lineIndex]
			targets := targetsForVerificationLine(line)
			if len(targets) == 0 {
				continue
			}
			if len(targets) > 1 {
				addKnowledgeIssue(model, document, "error", "ambiguous-verification-target", "Одна запись проверки должна ссылаться ровно на один target AC-*, ALL, DOCS или QUALITY.", lineIndex+1)
				continue
			}
			target := targets[0]
			if strings.HasPrefix(target, "AC-") {
				if _, exists := byID[target]; !exists {
					addKnowledgeIssue(model, document, "error", "unknown-criterion-verification", "Проверка ссылается на неизвестный критерий "+target+".", lineIndex+1)
					continue
				}
			}
			if strings.HasPrefix(target, "AC-") {
				if transitionIDs, reference, trace := traceabilityForVerificationLine(line, target); trace {
					transitionsByID[target] = append(transitionsByID[target], transitionIDs...)
					if reference == "" {
						addKnowledgeIssue(model, document, "error", "empty-traceability-verification", "Для связи "+target+" с переходом не указана проверка.", lineIndex+1)
					} else {
						referencesByID[target] = append(referencesByID[target], reference)
					}
					continue
				}
			}
			commands := commandsForVerificationLine(line, target)
			if len(commands) == 0 {
				addKnowledgeIssue(model, document, "error", "empty-criterion-verification", "Для target "+target+" не указана команда проверки.", lineIndex+1)
				continue
			}
			if seenTargets[target] {
				code := "duplicate-verification-target"
				if strings.HasPrefix(target, "AC-") {
					code = "duplicate-criterion-verification"
				}
				addKnowledgeIssue(model, document, "error", code, "Для target "+target+" указано несколько записей проверки.", lineIndex+1)
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
			addKnowledgeIssue(model, document, "error", "missing-criterion-verification", "Для критерия "+criterion.id+" отсутствует команда в разделе «Проверка».", criterion.task.Line)
		}
		text := strings.TrimSpace(criterionIDRE.ReplaceAllString(criterion.task.Text, ""))
		matrix = append(matrix, CriterionVerification{
			CriterionID: criterion.id, Criterion: text, Completed: criterion.task.Completed, Commands: commands,
			Transitions: uniqueStrings(transitionsByID[criterion.id]), References: uniqueStrings(referencesByID[criterion.id]),
		})
	}
	return tasks, matrix, checks
}

func validateScopePaths(model *Model, document *Document, item parsedWorkItem) []string {
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
			addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Путь scope должен быть относительным корню репозитория: "+value+".", scope.Heading.Line+1)
			continue
		}
		absolute := filepath.Clean(filepath.Join(model.RepositoryRoot, filepath.FromSlash(value)))
		if !ensureInside(model.RepositoryRoot, absolute) {
			addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Путь scope выходит за пределы repository-root: "+value+".", scope.Heading.Line+1)
			continue
		}
		resolvedRoot, rootErr := resolvePathForSafety(model.RepositoryRoot)
		resolvedPath, pathErr := resolvePathForSafety(absolute)
		if rootErr != nil || pathErr != nil || !ensureInside(resolvedRoot, resolvedPath) {
			addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Путь scope выходит за пределы repository-root через символическую ссылку: "+value+".", scope.Heading.Line+1)
			continue
		}
		if strings.ContainsAny(value, "*?[") {
			matches, _ := filepath.Glob(absolute)
			if len(matches) == 0 {
				addKnowledgeIssue(model, document, "error", "missing-scope-path", "Путь scope не существует: "+value+".", scope.Heading.Line+1)
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
				addKnowledgeIssue(model, document, "error", "unsafe-scope-path", "Совпадение scope выходит за пределы repository-root: "+value+".", scope.Heading.Line+1)
				continue
			}
		} else if _, err := os.Stat(absolute); err != nil {
			if os.IsNotExist(err) && strings.HasSuffix(value, "/") {
				addKnowledgeIssue(model, document, "error", "missing-scope-path", "Новый отсутствующий scope-путь должен быть файлом, а не каталогом: "+value+".", scope.Heading.Line+1)
				continue
			}
			parent := filepath.Dir(absolute)
			info, parentErr := os.Stat(parent)
			if !os.IsNotExist(err) || parentErr != nil || !info.IsDir() {
				addKnowledgeIssue(model, document, "error", "missing-scope-path", "Родительский каталог нового файла scope не существует: "+value+".", scope.Heading.Line+1)
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
	parsed := AnalyzeMarkdown("# Section\n\n" + section.Markdown)
	targets := map[string]bool{}
	for _, name := range names {
		targets[canonicalText(name)] = true
	}
	for _, candidate := range parsed.Sections {
		if targets[canonicalText(candidate.Title)] {
			return strings.TrimSpace(candidate.Text)
		}
	}
	// AnalyzeMarkdown only exposes H2 sections; demote the original H3 headings.
	content := regexp.MustCompile(`(?m)^###\s+`).ReplaceAllString(section.Markdown, "## ")
	parsed = AnalyzeMarkdown("# Section\n\n" + content)
	for _, candidate := range parsed.Sections {
		if targets[canonicalText(candidate.Title)] {
			return strings.TrimSpace(candidate.Text)
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
		{"severity", "Серьёзность"},
		{"priority", "Приоритет"},
		{"reproducibility", "Воспроизводимость"},
		{"regression", "Регрессия"},
		{"module", "Модуль"},
		{"useCase", "Сценарий"},
		{"owner", "Владелец"},
		{"updated", "Последнее обновление"},
	}
	for _, field := range fields {
		if strings.TrimSpace(item.Metadata[field.key]) == "" {
			addKnowledgeIssue(model, document, "error", "missing-bug-field", "Для бага требуется поле «"+field.label+"».", item.Heading.Line+1)
		}
	}

	if _, ok := normalizedEnum(item.Metadata["severity"], map[string]string{
		"критическая": "critical", "critical": "critical",
		"высокая": "high", "high": "high",
		"средняя": "medium", "medium": "medium",
		"низкая": "low", "low": "low",
	}); item.Metadata["severity"] != "" && !ok {
		addKnowledgeIssue(model, document, "error", "invalid-bug-severity", "Серьёзность бага должна быть Критическая, Высокая, Средняя или Низкая.", item.Heading.Line+1)
	}
	if _, ok := normalizedEnum(item.Metadata["priority"], map[string]string{
		"срочный": "urgent", "urgent": "urgent",
		"высокий": "high", "high": "high",
		"обычный": "normal", "normal": "normal",
		"низкий": "low", "low": "low",
	}); item.Metadata["priority"] != "" && !ok {
		addKnowledgeIssue(model, document, "error", "invalid-bug-priority", "Приоритет бага должен быть Срочный, Высокий, Обычный или Низкий.", item.Heading.Line+1)
	}
	if _, ok := normalizedEnum(item.Metadata["reproducibility"], map[string]string{
		"всегда": "always", "always": "always",
		"часто": "often", "often": "often",
		"иногда": "sometimes", "sometimes": "sometimes",
		"редко": "rarely", "rarely": "rarely",
		"не воспроизводится": "not-reproduced", "not reproduced": "not-reproduced",
		"неизвестно": "unknown", "unknown": "unknown",
	}); item.Metadata["reproducibility"] != "" && !ok {
		addKnowledgeIssue(model, document, "error", "invalid-bug-reproducibility", "Указано недопустимое значение воспроизводимости бага.", item.Heading.Line+1)
	}
	regression, regressionValid := normalizedEnum(item.Metadata["regression"], map[string]string{
		"да": "yes", "yes": "yes", "true": "yes",
		"нет": "no", "no": "no", "false": "no",
	})
	if item.Metadata["regression"] != "" && !regressionValid {
		addKnowledgeIssue(model, document, "error", "invalid-bug-regression", "Поле «Регрессия» должно иметь значение Да или Нет.", item.Heading.Line+1)
	}
	if item.Metadata["updated"] != "" {
		if _, ok := parseDate(item.Metadata["updated"]); !ok {
			addKnowledgeIssue(model, document, "error", "invalid-bug-updated-date", "Поле «Последнее обновление» должно содержать дату YYYY-MM-DD.", item.Heading.Line+1)
		}
	}
	if regression == "yes" {
		body := strings.ToLower(strings.Join(document.Lines[item.Heading.Line+1:item.EndLine], "\n"))
		versionOrPeriod := regexp.MustCompile(`(?m)^\s*[-*+]\s*(?:версия|version|период|period)\s*[:：]\s*\S+`).MatchString(body)
		if !versionOrPeriod {
			addKnowledgeIssue(model, document, "error", "missing-regression-version", "Для регрессии требуется версия или период, где наблюдался дефект.", item.Heading.Line+1)
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
		addKnowledgeIssue(model, document, "error", "invalid-task-status", "Недопустимый статус задачи: "+fallbackDash(item.Metadata["status"])+".", item.Heading.Line+1)
	}
	typeName, typeValid := taskType(item.Metadata["type"])
	if !typeValid {
		addKnowledgeIssue(model, document, "error", "invalid-task-type", "Тип задачи должен быть Feature, Bug, Maintenance, Documentation или Research.", item.Heading.Line+1)
	}
	isBug := typeValid && typeName == "Bug"
	if isBug && !strings.HasPrefix(match[1], "BUG-") {
		addKnowledgeIssue(model, document, "error", "invalid-bug-id", "Идентификатор рабочего элемента типа Bug должен начинаться с BUG-.", item.Heading.Line+1)
	}
	if !isBug && strings.HasPrefix(match[1], "BUG-") {
		addKnowledgeIssue(model, document, "error", "bug-id-type-mismatch", "Идентификатор BUG-* требует поле «Тип: Bug».", item.Heading.Line+1)
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
			requiredWorkSection{[]string{"симптом", "symptom"}, "Симптом"},
			requiredWorkSection{[]string{"ожидаемое поведение", "expected behavior"}, "Ожидаемое поведение"},
			requiredWorkSection{[]string{"фактическое поведение", "actual behavior"}, "Фактическое поведение"},
		)
	} else {
		requiredSections = append(requiredSections, requiredWorkSection{[]string{"результат", "result"}, "Результат"})
	}
	strictWorkflow := statusValid && statusName != "draft"
	if strictWorkflow {
		requiredSections = append(requiredSections,
			requiredWorkSection{[]string{"область изменения", "scope"}, "Область изменения"},
			requiredWorkSection{[]string{"не входит в задачу", "не входит в исправление", "out of scope"}, "Не входит в исправление"},
			requiredWorkSection{[]string{"критерии приёмки", "критерии приемки", "acceptance criteria"}, "Критерии приёмки"},
			requiredWorkSection{[]string{"план", "plan"}, "План"},
			requiredWorkSection{[]string{"проверка", "verification"}, "Проверка"},
			requiredWorkSection{[]string{"влияние на документацию", "documentation impact"}, "Влияние на документацию"},
		)
		if isBug {
			requiredSections = append(requiredSections,
				requiredWorkSection{[]string{"причина", "cause", "root cause"}, "Причина"},
			)
		} else if typeValid && typeName == "Feature" {
			requiredSections = append(requiredSections,
				requiredWorkSection{[]string{"изменение поведения", "behavior change"}, "Изменение поведения"},
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
				addKnowledgeIssue(model, document, "error", "incomplete-behavior-change", "Раздел изменения поведения должен содержать непустые «Было» и «Станет».", behavior.Heading.Line+1)
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
				addKnowledgeIssue(model, document, "error", "bug-plan-checkbox", "План бага должен быть нумерованным списком без чекбоксов.", step.Line)
			}
			checklistLines[step.Line] = struct{}{}
		}
	}
	for _, task := range extractTasks(document.Lines[item.Heading.Line+1:item.EndLine], nil, item.Heading.Line+1) {
		if _, allowed := checklistLines[task.Line]; !allowed {
			message := "Чекбоксы задачи разрешены только в разделах «Критерии приёмки» и «План»."
			if isBug {
				message = "В документе бага чекбоксы разрешены только в разделе «Критерии приёмки»."
			}
			addKnowledgeIssue(model, document, "error", "task-checkbox-outside-criteria", message, task.Line)
		}
	}

	if isBug {
		steps, stepsFound := workSection(item, "шаги воспроизведения", "steps to reproduce", "reproduction steps")
		evidence, evidenceFound := workSection(item, "доказательства", "evidence", "подтверждение", "confirmation")
		if (!stepsFound || strings.TrimSpace(steps.Text) == "") && (!evidenceFound || strings.TrimSpace(evidence.Text) == "") {
			addKnowledgeIssue(model, document, "error", "missing-bug-reproduction-evidence", "Баг должен содержать шаги воспроизведения либо непустые доказательства.", item.Heading.Line+1)
		}
		if strictWorkflow && !bugHasRegressionCoverage(item, criteria) {
			addKnowledgeIssue(model, document, "error", "missing-bug-regression-test", "Для бага требуется критерий регрессионного теста либо раздел «Регрессионный тест» с объяснением невозможности автоматизации.", item.Heading.Line+1)
		}
		if statusName == "done" {
			cause, found := workSection(item, "причина", "cause", "root cause")
			unknown := canonicalText(cause.Text)
			if !found || unknown == "" || unknown == "не установлена" || unknown == "unknown" || unknown == "not established" {
				addKnowledgeIssue(model, document, "error", "missing-completed-bug-cause", "Для выполненного бага должна быть установлена первопричина.", item.Heading.Line+1)
			}
		}
	}

	if statusName == "blocked" {
		blocker, found := workSection(item, "блокер", "blocker")
		workSectionContentRequired(model, document, item, blocker, found, "Блокер")
	}
	if statusName == "cancelled" {
		reason, found := workSection(item, "причина отмены", "cancellation reason")
		workSectionContentRequired(model, document, item, reason, found, "Причина отмены")
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
				addKnowledgeIssue(model, document, "error", code, "Задача должна содержать проверку "+target+".", item.Heading.Line+1)
			}
		}
	}
	if statusName == "done" {
		if criteriaSection, found := workSection(item, "критерии приёмки", "критерии приемки", "acceptance criteria"); found {
			for _, criterion := range criteriaSection.Tasks {
				if !criterion.Completed {
					addKnowledgeIssue(model, document, "error", "incomplete-completed-task", "У выполненной задачи все критерии приёмки должны быть отмечены [x].", criterion.Line)
				}
			}
		}
	}

	useCaseID := strings.TrimSpace(item.Metadata["useCase"])
	useCaseOmitted := isBug && bugUseCaseNotApplicable(useCaseID)
	if useCaseOmitted {
		useCaseID = ""
		relation, found := workSection(item, "связь с пользовательским поведением", "relationship to user behavior")
		if !found || strings.TrimSpace(relation.Text) == "" {
			addKnowledgeIssue(model, document, "error", "missing-bug-use-case-explanation", "Для значения «Сценарий: Не применяется» требуется раздел «Связь с пользовательским поведением».", item.Heading.Line+1)
		}
	}
	if strictWorkflow && typeValid && (typeName == "Feature" || typeName == "Bug") && useCaseID == "" {
		if !useCaseOmitted {
			addKnowledgeIssue(model, document, "error", "missing-task-use-case", "Для задачи типа "+typeName+" требуется связанный пользовательский сценарий.", item.Heading.Line+1)
		}
	}
	if strictWorkflow && typeValid && typeName != "Feature" && typeName != "Bug" && useCaseID == "" {
		reason, found := workSection(item, "обоснование отсутствия сценария", "use case omission reason")
		if !found || strings.TrimSpace(reason.Text) == "" {
			addKnowledgeIssue(model, document, "error", "missing-use-case-omission-reason", "Техническая задача без сценария должна содержать раздел «Обоснование отсутствия сценария».", item.Heading.Line+1)
		}
	}

	resultSection, _ := workSection(item, "результат", "result")
	behaviorSection, _ := workSection(item, "изменение поведения", "behavior change")
	outOfScopeSection, _ := workSection(item, "не входит в задачу", "не входит в исправление", "out of scope")
	planSection, _ := workSection(item, "план", "plan")
	documentationImpactSection, _ := workSection(item, "влияние на документацию", "documentation impact")
	blockerSection, _ := workSection(item, "блокер", "blocker")
	repositoryPaths := append([]string{}, validateScopePaths(model, document, item)...)
	return WorkItem{
		ID: match[1], Title: match[2], Status: StatusFor(item.Metadata["status"]), Type: typeName,
		Priority: item.Metadata["priority"], Severity: item.Metadata["severity"],
		Reproducibility: item.Metadata["reproducibility"], Regression: item.Metadata["regression"],
		Updated: item.Metadata["updated"], Owner: item.Metadata["owner"], ModuleID: item.Metadata["module"],
		UseCaseID: useCaseID, FlowID: strings.TrimSpace(item.Metadata["flow"]),
		ScreenIDs:     splitReferences(item.Metadata["screens"]),
		TransitionIDs: splitReferences(item.Metadata["transitions"]),
		StandardIDs:   splitReferences(item.Metadata["standards"]),
		RunbookIDs:    splitReferences(item.Metadata["runbooks"]),
		DependsOn:     splitReferences(item.Metadata["dependsOn"]), Document: document.SourcePath,
		Anchor: item.Heading.ID, Criteria: criteria, Verification: verification, Checks: checks,
		RepositoryPaths: repositoryPaths, line: item.Heading.Line + 1,
		Result:              strings.TrimSpace(resultSection.Text),
		BehaviorChange:      strings.TrimSpace(behaviorSection.Text),
		Before:              nestedWorkSection(behaviorSection, "было", "before"),
		After:               nestedWorkSection(behaviorSection, "станет", "after"),
		OutOfScope:          strings.TrimSpace(outOfScopeSection.Text),
		Plan:                strings.TrimSpace(planSection.Text),
		DocumentationImpact: strings.TrimSpace(documentationImpactSection.Text),
		DocumentationPaths:  documentationPathsFor(model, document, item),
		Blocker:             strings.TrimSpace(blockerSection.Text),
		ownerDoc:            document, statusName: statusName,
	}
}

func validateStatusDocument(model *Model) {
	document := model.DocByPath["status.md"]
	if document == nil {
		return
	}
	for _, task := range document.Tasks {
		addKnowledgeIssue(model, document, "error", "status-requirement-checklist", "status.md не должен содержать собственный чек-лист требований; используйте ссылки на roadmap или work item.", task.Line)
	}
}

func validateRoadmap(model *Model, documentIDs map[string]*Document) {
	document := model.DocByPath["roadmap.md"]
	if document == nil {
		return
	}
	seenDeliverables := map[string]int{}
	for _, task := range document.Tasks {
		ids := uniqueStrings(roadmapIDRE.FindAllString(strings.ToUpper(task.Text), -1))
		if len(ids) != 1 {
			addKnowledgeIssue(model, document, "error", "invalid-roadmap-item-id", "Каждый элемент roadmap должен содержать ровно один стабильный ID сценария, контракта или deliverable.", task.Line)
			continue
		}
		id := ids[0]
		if strings.HasPrefix(id, "DLV-") || strings.HasPrefix(id, "DELIVERABLE-") {
			if previousLine := seenDeliverables[id]; previousLine > 0 {
				addKnowledgeIssue(model, document, "error", "duplicate-roadmap-id", fmt.Sprintf("Deliverable %s уже объявлен в строке %d.", id, previousLine), task.Line)
			} else {
				seenDeliverables[id] = task.Line
			}
			continue
		}
		target := documentIDs[id]
		if target == nil || (target.Type != "use-case" && target.Type != "contract") {
			addKnowledgeIssue(model, document, "error", "dangling-roadmap-reference", "Roadmap ссылается на неизвестный сценарий или контракт "+id+".", task.Line)
			continue
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
	flows := []KnowledgeFlow{}
	businessRules := []BusinessRule{}
	workItems := []WorkItem{}

	for _, document := range model.Documents {
		requiredPrefix := map[string]string{"module": "MOD-", "use-case": "UC-", "decision": "ADR-", "flow": "FLOW-", "screen": "SC-"}[document.Type]
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
				addKnowledgeIssue(model, document, "error", "work-item-count", fmt.Sprintf("Документ work должен содержать ровно один рабочий элемент TASK-* или BUG-*; найдено: %d.", len(items)), 0)
			}
			for _, item := range items {
				validated := validateWorkItem(model, document, item)
				archived, archiveYear, archivePathValid := taskArchivePathInfo(document.SourcePath)
				validated.Archived = archived
				validated.ArchiveYear = archiveYear
				if archived && !archivePathValid {
					addKnowledgeIssue(model, document, "error", "invalid-task-archive-path", "Архивная задача должна находиться в work/archive/YYYY/*.md.", item.Heading.Line+1)
				}
				if archived && validated.statusName != "done" && validated.statusName != "cancelled" {
					addKnowledgeIssue(model, document, "error", "nonterminal-archived-task", "В архиве разрешены только задачи Done и Cancelled.", item.Heading.Line+1)
				}
				workItems = append(workItems, validated)
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
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-module-reference", fmt.Sprintf("Задача %s ссылается на неизвестный модуль %s.", item.ID, fallbackDash(item.ModuleID)), item.line)
		} else if item.ModuleID != "" && moduleByID[item.ModuleID] == nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-module-reference", fmt.Sprintf("Задача %s ссылается на неизвестный модуль %s.", item.ID, fallbackDash(item.ModuleID)), item.line)
		}
		if item.UseCaseID != "" && useCaseByID[item.UseCaseID] == nil {
			addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-use-case-reference", fmt.Sprintf("Задача %s ссылается на неизвестный сценарий %s.", item.ID, fallbackDash(item.UseCaseID)), item.line)
		}
		if item.FlowID != "" {
			target := documentIDs[item.FlowID]
			if target == nil || target.Type != "flow" {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-flow-reference", fmt.Sprintf("Задача %s ссылается на неизвестный процесс %s.", item.ID, fallbackDash(item.FlowID)), item.line)
			}
		}
		for _, dependencyID := range item.DependsOn {
			if workByID[dependencyID] == nil {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-task-reference", fmt.Sprintf("Задача %s зависит от неизвестной задачи %s.", item.ID, dependencyID), item.line)
			}
		}
		if item.statusName == "done" {
			for _, dependencyID := range item.DependsOn {
				if dependency := workByID[dependencyID]; dependency != nil && dependency.statusName != "done" {
					addKnowledgeIssue(model, item.ownerDoc, "error", "incomplete-task-dependency", fmt.Sprintf("Выполненная задача %s зависит от незавершённой задачи %s.", item.ID, dependencyID), item.line)
				}
			}
		}
	}
	detectTaskDependencyCycles(model, workItems, workByID)
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
					item.EffectiveCompleted = status.Kind == "done"
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
				PlannedDate: section.Metadata["plannedDate"], Owner: section.Metadata["owner"],
				TaskStats: TaskStats{Total: len(items), Completed: completed, Remaining: len(items) - completed, Percent: progress(completed, len(items))},
				Items:     items, Document: document, Anchor: section.ID, Text: section.Text,
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
		archived, archiveYear, _ := taskArchivePathInfo(document.SourcePath)
		result = append(result, SearchItem{
			Title: document.Title, Path: document.SourcePath, URL: document.OutputPath,
			Type: document.Type, TypeLabel: document.TypeLabel, Status: document.Metadata["status"],
			Archived: archived, ArchiveYear: archiveYear, Owner: document.Metadata["owner"],
			Description: truncate(description, 220), Text: text,
		})
	}
	return result
}
