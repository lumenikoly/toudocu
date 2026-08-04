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
	writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\nПлан.\n\n## MVP\n\n- Статус: В работе\n- Плановая дата: 2026-09-01\n\n- [x] Готово\n- [ ] Осталось\n")
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
	for _, part := range []string{"Готовность документа", "../use-cases/login.html", `data-task-filter="open"`} {
		if !strings.Contains(html, part) {
			t.Fatalf("missing %s", part)
		}
	}
	if strings.Contains(html, "<script>alert") {
		t.Fatal("unsafe")
	}
	reportBytes, _ := os.ReadFile(filepath.Join(output, "report.json"))
	var report map[string]any
	if err := json.Unmarshal(reportBytes, &report); err != nil {
		t.Fatal(err)
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
}

func TestKnowledgeModel(t *testing.T) {
	_, docs, _ := createFixture(t)
	content := "# Текущие задачи\n\n" +
		"## TASK-AUTH-001: Защитить вход\n\n" +
		"- Статус: Готово\n- Приоритет: Высокий\n- Модуль: MOD-AUTH\n- Сценарий: UC-AUTH-01\n\n" +
		"### Результат\n\nВход проверяет ограничения.\n\n" +
		"### Область изменения\n\nМодуль авторизации.\n\n" +
		"### Не входит в задачу\n\nПрофиль.\n\n" +
		"### Критерии готовности\n\n- [x] Неверный пароль отклоняется.\n\n" +
		"### Проверка\n\n`go test ./...`\n"
	writeTestFile(t, docs, "work/current.md", content)
	model := buildFixture(t, docs)
	if len(model.Knowledge.Modules) != 1 || len(model.Knowledge.UseCases) != 1 || len(model.Knowledge.BusinessRules) != 1 || len(model.Knowledge.WorkItems) != 1 || model.Knowledge.WorkItems[0].ID != "TASK-AUTH-001" || model.Stats.Errors != 0 {
		t.Fatalf("knowledge %#v issues %#v", model.Knowledge, model.Issues)
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
		return "## " + id + ": Цикл\n\n" +
			"- Статус: В работе\n- Модуль: MOD-AUTH\n- Сценарий: UC-AUTH-01\n- Зависит от: " + dep + "\n\n" +
			"### Результат\n\nРезультат.\n\n" +
			"### Область изменения\n\nМодуль.\n\n" +
			"### Не входит в задачу\n\nПрочее.\n\n" +
			"### Критерии готовности\n\n- [ ] Проверено.\n\n" +
			"### Проверка\n\n`go test ./...`\n"
	}
	writeTestFile(t, docs, "work/current.md", "# Текущие задачи\n\n"+task("TASK-AUTH-001", "TASK-AUTH-002")+"\n"+task("TASK-AUTH-002", "TASK-AUTH-001"))
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
}

func TestInitCheckBuild(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	count, err := InitDocumentation(docs, false)
	if err != nil || count == 0 {
		t.Fatalf("init %d %v", count, err)
	}
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(output, "index.html")); err != nil {
		t.Fatal(err)
	}
}
