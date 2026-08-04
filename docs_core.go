package docgent

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

var defaultExcludes = []string{".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "coverage"}

var typeLabels = map[string]string{
	"overview": "Обзор проекта", "status": "Текущее состояние", "roadmap": "Дорожная карта",
	"risks": "Риски", "changelog": "История изменений", "use-case": "Пользовательский сценарий",
	"module": "Модуль", "architecture": "Архитектура", "contract": "Контрактный каталог",
	"decision": "Архитектурное решение", "flow": "Процесс", "guide": "Руководство", "work": "Рабочие задачи",
	"reference": "Справочник", "screen-map": "Устаревшая карта экранов", "screen-index": "Раздел экранов", "screen": "Экран",
	"notes": "Заметки", "ideas": "Идеи развития", "document": "Документ",
}

var folderLabels = map[string]string{
	"use-cases": "Пользовательские сценарии", "modules": "Модули", "architecture": "Архитектура",
	"contracts": "Контракты", "decisions": "Решения", "flows": "Процессы", "guides": "Руководства",
	"work": "Рабочие задачи", "reference": "Справочник",
	"processes": "Процессы", "screens": "Экраны",
}

var rootOrder = map[string]int{
	"index.md": 0, "status.md": 1, "roadmap.md": 2, "risks.md": 3,
	"ideas.md": 4, "notes.md": 5, "changelog.md": 6, "glossary.md": 7,
}

type statusGroup struct {
	Kind   string
	Symbol string
	Values []string
}

var statusGroups = []statusGroup{
	{Kind: "not-started", Symbol: "○", Values: []string{"не начато", "не начат", "not started", "new", "черновик", "draft"}},
	{Kind: "planned", Symbol: "◷", Values: []string{"запланировано", "запланирован", "planned", "proposed", "предложено", "предложен", "готово к работе", "ready"}},
	{Kind: "in-progress", Symbol: "◐", Values: []string{"в работе", "работа", "in progress", "work in progress", "active", "активен", "снижается"}},
	{Kind: "blocked", Symbol: "!", Values: []string{"заблокировано", "заблокирован", "blocked"}},
	{Kind: "paused", Symbol: "Ⅱ", Values: []string{"приостановлено", "приостановлен", "paused", "on hold"}},
	{Kind: "done", Symbol: "✓", Values: []string{"готово", "готов", "выполнено", "выполнен", "завершено", "завершен", "реализовано", "реализован", "done", "complete", "completed", "implemented", "закрыт", "закрыто", "closed"}},
	{Kind: "open", Symbol: "◇", Values: []string{"открыт", "открыто", "open"}},
	{Kind: "accepted", Symbol: "✓", Values: []string{"принято", "принят", "accepted"}},
	{Kind: "rejected", Symbol: "×", Values: []string{"отклонено", "отклонен", "rejected"}},
	{Kind: "cancelled", Symbol: "×", Values: []string{"отменено", "отменен", "cancelled", "canceled"}},
	{Kind: "superseded", Symbol: "↪", Values: []string{"заменено", "заменен", "superseded"}},
	{Kind: "obsolete", Symbol: "⌁", Values: []string{"устарело", "устарел", "deprecated", "obsolete"}},
	{Kind: "risk-accepted", Symbol: "≈", Values: []string{"риск принят", "risk accepted"}},
}

func ClassifyDocument(relativePath string) string {
	normalized := strings.ToLower(normalizeSlashes(relativePath))
	base := path.Base(normalized)
	first := strings.Split(normalized, "/")[0]
	switch normalized {
	case "index.md":
		return "overview"
	case "status.md":
		return "status"
	case "roadmap.md":
		return "roadmap"
	case "risks.md":
		return "risks"
	case "changelog.md":
		return "changelog"
	case "notes.md":
		return "notes"
	case "ideas.md":
		return "ideas"
	}
	switch first {
	case "use-cases":
		return "use-case"
	case "modules":
		return "module"
	case "architecture":
		return "architecture"
	case "contracts":
		return "contract"
	case "decisions":
		return "decision"
	case "flows":
		return "flow"
	case "guides":
		return "guide"
	case "work":
		return "work"
	case "reference":
		return "reference"
	case "screens":
		if base == "map.md" {
			return "screen-map"
		}
		if base == "index.md" {
			return "screen-index"
		}
		return "screen"
	}
	if base == "index.md" {
		return "document"
	}
	return "document"
}

func outputPathForDocument(relativePath string) string {
	normalized := normalizeSlashes(relativePath)
	if len(normalized) >= 3 && strings.EqualFold(normalized[len(normalized)-3:], ".md") {
		return normalized[:len(normalized)-3] + ".html"
	}
	return normalized + ".html"
}

// StatusFor converts a human status into a visual and machine-readable group.
func StatusFor(status string) StatusInfo {
	label := strings.TrimSpace(status)
	if label == "" {
		label = "Не указан"
	}
	canonical := canonicalText(label)
	for _, group := range statusGroups {
		for _, value := range group.Values {
			if canonical == canonicalText(value) {
				return StatusInfo{Kind: group.Kind, Symbol: group.Symbol, Label: label, Recognized: true}
			}
		}
	}
	return StatusInfo{Kind: "neutral", Symbol: "•", Label: label, Recognized: status == ""}
}

func shouldExclude(relativePath, baseName string, excludes map[string]struct{}) bool {
	if strings.HasPrefix(baseName, ".") {
		return true
	}
	normalized := normalizeSlashes(relativePath)
	_, byName := excludes[baseName]
	_, byPath := excludes[normalized]
	return byName || byPath
}

type scannedFile struct {
	AbsolutePath string
	RelativePath string
}

func scanMarkdownFiles(root string, customExcludes []string, issues *[]Issue) []scannedFile {
	excludes := map[string]struct{}{}
	for _, value := range append(append([]string{}, defaultExcludes...), customExcludes...) {
		value = strings.TrimSpace(value)
		if value != "" {
			excludes[normalizeSlashes(value)] = struct{}{}
		}
	}
	files := []scannedFile{}
	var walk func(string)
	walk = func(directory string) {
		entries, err := os.ReadDir(directory)
		if err != nil {
			*issues = append(*issues, Issue{Severity: "error", Code: "directory-read-failed", Message: "Не удалось прочитать каталог: " + err.Error(), DocumentPath: toPosixRelative(root, directory)})
			return
		}
		sort.SliceStable(entries, func(i, j int) bool { return naturalCompare(entries[i].Name(), entries[j].Name()) < 0 })
		for _, entry := range entries {
			absolute := filepath.Join(directory, entry.Name())
			relative := toPosixRelative(root, absolute)
			info, err := os.Lstat(absolute)
			if err != nil {
				*issues = append(*issues, Issue{Severity: "warning", Code: "file-stat-failed", Message: "Не удалось проверить файл: " + err.Error(), DocumentPath: relative})
				continue
			}
			if info.Mode()&os.ModeSymlink != 0 {
				if strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
					*issues = append(*issues, Issue{Severity: "warning", Code: "ignored-symlink", Message: "Символическая ссылка Markdown проигнорирована.", DocumentPath: relative})
				}
				continue
			}
			if info.IsDir() {
				if !shouldExclude(relative, entry.Name(), excludes) {
					walk(absolute)
				}
			} else if info.Mode().IsRegular() && strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
				files = append(files, scannedFile{AbsolutePath: absolute, RelativePath: relative})
			}
		}
	}
	walk(root)
	return files
}

func newIssue(severity, code, message, documentPath string, line int) Issue {
	return Issue{Severity: severity, Code: code, Message: message, DocumentPath: documentPath, Line: line}
}

func documentLess(a, b *Document) bool {
	aRoot := !strings.Contains(a.SourcePath, "/")
	bRoot := !strings.Contains(b.SourcePath, "/")
	if aRoot && bRoot {
		aOrder, aKnown := rootOrder[strings.ToLower(a.SourcePath)]
		bOrder, bKnown := rootOrder[strings.ToLower(b.SourcePath)]
		if !aKnown {
			aOrder = 100
		}
		if !bKnown {
			bOrder = 100
		}
		if aOrder != bOrder {
			return aOrder < bOrder
		}
	}
	if aRoot != bRoot {
		return aRoot
	}
	return naturalCompare(a.SourcePath, b.SourcePath) < 0
}

func createDocument(file scannedFile, root string, staleDays int, now time.Time, issues *[]Issue) *Document {
	contentBytes, err := os.ReadFile(file.AbsolutePath)
	if err != nil {
		*issues = append(*issues, newIssue("error", "file-read-failed", "Не удалось прочитать файл: "+err.Error(), file.RelativePath, 0))
		return nil
	}
	info, err := os.Stat(file.AbsolutePath)
	if err != nil {
		*issues = append(*issues, newIssue("error", "file-read-failed", "Не удалось получить сведения о файле: "+err.Error(), file.RelativePath, 0))
		return nil
	}
	content := string(contentBytes)
	parsed := AnalyzeMarkdown(content)
	typeName := ClassifyDocument(file.RelativePath)
	fallback := strings.TrimSuffix(path.Base(file.RelativePath), path.Ext(file.RelativePath))
	fallback = strings.ReplaceAll(strings.ReplaceAll(fallback, "-", " "), "_", " ")
	if fallback != "" {
		runes := []rune(fallback)
		runes[0] = []rune(strings.ToUpper(string(runes[0])))[0]
		fallback = string(runes)
	}
	updatedAt := info.ModTime().UTC()
	if value := parsed.Metadata["updated"]; value != "" {
		if parsedDate, ok := parseDate(value); ok {
			updatedAt = parsedDate
		}
	} else if value := parsed.Metadata["date"]; value != "" {
		if parsedDate, ok := parseDate(value); ok {
			updatedAt = parsedDate
		}
	}
	ageDays := int(now.UTC().Sub(updatedAt).Hours() / 24)
	completed := 0
	for _, task := range parsed.Tasks {
		if task.Completed {
			completed++
		}
	}
	title := parsed.Title
	if title == "" {
		title = fallback
	}
	directory := path.Dir(normalizeSlashes(file.RelativePath))
	return &Document{
		ID: file.RelativePath, AbsolutePath: file.AbsolutePath, SourcePath: normalizeSlashes(file.RelativePath),
		OutputPath: outputPathForDocument(file.RelativePath), Directory: directory, FileName: path.Base(file.RelativePath),
		Type: typeName, TypeLabel: typeLabels[typeName], Title: title, Description: parsed.Description,
		Content: content, Lines: parsed.Lines, Headings: parsed.Headings, HeadingByLine: parsed.HeadingByLine,
		Sections: parsed.Sections, Metadata: parsed.Metadata, MetadataExtras: parsed.MetadataExtras,
		MetadataLineIndexes: parsed.MetadataLineIndexes, Tasks: parsed.Tasks,
		TaskStats: TaskStats{Total: len(parsed.Tasks), Completed: completed, Remaining: len(parsed.Tasks) - completed, Percent: progress(completed, len(parsed.Tasks))},
		Links:     parsed.Links, PlainText: parsed.PlainText, MTime: info.ModTime().UTC(), UpdatedAt: updatedAt,
		AgeDays: ageDays, Stale: staleDays > 0 && ageDays > staleDays, Status: StatusFor(parsed.Metadata["status"]),
	}
}

func addDocumentIssue(model *Model, document *Document, issue Issue) {
	model.Issues = append(model.Issues, issue)
	if issue.Severity == "error" {
		document.Errors = append(document.Errors, issue)
	} else {
		document.Warnings = append(document.Warnings, issue)
	}
}

func hasSection(document *Document, names []string) bool {
	targets := map[string]struct{}{}
	for _, name := range names {
		targets[canonicalText(name)] = struct{}{}
	}
	for _, section := range document.Sections {
		if _, exists := targets[canonicalText(section.Title)]; exists {
			return true
		}
	}
	return false
}

func validateDocumentBasics(model *Model, document *Document) {
	if containsType([]string{"notes", "ideas"}, document.Type) {
		return
	}
	if strings.TrimSpace(document.Content) == "" {
		addDocumentIssue(model, document, newIssue("warning", "empty-document", "Документ пустой.", document.SourcePath, 0))
	}
	hasH1 := false
	for _, heading := range document.Headings {
		if heading.Level == 1 {
			hasH1 = true
			break
		}
	}
	if !hasH1 {
		addDocumentIssue(model, document, newIssue("warning", "missing-h1", "Отсутствует заголовок первого уровня.", document.SourcePath, 0))
	}
	if document.Description == "" && containsType([]string{"overview", "module", "use-case", "architecture", "decision"}, document.Type) {
		addDocumentIssue(model, document, newIssue("warning", "missing-description", "Отсутствует краткое вводное описание.", document.SourcePath, 0))
	}
	if document.Stale {
		addDocumentIssue(model, document, newIssue("warning", "stale-document", fmt.Sprintf("Документ не обновлялся %d дн.", document.AgeDays), document.SourcePath, 0))
	}
	if document.Metadata["status"] != "" && !document.Status.Recognized {
		addDocumentIssue(model, document, newIssue("warning", "unknown-status", fmt.Sprintf("Неизвестный статус «%s».", document.Metadata["status"]), document.SourcePath, 0))
	}
	if containsType([]string{"status", "use-case", "module", "decision"}, document.Type) && document.Metadata["status"] == "" {
		addDocumentIssue(model, document, newIssue("warning", "missing-status", "Не указано поле «Статус».", document.SourcePath, 0))
	}

	type sectionRule struct {
		Names   []string
		Message string
	}
	rules := map[string][]sectionRule{
		"use-case": {
			{[]string{"основной сценарий", "main scenario", "основной поток"}, "Отсутствует раздел «Основной сценарий»."},
			{[]string{"постусловия", "postconditions"}, "Отсутствует раздел «Постусловия»."},
			{[]string{"бизнес-правила", "business rules"}, "Отсутствует раздел «Бизнес-правила»."},
			{[]string{"реализация", "implementation"}, "Отсутствует раздел «Реализация»."},
		},
		"module": {
			{[]string{"расположение в коде", "code location"}, "Отсутствует раздел «Расположение в коде»."},
			{[]string{"границы", "границы модуля", "module boundaries"}, "Отсутствует раздел «Границы»."},
			{[]string{"бизнес-правила", "business rules"}, "Отсутствует раздел «Бизнес-правила»."},
			{[]string{"инварианты", "invariants"}, "Отсутствует раздел «Инварианты»."},
			{[]string{"стабильные интерфейсы", "stable interfaces"}, "Отсутствует раздел «Стабильные интерфейсы»."},
			{[]string{"связанные сценарии", "related use cases"}, "Отсутствует раздел «Связанные сценарии»."},
		},
		"decision": {
			{[]string{"контекст", "context"}, "Отсутствует раздел «Контекст»."},
			{[]string{"решение", "decision"}, "Отсутствует раздел «Решение»."},
			{[]string{"последствия", "consequences"}, "Отсутствует раздел «Последствия»."},
		},
	}
	for _, rule := range rules[document.Type] {
		if !hasSection(document, rule.Names) {
			addDocumentIssue(model, document, newIssue("warning", "missing-section", rule.Message, document.SourcePath, 0))
		}
	}
}

func containsType(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func buildDirectories(documents []*Document) map[string]struct{} {
	result := map[string]struct{}{}
	for _, document := range documents {
		directory := document.Directory
		for directory != "" && directory != "." {
			result[directory] = struct{}{}
			parent := path.Dir(directory)
			if parent == directory || parent == "." {
				break
			}
			directory = parent
		}
	}
	return result
}

func buildCollections(documents []*Document) map[string][]*Document {
	result := map[string][]*Document{}
	for _, document := range documents {
		result[document.Type] = append(result[document.Type], document)
	}
	for _, collection := range result {
		sort.SliceStable(collection, func(i, j int) bool { return documentLess(collection[i], collection[j]) })
	}
	return result
}

func validateGlobalStructure(model *Model) {
	if model.DocByPath["index.md"] == nil {
		model.Issues = append(model.Issues, newIssue("warning", "missing-index", "Отсутствует обязательный файл index.md.", "", 0))
	}
	titles := map[string][]*Document{}
	for _, document := range model.Documents {
		key := canonicalText(document.Title)
		if key != "" {
			titles[key] = append(titles[key], document)
		}
	}
	for _, group := range titles {
		if len(group) > 1 {
			for _, document := range group {
				addDocumentIssue(model, document, newIssue("warning", "duplicate-title", fmt.Sprintf("Заголовок «%s» используется в нескольких документах.", document.Title), document.SourcePath, 0))
			}
		}
	}
}

func assignUniqueOutputPaths(model *Model) {
	used := map[string]*Document{}
	for _, document := range model.Documents {
		if id := strings.TrimSpace(document.Metadata["id"]); safeStableID(id) {
			switch document.Type {
			case "use-case":
				if strings.HasPrefix(id, "UC-") {
					document.OutputPath = path.Join("use-cases", id+".html")
				}
			case "flow":
				if strings.HasPrefix(id, "FLOW-") {
					document.OutputPath = path.Join("flows", id+".html")
				}
			case "screen":
				if strings.HasPrefix(id, "SC-") {
					document.OutputPath = path.Join("screens", id+".html")
				}
			}
		}
		candidate := document.OutputPath
		key := strings.ToLower(candidate)
		if previous := used[key]; previous != nil {
			base := strings.TrimSuffix(candidate, path.Ext(candidate))
			ext := path.Ext(candidate)
			for i := 2; ; i++ {
				candidate = fmt.Sprintf("%s-%d%s", base, i, ext)
				if used[strings.ToLower(candidate)] == nil {
					break
				}
			}
			document.OutputPath = candidate
			addDocumentIssue(model, document, newIssue("error", "output-path-collision", fmt.Sprintf("Выходной путь конфликтует с %s; назначен %s.", previous.SourcePath, candidate), document.SourcePath, 0))
		}
		used[strings.ToLower(document.OutputPath)] = document
	}
}

func safeStableID(id string) bool {
	if id == "" || strings.HasPrefix(id, "-") || strings.HasSuffix(id, "-") {
		return false
	}
	for _, value := range id {
		if value == '-' || value >= 'A' && value <= 'Z' || value >= '0' && value <= '9' {
			continue
		}
		return false
	}
	return true
}

// BuildDocumentationModel reads, validates and cross-links all Markdown documents.
func BuildDocumentationModel(options Options) (*Model, error) {
	root, err := filepath.Abs(options.InputDirectory)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("каталог документации не найден: %s", root)
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("указанный путь не является каталогом: %s", root)
	}
	repositoryRoot := options.RepositoryRoot
	if repositoryRoot == "" {
		repositoryRoot = filepath.Dir(root)
	}
	repositoryRoot, err = filepath.Abs(repositoryRoot)
	if err != nil {
		return nil, err
	}
	now := options.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}
	staleDays := options.StaleDays
	if staleDays < 0 {
		staleDays = 90
	}
	model := &Model{
		RootDirectory: root, RepositoryRoot: repositoryRoot, RepositoryURL: strings.TrimRight(options.RepositoryURL, "/"),
		RepositoryRef: options.RepositoryRef, GeneratedAt: now.UTC(), StaleDays: staleDays,
		DocByPath: map[string]*Document{}, Directories: map[string]struct{}{}, Assets: map[string]string{},
		Collections: map[string][]*Document{}, Knowledge: KnowledgeModel{},
		HealthOutputPath: "health.html", ReportOutputPath: "report.json", ScreenMapEnabled: true,
	}
	if model.RepositoryRef == "" {
		model.RepositoryRef = "main"
	}
	files := scanMarkdownFiles(root, options.Excludes, &model.Issues)
	for _, file := range files {
		document := createDocument(file, root, staleDays, now, &model.Issues)
		if document == nil {
			continue
		}
		model.Documents = append(model.Documents, document)
		model.DocByPath[document.SourcePath] = document
	}
	sort.SliceStable(model.Documents, func(i, j int) bool { return documentLess(model.Documents[i], model.Documents[j]) })
	assignUniqueOutputPaths(model)
	usedOutputs := map[string]struct{}{}
	for _, document := range model.Documents {
		usedOutputs[strings.ToLower(document.OutputPath)] = struct{}{}
	}
	for _, candidate := range []string{"health.html", "documentation-health.html", "_project-docs/health.html"} {
		if _, exists := usedOutputs[strings.ToLower(candidate)]; !exists {
			model.HealthOutputPath = candidate
			break
		}
	}
	model.Directories = buildDirectories(model.Documents)
	model.Collections = buildCollections(model.Documents)
	for _, document := range model.Documents {
		validateDocumentBasics(model, document)
	}
	validateGlobalStructure(model)
	resolveLinks(model)
	connectUseCasesAndModules(model)
	validateMermaidDocuments(model)
	model.Knowledge = buildKnowledgeModel(model)
	buildScreenKnowledge(model)
	model.Risks = buildRisks(model)
	model.RoadmapStages = buildRoadmapStages(model)
	model.Project = buildProjectInfo(model, options.Title)
	model.CurrentStatus = buildCurrentStatus(model)
	model.Stats = buildStats(model)
	model.SearchIndex = buildSearchIndex(model)
	return model, nil
}

func directoryLabel(directory string) string {
	base := path.Base(directory)
	if label := folderLabels[base]; label != "" {
		return label
	}
	label := strings.ReplaceAll(strings.ReplaceAll(base, "-", " "), "_", " ")
	if label == "" {
		return "Документы"
	}
	runes := []rune(label)
	runes[0] = []rune(strings.ToUpper(string(runes[0])))[0]
	return string(runes)
}

func directoryHasSourceIndex(model *Model, directory string) bool {
	if directory == "screens" && len(model.Knowledge.Screens) > 0 {
		return true
	}
	if directory == "flows" && len(model.Knowledge.PlayableFlows) > 0 {
		return true
	}
	return model.DocByPath[path.Join(directory, "index.md")] != nil
}

func highRisk(risk Risk) bool {
	high := map[string]struct{}{
		"высокая": {}, "высокое": {}, "высокий": {}, "high": {}, "critical": {}, "критическая": {}, "критическое": {},
	}
	_, probability := high[canonicalText(risk.Probability)]
	_, impact := high[canonicalText(risk.Impact)]
	return probability || impact
}
