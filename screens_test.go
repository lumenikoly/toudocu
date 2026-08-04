package docgent

import (
	"encoding/json"
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
	writeTestFile(t, docs, "modules/auth.md", "# MOD-AUTH: Авторизация\n\n- Идентификатор: MOD-AUTH\n- Статус: В работе\n\nМодуль авторизации.\n")
	writeTestFile(t, docs, "modules/account.md", "# MOD-ACCOUNT: Аккаунт\n\n- Идентификатор: MOD-ACCOUNT\n- Статус: Запланировано\n\nЛичный кабинет.\n")
	writeTestFile(t, docs, "contracts/auth.md", `# CON-AUTH: Ошибки входа

- Идентификатор: CON-AUTH
- Статус: Готово

## Ошибки

| ID | Сообщение |
|---|---|
| INVALID_CREDENTIALS | Неверный email или пароль. |
`)
	writeTestFile(t, docs, "use-cases/login.md", `# UC-AUTH-01: Вход

- Идентификатор: UC-AUTH-01
- Статус: В работе
- Модуль: MOD-AUTH
- Начальный экран: SC-PUBLIC-HOME
- Конечные экраны: SC-ACCOUNT-DASHBOARD
- Разрешить цикл: Да
- Экраны: SC-PUBLIC-HOME, SC-AUTH-LOGIN, SC-AUTH-HELP, SC-ACCOUNT-DASHBOARD

Пользователь входит.

## Основной сценарий

1. Пользователь открывает вход и продолжает.

## Постусловия

Пользователь вошёл в систему.

## Бизнес-правила

Правила входа.

## Реализация

Модуль авторизации.
`)
	writeTestFile(t, docs, "screens/SC-PUBLIC-HOME.md", `# SC-PUBLIC-HOME: Главная

- Идентификатор: SC-PUBLIC-HOME
- Тип: Страница
- Модуль: MOD-AUTH
- Статус: Реализован
- Маршрут: /

## Переходы

| ID | Сценарий | Действие | Условие | Результат |
|---|---|---|---|---|
| TR-AUTH-001 | UC-AUTH-01 | Войти | Всегда | SC-AUTH-LOGIN |
`)
	writeTestFile(t, docs, "screens/SC-AUTH-LOGIN.md", `# SC-AUTH-LOGIN: Вход

- Идентификатор: SC-AUTH-LOGIN
- Тип: Экран
- Модуль: MOD-AUTH
- Статус: В работе
- Маршрут: /login
- Родительский экран: SC-PUBLIC-HOME

## Состояния

| ID | Название | Превью |
|---|---|---|
| DEFAULT | Исходное состояние | — |
| INVALID-CREDENTIALS | Неверные данные | — |

## Переходы

| ID | Сценарий | Действие | Условие | Результат | Состояние | Ошибка | Сообщение | Тип |
|---|---|---|---|---|---|---|---|---|
| TR-AUTH-002 | UC-AUTH-01 | Продолжить | Успех | SC-ACCOUNT-DASHBOARD | DEFAULT | — | — | redirect |
| TR-AUTH-003 | UC-AUTH-01 | Продолжить | Неверные данные | SC-AUTH-LOGIN | INVALID-CREDENTIALS | INVALID_CREDENTIALS | — | error |
| TR-AUTH-004 | UC-AUTH-01 | Открыть помощь | Всегда | SC-AUTH-HELP | DEFAULT | — | — | navigation |
`)
	writeTestFile(t, docs, "screens/SC-AUTH-HELP.md", `# SC-AUTH-HELP: Помощь

- Идентификатор: SC-AUTH-HELP
- Тип: Модальное окно
- Модуль: MOD-AUTH
- Статус: В работе
- Родительский экран: SC-AUTH-LOGIN

## Переходы

| ID | Сценарий | Действие | Условие | Результат | Тип |
|---|---|---|---|---|---|
| TR-AUTH-005 | UC-AUTH-01 | Закрыть | Всегда | SC-AUTH-LOGIN | return |
`)
	writeTestFile(t, docs, "screens/SC-ACCOUNT-DASHBOARD.md", `# SC-ACCOUNT-DASHBOARD: Обзор

- Идентификатор: SC-ACCOUNT-DASHBOARD
- Тип: Страница
- Модуль: MOD-ACCOUNT
- Статус: Запланировано
- Маршрут: /account
- Родительский экран: SC-PUBLIC-HOME

Экран результата.
`)
	return root, docs
}

func navigationFolderHTML(t *testing.T, page, key string) string {
	t.Helper()
	marker := `data-nav-folder="` + key + `"`
	start := strings.Index(page, marker)
	if start < 0 {
		t.Fatalf("navigation folder %q is missing", key)
	}
	end := strings.Index(page[start:], `</ul></li>`)
	if end < 0 {
		t.Fatalf("navigation folder %q is not closed", key)
	}
	return page[start : start+end+len(`</ul></li>`)]
}

func screenIssueCodes(model *Model) map[string]bool {
	result := map[string]bool{}
	for _, issue := range model.Issues {
		result[issue.Code] = true
	}
	return result
}

func TestScreenKnowledgeAndPlayableFlow(t *testing.T) {
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
		if issue.Severity == "error" {
			t.Fatalf("valid screen model produced issue: %#v", issue)
		}
	}
	if len(model.Knowledge.Screens) != 4 || len(model.Knowledge.Transitions) != 5 || len(model.Knowledge.PlayableFlows) != 1 {
		t.Fatalf("unexpected screen knowledge: %#v", model.Knowledge)
	}
	flow := model.Knowledge.PlayableFlows[0]
	if !flow.Valid || flow.StartScreenID != "SC-PUBLIC-HOME" || len(flow.ReachableScreens) != 4 || len(flow.TransitionIDs) != 5 {
		t.Fatalf("unexpected playable flow: %#v", flow)
	}
	var login KnowledgeScreen
	for _, screen := range model.Knowledge.Screens {
		if screen.ID == "SC-AUTH-LOGIN" {
			login = screen
		}
	}
	if len(login.States) != 2 || len(login.IncomingTransitionIDs) != 3 || len(login.OutgoingTransitionIDs) != 3 {
		t.Fatalf("screen states or relationships missing: %#v", login)
	}
	context, err := BuildTaskContext(model, "TASK-AUTH-099")
	if err != nil {
		t.Fatal(err)
	}
	if len(context.Screens) != 1 || len(context.ScreenTransitions) != 5 {
		t.Fatalf("task context must include incident transitions: %#v", context)
	}
}

func TestScreenValidationAndHotspots(t *testing.T) {
	root, docs := createScreenFixture(t)
	writeTestFile(t, docs, "screens/hotspots.json", `{
  "SC-AUTH-LOGIN": [
    {"transition":"TR-AUTH-002","x":31.5,"y":59.2,"width":37,"height":8.4},
    {"transition":"TR-UNKNOWN-999","x":99,"y":99,"width":4,"height":4}
  ]
}`)
	writeTestFile(t, docs, "screens/SC-AUTH-DUPLICATE.md", `# SC-AUTH-LOGIN: Duplicate

- Идентификатор: SC-AUTH-LOGIN
- Тип: Bad
- Модуль: MOD-UNKNOWN
- Статус: Unknown
- Маршрут: /login
`)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	codes := screenIssueCodes(model)
	for _, code := range []string{
		"duplicate-screen-id", "invalid-screen-kind", "invalid-screen-status",
		"duplicate-screen-route", "dangling-module-reference", "unknown-hotspot-transition",
		"invalid-hotspot-bounds",
	} {
		if !codes[code] {
			t.Fatalf("missing issue %s in %#v", code, model.Issues)
		}
	}
	if len(model.Knowledge.Hotspots) != 1 {
		t.Fatalf("only valid hotspot should survive: %#v", model.Knowledge.Hotspots)
	}
	page := renderScreenMapPage(model, "screens/index.html")
	if !strings.Contains(page, "Карта экранов не построена") || !strings.Contains(page, "Экран SC-AUTH-LOGIN уже объявлен") {
		t.Fatalf("blocking map diagnostics missing: %s", page)
	}
}

func TestLegacyScreenMapIsRejected(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Project\n\nDescription.\n")
	writeTestFile(t, docs, "screens/map.md", "# Legacy map\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if !screenIssueCodes(model)["legacy-screen-map-not-supported"] {
		t.Fatalf("legacy map migration error missing: %#v", model.Issues)
	}
}

func TestScreenPreviewSafetyAndCopy(t *testing.T) {
	root, docs := createScreenFixture(t)
	loginPath := filepath.Join(docs, "screens", "SC-AUTH-LOGIN.md")
	original, err := os.ReadFile(loginPath)
	if err != nil {
		t.Fatal(err)
	}
	withPreview := func(value string) {
		content := strings.Replace(string(original), "- Маршрут: /login", "- Маршрут: /login\n- Превью: `"+value+"`", 1)
		writeTestFile(t, docs, "screens/SC-AUTH-LOGIN.md", content)
	}

	withPreview("../../../outside.png")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if !screenIssueCodes(model)["unsafe-screen-preview"] {
		t.Fatalf("preview traversal must be rejected: %#v", model.Issues)
	}

	writeTestFile(t, docs, "assets/login.svg", "<svg/>")
	withPreview("../assets/login.svg")
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if !screenIssueCodes(model)["unsafe-screen-preview-format"] {
		t.Fatalf("active SVG preview must be rejected: %#v", model.Issues)
	}

	writeTestFile(t, docs, "assets/login.webp", "fixture")
	withPreview("../assets/login.webp")
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if screenIssueCodes(model)["unsafe-screen-preview"] || screenIssueCodes(model)["unsafe-screen-preview-format"] {
		t.Fatalf("safe raster preview must be accepted: %#v", model.Issues)
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{InputDirectory: docs, OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(output, "assets", "login.webp")); err != nil {
		t.Fatalf("preview was not copied: %v", err)
	}
}

func TestScreenTraceabilityFromWorkItem(t *testing.T) {
	root, docs := createScreenFixture(t)
	writeTestFile(t, docs, "work/TASK-AUTH-100-login.md", `# TASK-AUTH-100: Проверить успешный вход

- Статус: Черновик
- Тип: Research
- Экраны: SC-AUTH-LOGIN, SC-ACCOUNT-DASHBOARD
- Переходы: TR-AUTH-002

## Критерии приёмки

- [ ] AC-01 Успешный вход открывает SC-ACCOUNT-DASHBOARD.

## Проверка

- AC-01 → TR-AUTH-002 → TestSuccessfulLogin
`)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(model.Knowledge.Traceability) != 1 {
		t.Fatalf("unexpected traceability rows: %#v", model.Knowledge.Traceability)
	}
	row := model.Knowledge.Traceability[0]
	if row.UseCaseID != "UC-AUTH-01" || row.ScreenID != "SC-AUTH-LOGIN" || row.TransitionID != "TR-AUTH-002" ||
		row.TaskID != "TASK-AUTH-100" || row.CriterionID != "AC-01" || row.Verification != "TestSuccessfulLogin" {
		t.Fatalf("unexpected traceability row: %#v", row)
	}
}

func TestScreensOnAllPathsIncludesBranchesAndCycles(t *testing.T) {
	screens := []KnowledgeScreen{{ID: "SC-A-A"}, {ID: "SC-A-B"}, {ID: "SC-A-C"}, {ID: "SC-A-D"}, {ID: "SC-A-OFF"}}
	transitions := []ScreenTransition{
		{FromID: "SC-A-A", ToID: "SC-A-B"}, {FromID: "SC-A-A", ToID: "SC-A-C"},
		{FromID: "SC-A-B", ToID: "SC-A-C"}, {FromID: "SC-A-C", ToID: "SC-A-B"},
		{FromID: "SC-A-B", ToID: "SC-A-D"}, {FromID: "SC-A-C", ToID: "SC-A-D"},
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
}

func TestScreenPortalAndReportV1(t *testing.T) {
	root, docs := createScreenFixture(t)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{InputDirectory: docs, OutputDirectory: output}); err != nil {
		t.Fatal(err)
	}
	for file, expected := range map[string]string{
		"screens/index.html":        `data-screen-map`,
		"screens/catalog.html":      `Каталог экранов`,
		"processes/index.html":      `Все процессы`,
		"use-cases/index.html":      `Пользовательские сценарии`,
		"use-cases/UC-AUTH-01.html": `data-playable-flow`,
		"flows/index.html":          `Визуальные процессы`,
		"traceability.html":         `Traceability Matrix`,
		"assets/screen-map.js":      `computeVisible`,
		"assets/playable-flow.js":   `function activate`,
	} {
		data, err := os.ReadFile(filepath.Join(output, filepath.FromSlash(file)))
		if err != nil || !strings.Contains(string(data), expected) {
			t.Fatalf("%s missing %q: %v", file, expected, err)
		}
	}
	catalogData, err := os.ReadFile(filepath.Join(output, "screens", "catalog.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		`class="screen-catalog-filterbar"`,
		`<span>Сценарий</span>`,
		`data-filter-reset`,
		`class="screen-catalog-screen"`,
		`<small>Входящие</small>`,
		`<small>Исходящие</small>`,
	} {
		if !strings.Contains(string(catalogData), expected) {
			t.Fatalf("screen catalog missing %q", expected)
		}
	}
	mapData, err := os.ReadFile(filepath.Join(output, "screens", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(mapData), "3 вход.") || !strings.Contains(string(mapData), "3 исх.") {
		t.Fatalf("screen cards must expose incoming and outgoing transition counts: %s", mapData)
	}
	flowData, err := os.ReadFile(filepath.Join(output, "use-cases", "UC-AUTH-01.html"))
	if err != nil {
		t.Fatal(err)
	}
	useCasePage := string(flowData)
	for _, expected := range []string{
		`data-usecase-tabs`,
		`href="#overview"`,
		`href="#map"`,
		`href="#play"`,
		`href="#links"`,
		`data-map-initial-usecase="UC-AUTH-01"`,
		`data-playable-flow`,
		`Открыть use case`,
		`data-nav-folder="use-cases"`,
		`data-nav-folder="processes"`,
		`Все процессы`,
		`Пользовательские сценарии`,
		`Визуальные процессы`,
		`Расположение в коде`,
	} {
		if !strings.Contains(useCasePage, expected) {
			t.Fatalf("use case workspace missing %q", expected)
		}
	}
	if strings.Contains(useCasePage, ">Playable flows<") || strings.Contains(useCasePage, ">User flows<") {
		t.Fatal("playable and user-flow navigation must not be separate sections")
	}
	useCaseNavigation := navigationFolderHTML(t, useCasePage, "use-cases")
	processNavigation := navigationFolderHTML(t, useCasePage, "processes")
	if !strings.Contains(useCaseNavigation, `nav-folder-link is-active`) {
		t.Fatal("use case page must activate the top-level user-scenarios section")
	}
	if strings.Contains(processNavigation, `nav-folder-link is-active`) {
		t.Fatal("use case page must not activate the aggregate processes section")
	}
	if strings.Contains(processNavigation, `UC-AUTH-01`) {
		t.Fatal("individual use cases must not be duplicated inside the processes navigation tree")
	}
	if strings.Index(useCasePage, `data-nav-folder="use-cases"`) > strings.Index(useCasePage, `data-nav-folder="processes"`) {
		t.Fatal("user scenarios must appear above processes in the primary navigation")
	}
	processData, err := os.ReadFile(filepath.Join(output, "processes", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	processPage := string(processData)
	if !strings.Contains(navigationFolderHTML(t, processPage, "processes"), `nav-folder-link is-active`) {
		t.Fatal("aggregate catalog must activate the processes section")
	}
	if strings.Contains(navigationFolderHTML(t, processPage, "use-cases"), `nav-folder-link is-active`) {
		t.Fatal("aggregate catalog must not activate the user-scenarios section")
	}
	if !strings.Contains(processPage, `UC-AUTH-01`) {
		t.Fatal("aggregate processes catalog must retain user scenarios")
	}
	useCaseCatalogData, err := os.ReadFile(filepath.Join(output, "use-cases", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(useCaseCatalogData), `../processes/index.html`) || !strings.Contains(string(useCaseCatalogData), `>Все процессы</a>`) {
		t.Fatal("user-scenarios catalog must link to the aggregate processes catalog")
	}
	if _, err := os.Stat(filepath.Join(output, "flows", "UC-AUTH-01.html")); !os.IsNotExist(err) {
		t.Fatalf("legacy duplicate playable page must not be generated: %v", err)
	}
	mapScript, err := os.ReadFile(filepath.Join(output, "assets", "screen-map.js"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"edge.type === 'return'",
		"screen-edge-external-outer",
		"screen-edge-external-inner",
		"MODULE_COLUMN_GAP = 144",
		"MODULE_ROW_GAP = 112",
		"function normalEdgeGeometry",
		"function measureVisibleCards",
	} {
		if !strings.Contains(string(mapScript), expected) {
			t.Fatalf("screen map script missing visual transition contract %q", expected)
		}
	}
	playableScript, err := os.ReadFile(filepath.Join(output, "assets", "playable-flow.js"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(playableScript), "button.classList.toggle('is-visible'") || strings.Contains(string(playableScript), "button.hidden =") {
		t.Fatal("hotspots must remain interactive while visually hidden and reveal on hover")
	}
	appScript, err := os.ReadFile(filepath.Join(output, "assets", "app.js"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{".split('|').map(normalize).includes(value)", "resetButtons.forEach", "initializeUseCaseTabs", "history.pushState"} {
		if !strings.Contains(string(appScript), expected) {
			t.Fatalf("collection filters missing %q", expected)
		}
	}
	styleData, err := os.ReadFile(filepath.Join(output, "assets", "style.css"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{".screen-catalog-filterbar", ".screen-catalog-preview", ".screen-transition-summary"} {
		if !strings.Contains(string(styleData), expected) {
			t.Fatalf("screen catalog stylesheet missing %q", expected)
		}
	}
	reportData, err := os.ReadFile(filepath.Join(output, "report.json"))
	if err != nil {
		t.Fatal(err)
	}
	var report ProjectReport
	if err := json.Unmarshal(reportData, &report); err != nil {
		t.Fatal(err)
	}
	if report.SchemaVersion != 1 || len(report.Screens) != 4 || len(report.Transitions) != 5 || len(report.PlayableFlows) != 1 {
		t.Fatalf("unexpected report v1: %#v", report)
	}
	if strings.Contains(string(reportData), `"screenTransitions"`) {
		t.Fatal("report v1 must not duplicate legacy screenTransitions")
	}
}

func TestScreenCatalogUsesUnambiguousUseCaseValues(t *testing.T) {
	root, docs := createScreenFixture(t)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	model.Knowledge.Screens[0].UseCaseIDs = []string{"UC-AUTH-01", "UC-AUTH-02"}
	rows := screenCatalogRows(model, "screens/catalog.html")
	if !strings.Contains(rows, `data-usecase="UC-AUTH-01|UC-AUTH-02"`) {
		t.Fatalf("use case filter values must preserve complete IDs: %s", rows)
	}
}

func TestNoScreenMapStillBuildsCatalogAndReport(t *testing.T) {
	root, docs := createScreenFixture(t)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(root, "site")
	if _, err := GenerateSite(model, Options{InputDirectory: docs, OutputDirectory: output, NoScreenMap: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(output, "screens", "index.html")); !os.IsNotExist(err) {
		t.Fatalf("screen map must not be generated: %v", err)
	}
	for _, name := range []string{"screens/catalog.html", "processes/index.html", "use-cases/UC-AUTH-01.html", "report.json"} {
		if _, err := os.Stat(filepath.Join(output, filepath.FromSlash(name))); err != nil {
			t.Fatalf("%s must still be generated: %v", name, err)
		}
	}
}
