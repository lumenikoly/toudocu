package docgent

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEmbeddedMermaidVersionIsPinned(t *testing.T) {
	content, err := EmbeddedFiles.ReadFile("assets/mermaid.tiny.js")
	if err != nil {
		t.Fatal(err)
	}
	const expected = "a1bc2282b3d935693780f77931382c517e72eb72ff3427752cbb29941de11bee"
	if actual := fmt.Sprintf("%x", sha256.Sum256(content)); actual != expected {
		t.Fatalf("unexpected Mermaid bundle checksum: got %s want %s", actual, expected)
	}
	if _, err := EmbeddedFiles.ReadFile("assets/mermaid.LICENSE.txt"); err != nil {
		t.Fatal("embedded Mermaid license is missing")
	}
}

func TestArchivedTasksAreFilteredFromDefaultPortalSurfaces(t *testing.T) {
	root, docs, _ := createFixture(t)
	active := strings.Replace(completeTaskFixture("Ready"), "Add verification workflow", "Active portal task", 1)
	archived := strings.Replace(terminalTaskFixture("Done"), "Add verification workflow", "Archived portal task", 1)
	archived = strings.Replace(archived, "TASK-AUTH-021", "TASK-AUTH-022", 1)
	writeTestFile(t, docs, "work/TASK-AUTH-021.md", active)
	writeTestFile(t, docs, "work/archive/2031/TASK-AUTH-022.md", archived)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	catalog := renderDirectoryPage(model, "work")
	for _, expected := range []string{`data-filter-default="active"`, `data-archive="active"`, `data-archive="archived"`, "Archived portal task"} {
		if !strings.Contains(catalog, expected) {
			t.Fatalf("work catalog missing %q", expected)
		}
	}
	navigation := renderNavigation(model, "work/index.html")
	if !strings.Contains(navigation, "Active portal task") || strings.Contains(navigation, "Archived portal task") {
		t.Fatalf("unexpected work navigation: %s", navigation)
	}
	dashboard := renderDashboard(model)
	if !strings.Contains(dashboard, "Active portal task") || strings.Contains(dashboard, "Archived portal task") {
		t.Fatalf("unexpected dashboard archive visibility")
	}
}

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
	writeArchitectureOverview(t, docs, "")
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

func writeArchitectureOverview(t *testing.T, docs, links string) {
	t.Helper()
	writeTestFile(t, docs, "architecture/overview.md", `# Architecture

- Document type: Architecture Overview

System architecture map.

## Questions

`+links+`
`)
}

func architectureIssueCodes(model *Model) map[string][]Issue {
	result := map[string][]Issue{}
	for _, issue := range model.Issues {
		result[issue.Code] = append(result[issue.Code], issue)
	}
	return result
}

func TestArchitectureContract(t *testing.T) {
	t.Run("overview is mandatory", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		if len(architectureIssueCodes(model)["missing-architecture-overview"]) != 1 {
			t.Fatalf("missing overview diagnostic not found: %#v", model.Issues)
		}
	})

	t.Run("details remain validated when overview is absent", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		writeTestFile(t, docs, "architecture/legacy.md", "# Legacy\n\nAnswer.\n")
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		codes := architectureIssueCodes(model)
		for _, code := range []string{"missing-architecture-overview", "missing-architecture-question", "unlisted-architecture-document"} {
			if len(codes[code]) != 1 {
				t.Fatalf("legacy detail must produce %s: %#v", code, model.Issues)
			}
		}
	})

	t.Run("overview type is exact", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		writeTestFile(t, docs, "architecture/overview.md", "# Architecture\n\n- Document type: Architecture\n\nMap.\n")
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		if len(architectureIssueCodes(model)["invalid-architecture-overview-type"]) != 1 {
			t.Fatalf("invalid overview type diagnostic not found: %#v", model.Issues)
		}
	})

	t.Run("detail requires a non-empty question", func(t *testing.T) {
		for _, metadata := range []string{"", "- Architecture question:\n"} {
			root := t.TempDir()
			docs := filepath.Join(root, "docs")
			writeTestFile(t, docs, "index.md", "# Project\n")
			writeArchitectureOverview(t, docs, "[Detail](detail.md)")
			writeTestFile(t, docs, "architecture/detail.md", "# Detail\n\n"+metadata+"\nAnswer.\n")
			model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
			if err != nil {
				t.Fatal(err)
			}
			if len(architectureIssueCodes(model)["missing-architecture-question"]) != 1 {
				t.Fatalf("missing question diagnostic not found for %q: %#v", metadata, model.Issues)
			}
		}
	})

	t.Run("question does not require punctuation", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		writeArchitectureOverview(t, docs, "[Detail](nested/detail.md)")
		writeTestFile(t, docs, "architecture/nested/detail.md", "# Detail\n\n- Architecture question: Runtime responsibility split\n\nAnswer.\n")
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		codes := architectureIssueCodes(model)
		for _, code := range []string{"missing-architecture-question", "unlisted-architecture-document"} {
			if len(codes[code]) != 0 {
				t.Fatalf("valid recursive detail produced %s: %#v", code, codes[code])
			}
		}
	})

	t.Run("overview map must link every detail directly", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		writeArchitectureOverview(t, docs, "[First](first.md)")
		writeTestFile(t, docs, "architecture/first.md", "# First\n\n- Architecture question: First boundary\n\n[Second](nested/second.md)\n")
		writeTestFile(t, docs, "architecture/nested/second.md", "# Second\n\n- Architecture question: Second boundary\n\nAnswer.\n")
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		issues := architectureIssueCodes(model)["unlisted-architecture-document"]
		if len(issues) != 1 || issues[0].DocumentPath != "architecture/nested/second.md" {
			t.Fatalf("transitively linked detail must be unlisted: %#v", issues)
		}
	})

	t.Run("architecture link diagnostics are errors", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		writeArchitectureOverview(t, docs, "[Detail](detail.md)\n\n[Missing](missing.md)")
		writeTestFile(t, docs, "architecture/detail.md", "# Detail\n\n- Architecture question: Trust boundary\n\n[Blocked](/etc/passwd)\n")
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		codes := architectureIssueCodes(model)
		for _, code := range []string{"broken-link", "blocked-link"} {
			if len(codes[code]) != 1 || codes[code][0].Severity != "error" {
				t.Fatalf("%s must be one architecture error: %#v", code, codes[code])
			}
		}
	})

	t.Run("optional architecture IDs keep global uniqueness", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n")
		writeTestFile(t, docs, "architecture/overview.md", `# Architecture

- Document type: Architecture Overview
- Identifier: ARCH-SHARED

System map.

[Detail](detail.md)
`)
		writeTestFile(t, docs, "architecture/detail.md", `# Detail

- Document type: Architecture
- Architecture question: Runtime boundary
- Identifier: ARCH-SHARED

Answer.
`)
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		issues := architectureIssueCodes(model)["duplicate-id"]
		if len(issues) != 1 || issues[0].Severity != "error" {
			t.Fatalf("optional architecture ID must retain duplicate-id behavior: %#v", issues)
		}
	})
}

func TestArchitectureSchemaContract(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Project\n")
	writeArchitectureOverview(t, docs, "")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	report := BuildReport(model)
	if report.SchemaVersion != 1 {
		t.Fatalf("schema version=%d", report.SchemaVersion)
	}
	for _, document := range report.Documents {
		if document.SourcePath == "architecture/overview.md" {
			if document.Type != "architecture" {
				t.Fatalf("overview type=%q", document.Type)
			}
			if document.Metadata["documentType"] != "Architecture Overview" {
				t.Fatalf("overview metadata=%#v", document.Metadata)
			}
			return
		}
	}
	t.Fatal("architecture overview missing from report")
}

func TestModelAndStatistics(t *testing.T) {
	_, docs, _ := createFixture(t)
	model := buildFixture(t, docs)
	if model.Project.Title != "Test Project" || model.Stats.Documents != 8 || model.Stats.TotalTasks != 2 || model.Stats.CompletedTasks != 1 || len(model.Risks) != 1 || len(model.RoadmapStages) != 1 || model.Stats.BrokenLinks != 0 {
		t.Fatalf("unexpected model: %#v %#v", model.Project, model.Stats)
	}
	module := model.DocByPath["modules/auth.md"]
	useCase := model.DocByPath["use-cases/login.md"]
	if len(module.LinkedUseCases) != 1 || module.LinkedUseCases[0] != useCase || len(useCase.LinkedModules) != 1 || useCase.LinkedModules[0] != module {
		t.Fatalf("links failed")
	}
}

func TestNotesAndIdeasAreUnvalidatedFreeFormDocuments(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n\nОписание.\n")
	writeTestFile(t, docs, "notes.md", `# Заметки

## Наблюдения

- Первый пункт с **выделением**
  - Вложенный пункт
`)
	writeTestFile(t, docs, "ideas.md", `- Статус: неизвестная идея
- Обновлено: 2000-01-01

## Возможности

1. Первый план.
2. Второй план.
`)

	model, err := BuildDocumentationModel(Options{
		InputDirectory: docs,
		RepositoryRoot: root,
		StaleDays:      1,
		Now:            time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	if model.DocByPath["notes.md"].Type != "notes" || model.DocByPath["ideas.md"].Type != "ideas" {
		t.Fatalf("unexpected free-form types: notes=%q ideas=%q", model.DocByPath["notes.md"].Type, model.DocByPath["ideas.md"].Type)
	}
	for _, issue := range model.Issues {
		if issue.DocumentPath == "notes.md" || issue.DocumentPath == "ideas.md" {
			t.Fatalf("free-form documents must not produce validation issues: %#v", issue)
		}
	}

	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	notesHTML, err := os.ReadFile(filepath.Join(output, "notes.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{"Заметки", "Наблюдения", "<ul>", "<strong>выделением</strong>", "Вложенный пункт"} {
		if !strings.Contains(string(notesHTML), fragment) {
			t.Fatalf("notes page does not contain %q", fragment)
		}
	}
	ideasHTML, err := os.ReadFile(filepath.Join(output, "ideas.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(ideasHTML), "<ol>") || !strings.Contains(string(ideasHTML), "Идеи развития") {
		t.Fatal("ideas page must render ordered plans and its document type")
	}
}

func TestMermaidFlowModelAndRelationships(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n\nОписание.\n")
	writeTestFile(t, docs, "modules/auth.md", `# Авторизация

- Идентификатор: MOD-AUTH
- Статус: В работе

Модуль авторизации.
`)
	writeTestFile(t, docs, "use-cases/login.md", `# UC-AUTH-01: Вход

- Идентификатор: UC-AUTH-01
- Статус: В работе
- Модуль: MOD-AUTH

Пользователь входит.
`)
	writeTestFile(t, docs, "flows/login.md", `# FLOW-AUTH-LOGIN: Вход

- Идентификатор: FLOW-AUTH-LOGIN
- Сценарий: UC-AUTH-01
- Модуль: MOD-AUTH

Процесс входа.

## Процесс

`+"```mermaid"+`
sequenceDiagram
    User->>Web: Login
    Web->>API: Authenticate
    API-->>Web: Session
    Web-->>User: Dashboard
`+"```"+`
`)
	writeTestFile(t, docs, "architecture/services.md", `# Взаимодействие сервисов

- Идентификатор: ADR-SERVICES

Архитектурное взаимодействие.

`+"```mermaid"+`
sequenceDiagram
    Web->>API: Login
`+"```"+`
`)
	writeTestFile(t, docs, "flows/services.md", `# FLOW-SERVICES: Вызов API

- Идентификатор: FLOW-SERVICES

Архитектурный процесс.

`+"```mermaid"+`
sequenceDiagram
    Web->>API: Login
`+"```"+`

[Архитектура](../architecture/services.md)
`)

	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	flow := model.DocByPath["flows/login.md"]
	if flow == nil || flow.Type != "flow" {
		t.Fatalf("flow document was not classified: %#v", flow)
	}
	for _, issue := range model.Issues {
		if strings.Contains(issue.Code, "mermaid") || strings.Contains(issue.Code, "flow") || issue.Code == "dangling-use-case-reference" || issue.Code == "dangling-module-reference" {
			t.Fatalf("valid Mermaid model produced issue: %#v", issue)
		}
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	flowHTML, err := os.ReadFile(filepath.Join(output, "flows", "FLOW-AUTH-LOGIN.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{
		`data-mermaid-stage`, `data-mermaid-diagram`, `data-mermaid-zoom-out`,
		`data-mermaid-fit`, `data-mermaid-zoom-in`, `data-mermaid-fullscreen`,
		`UC-AUTH-01`, `../use-cases/UC-AUTH-01.html`,
	} {
		if !strings.Contains(string(flowHTML), part) {
			t.Fatalf("flow Mermaid page missing %q: %s", part, flowHTML)
		}
	}
	if _, err := os.Stat(filepath.Join(output, "flows", "login.html")); !os.IsNotExist(err) {
		t.Fatalf("source-filename URL must not be generated when a stable FLOW ID exists: %v", err)
	}
	processHTML, err := os.ReadFile(filepath.Join(output, "processes", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"UC-AUTH-01", "FLOW-AUTH-LOGIN", "FLOW-SERVICES"} {
		if !strings.Contains(string(processHTML), expected) {
			t.Fatalf("aggregate processes catalog missing %q", expected)
		}
	}
}

func TestKnowledgeFlowsLinkMultipleUseCasesInBothDirections(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n")
	for _, id := range []string{"UC-AUTH-01", "UC-AUTH-02"} {
		writeTestFile(t, docs, "use-cases/"+id+".md", "# "+id+": Сценарий\n\n- Идентификатор: "+id+"\n- Статус: В работе\n")
	}
	writeTestFile(t, docs, "flows/FLOW-AUTH-LOGIN.md", `# FLOW-AUTH-LOGIN: Общий процесс

- Идентификатор: FLOW-AUTH-LOGIN
- Сценарий: UC-AUTH-01, UC-AUTH-02

`+"```mermaid"+`
flowchart TD
    Start --> Finish
`+"```"+`
`)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(model.Knowledge.Flows) != 1 {
		t.Fatalf("flows=%#v", model.Knowledge.Flows)
	}
	if got := strings.Join(model.Knowledge.Flows[0].UseCaseIDs, ","); got != "UC-AUTH-01,UC-AUTH-02" {
		t.Fatalf("flow use cases=%q", got)
	}
	for _, useCase := range model.Knowledge.UseCases {
		if got := strings.Join(useCase.FlowIDs, ","); got != "FLOW-AUTH-LOGIN" {
			t.Fatalf("%s flow IDs=%q", useCase.ID, got)
		}
	}
}

func TestMermaidContractErrors(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n\nОписание.\n")
	writeTestFile(t, docs, "flows/missing.md", `# Процесс без схемы

- Идентификатор: FLOW-MISSING
`)
	writeTestFile(t, docs, "guides/unlinked.md", `# Непривязанная схема

Описание.

`+"```mermaid"+`
sequenceDiagram
    A->>B: Test
`+"```"+`
`)
	writeTestFile(t, docs, "work/TASK-FLOW-001.md", `# TASK-FLOW-001: Проверить процесс

- Статус: Черновик
- Тип: Research
- Процесс: FLOW-UNKNOWN

## Результат

Проверка выполнена.
`)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	codes := map[string]bool{}
	for _, issue := range model.Issues {
		codes[issue.Code] = true
	}
	for _, code := range []string{"missing-flow-diagram", "unlinked-mermaid-diagram", "dangling-flow-reference"} {
		if !codes[code] {
			t.Fatalf("missing %s in %#v", code, model.Issues)
		}
	}
	if codes["sequence-diagram-outside-architecture"] {
		t.Fatalf("removed sequence diagram diagnostic returned in %#v", model.Issues)
	}
}

func TestCanonicalOutputPathsRequireSafeStableIDs(t *testing.T) {
	model := &Model{Documents: []*Document{
		{Type: "use-case", Metadata: map[string]string{"id": "UC-AUTH-01"}, OutputPath: "use-cases/login.html"},
		{Type: "flow", Metadata: map[string]string{"id": "FLOW-../ESCAPE"}, OutputPath: "flows/unsafe.html"},
		{Type: "screen", Metadata: map[string]string{"id": "SC-AUTH/LOGIN"}, OutputPath: "screens/unsafe.html"},
	}}
	assignUniqueOutputPaths(model)
	if got := model.Documents[0].OutputPath; got != "use-cases/UC-AUTH-01.html" {
		t.Fatalf("canonical output=%q", got)
	}
	if got := model.Documents[1].OutputPath; got != "flows/unsafe.html" {
		t.Fatalf("unsafe FLOW ID changed output path to %q", got)
	}
	if got := model.Documents[2].OutputPath; got != "screens/unsafe.html" {
		t.Fatalf("unsafe screen ID changed output path to %q", got)
	}
}

func TestTaskContextIncludesReferencedFlow(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "flows/login.md", `# FLOW-AUTH-LOGIN: Вход

- Идентификатор: FLOW-AUTH-LOGIN
- Сценарий: UC-AUTH-01

Процесс входа.

`+"```mermaid"+`
flowchart TD
    Login --> Dashboard
`+"```"+`
`)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	task := strings.Replace(taskVerifyFixture("Готово к работе", false, commands, ""), "- Сценарий: UC-AUTH-01", "- Сценарий: UC-AUTH-01\n- Процесс: FLOW-AUTH-LOGIN", 1)
	writeTestFile(t, docs, "work/TASK-AUTH-020-flow.md", task)
	model := buildFixture(t, docs)
	report, err := BuildTaskContext(model, "TASK-AUTH-020")
	if err != nil {
		t.Fatal(err)
	}
	if report.Task.FlowID != "FLOW-AUTH-LOGIN" {
		t.Fatalf("flow ID missing from task: %#v", report.Task)
	}
	found := false
	for _, document := range report.Documents {
		if document.Path == "flows/login.md" {
			found = true
		}
	}
	if !found {
		t.Fatalf("flow missing from task context: %#v", report.Documents)
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
	for _, name := range []string{"index.html", "health.html", "report.json", "assets/style.css", "assets/app.js", "assets/search-index.js", "modules/auth.html", "modules/index.html", "processes/index.html", "use-cases/UC-AUTH-01.html", "use-cases/index.html", "flows/index.html"} {
		if _, err := os.Stat(filepath.Join(output, filepath.FromSlash(name))); err != nil {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(output, "use-cases", "login.html")); !os.IsNotExist(err) {
		t.Fatalf("source-filename URL must not be generated when a stable UC ID exists: %v", err)
	}
	htmlBytes, _ := os.ReadFile(filepath.Join(output, "modules/auth.html"))
	html := string(htmlBytes)
	for _, part := range []string{"Готовность документа", "../use-cases/UC-AUTH-01.html", `class="metadata-grid"`, "<dt>Статус</dt>", `class="document-toolbar task-toolbar"`, `role="group"`, `class="toolbar-button"`, `data-task-filter="open"`, `class="collapse-all-button"`, `data-collapse-label`} {
		if !strings.Contains(html, part) {
			t.Fatalf("missing %s", part)
		}
	}
	if strings.Contains(html, "<script>alert") {
		t.Fatal("unsafe")
	}
	dashboardBytes, _ := os.ReadFile(filepath.Join(output, "index.html"))
	if !strings.Contains(string(dashboardBytes), `data-filter-control="type"`) {
		t.Fatal("dashboard must offer a type filter for its mixed document collection")
	}
	directoryBytes, _ := os.ReadFile(filepath.Join(output, "modules/index.html"))
	directoryHTML := string(directoryBytes)
	if strings.Contains(directoryHTML, `data-filter-control="type"`) {
		t.Fatal("typed directory must not offer a redundant type filter")
	}
	if strings.Contains(directoryHTML, `data-filter-control="search"`) {
		t.Fatal("single-document directory must not offer redundant collection filters")
	}
	reportBytes, _ := os.ReadFile(filepath.Join(output, "report.json"))
	var report ProjectReport
	if err := json.Unmarshal(reportBytes, &report); err != nil {
		t.Fatal(err)
	}
	if report.SchemaVersion != 1 || report.Documents == nil || report.Issues == nil || report.Screens == nil || report.Transitions == nil || report.PlayableFlows == nil || report.Hotspots == nil || report.Traceability == nil || report.CurrentStatus.ActiveWork == nil || report.CurrentStatus.Blockers == nil {
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

func TestDocumentContextCopyMarkupAndAssets(t *testing.T) {
	root, docs, _ := createFixture(t)
	model := buildFixture(t, docs)
	module := model.DocByPath["modules/auth.md"]
	useCase := model.DocByPath["use-cases/login.md"]

	moduleHTML := renderDocumentPage(model, module)
	for _, part := range []string{
		`data-copy-document-context`,
		`data-document-context-title="Авторизация"`,
		`data-document-context-path="docs/modules/auth.md"`,
		`data-copy-document-context-label`,
		`Копировать контекст`,
	} {
		if !strings.Contains(moduleHTML, part) {
			t.Fatalf("document context markup missing %q", part)
		}
	}
	if !strings.Contains(renderUseCasePage(model, useCase), `data-document-context-path="docs/use-cases/login.md"`) {
		t.Fatal("canonical use-case page must expose its source document context")
	}
	if !strings.Contains(renderDashboard(model), `data-document-context-path="docs/index.md"`) {
		t.Fatal("dashboard must expose the root index document context")
	}

	for name, html := range map[string]string{
		"directory":    renderDirectoryPage(model, "modules"),
		"processes":    renderProcessCatalogPage(model, "processes/index.html", "flow"),
		"health":       renderHealthPage(model),
		"traceability": renderTraceabilityPage(model, "traceability.html"),
	} {
		if strings.Contains(html, `data-copy-document-context`) {
			t.Fatalf("%s page must not expose synthetic document context", name)
		}
	}

	model.RepositoryRoot = filepath.Join(root, "unrelated")
	fallbackHTML := renderDocumentPage(model, module)
	if !strings.Contains(fallbackHTML, `data-document-context-path="modules/auth.md"`) ||
		strings.Contains(fallbackHTML, module.AbsolutePath) {
		t.Fatal("context outside repository root must use SourcePath without exposing an absolute path")
	}

	appScript, err := EmbeddedFiles.ReadFile("assets/app.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{
		"initializeDocumentContextCopy",
		"navigator.clipboard?.writeText",
		"document.execCommand('copy')",
		"Документ: ${title}\\nПуть: ${path}",
		"Не удалось скопировать",
	} {
		if !strings.Contains(string(appScript), part) {
			t.Fatalf("document context browser behavior missing %q", part)
		}
	}
	style, err := EmbeddedFiles.ReadFile("assets/style.css")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(style), `.document-context-button`) {
		t.Fatal("document context button styles are missing")
	}
}

func TestGenerateMermaidSiteAssetsAndMarkup(t *testing.T) {
	_, docs, output := createFixture(t)
	useCasePath := filepath.Join(docs, "use-cases", "login.md")
	file, err := os.OpenFile(useCasePath, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = file.WriteString("\n## Схема\n\n```mermaid\nflowchart TD\n    Login --> Dashboard\n```\n")
	_ = file.Close()

	model := buildFixture(t, docs)
	if _, err := GenerateSite(model, Options{OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"assets/mermaid.tiny.js", "assets/mermaid.LICENSE.txt"} {
		if _, err := os.Stat(filepath.Join(output, filepath.FromSlash(name))); err != nil {
			t.Fatalf("missing embedded Mermaid asset %s: %v", name, err)
		}
	}
	htmlBytes, err := os.ReadFile(filepath.Join(output, "use-cases", "UC-AUTH-01.html"))
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)
	for _, part := range []string{`data-mermaid-diagram`, `class="mermaid-source"`, `../assets/mermaid.tiny.js`, "Показать исходный код"} {
		if !strings.Contains(html, part) {
			t.Fatalf("Mermaid page missing %q: %s", part, html)
		}
	}
	if strings.Contains(html, `data-mermaid-stage`) {
		t.Fatalf("non-flow Mermaid page must keep the static diagram layout: %s", html)
	}
	if strings.Contains(html, `type="module"`) || strings.Contains(html, "cdn.") {
		t.Fatalf("Mermaid page must be file:// compatible and offline: %s", html)
	}
	if strings.Index(html, "assets/mermaid.tiny.js") > strings.Index(html, "assets/app.js") {
		t.Fatal("Mermaid bundle must execute before app.js")
	}
	indexBytes, _ := os.ReadFile(filepath.Join(output, "index.html"))
	if strings.Contains(string(indexBytes), "assets/mermaid.tiny.js") {
		t.Fatal("pages without diagrams must not load Mermaid")
	}
}

func TestDocumentationAssetCannotReplaceMermaidLicense(t *testing.T) {
	root, docs, output := createFixture(t)
	writeTestFile(t, docs, "assets/mermaid.LICENSE.txt", "untrusted")
	indexPath := filepath.Join(docs, "index.md")
	index, err := os.OpenFile(indexPath, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = index.WriteString("\n[Лицензия](assets/mermaid.LICENSE.txt)\n")
	_ = index.Close()
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	link := model.DocByPath["index.md"].ResolvedLinks[len(model.DocByPath["index.md"].ResolvedLinks)-1]
	if link.AssetPath != "_files/assets/mermaid.LICENSE.txt" {
		t.Fatalf("reserved Mermaid license path was not isolated: %#v", link)
	}
	if _, err := GenerateSite(model, Options{OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	embedded, _ := os.ReadFile(filepath.Join(output, "assets", "mermaid.LICENSE.txt"))
	copied, _ := os.ReadFile(filepath.Join(output, "_files", "assets", "mermaid.LICENSE.txt"))
	if strings.TrimSpace(string(copied)) != "untrusted" || strings.TrimSpace(string(embedded)) == "untrusted" {
		t.Fatal("documentation asset replaced embedded Mermaid license")
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
	if _, _, _, err := ParseArguments([]string{"refresh"}); err == nil || !strings.Contains(err.Error(), "неизвестная команда") {
		t.Fatalf("refresh must be rejected as an unknown command, got %v", err)
	}
	if _, _, _, err := ParseArguments([]string{"./docs", "--force"}); err == nil || !strings.Contains(err.Error(), "неизвестный параметр") {
		t.Fatalf("--force must be rejected as an unknown option, got %v", err)
	}
	noMap, _, _, err := ParseArguments([]string{"build", "./docs", "--no-screen-map"})
	if err != nil || !noMap.NoScreenMap {
		t.Fatalf("--no-screen-map not parsed: %#v, %v", noMap, err)
	}
	if _, _, _, err := ParseArguments([]string{"build", "./docs", "--screen-map", "--no-screen-map"}); err == nil {
		t.Fatal("conflicting screen map options must be rejected")
	}
	if _, _, _, err := ParseArguments([]string{"check", "./docs", "--no-screen-map"}); err == nil {
		t.Fatal("screen map build option must be rejected by check")
	}
}

func TestTaskVerifyCLIArguments(t *testing.T) {
	options, _, _, err := ParseArguments([]string{
		"task", "verify", "TASK-AUTH-014", "./docs", "--run",
		"--repository-root", ".", "--format", "json", "--report", "./task-report.json", "--timeout", "45s",
	})
	if err != nil {
		t.Fatal(err)
	}
	if options.Command != "task-verify" || options.TaskID != "TASK-AUTH-014" || options.Format != "json" || options.Timeout != 45*time.Second || !filepath.IsAbs(options.ReportPath) {
		t.Fatalf("options: %#v", options)
	}
	if _, _, _, err := ParseArguments([]string{"check", "./docs", "--timeout", "1s"}); err == nil {
		t.Fatal("--timeout must be rejected outside task verify")
	}
	if _, _, _, err := ParseArguments([]string{"task", "verify", "TASK-AUTH-014", "./docs", "--run", "--report", "./docs/report.json"}); err == nil {
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
		"task", "verify", "TASK-AUTH-014", docs, "--run", "--report", filepath.Join(alias, "report.json"),
	}); err == nil {
		t.Fatal("--report must not overwrite source documentation through a symlink")
	}
}

func TestKnowledgeModel(t *testing.T) {
	_, docs, _ := createFixture(t)
	content := "# TASK-AUTH-001: Защитить вход\n\n" +
		"- Статус: В работе\n- Тип: Feature\n- Приоритет: Высокий\n- Модуль: MOD-AUTH\n- Сценарий: UC-AUTH-01\n\n" +
		"## Результат\n\nВход проверяет ограничения.\n\n" +
		"## Изменение поведения\n\n### Было\n\nВход не учитывал ограничение.\n\n### Станет\n\nВход учитывает ограничение.\n\n" +
		"## Область изменения\n\n- `docs/`\n\n" +
		"## Не входит в задачу\n\nПрофиль.\n\n" +
		"## Критерии приёмки\n\n- [x] `AC-01` Неверный пароль отклоняется.\n\n" +
		"## План\n\n1. Проверить поток.\n2. Изменить реализацию.\n3. Запустить тесты и обновить документацию.\n\n" +
		"## Проверка\n\n- `AC-01` → `go test ./...`\n- `ALL` → `go test ./...`\n- `DOCS` → `go test ./...`\n\n" +
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
- [ ] Чекбокс вне критериев и плана.

## Область изменения

- ` + "`missing/path.go`" + `
- ` + "`../outside.go`" + `

## Не входит в задачу

Прочее.

## Критерии приёмки

- [x] ` + "`AC-01`" + ` Первый критерий.
- [ ] ` + "`AC-01`" + ` Повтор критерия.

## План

- [ ] Чекбокс в плане.
- [x] Завершённый шаг в плане.

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

func TestWorkItemPlanChecklistAllowed(t *testing.T) {
	_, docs, _ := createFixture(t)
	content := strings.Replace(
		taskVerifyFixture("Готово к работе", false, map[string]string{
			"AC-01": "go test ./...",
			"AC-02": "go test ./...",
			"ALL":   "go test ./...",
			"DOCS":  "go run ./cmd/docgent check ./docs --strict",
		}, ""),
		"## План\n\n1. Подготовить команды.\n2. Выполнить проверки.\n3. Сформировать отчёт и обновить документацию.",
		"## План\n\n- [x] Выполненный шаг.\n- [ ] Следующий шаг.",
		1,
	)
	writeTestFile(t, docs, "work/TASK-AUTH-020-plan-checklist.md", content)
	model := buildFixture(t, docs)
	for _, issue := range model.Issues {
		if issue.DocumentPath == "work/TASK-AUTH-020-plan-checklist.md" && issue.Code == "task-checkbox-outside-criteria" {
			t.Fatalf("plan checklist must be allowed: %#v", issue)
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
	task := taskVerifyFixture("Заблокировано", false, commands, "\n## Блокер\n\nОжидается решение ADR-014.\n")
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
	writeArchitectureOverview(t, docs, "")
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
	for _, absent := range []string{"Дорожная карта", "Вычисляемое состояние", "Открытые риски", "metric-label\">Модули"} {
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
