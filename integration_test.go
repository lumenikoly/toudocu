package docgent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeTestFile(t *testing.T, root, relative, content string) {
	t.Helper()
	target := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func createFixture(t *testing.T) (string, string, string) {
	t.Helper()
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	if err := os.MkdirAll(docs, 0755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, docs, "index.md", "# Test Project\n\nОписание тестового проекта.\n\n- [x] Общая задача\n\n[Статус](status.md)\n")
	writeTestFile(t, docs, "status.md", "# Состояние\n\n- Статус: В работе\n- Этап: MVP\n- Последнее обновление: 2026-07-24\n\nТекущее состояние.\n\n## Краткое состояние\n\nОсновной поток работает.\n")
	writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\nПлан.\n\n## MVP\n\n- Статус: В работе\n- Плановая дата: 2026-09-01\n\n- [x] `DLV-DOCS-01` Документация готова.\n- [ ] `UC-AUTH-01` Пользователь входит.\n")
	writeTestFile(t, docs, "risks.md", "# Риски\n\nОписание рисков.\n\n## RISK-01: Тестовый риск\n\n- Статус: Открыт\n- Вероятность: Высокая\n- Влияние: Среднее\n- Владелец: Team\n\n- [ ] Снизить риск\n")
	writeTestFile(t, docs, "modules/auth.md", `# Авторизация

- Идентификатор: MOD-AUTH
- Статус: В работе
- Владелец: Backend

Модуль входа.

## Назначение

Вход пользователей.

## Расположение в коде

Определяется приложением.

## Границы модуля

Отвечает за вход, но не за профиль.

## Бизнес-правила

### BR-AUTH-001: Сессия создаётся только после проверки

Неверные данные не создают сессию.

## Инварианты

Сессия принадлежит пользователю.

## Стабильные интерфейсы

Сценарий входа.

## Связанные сценарии

[UC-01](../use-cases/login.md)

## Проверка

Запустить тесты.

## Задачи

- [x] Вход
- [ ] Восстановление
`)
	writeTestFile(t, docs, "use-cases/login.md", `# UC-01: Вход

- Идентификатор: UC-AUTH-01
- Статус: В работе
- Актор: Пользователь
- Модуль: MOD-AUTH

Пользователь входит.

## Цель

Открыть аккаунт.

## Входные данные

Учётные данные.

## Предусловия

Пользователь существует.

## Основной сценарий

1. Ввести пароль.
2. Открыть проект.

## Альтернативные сценарии

Неверный пароль отклоняется.

## Постусловия

Создана сессия или состояние не изменилось.

## Бизнес-правила

[BR-AUTH-001](../modules/auth.md#br-auth-001-сессия-создаётся-только-после-проверки)

## Критерии приёмки

- [x] Форма
- [ ] Защита

## Реализация

[Модуль](../modules/auth.md)

## Проверка

Запустить тесты.
`)
	writeTestFile(t, docs, "decisions/001-db.md", `# ADR-001: База данных

- Идентификатор: ADR-001
- Статус: Принято
- Дата: 2026-07-01

Выбор базы.

## Контекст

Нужно хранение.

## Решение

Использовать SQL.

## Последствия

Нужны миграции.
`)
	return root, docs, filepath.Join(root, "site")
}

func buildFixture(t *testing.T, docs string) *Model {
	t.Helper()
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: filepath.Dir(docs), StaleDays: 90, Now: time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)})
	if err != nil {
		t.Fatal(err)
	}
	return model
}

func TestModelAndStatistics(t *testing.T) {
	_, docs, _ := createFixture(t)
	model := buildFixture(t, docs)
	if model.Project.Title != "Test Project" || model.Stats.Documents != 7 || model.Stats.TotalTasks != 2 || model.Stats.CompletedTasks != 1 || len(model.Risks) != 1 || len(model.RoadmapStages) != 1 || model.Stats.BrokenLinks != 0 {
		t.Fatalf("unexpected model: %#v %#v", model.Project, model.Stats)
	}
	module := model.DocByPath["modules/auth.md"]
	useCase := model.DocByPath["use-cases/login.md"]
	if len(module.LinkedUseCases) != 1 || module.LinkedUseCases[0] != useCase || len(useCase.LinkedModules) != 1 || useCase.LinkedModules[0] != module {
		t.Fatalf("links failed")
	}
}

func TestGenerateSite(t *testing.T) {
	_, docs, output := createFixture(t)
	indexFile, err := os.OpenFile(filepath.Join(docs, "index.md"), os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := indexFile.WriteString("\n[Сценарии](use-cases/)\n"); err != nil {
		_ = indexFile.Close()
		t.Fatal(err)
	}
	if err := indexFile.Close(); err != nil {
		t.Fatal(err)
	}
	model := buildFixture(t, docs)
	result, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true})
	if err != nil {
		t.Fatal(err)
	}
	if result.Pages < 10 {
		t.Fatalf("pages=%d", result.Pages)
	}
	for _, name := range []string{"index.html", "health.html", "report.json", "assets/style.css", "assets/app.js", "assets/search-index.js", "modules/auth.html", "modules/index.html", "use-cases/login.html", "use-cases/index.html"} {
		if _, err := os.Stat(filepath.Join(output, filepath.FromSlash(name))); err != nil {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	htmlBytes, _ := os.ReadFile(filepath.Join(output, "modules/auth.html"))
	html := string(htmlBytes)
	for _, part := range []string{"Готовность документа", "../use-cases/login.html", `class="metadata-grid"`, "<dt>Статус</dt>", `class="document-toolbar task-toolbar"`, `role="group"`, `class="toolbar-button"`, `data-task-filter="open"`, `class="collapse-all-button"`, `data-collapse-label`} {
		if !strings.Contains(html, part) {
			t.Fatalf("missing %s", part)
		}
	}
	if strings.Contains(html, "<script>alert") {
		t.Fatal("unsafe")
	}
	reportBytes, _ := os.ReadFile(filepath.Join(output, "report.json"))
	var report ProjectReport
	if err := json.Unmarshal(reportBytes, &report); err != nil {
		t.Fatal(err)
	}
	if report.SchemaVersion != 1 || report.Documents == nil || report.Issues == nil || report.CurrentStatus.ActiveWork == nil || report.CurrentStatus.Blockers == nil {
		t.Fatalf("unstable report collections: %#v", report)
	}
	foundDirectoryTarget := false
	for _, document := range report.Documents {
		if document.SourcePath != "index.md" {
			continue
		}
		for _, link := range document.Links {
			if link.Destination == "use-cases/" && link.TargetKind == "directory" && link.Target == "use-cases/index.html" {
				foundDirectoryTarget = true
			}
		}
	}
	if !foundDirectoryTarget {
		t.Fatal("generated directory link is missing a typed report target")
	}
}

func TestBrokenLinksDoNotStopGeneration(t *testing.T) {
	_, docs, output := createFixture(t)
	f, _ := os.OpenFile(filepath.Join(docs, "status.md"), os.O_APPEND|os.O_WRONLY, 0644)
	_, _ = f.WriteString("\n[Нет файла](missing.md)\n")
	_ = f.Close()
	model := buildFixture(t, docs)
	if model.Stats.BrokenLinks != 1 {
		t.Fatalf("broken=%d", model.Stats.BrokenLinks)
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
}

func TestCLIArguments(t *testing.T) {
	options, _, _, err := ParseArguments([]string{"./docs", "--output", "./out", "--title=Проект", "--exclude", "tmp,cache", "--stale-days", "30", "--repository-root", ".", "--repository-url=https://github.com/example/project", "--repository-ref", "abc123", "--clean", "--strict"})
	if err != nil {
		t.Fatal(err)
	}
	if options.Title != "Проект" || options.StaleDays != 30 || len(options.Excludes) != 2 || !options.Clean || !options.Strict || options.RepositoryRef != "abc123" || !filepath.IsAbs(options.InputDirectory) {
		t.Fatalf("options: %#v", options)
	}
	if _, _, _, err := ParseArguments([]string{"init"}); err == nil || !strings.Contains(err.Error(), "неизвестная команда") {
		t.Fatalf("init must be rejected as an unknown command, got %v", err)
	}
	if _, _, _, err := ParseArguments([]string{"./docs", "--force"}); err == nil || !strings.Contains(err.Error(), "неизвестный параметр") {
		t.Fatalf("--force must be rejected as an unknown option, got %v", err)
	}
}

func TestTaskCheckCLIArguments(t *testing.T) {
	options, _, _, err := ParseArguments([]string{
		"task", "check", "TASK-AUTH-014", "./docs",
		"--repository-root", ".", "--format", "json", "--report", "./task-report.json", "--timeout", "45s",
	})
	if err != nil {
		t.Fatal(err)
	}
	if options.Command != "task-check" || options.TaskID != "TASK-AUTH-014" || options.Format != "json" || options.Timeout != 45*time.Second || !filepath.IsAbs(options.ReportPath) {
		t.Fatalf("options: %#v", options)
	}
	if _, _, _, err := ParseArguments([]string{"check", "./docs", "--timeout", "1s"}); err == nil {
		t.Fatal("--timeout must be rejected outside task check")
	}
	if _, _, _, err := ParseArguments([]string{"task", "check", "TASK-AUTH-014", "./docs", "--report", "./docs/report.json"}); err == nil {
		t.Fatal("--report must not overwrite source documentation")
	}
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	if err := os.MkdirAll(docs, 0755); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(root, "docs-alias")
	if err := os.Symlink(docs, alias); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, _, _, err := ParseArguments([]string{
		"task", "check", "TASK-AUTH-014", docs, "--report", filepath.Join(alias, "report.json"),
	}); err == nil {
		t.Fatal("--report must not overwrite source documentation through a symlink")
	}
}

func TestKnowledgeModel(t *testing.T) {
	_, docs, _ := createFixture(t)
	content := "# TASK-AUTH-001: Защитить вход\n\n" +
		"- Статус: В работе\n- Тип: Feature\n- Приоритет: Высокий\n- Модуль: MOD-AUTH\n- Сценарий: UC-AUTH-01\n\n" +
		"## Результат\n\nВход проверяет ограничения.\n\n" +
		"## Область изменения\n\n- `docs/`\n\n" +
		"## Не входит в задачу\n\nПрофиль.\n\n" +
		"## Критерии приёмки\n\n- [x] `AC-01` Неверный пароль отклоняется.\n\n" +
		"## План\n\n1. Проверить поток.\n2. Изменить реализацию.\n3. Запустить тесты и обновить документацию.\n\n" +
		"## Проверка\n\n- `AC-01` → `go test ./...`\n\n" +
		"## Влияние на документацию\n\nОбновить сценарий входа.\n"
	writeTestFile(t, docs, "work/TASK-AUTH-001-login.md", content)
	model := buildFixture(t, docs)
	if len(model.Knowledge.Modules) != 1 || len(model.Knowledge.UseCases) != 1 || len(model.Knowledge.BusinessRules) != 1 || len(model.Knowledge.WorkItems) != 1 || model.Knowledge.WorkItems[0].ID != "TASK-AUTH-001" || len(model.Knowledge.WorkItems[0].Verification) != 1 || model.Stats.Errors != 0 {
		t.Fatalf("knowledge %#v issues %#v", model.Knowledge, model.Issues)
	}
}

func issueCodes(model *Model) map[string]bool {
	result := map[string]bool{}
	for _, issue := range model.Issues {
		result[issue.Code] = true
	}
	return result
}

func TestWorkItemValidationRules(t *testing.T) {
	_, docs, _ := createFixture(t)
	content := `# TASK-AUTH-002: Некорректная завершённая задача

- Статус: Выполнено
- Тип: Feature
- Модуль: MOD-AUTH
- Сценарий: UC-AUTH-01

## Результат

Результат.

## Область изменения

- ` + "`missing/path.go`" + `
- ` + "`../outside.go`" + `

## Не входит в задачу

Прочее.

## Критерии приёмки

- [x] ` + "`AC-01`" + ` Первый критерий.
- [ ] ` + "`AC-01`" + ` Повтор критерия.

## План

1. Первый шаг.
2. Второй шаг.
- [ ] Чекбокс в плане.

## Проверка

- ` + "`AC-02`" + ` → ` + "`go test ./...`" + `

## Влияние на документацию
`
	writeTestFile(t, docs, "work/TASK-AUTH-002-invalid.md", content)
	model := buildFixture(t, docs)
	codes := issueCodes(model)
	for _, code := range []string{
		"duplicate-acceptance-criterion-id",
		"unknown-criterion-verification",
		"missing-criterion-verification",
		"task-checkbox-outside-criteria",
		"incomplete-completed-task",
		"missing-completed-task-check",
		"missing-scope-path",
		"unsafe-scope-path",
		"empty-work-section",
	} {
		if !codes[code] {
			t.Fatalf("missing issue %s in %#v", code, model.Issues)
		}
	}
}

func TestDraftWorkItemCanBeMinimal(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "work/TASK-AUTH-030-draft.md", `# TASK-AUTH-030: Исследовать вариант

- Статус: Черновик
- Тип: Research

## Результат

Понятно, стоит ли продолжать реализацию.
`)
	model := buildFixture(t, docs)
	for _, issue := range model.Issues {
		if issue.DocumentPath == "work/TASK-AUTH-030-draft.md" {
			t.Fatalf("minimal draft must be valid: %#v", issue)
		}
	}
	item := model.Knowledge.WorkItems[0]
	if item.ID != "TASK-AUTH-030" || item.Criteria == nil || item.Verification == nil || item.Checks == nil || item.RepositoryPaths == nil {
		t.Fatalf("minimal draft has unstable collections: %#v", item)
	}

	writeTestFile(t, docs, "work/TASK-AUTH-031-ready.md", `# TASK-AUTH-031: Начать реализацию

- Статус: Готово к работе
- Тип: Feature

## Результат

Результат реализован.
`)
	model = buildFixture(t, docs)
	found := false
	for _, issue := range model.Issues {
		if issue.DocumentPath == "work/TASK-AUTH-031-ready.md" && issue.Code == "missing-work-section" {
			found = true
		}
	}
	if !found {
		t.Fatal("ready task must require the complete workflow contract")
	}
}

func TestSpecialTaskStatusesAndSingleTaskFile(t *testing.T) {
	_, docs, _ := createFixture(t)
	task := func(id, status string) string {
		return "# " + id + ": Статусная задача\n\n" +
			"- Статус: " + status + "\n- Тип: Feature\n- Модуль: MOD-AUTH\n- Сценарий: UC-AUTH-01\n\n" +
			"## Результат\n\nРезультат.\n\n## Область изменения\n\n- `docs/`\n\n" +
			"## Не входит в задачу\n\nПрочее.\n\n## Критерии приёмки\n\n- [ ] `AC-01` Результат наблюдаем.\n\n" +
			"## План\n\n1. Проверить.\n2. Реализовать.\n3. Протестировать и обновить документацию.\n\n" +
			"## Проверка\n\n- `AC-01` → `go test ./...`\n\n## Влияние на документацию\n\nНе требуется: поведение не меняется.\n"
	}
	writeTestFile(t, docs, "work/TASK-AUTH-003-blocked.md", task("TASK-AUTH-003", "Заблокировано"))
	writeTestFile(t, docs, "work/TASK-AUTH-004-cancelled.md", task("TASK-AUTH-004", "Отменено"))
	writeTestFile(t, docs, "work/two-items.md", "# Список\n\n## TASK-AUTH-005: Первая\n\n## TASK-AUTH-006: Вторая\n")
	model := buildFixture(t, docs)
	codes := issueCodes(model)
	for _, code := range []string{"work-item-count", "missing-work-section"} {
		if !codes[code] {
			t.Fatalf("missing issue %s in %#v", code, model.Issues)
		}
	}
	messages := strings.Builder{}
	for _, issue := range model.Issues {
		messages.WriteString(issue.Message)
		messages.WriteByte('\n')
	}
	if !strings.Contains(messages.String(), "Блокер") || !strings.Contains(messages.String(), "Причина отмены") {
		t.Fatalf("special status sections not validated: %s", messages.String())
	}
}

func TestTaskTypeAndUseCaseRules(t *testing.T) {
	_, docs, _ := createFixture(t)
	task := func(id, status, taskType string) string {
		return "# " + id + ": Техническая задача\n\n" +
			"- Статус: " + status + "\n- Тип: " + taskType + "\n- Модуль: MOD-AUTH\n\n" +
			"## Результат\n\nРезультат.\n\n## Область изменения\n\n- `docs/`\n\n" +
			"## Не входит в задачу\n\nПрочее.\n\n## Критерии приёмки\n\n- [ ] `AC-01` Результат наблюдаем.\n\n" +
			"## План\n\n1. Проверить.\n2. Реализовать.\n3. Протестировать и обновить документацию.\n\n" +
			"## Проверка\n\n- `AC-01` → `go test ./...`\n\n## Влияние на документацию\n\nНе требуется: поведение не меняется.\n"
	}
	writeTestFile(t, docs, "work/TASK-AUTH-008-invalid-enums.md", task("TASK-AUTH-008", "Запланировано", "Chore"))
	writeTestFile(t, docs, "work/TASK-AUTH-009-maintenance.md", task("TASK-AUTH-009", "Готово к работе", "Maintenance"))
	model := buildFixture(t, docs)
	codes := issueCodes(model)
	for _, code := range []string{"invalid-task-status", "invalid-task-type", "missing-use-case-omission-reason"} {
		if !codes[code] {
			t.Fatalf("missing issue %s in %#v", code, model.Issues)
		}
	}
}

func TestStatusAndRoadmapConsistency(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "status.md", "# Состояние\n\n- Статус: В работе\n\n## В работе\n\n- [ ] Сделать авторизацию.\n")
	writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\n## MVP\n\n- [x] `UC-AUTH-01` Пользователь входит.\n- [ ] Произвольный результат.\n- [ ] `UC-UNKNOWN-01` Неизвестный сценарий.\n")
	model := buildFixture(t, docs)
	codes := issueCodes(model)
	for _, code := range []string{"status-requirement-checklist", "invalid-roadmap-item-id", "dangling-roadmap-reference"} {
		if !codes[code] {
			t.Fatalf("missing issue %s in %#v", code, model.Issues)
		}
	}
	if model.RoadmapStages[0].Items[0].EffectiveCompleted {
		t.Fatal("roadmap completion must be derived from the unfinished use case")
	}
}

func TestRoadmapCompletionIsDerivedAndRendered(t *testing.T) {
	root, docs, output := createFixture(t)
	useCasePath := filepath.Join(docs, "use-cases", "login.md")
	content, err := os.ReadFile(useCasePath)
	if err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, docs, "use-cases/login.md", strings.Replace(string(content), "- Статус: В работе", "- Статус: Выполнено", 1))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	stage := model.RoadmapStages[0]
	if stage.TaskStats.Completed != 2 || model.Stats.CompletedTasks != 2 || stage.Items[1].DeclaredCompleted || !stage.Items[1].EffectiveCompleted || stage.Items[1].CompletionSource != "use-case-status" {
		t.Fatalf("derived roadmap: %#v %#v", stage, model.Stats)
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
	roadmapHTML, err := os.ReadFile(filepath.Join(output, "roadmap.html"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(roadmapHTML), `data-task-state="open"`) {
		t.Fatalf("roadmap HTML did not apply effective completion: %s", roadmapHTML)
	}
	report, err := json.Marshal(BuildReport(model))
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{`"schemaVersion":1`, `"declaredCompleted":false`, `"effectiveCompleted":true`, `"completionSource":"use-case-status"`} {
		if !strings.Contains(string(report), part) {
			t.Fatalf("missing %s in %s", part, report)
		}
	}
}

func TestRoadmapContractAndDeliverableRemainManual(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "contracts/auth.md", "# Auth contract\n\n- Идентификатор: CON-AUTH-API\n- Статус: В работе\n\nContract.\n")
	writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\n## MVP\n\n- [x] `CON-AUTH-API` Контракт опубликован.\n- [ ] `DLV-RELEASE-01` Релиз подготовлен.\n")
	model := buildFixture(t, docs)
	items := model.RoadmapStages[0].Items
	if len(items) != 2 || !items[0].EffectiveCompleted || items[0].CompletionSource != "roadmap-checkbox" || items[1].EffectiveCompleted {
		t.Fatalf("manual roadmap items: %#v", items)
	}
}

func TestComputedStatusAppearsOnDashboardAndStatusPage(t *testing.T) {
	root, docs, output := createFixture(t)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	task := taskCheckFixture("Заблокировано", false, commands, "\n## Блокер\n\nОжидается решение ADR-014.\n")
	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", task)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(model.CurrentStatus.ActiveWork) != 1 || len(model.CurrentStatus.Blockers) != 1 || model.CurrentStatus.NextResult == nil || model.CurrentStatus.NextResult.ID != "UC-AUTH-01" {
		t.Fatalf("current status: %#v", model.CurrentStatus)
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"index.html", "status.html"} {
		data, err := os.ReadFile(filepath.Join(output, name))
		if err != nil {
			t.Fatal(err)
		}
		for _, part := range []string{"Вычисляемое состояние", "TASK-AUTH-020", "Ожидается решение ADR-014", "UC-AUTH-01"} {
			if !strings.Contains(string(data), part) {
				t.Fatalf("%s missing %q", name, part)
			}
		}
	}
}

func TestVerificationMatrixIsReported(t *testing.T) {
	_, docs, _ := createFixture(t)
	content := `# TASK-AUTH-007: Матрица

- Статус: Черновик
- Тип: Feature
- Модуль: MOD-AUTH
- Сценарий: UC-AUTH-01

## Результат

Результат.

## Область изменения

Будет уточнена.

## Не входит в задачу

Прочее.

## Критерии приёмки

- [ ] ` + "`AC-01`" + ` Результат наблюдаем.

## План

Будет уточнён.

## Проверка

- ` + "`AC-01`" + ` → ` + "`go test ./...`" + `

## Влияние на документацию

Не требуется: это тест.
`
	writeTestFile(t, docs, "work/TASK-AUTH-007-matrix.md", content)
	model := buildFixture(t, docs)
	expectedLine := 0
	for index, line := range strings.Split(content, "\n") {
		if strings.Contains(line, "AC-01") && strings.Contains(line, "[ ]") {
			expectedLine = index + 1
			break
		}
	}
	if line := model.Knowledge.WorkItems[0].Criteria[0].Line; line != expectedLine {
		t.Fatalf("criterion line must be 1-based: got %d want %d", line, expectedLine)
	}
	data, err := json.Marshal(BuildReport(model))
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{`"verificationMatrix"`, `"criterionId":"AC-01"`, `"commands":["go test ./..."]`} {
		if !strings.Contains(string(data), part) {
			t.Fatalf("report does not contain %s: %s", part, data)
		}
	}
}

func TestRepositoryLinksAndTraversal(t *testing.T) {
	root, docs, _ := createFixture(t)
	writeTestFile(t, root, "src/auth.go", "package auth\n")
	f, _ := os.OpenFile(filepath.Join(docs, "modules/auth.md"), os.O_APPEND|os.O_WRONLY, 0644)
	_, _ = f.WriteString("\n[Код](../../src/auth.go)\n[Снаружи](../../../outside.txt)\n")
	_ = f.Close()
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, RepositoryURL: "https://github.com/example/project", RepositoryRef: "abc123", StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	links := model.DocByPath["modules/auth.md"].ResolvedLinks
	if links[len(links)-2].RepositoryPath != "src/auth.go" || links[len(links)-2].Href != "https://github.com/example/project/blob/abc123/src/auth.go" || !links[len(links)-1].Blocked {
		t.Fatalf("links %#v", links[len(links)-2:])
	}
}

func TestTaskDependencyCycle(t *testing.T) {
	_, docs, _ := createFixture(t)
	task := func(id, dep string) string {
		return "# " + id + ": Цикл\n\n" +
			"- Статус: В работе\n- Тип: Feature\n- Модуль: MOD-AUTH\n- Сценарий: UC-AUTH-01\n- Зависит от: " + dep + "\n\n" +
			"## Результат\n\nРезультат.\n\n" +
			"## Область изменения\n\n- `docs/`\n\n" +
			"## Не входит в задачу\n\nПрочее.\n\n" +
			"## Критерии приёмки\n\n- [ ] `AC-01` Проверено.\n\n" +
			"## План\n\n1. Исследовать.\n2. Реализовать.\n3. Проверить и обновить документацию.\n\n" +
			"## Проверка\n\n- `AC-01` → `go test ./...`\n\n" +
			"## Влияние на документацию\n\nНе требуется: тестовая задача.\n"
	}
	writeTestFile(t, docs, "work/TASK-AUTH-001.md", task("TASK-AUTH-001", "TASK-AUTH-002"))
	writeTestFile(t, docs, "work/TASK-AUTH-002.md", task("TASK-AUTH-002", "TASK-AUTH-001"))
	model := buildFixture(t, docs)
	found := false
	for _, issue := range model.Issues {
		if issue.Code == "task-dependency-cycle" {
			found = true
		}
	}
	if !found || model.Stats.Errors == 0 {
		t.Fatal("cycle not reported")
	}
}

func TestDuplicateAndDanglingRule(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "modules/duplicate.md", "# Duplicate\n\n- Идентификатор: MOD-AUTH\n- Статус: В работе\n\nDuplicate module.\n")
	f, _ := os.OpenFile(filepath.Join(docs, "use-cases/login.md"), os.O_APPEND|os.O_WRONLY, 0644)
	_, _ = f.WriteString("\nНеизвестное правило BR-AUTH-999.\n")
	_ = f.Close()
	model := buildFixture(t, docs)
	codes := map[string]bool{}
	for _, issue := range model.Issues {
		codes[issue.Code] = true
	}
	if !codes["duplicate-id"] || !codes["dangling-rule-reference"] {
		t.Fatalf("codes %#v", codes)
	}
}

func TestHealthCollision(t *testing.T) {
	_, docs, output := createFixture(t)
	writeTestFile(t, docs, "health.md", "# Пользовательский health\n\nОписание пользовательского документа.\n")
	model := buildFixture(t, docs)
	if model.DocByPath["health.md"].OutputPath != "health.html" || model.HealthOutputPath != "documentation-health.html" {
		t.Fatalf("paths")
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
}

func TestOutputSafety(t *testing.T) {
	root, docs, _ := createFixture(t)
	model := buildFixture(t, docs)
	if _, err := GenerateSite(model, Options{OutputDirectory: root, Clean: true}); err == nil || !strings.Contains(err.Error(), "родительским") {
		t.Fatalf("expected safety error, got %v", err)
	}

	alias := filepath.Join(t.TempDir(), "output-alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: alias, Clean: true}); err == nil {
		t.Fatal("output symlink to documentation parent must be rejected")
	}
	if _, err := os.Stat(filepath.Join(docs, "index.md")); err != nil {
		t.Fatalf("source documentation was changed through output symlink: %v", err)
	}

	unrelated := filepath.Join(t.TempDir(), "existing-output")
	if err := os.MkdirAll(unrelated, 0755); err != nil {
		t.Fatal(err)
	}
	directAlias := filepath.Join(t.TempDir(), "direct-output-alias")
	if err := os.Symlink(unrelated, directAlias); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: directAlias, Clean: true}); err == nil || !strings.Contains(err.Error(), "символической ссылки") {
		t.Fatalf("direct output symlink must be rejected, got %v", err)
	}
}

func TestMinimalDocumentationCheckAndBuild(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Минимальный проект\n\nКраткое описание проекта.\n\n## Подробности\n\nУникальное содержимое главной страницы.\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if model.Stats.Warnings != 0 || model.Stats.Errors != 0 {
		t.Fatalf("minimal documentation must be valid: %#v", model.Issues)
	}
	var stdout, stderr strings.Builder
	if code := RunCLI([]string{"check", docs, "--repository-root", root, "--strict", "--stale-days", "0"}, &stdout, &stderr); code != 0 {
		t.Fatalf("strict check failed: stdout=%s stderr=%s", stdout.String(), stderr.String())
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"index.html", "report.json"} {
		if _, err := os.Stat(filepath.Join(output, name)); err != nil {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	data, err := os.ReadFile(filepath.Join(output, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	html := string(data)
	if !strings.Contains(html, "Уникальное содержимое главной страницы.") {
		t.Fatalf("index.md body is missing from dashboard: %s", html)
	}
	for _, absent := range []string{"Дорожная карта", "Вычисляемое состояние", "Открытые риски", "metric-label\">Модули", "Не указан"} {
		if strings.Contains(html, absent) {
			t.Fatalf("minimal dashboard contains optional block %q", absent)
		}
	}
}

func TestMissingIndexRemainsStrictFailure(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "notes.md", "# Заметки\n\nОписание заметок.\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, issue := range model.Issues {
		if issue.Code == "missing-index" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("missing-index diagnostic not found: %#v", model.Issues)
	}
	var stdout, stderr strings.Builder
	if code := RunCLI([]string{"check", docs, "--repository-root", root, "--strict", "--stale-days", "0"}, &stdout, &stderr); code == 0 {
		t.Fatalf("strict check must fail without index.md: stdout=%s stderr=%s", stdout.String(), stderr.String())
	}
}
