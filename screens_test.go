package docgent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func createScreenFixture(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n\nОписание проекта.\n")
	writeTestFile(t, docs, "modules/auth.md", `# Авторизация

- Идентификатор: MOD-AUTH
- Статус: В работе

Модуль авторизации.
`)
	writeTestFile(t, docs, "modules/account.md", `# Аккаунт

- Идентификатор: MOD-ACCOUNT
- Статус: Запланировано

Личный кабинет.
`)
	writeTestFile(t, docs, "use-cases/login.md", `# UC-AUTH-01: Вход

- Идентификатор: UC-AUTH-01
- Статус: В работе
- Модуль: MOD-AUTH
- Экраны: SC-PUBLIC-HOME, SC-AUTH-LOGIN, SC-ACCOUNT-DASHBOARD

Пользователь входит.
`)
	writeTestFile(t, docs, "screens/map.md", `# Карта экранов

Основная навигация продукта.

## Каталог экранов

| ID | Экран | Модуль | Тип | Роль | Маршрут | Статус | Ошибки |
|---|---|---|---|---|---|---|---|
| SC-PUBLIC-HOME | Главная | MOD-AUTH | page | entry | / | Готово | — |
| SC-AUTH-LOGIN | Вход | MOD-AUTH | page | normal | /login | В работе | ERR-AUTH-INVALID |
| SC-AUTH-HELP | Помощь | MOD-AUTH | modal | normal | — | В работе | — |
| SC-ACCOUNT-DASHBOARD | Обзор | MOD-ACCOUNT | page | terminal | /account | Запланировано | — |

## Переходы

| Из | Действие | Условие | В | Тип |
|---|---|---|---|---|
| SC-PUBLIC-HOME | Войти | — | SC-AUTH-LOGIN | navigation |
| SC-AUTH-LOGIN | Открыть помощь | — | SC-AUTH-HELP | navigation |
| SC-AUTH-HELP | Закрыть | — | SC-AUTH-LOGIN | navigation |
| SC-AUTH-LOGIN | Продолжить | Данные корректны | SC-ACCOUNT-DASHBOARD | redirect |
`)
	writeTestFile(t, docs, "screens/SC-AUTH-LOGIN.md", `# SC-AUTH-LOGIN: Вход

- Идентификатор: SC-AUTH-LOGIN
- Модуль: MOD-AUTH
- Статус: В работе
- Маршрут: /login
- Компонент: web/pages/login/

Позволяет пользователю войти.
`)
	return root, docs
}

func screenIssueCodes(model *Model) map[string]bool {
	result := map[string]bool{}
	for _, issue := range model.Issues {
		result[issue.Code] = true
	}
	return result
}

func TestScreenKnowledgeAndRelationships(t *testing.T) {
	root, docs := createScreenFixture(t)
	writeTestFile(t, docs, "work/TASK-AUTH-099-screen.md", `# TASK-AUTH-099: Проверить вход

- Статус: Черновик
- Тип: Research
- Экраны: SC-AUTH-LOGIN

## Результат

Переход входа исследован.
`)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	for _, issue := range model.Issues {
		if issue.Severity == "error" && (strings.Contains(issue.Code, "screen") || issue.Code == "dangling-module-reference") {
			t.Fatalf("valid screen model produced issue: %#v", issue)
		}
	}
	if len(model.Knowledge.Screens) != 4 || len(model.Knowledge.Transitions) != 4 {
		t.Fatalf("unexpected screen knowledge: %#v", model.Knowledge)
	}
	if model.Stats.Screens != 4 || model.Stats.ScreensDone != 1 || model.Stats.ScreensInProgress != 2 || model.Stats.ScreensPlanned != 1 || model.Stats.ScreensUnreachable != 0 {
		t.Fatalf("unexpected screen stats: %#v", model.Stats)
	}
	login := model.Knowledge.Screens[1]
	if login.Document != "screens/SC-AUTH-LOGIN.md" || len(login.UseCaseIDs) != 1 || len(login.WorkItemIDs) != 1 {
		t.Fatalf("screen relationships missing: %#v", login)
	}
	var authScreens int
	for _, module := range model.Knowledge.Modules {
		if module.ID == "MOD-AUTH" {
			authScreens = len(module.ScreenIDs)
		}
	}
	if authScreens != 3 || len(model.Knowledge.UseCases[0].ScreenIDs) != 3 {
		t.Fatalf("module/use-case screen relationships missing: %#v", model.Knowledge)
	}
	context, err := BuildTaskContext(model, "TASK-AUTH-099")
	if err != nil {
		t.Fatal(err)
	}
	if len(context.Screens) != 1 || len(context.ScreenTransitions) != 4 {
		t.Fatalf("task context must include the selected screen and incident transitions: %#v", context)
	}
	foundMap := false
	for _, document := range context.Documents {
		foundMap = foundMap || document.Path == "screens/map.md"
	}
	if !foundMap {
		t.Fatal("task context must include screens/map.md")
	}
}

func TestScreenMapValidation(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n\nОписание.\n")
	writeTestFile(t, docs, "modules/auth.md", "# Auth\n\n- Идентификатор: MOD-AUTH\n- Статус: В работе\n\nОписание.\n")
	writeTestFile(t, docs, "screens/map.md", `# Карта

## Screen catalog

| ID | Screen | Module | Type | Role | Route | Status | Errors |
|---|---|---|---|---|---|---|---|
| SC-AUTH-LOGIN | Login | MOD-UNKNOWN | bad | bad | /same | Unknown | BAD |
| SC-AUTH-LOGIN | Duplicate | MOD-AUTH | page | normal | /same | Planned | — |
| SC-AUTH-LOST | Lost | MOD-AUTH | page | normal | — | Planned | — |

## Transitions

| From | Action | Condition | To | Type |
|---|---|---|---|---|
| SC-AUTH-LOGIN | Continue | — | SC-UNKNOWN-PAGE | bad |
`)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	codes := screenIssueCodes(model)
	for _, code := range []string{
		"duplicate-screen-id", "invalid-screen-kind", "invalid-screen-role",
		"invalid-screen-error-id", "unknown-screen-status", "duplicate-screen-route",
		"dangling-screen-reference", "invalid-screen-transition-kind",
		"missing-entry-screen", "isolated-screen", "dangling-module-reference",
	} {
		if !codes[code] {
			t.Fatalf("missing issue %s in %#v", code, model.Issues)
		}
	}
}

func TestScreenMapIsRequiredByScreenContracts(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Проект\n\nОписание.\n")
	writeTestFile(t, docs, "screens/SC-AUTH-LOGIN.md", "# Login\n\n- Идентификатор: SC-AUTH-LOGIN\n\nОписание.\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if !screenIssueCodes(model)["missing-screen-map"] {
		t.Fatalf("missing-screen-map not reported: %#v", model.Issues)
	}
}

func TestScreenDocumentAndTableContracts(t *testing.T) {
	t.Run("document consistency", func(t *testing.T) {
		root, docs := createScreenFixture(t)
		writeTestFile(t, docs, "screens/duplicate.md", `# Duplicate

- Идентификатор: SC-AUTH-LOGIN
- Модуль: MOD-ACCOUNT
- Статус: Готово
- Маршрут: /other

Duplicate screen document.
`)
		writeTestFile(t, docs, "screens/unknown.md", `# Unknown

- Идентификатор: SC-AUTH-UNKNOWN

Unknown screen document.
`)
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		codes := screenIssueCodes(model)
		for _, code := range []string{"duplicate-screen-document", "screen-document-not-in-catalog", "screen-document-mismatch"} {
			if !codes[code] {
				t.Fatalf("missing issue %s in %#v", code, model.Issues)
			}
		}
	})

	t.Run("missing table columns", func(t *testing.T) {
		root := t.TempDir()
		docs := filepath.Join(root, "docs")
		writeTestFile(t, docs, "index.md", "# Project\n\nDescription.\n")
		writeTestFile(t, docs, "screens/map.md", `# Map

## Screen catalog

| ID | Screen |
|---|---|
| SC-AREA-HOME | Home |
`)
		model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
		if err != nil {
			t.Fatal(err)
		}
		codes := screenIssueCodes(model)
		for _, code := range []string{"invalid-screen-table-columns", "missing-screen-transitions"} {
			if !codes[code] {
				t.Fatalf("missing issue %s in %#v", code, model.Issues)
			}
		}
	})
}

func TestScreensOnAllPathsIncludesBranchesAndCycles(t *testing.T) {
	screens := []KnowledgeScreen{{ID: "SC-A-A"}, {ID: "SC-A-B"}, {ID: "SC-A-C"}, {ID: "SC-A-D"}, {ID: "SC-A-OFF"}}
	transitions := []ScreenTransition{
		{FromID: "SC-A-A", ToID: "SC-A-B"},
		{FromID: "SC-A-A", ToID: "SC-A-C"},
		{FromID: "SC-A-B", ToID: "SC-A-C"},
		{FromID: "SC-A-C", ToID: "SC-A-B"},
		{FromID: "SC-A-B", ToID: "SC-A-D"},
		{FromID: "SC-A-C", ToID: "SC-A-D"},
		{FromID: "SC-A-A", ToID: "SC-A-OFF"},
	}
	result := screensOnPaths(screens, transitions, "SC-A-A", "SC-A-D")
	for _, id := range []string{"SC-A-A", "SC-A-B", "SC-A-C", "SC-A-D"} {
		if !result[id] {
			t.Fatalf("%s missing from all-path subgraph: %#v", id, result)
		}
	}
	if result["SC-A-OFF"] {
		t.Fatalf("dead branch must not be included: %#v", result)
	}
	if found := screensOnPaths(screens, transitions, "SC-A-D", "SC-A-A"); len(found) != 0 {
		t.Fatalf("unreachable destination must produce an empty subgraph: %#v", found)
	}
}

func TestScreenPortal(t *testing.T) {
	root, docs := createScreenFixture(t)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{InputDirectory: docs, OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	mapHTML, err := os.ReadFile(filepath.Join(output, "screens", "map.html"))
	if err != nil {
		t.Fatal(err)
	}
	html := string(mapHTML)
	for _, part := range []string{
		`data-screen-map`, `data-screen-mode="all"`, `data-screen-mode="module"`,
		`data-screen-mode="unfinished"`, `data-screen-mode="path"`, `data-screen-map-data`,
		`data-screen-fullscreen`, `data-filter-control="route"`, `SC-AUTH-LOGIN`,
		`subgraph module`, `assets/mermaid.tiny.js`,
	} {
		if !strings.Contains(html, part) {
			t.Fatalf("screen portal missing %q", part)
		}
	}
	if _, err := os.Stat(filepath.Join(output, "screens", "index.html")); !os.IsNotExist(err) {
		t.Fatal("screens/map.html must be the section entry instead of a duplicate screens/index.html")
	}
	screenHTML, err := os.ReadFile(filepath.Join(output, "screens", "SC-AUTH-LOGIN.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{"Вычислено из центральной карты экранов", "SC-PUBLIC-HOME", "SC-ACCOUNT-DASHBOARD"} {
		if !strings.Contains(string(screenHTML), part) {
			t.Fatalf("screen document missing computed relationship %q", part)
		}
	}
	reportJSON, err := os.ReadFile(filepath.Join(output, "report.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{`"screens": 4`, `"screenTransitions"`, `"screenIds"`} {
		if !strings.Contains(string(reportJSON), part) {
			t.Fatalf("report.json missing additive screen contract %q", part)
		}
	}
}
