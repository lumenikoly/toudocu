package docudocu

import (
	"encoding/json"
	"fmt"
	"strings"
)

type screenMapPayload struct {
	Screens     []KnowledgeScreen  `json:"screens"`
	Transitions []ScreenTransition `json:"transitions"`
	Flows       []PlayableFlow     `json:"flows"`
	Hotspots    []Hotspot          `json:"hotspots"`
	Modules     map[string]string  `json:"modules"`
	ScreenURLs  map[string]string  `json:"screenUrls"`
	FlowURLs    map[string]string  `json:"flowUrls"`
}

func screenMapData(model *Model, current string) screenMapPayload {
	modules := map[string]string{}
	for _, module := range model.Knowledge.Modules {
		modules[module.ID] = module.Title
	}
	screenURLs := map[string]string{}
	for _, screen := range model.Knowledge.Screens {
		if document := model.DocByPath[screen.Document]; document != nil {
			screenURLs[screen.ID] = relativeURL(current, document.OutputPath)
		}
	}
	flowURLs := map[string]string{}
	for _, flow := range model.Knowledge.PlayableFlows {
		if useCase := findUseCase(model, flow.UseCaseID); useCase != nil {
			if document := model.DocByPath[useCase.Document]; document != nil {
				flowURLs[flow.UseCaseID] = relativeURL(current, document.OutputPath) + "#play"
			}
		}
	}
	screens := make([]KnowledgeScreen, len(model.Knowledge.Screens))
	copy(screens, model.Knowledge.Screens)
	for index := range screens {
		if screens[index].Preview != "" {
			screens[index].Preview = relativeURL(current, screens[index].Preview)
		}
		screens[index].States = append([]ScreenState{}, screens[index].States...)
		for stateIndex := range screens[index].States {
			if screens[index].States[stateIndex].Preview != "" {
				screens[index].States[stateIndex].Preview = relativeURL(current, screens[index].States[stateIndex].Preview)
			}
		}
	}
	return screenMapPayload{
		Screens: screens, Transitions: model.Knowledge.Transitions,
		Flows: model.Knowledge.PlayableFlows, Hotspots: model.Knowledge.Hotspots,
		Modules: modules, ScreenURLs: screenURLs, FlowURLs: flowURLs,
	}
}

func jsonScript(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func screenModuleOptions(model *Model) string {
	var options strings.Builder
	seen := map[string]bool{}
	for _, screen := range model.Knowledge.Screens {
		if seen[screen.ModuleID] {
			continue
		}
		seen[screen.ModuleID] = true
		label := screen.ModuleID
		for _, module := range model.Knowledge.Modules {
			if module.ID == screen.ModuleID && module.Title != "" {
				label += " · " + module.Title
				break
			}
		}
		options.WriteString(`<option value="` + escapeAttr(screen.ModuleID) + `">` + escapeHTML(label) + `</option>`)
	}
	return options.String()
}

func screenStatusOptions(model *Model) string {
	seen := map[string]string{}
	var options strings.Builder
	for _, screen := range model.Knowledge.Screens {
		if _, exists := seen[screen.Status.Kind]; exists {
			continue
		}
		seen[screen.Status.Kind] = screen.Status.Label
		options.WriteString(`<option value="` + escapeAttr(screen.Status.Kind) + `">` + escapeHTML(screen.Status.Label) + `</option>`)
	}
	return options.String()
}

func screenUseCaseOptions(model *Model, selectedValues ...string) string {
	selected := ""
	if len(selectedValues) > 0 {
		selected = selectedValues[0]
	}
	var options strings.Builder
	for _, flow := range model.Knowledge.PlayableFlows {
		title := flow.UseCaseID
		for _, useCase := range model.Knowledge.UseCases {
			if useCase.ID == flow.UseCaseID {
				title += " · " + screenTitleForUseCase(useCase)
				break
			}
		}
		selectedAttribute := ""
		if flow.UseCaseID == selected {
			selectedAttribute = ` selected`
		}
		options.WriteString(`<option value="` + escapeAttr(flow.UseCaseID) + `"` + selectedAttribute + `>` + escapeHTML(title) + `</option>`)
	}
	return options.String()
}

func screenTitleForUseCase(useCase KnowledgeUseCase) string {
	for _, separator := range []string{":", "—"} {
		if strings.HasPrefix(useCase.Title, useCase.ID+separator) {
			return strings.TrimSpace(strings.TrimPrefix(useCase.Title, useCase.ID+separator))
		}
	}
	return useCase.Title
}

func screenMapTarget(model *Model) string {
	if model.ScreenMapEnabled {
		return "screens/index.html"
	}
	return "screens/catalog.html"
}

func previewHTML(current string, screen KnowledgeScreen, className string) string {
	if screen.Preview == "" {
		return `<div class="screen-preview-placeholder ` + className + `"><strong>` + escapeHTML(screen.ID) + `</strong><span>Превью отсутствует</span></div>`
	}
	return `<img class="` + className + `" src="` + escapeAttr(relativeURL(current, screen.Preview)) + `" alt="Превью ` + escapeAttr(screen.Title) + `" loading="lazy">`
}

func screenCardHTML(current string, screen KnowledgeScreen) string {
	route := "Маршрут не указан"
	if screen.Route != "" {
		route = screen.Route
	}
	incoming := len(screen.IncomingTransitionIDs)
	outgoing := len(screen.OutgoingTransitionIDs)
	return `<article class="screen-node" data-screen-node="` + escapeAttr(screen.ID) + `" data-module="` + escapeAttr(screen.ModuleID) +
		`" data-status="` + escapeAttr(screen.Status.Kind) + `" tabindex="0" role="button" aria-label="` +
		escapeAttr(fmt.Sprintf("%s: %s, входящих переходов %d, исходящих %d", screen.ID, screen.Title, incoming, outgoing)) + `">` + previewHTML(current, screen, "screen-node-preview") +
		`<div class="screen-node-copy"><strong>` + escapeHTML(screen.ID) + `</strong><span>` + escapeHTML(screen.Title) +
		`</span><small>` + escapeHTML(route) + `</small><div class="screen-node-meta">` + renderStatusChip(screen.Status) +
		`<span class="screen-module-label">` + escapeHTML(screen.ModuleID) + `</span></div>` +
		`<div class="screen-node-transition-counts" aria-label="Входящих переходов ` + fmt.Sprint(incoming) + `, исходящих ` + fmt.Sprint(outgoing) + `">` +
		`<span title="Входящие переходы"><span aria-hidden="true">↙</span> ` + fmt.Sprint(incoming) + ` вход.</span>` +
		`<span title="Исходящие переходы"><span aria-hidden="true">↗</span> ` + fmt.Sprint(outgoing) + ` исх.</span></div></div></article>`
}

func blockingScreenMapIssues(model *Model) []Issue {
	result := []Issue{}
	for _, issue := range model.Issues {
		if issue.Severity == "error" && strings.HasPrefix(issue.DocumentPath, "screens/") && issue.DocumentPath != "screens/hotspots.json" {
			result = append(result, issue)
		}
	}
	return result
}

func renderScreenMapWorkspace(model *Model, current, initialUseCase string, embedded bool) string {
	var cards strings.Builder
	for _, screen := range model.Knowledge.Screens {
		cards.WriteString(screenCardHTML(current, screen))
	}
	workspaceClass := "screen-map-workspace"
	if embedded {
		workspaceClass += " is-embedded"
	}
	initialAttribute := ""
	modeControls := `<div class="screen-map-modes" role="group" aria-label="Режим карты">` +
		`<button type="button" class="toolbar-button is-active" data-map-mode="all" aria-pressed="true">Все</button>` +
		`<button type="button" class="toolbar-button" data-map-mode="module" aria-pressed="false">Модуль</button>` +
		`<button type="button" class="toolbar-button" data-map-mode="usecase" aria-pressed="false">Сценарий</button>` +
		`<button type="button" class="toolbar-button" data-map-mode="unfinished" aria-pressed="false">Незавершённые</button>` +
		`<button type="button" class="toolbar-button" data-map-mode="sitemap" aria-pressed="false">Sitemap</button></div>`
	if initialUseCase != "" {
		initialAttribute = ` data-map-initial-usecase="` + escapeAttr(initialUseCase) + `"`
		modeControls = `<div class="screen-map-modes"><span class="screen-map-fixed-mode">Сценарий <code>` + escapeHTML(initialUseCase) + `</code></span></div>`
	}
	changesControl := ""
	if model.serveRevision != "" {
		changesControl = `<button type="button" class="toolbar-button" data-map-changes aria-pressed="false">Показать изменения</button><select data-map-change-status aria-label="Статус изменения" hidden><option value="">Все изменения</option><option value="added">Добавленные</option><option value="modified">Изменённые</option><option value="removed">Удалённые</option></select>`
	}
	return `<section class="` + workspaceClass + `" data-screen-map` + initialAttribute + `>` +
		`<div class="screen-map-toolbar">` + modeControls +
		`<div class="screen-map-filters"><input type="search" data-map-search placeholder="Найти экран" aria-label="Найти экран">` +
		`<select data-map-status aria-label="Статус"><option value="">Все статусы</option>` + screenStatusOptions(model) + `</select>` +
		`<select data-map-module aria-label="Модуль" hidden><option value="">Выберите модуль</option>` + screenModuleOptions(model) + `</select>` +
		`<select data-map-usecase aria-label="Сценарий" hidden><option value="">Выберите сценарий</option>` + screenUseCaseOptions(model, initialUseCase) + `</select>` + changesControl + `</div>` +
		`<div class="screen-map-zoom" role="group" aria-label="Масштаб"><button type="button" data-map-zoom-out aria-label="Уменьшить">−</button>` +
		`<button type="button" data-map-fit>Вписать</button><button type="button" data-map-reset>Сбросить</button>` +
		`<button type="button" data-map-zoom-in aria-label="Увеличить">+</button><button type="button" data-map-fullscreen>На весь экран</button></div></div>` +
		`<div class="screen-map-shell"><div class="screen-map-stage" data-map-stage tabindex="0" aria-label="Интерактивная карта экранов">` +
		`<div class="screen-map-viewport" data-map-viewport><div class="screen-map-groups" data-map-groups></div><svg class="screen-map-edges" data-map-edges aria-hidden="true"></svg>` +
		`<div class="screen-map-nodes" data-map-nodes>` + cards.String() + `</div><div class="screen-map-labels" data-map-labels></div></div><p class="screen-map-empty" data-map-empty hidden>Нет экранов для выбранного режима.</p></div>` +
		`<aside class="screen-inspector" data-map-inspector aria-live="polite"><div class="screen-inspector-empty"><strong>Выберите экран</strong><span>Здесь появятся состояния, связи и затронутые документы.</span></div></aside></div>` +
		`<p class="screen-map-status" data-map-summary aria-live="polite"></p><script type="application/json" data-screen-map-data>` +
		jsonScript(screenMapData(model, current)) + `</script></section>`
}

func renderScreenMapPage(model *Model, current string) string {
	if issues := blockingScreenMapIssues(model); len(issues) > 0 {
		var reasons strings.Builder
		for _, issue := range issues {
			location := issue.DocumentPath
			if issue.Line > 0 {
				location += fmt.Sprintf(":%d", issue.Line)
			}
			reasons.WriteString(`<li><code>` + escapeHTML(location) + `</code> — ` + escapeHTML(issue.Message) + `</li>`)
		}
		content := breadcrumbs(model, current, "Карта экранов") +
			`<header class="page-header"><h1>Карта экранов не построена</h1><p class="page-lead">Исправьте ошибки модели экранов. Остальная документация и каталог остаются доступны.</p></header>` +
			`<section class="dashboard-section"><h2>Причины</h2><ul>` + reasons.String() + `</ul><p><a class="primary-link" href="` +
			escapeAttr(relativeURL(current, "screens/catalog.html")) + `">Открыть каталог экранов →</a></p></section>`
		return pageShell(model, current, "Карта экранов не построена", "Ошибки модели экранов", content, "")
	}
	content := breadcrumbs(model, current, "Карта экранов") +
		`<header class="page-header screen-map-header"><div class="page-kicker"><span class="badge">Screen map</span><a class="badge" href="` +
		escapeAttr(relativeURL(current, "screens/catalog.html")) + `">Каталог</a><a class="badge" href="` +
		escapeAttr(relativeURL(current, sectionCatalogOutput(SectionFlows))) + `">` + escapeHTML(modelDirectoryLabel(model, "flows")) + `</a></div><h1>Карта экранов</h1><p class="page-lead">Экраны, состояния и переходы из Markdown-модели проекта.</p></header>` +
		renderScreenMapWorkspace(model, current, "", false)
	return pageShell(model, current, "Карта экранов", "Интерактивная карта экранов", content, "")
}

func screenErrorIDs(model *Model, screenID string) []string {
	values := []string{}
	for _, transition := range model.Knowledge.Transitions {
		if transition.FromID == screenID && transition.ErrorID != "" {
			values = append(values, transition.ErrorID)
		}
	}
	return uniqueStrings(values)
}

func screenKindLabel(kind string) string {
	labels := map[string]string{
		"screen":   "Экран",
		"page":     "Страница",
		"modal":    "Модальное окно",
		"external": "Внешняя страница",
	}
	if label := labels[kind]; label != "" {
		return label
	}
	return kind
}

func screenModuleDetails(model *Model, moduleID string) string {
	title := ""
	for _, module := range model.Knowledge.Modules {
		if module.ID == moduleID {
			title = module.Title
			break
		}
	}
	result := `<code>` + escapeHTML(moduleID) + `</code>`
	if title != "" {
		result += `<span>` + escapeHTML(title) + `</span>`
	}
	return `<div class="screen-catalog-module">` + result + `</div>`
}

func screenCatalogUseCases(model *Model, current string, ids []string) string {
	if len(ids) == 0 {
		return `<span class="screen-catalog-empty-value">Не используется</span>`
	}
	var values strings.Builder
	for _, id := range ids {
		label := `<span class="screen-usecase-chip">` + escapeHTML(id) + `</span>`
		for _, useCase := range model.Knowledge.UseCases {
			if useCase.ID != id {
				continue
			}
			if document := model.DocByPath[useCase.Document]; document != nil {
				label = `<a class="screen-usecase-chip" href="` + escapeAttr(relativeURL(current, document.OutputPath)) +
					`" title="` + escapeAttr(screenTitleForUseCase(useCase)) + `">` + escapeHTML(id) + `</a>`
			}
			break
		}
		values.WriteString(label)
	}
	return `<div class="screen-catalog-usecases">` + values.String() + `</div>`
}

func screenCatalogErrors(errors []string) string {
	if len(errors) == 0 {
		return ""
	}
	var values strings.Builder
	for _, id := range errors {
		values.WriteString(`<span class="screen-error-id">` + escapeHTML(id) + `</span>`)
	}
	return `<div class="screen-catalog-errors" aria-label="Ошибки экрана">` + values.String() + `</div>`
}

func screenCatalogTransitionCounts(incoming, outgoing int) string {
	return `<div class="screen-transition-summary" aria-label="Входящих переходов ` + fmt.Sprint(incoming) +
		`, исходящих переходов ` + fmt.Sprint(outgoing) + `">` +
		`<span><span aria-hidden="true">↙</span><strong>` + fmt.Sprint(incoming) + `</strong><small>Входящие</small></span>` +
		`<span><span aria-hidden="true">↗</span><strong>` + fmt.Sprint(outgoing) + `</strong><small>Исходящие</small></span></div>`
}

func screenCatalogRows(model *Model, current string) string {
	var rows strings.Builder
	for _, screen := range model.Knowledge.Screens {
		document := model.DocByPath[screen.Document]
		title := `<strong class="screen-catalog-title">` + escapeHTML(screen.Title) + `</strong>`
		if document != nil {
			title = `<a class="screen-catalog-title" href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `">` + escapeHTML(screen.Title) + `</a>`
		}
		route := "—"
		if screen.Route != "" {
			route = `<code class="screen-catalog-route" title="` + escapeAttr(screen.Route) + `">` + escapeHTML(screen.Route) + `</code>`
		}
		errors := screenErrorIDs(model, screen.ID)
		search := strings.Join([]string{screen.ID, screen.Title, screen.ModuleID, screen.Route, strings.Join(errors, " "), strings.Join(screen.UseCaseIDs, " ")}, " ")
		fmt.Fprintf(&rows, `<tr data-filter-item data-search="%s" data-module="%s" data-status="%s" data-usecase="%s"><td><div class="screen-catalog-screen">%s<div class="screen-catalog-identity">%s<code>%s</code><span>%s</span>%s</div></div></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			escapeAttr(search), escapeAttr(screen.ModuleID), escapeAttr(screen.Status.Kind), escapeAttr(strings.Join(screen.UseCaseIDs, "|")),
			previewHTML(current, screen, "screen-catalog-preview"), title, escapeHTML(screen.ID), escapeHTML(screenKindLabel(screen.Kind)), screenCatalogErrors(errors),
			screenModuleDetails(model, screen.ModuleID), route, screenCatalogUseCases(model, current, screen.UseCaseIDs), renderStatusChip(screen.Status),
			screenCatalogTransitionCounts(len(screen.IncomingTransitionIDs), len(screen.OutgoingTransitionIDs)))
	}
	return rows.String()
}

func renderScreenCatalogPage(model *Model, current string) string {
	mapBadge := ""
	if model.ScreenMapEnabled {
		mapBadge = `<div class="page-kicker"><a class="badge" href="` + escapeAttr(relativeURL(current, "screens/index.html")) + `">← Карта</a></div>`
	}
	content := breadcrumbs(model, current, "Каталог экранов") +
		`<header class="page-header">` + mapBadge + `<h1>Каталог экранов</h1><p class="page-lead">Поиск по экрану, модулю, статусу и пользовательскому сценарию.</p></header>` +
		`<section class="dashboard-section screen-catalog" data-filter-scope aria-labelledby="screen-catalog-filters-title">` +
		`<h2 class="screen-reader-only" id="screen-catalog-filters-title">Фильтры каталога экранов</h2>` +
		`<div class="screen-catalog-filterbar">` +
		`<label class="screen-filter-field screen-filter-search"><span>Поиск</span><input type="search" data-filter-control="search" placeholder="ID, название, маршрут или ошибка"></label>` +
		`<label class="screen-filter-field"><span>Модуль</span><select data-filter-control="module"><option value="all">Все модули</option>` + screenModuleOptions(model) + `</select></label>` +
		`<label class="screen-filter-field"><span>Статус</span><select data-filter-control="status"><option value="all">Все статусы</option>` + screenStatusOptions(model) + `</select></label>` +
		`<label class="screen-filter-field"><span>Сценарий</span><select data-filter-control="usecase"><option value="all">Все сценарии</option>` + screenUseCaseOptions(model) + `</select></label>` +
		`<button class="toolbar-button screen-filter-reset" type="button" data-filter-reset>Сбросить</button></div>` +
		`<div class="screen-catalog-summary" aria-live="polite"><span>Найдено экранов: <strong data-filter-count></strong></span><span>Фильтры применяются сразу</span></div>` +
		`<div class="screen-catalog-table"><table><caption class="screen-reader-only">Экраны проекта и связанные пользовательские сценарии</caption>` +
		`<thead><tr><th scope="col">Экран</th><th scope="col">Модуль</th><th scope="col">Маршрут</th><th scope="col">Сценарии</th><th scope="col">Статус</th><th scope="col">Переходы</th></tr></thead><tbody>` +
		screenCatalogRows(model, current) + `</tbody></table></div><div class="empty-state screen-catalog-empty" data-filter-empty hidden><strong>Экраны не найдены</strong><span>Измените условия поиска или сбросьте фильтры.</span><button class="toolbar-button" type="button" data-filter-reset>Сбросить фильтры</button></div></section>`
	return pageShell(model, current, "Каталог экранов", "Каталог экранов проекта", content, "")
}

func findUseCase(model *Model, id string) *KnowledgeUseCase {
	for index := range model.Knowledge.UseCases {
		if model.Knowledge.UseCases[index].ID == id {
			return &model.Knowledge.UseCases[index]
		}
	}
	return nil
}

func renderPlayableFlowComponent(model *Model, flow PlayableFlow, current string, embedded bool) string {
	useCase := findUseCase(model, flow.UseCaseID)
	title := flow.UseCaseID
	if useCase != nil {
		title += " · " + screenTitleForUseCase(*useCase)
	}
	if !flow.Valid {
		var issues strings.Builder
		for _, code := range flow.IssueCodes {
			message := code
			for _, issue := range model.Issues {
				if issue.Code == code {
					message = issue.Message
					break
				}
			}
			issues.WriteString(`<li><code>` + escapeHTML(code) + `</code> — ` + escapeHTML(message) + `</li>`)
		}
		return `<section class="playable-unavailable"><h2>Сценарий нельзя запустить</h2><p>Исправьте ошибки экранной модели.</p><ul>` +
			issues.String() + `</ul><a href="` + escapeAttr(relativeURL(current, model.HealthOutputPath)) + `">Открыть диагностику →</a></section>`
	}
	payload := screenMapData(model, current)
	useCaseLink := ""
	mapLink := relativeURL(current, screenMapTarget(model)) + "#usecase=" + flow.UseCaseID
	if useCase != nil {
		if document := model.DocByPath[useCase.Document]; document != nil {
			useCaseTarget := relativeURL(current, document.OutputPath)
			useCaseLink = `<a class="primary-button" href="` + escapeAttr(useCaseTarget+"#overview") + `">Открыть use case</a>`
			if embedded {
				mapLink = "#map"
			}
		}
	}
	return `<section class="playable-flow" data-playable-flow><header class="playable-header"><div><span class="page-kicker">Playable flow</span><h2>` +
		escapeHTML(title) + `</h2><p>Шаг <strong data-flow-step>1</strong> · <span data-flow-history-label>Начало сценария</span></p></div>` +
		`<a class="toolbar-button" href="` + escapeAttr(mapLink) + `">Показать экраны</a></header>` +
		`<div class="playable-stage"><div class="playable-preview-wrap" data-flow-preview></div><div class="playable-copy"><div data-flow-alert></div>` +
		`<p class="screen-eyebrow" data-flow-screen-id></p><h2 data-flow-screen-title></h2><p data-flow-state></p><div class="playable-actions" data-flow-actions></div>` +
		`<div class="playable-complete" data-flow-complete hidden><strong>Сценарий завершён</strong><p>` + escapeHTML(flow.Result) +
		`</p><div class="playable-complete-actions"><button type="button" class="primary-button" data-flow-reset>Начать заново</button>` +
		`<a class="primary-button" href="` + escapeAttr(mapLink) + `">Показать карту</a>` + useCaseLink + `</div></div></div></div>` +
		`<footer class="playable-footer"><button type="button" data-flow-back disabled>← Назад</button><button type="button" data-flow-reset>Сначала</button>` +
		`<label><input type="checkbox" data-flow-show-hotspots> Показать интерактивные зоны</label></footer>` +
		`<script type="application/json" data-playable-data>` + jsonScript(struct {
		Model screenMapPayload `json:"model"`
		Flow  PlayableFlow     `json:"flow"`
	}{Model: payload, Flow: flow}) + `</script></section>`
}

func renderTraceabilityPage(model *Model, current string) string {
	var rows strings.Builder
	for _, row := range model.Knowledge.Traceability {
		search := strings.Join([]string{row.UseCaseID, row.ScreenID, row.TransitionID, row.TaskID, row.CriterionID, row.Verification}, " ")
		fmt.Fprintf(&rows, `<tr data-filter-item data-search="%s"><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td><code>%s</code></td></tr>`,
			escapeAttr(search), escapeHTML(fallbackDash(row.UseCaseID)), escapeHTML(row.ScreenID), escapeHTML(row.TransitionID),
			escapeHTML(row.TaskID), escapeHTML(row.CriterionID), escapeHTML(row.Verification))
	}
	content := breadcrumbs(model, current, "Трассируемость") +
		`<header class="page-header"><h1>Матрица трассируемости</h1><p class="page-lead">Связи сценариев, экранов, переходов, задач, критериев и проверок.</p></header>` +
		`<section class="dashboard-section" data-filter-scope><div class="collection-controls"><input type="search" data-filter-control="search" placeholder="UC, SC, TR, TASK или AC" aria-label="Поиск traceability"></div>` +
		`<div class="collection-summary">Показано: <strong data-filter-count></strong></div><div class="screen-catalog-table"><table><thead><tr><th>Use Case</th><th>Screen</th><th>Transition</th><th>Task</th><th>Criterion</th><th>Verification</th></tr></thead><tbody>` +
		rows.String() + `</tbody></table></div><div class="empty-state" data-filter-empty hidden>Связи не найдены.</div></section>`
	return pageShell(model, current, "Трассируемость", "Матрица трассируемости", content, "")
}

func renderScreenConnections(model *Model, document *Document) string {
	id := document.Metadata["id"]
	var incoming, outgoing strings.Builder
	linkScreen := func(screenID string) string {
		for _, screen := range model.Knowledge.Screens {
			if screen.ID == screenID {
				if target := model.DocByPath[screen.Document]; target != nil {
					return `<a href="` + escapeAttr(relativeURL(document.OutputPath, target.OutputPath)) + `">` + escapeHTML(screen.ID+" · "+screen.Title) + `</a>`
				}
			}
		}
		return escapeHTML(screenID)
	}
	for _, transition := range model.Knowledge.Transitions {
		label := `<code>` + escapeHTML(transition.ID) + `</code> · ` + escapeHTML(transition.Action+" · "+transition.Condition)
		if transition.ToID == id {
			incoming.WriteString(`<tr><td>` + linkScreen(transition.FromID) + `</td><td>` + label + `</td><td>` + escapeHTML(transition.Kind) + `</td></tr>`)
		}
		if transition.FromID == id {
			outgoing.WriteString(`<tr><td>` + label + `</td><td>` + linkScreen(transition.ToID) + `</td><td>` + escapeHTML(transition.Kind) + `</td></tr>`)
		}
	}
	table := func(headers, body string) string {
		if body == "" {
			return `<p class="empty-state">Переходов нет.</p>`
		}
		return `<div class="data-table"><table><thead><tr>` + headers + `</tr></thead><tbody>` + body + `</tbody></table></div>`
	}
	return `<section class="dashboard-section screen-connections"><div class="section-heading"><div><h2>Вычисленные связи</h2><p>Переходы извлечены из документов исходных экранов.</p></div>` +
		`<a href="` + escapeAttr(relativeURL(document.OutputPath, screenMapTarget(model))+"#screen="+id) + `">Открыть в каталоге →</a></div>` +
		`<h3>Входящие</h3>` + table(`<th>Откуда</th><th>Переход</th><th>Тип</th>`, incoming.String()) +
		`<h3>Исходящие</h3>` + table(`<th>Переход</th><th>Куда</th><th>Тип</th>`, outgoing.String()) + `</section>`
}
