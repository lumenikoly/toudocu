package docgent

import (
	"encoding/json"
	"fmt"
	"strings"
)

type screenMapPayload struct {
	Screens     []KnowledgeScreen  `json:"screens"`
	Transitions []ScreenTransition `json:"transitions"`
	Modules     map[string]string  `json:"modules"`
}

func mermaidScreenText(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "<", "&lt;")
	value = strings.ReplaceAll(value, ">", "&gt;")
	return value
}

func screenNodeIDs(screens []KnowledgeScreen) map[string]string {
	result := map[string]string{}
	for index, screen := range screens {
		result[screen.ID] = fmt.Sprintf("n%d", index)
	}
	return result
}

func renderScreenMermaid(model *Model, visible map[string]bool, selected string) string {
	nodeIDs := screenNodeIDs(model.Knowledge.Screens)
	moduleTitles := map[string]string{}
	for _, module := range model.Knowledge.Modules {
		moduleTitles[module.ID] = module.Title
	}
	grouped := map[string][]KnowledgeScreen{}
	moduleOrder := []string{}
	for _, screen := range model.Knowledge.Screens {
		if visible != nil && !visible[screen.ID] {
			continue
		}
		if _, exists := grouped[screen.ModuleID]; !exists {
			moduleOrder = append(moduleOrder, screen.ModuleID)
		}
		grouped[screen.ModuleID] = append(grouped[screen.ModuleID], screen)
	}
	var source strings.Builder
	source.WriteString("flowchart LR\n")
	for moduleIndex, moduleID := range moduleOrder {
		label := moduleID
		if title := moduleTitles[moduleID]; title != "" {
			label += " · " + title
		}
		fmt.Fprintf(&source, "    subgraph module%d[\"%s\"]\n", moduleIndex, mermaidScreenText(label))
		source.WriteString("        direction LR\n")
		for _, screen := range grouped[moduleID] {
			nodeID := nodeIDs[screen.ID]
			label := mermaidScreenText(screen.ID) + "<br/>" + mermaidScreenText(screen.Title)
			if screen.Kind == "modal" {
				fmt.Fprintf(&source, "        %s(\"%s\")\n", nodeID, label)
			} else {
				fmt.Fprintf(&source, "        %s[\"%s\"]\n", nodeID, label)
			}
		}
		source.WriteString("    end\n")
	}
	for _, transition := range model.Knowledge.Transitions {
		if visible != nil && (!visible[transition.FromID] || !visible[transition.ToID]) {
			continue
		}
		label := transition.Action
		if transition.Condition != "" {
			label += " · " + transition.Condition
		}
		arrow := "-->"
		if transition.Kind == "redirect" {
			arrow = "-.->"
		}
		fmt.Fprintf(&source, "    %s %s|\"%s\"| %s\n", nodeIDs[transition.FromID], arrow, mermaidScreenText(label), nodeIDs[transition.ToID])
	}
	for _, screen := range model.Knowledge.Screens {
		if visible != nil && !visible[screen.ID] {
			continue
		}
		classes := []string{"screenNode", "node-" + nodeIDs[screen.ID]}
		switch screen.Status.Kind {
		case "done":
			classes = append(classes, "screenDone")
		case "in-progress":
			classes = append(classes, "screenProgress")
		case "planned":
			classes = append(classes, "screenPlanned")
		}
		if screen.ID == selected {
			classes = append(classes, "screenSelected")
		}
		for _, className := range classes {
			fmt.Fprintf(&source, "    class %s %s\n", nodeIDs[screen.ID], className)
		}
	}
	source.WriteString("    classDef screenNode stroke-width:1.5px\n")
	source.WriteString("    classDef screenDone stroke:#23825f\n")
	source.WriteString("    classDef screenProgress stroke:#b97816\n")
	source.WriteString("    classDef screenPlanned stroke:#65758b\n")
	source.WriteString("    classDef screenSelected stroke:#1665d8,stroke-width:4px\n")
	return source.String()
}

func screenMapJSON(model *Model) string {
	modules := map[string]string{}
	for _, module := range model.Knowledge.Modules {
		modules[module.ID] = module.Title
	}
	data, err := json.Marshal(screenMapPayload{Screens: model.Knowledge.Screens, Transitions: model.Knowledge.Transitions, Modules: modules})
	if err != nil {
		return `{"screens":[],"transitions":[],"modules":{}}`
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
	order := []string{}
	for _, screen := range model.Knowledge.Screens {
		if _, exists := seen[screen.Status.Kind]; exists {
			continue
		}
		seen[screen.Status.Kind] = screen.Status.Label
		order = append(order, screen.Status.Kind)
	}
	var options strings.Builder
	for _, kind := range order {
		options.WriteString(`<option value="` + escapeAttr(kind) + `">` + escapeHTML(seen[kind]) + `</option>`)
	}
	return options.String()
}

func screenUseCaseOptions(model *Model) string {
	var options strings.Builder
	for _, useCase := range model.Knowledge.UseCases {
		if len(useCase.ScreenIDs) == 0 {
			continue
		}
		options.WriteString(`<option value="` + escapeAttr(useCase.ID) + `">` + escapeHTML(useCase.ID+" · "+useCase.Title) + `</option>`)
	}
	return options.String()
}

func screenCatalogRows(model *Model, current string) string {
	var rows strings.Builder
	for _, screen := range model.Knowledge.Screens {
		title := escapeHTML(screen.Title)
		if screen.Document != "" {
			if document := model.DocByPath[screen.Document]; document != nil {
				title = `<a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `">` + title + `</a>`
			}
		}
		route := "—"
		if screen.Route != "" {
			route = `<code>` + escapeHTML(screen.Route) + `</code>`
		}
		errors := "—"
		if len(screen.ErrorIDs) > 0 {
			var values strings.Builder
			for _, errorID := range screen.ErrorIDs {
				values.WriteString(`<span class="screen-error-id">` + escapeHTML(errorID) + `</span>`)
			}
			errors = values.String()
		}
		documented, documentLabel := "no", "Нет"
		if screen.Document != "" {
			documented, documentLabel = "yes", "Да"
		}
		useCases := strings.Join(screen.UseCaseIDs, " ")
		search := strings.Join([]string{screen.ID, screen.Title, screen.ModuleID, screen.Route, strings.Join(screen.ErrorIDs, " "), useCases}, " ")
		fmt.Fprintf(&rows, `<tr id="screen-%s" data-filter-item data-screen-row="%s" data-search="%s" data-route="%s" data-module="%s" data-status="%s" data-usecase="%s" data-errors="%s" data-docs="%s"><td><button class="screen-id-button" type="button" data-screen-select="%s">%s</button></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			escapeAttr(slugify(screen.ID)), escapeAttr(screen.ID), escapeAttr(search), escapeAttr(screen.Route), escapeAttr(screen.ModuleID),
			escapeAttr(screen.Status.Kind), escapeAttr(useCases), map[bool]string{true: "yes", false: "no"}[len(screen.ErrorIDs) > 0],
			documented, escapeAttr(screen.ID), escapeHTML(screen.ID), title, escapeHTML(screen.ModuleID), route,
			renderStatusChip(screen.Status), errors, documentLabel,
		)
	}
	return rows.String()
}

func renderScreenMapPage(model *Model, document *Document) string {
	current := document.OutputPath
	initialSource := renderScreenMermaid(model, nil, "")
	moduleOptions := screenModuleOptions(model)
	var screenOptions strings.Builder
	for _, screen := range model.Knowledge.Screens {
		screenOptions.WriteString(`<option value="` + escapeAttr(screen.ID) + `">` + escapeHTML(screen.ID+" · "+screen.Title) + `</option>`)
	}
	issues := ""
	if len(document.Warnings)+len(document.Errors) > 0 {
		issues = fmt.Sprintf(`<a class="badge" href="%s">Замечания: %d</a>`, escapeAttr(relativeURL(current, model.HealthOutputPath)), len(document.Warnings)+len(document.Errors))
	}
	content := breadcrumbs(model, current, "Экраны") +
		`<header class="page-header screen-map-header"><div class="page-kicker"><span class="badge">Карта продукта</span>` + issues + `</div><h1>Экраны</h1><p class="page-lead">Навигация продукта, состояния реализации и связи со сценариями.</p></header>` +
		`<section class="metric-grid screen-metrics">` +
		metricCard("Экранов", model.Stats.Screens, "в каталоге") +
		metricCard("Реализовано", model.Stats.ScreensDone, "статус готово") +
		metricCard("В работе", model.Stats.ScreensInProgress, "активная реализация") +
		metricCard("Запланировано", model.Stats.ScreensPlanned, "следующие экраны") +
		metricCard("Недостижимых", model.Stats.ScreensUnreachable, "от начальных экранов") + `</section>` +
		`<section class="screen-map-workspace" data-screen-map>` +
		`<div class="screen-map-heading"><div><h2>Карта</h2><p>Выберите режим, исследуйте связи и откройте подробности экрана.</p></div>` +
		`<div class="screen-map-modes" role="group" aria-label="Режим карты">` +
		`<button type="button" class="toolbar-button is-active" data-screen-mode="all" aria-pressed="true">Все</button>` +
		`<button type="button" class="toolbar-button" data-screen-mode="module" aria-pressed="false">По модулю</button>` +
		`<button type="button" class="toolbar-button" data-screen-mode="unfinished" aria-pressed="false">Незавершённые</button>` +
		`<button type="button" class="toolbar-button" data-screen-mode="path" aria-pressed="false">Путь</button></div></div>` +
		`<div class="screen-map-context">` +
		`<label data-screen-module-control hidden><span>Модуль</span><select data-screen-module>` + moduleOptions + `</select></label>` +
		`<div class="screen-path-controls" data-screen-path-controls hidden><label><span>Откуда</span><select data-screen-path-from><option value="">Выберите экран</option>` + screenOptions.String() + `</select></label><span aria-hidden="true">→</span><label><span>Куда</span><select data-screen-path-to><option value="">Выберите экран</option>` + screenOptions.String() + `</select></label></div>` +
		`<p class="screen-map-message" data-screen-map-message aria-live="polite"></p></div>` +
		`<div class="screen-map-stage" data-screen-map-stage>` +
		`<div class="screen-map-tools" role="group" aria-label="Масштаб карты"><button type="button" data-screen-zoom-out aria-label="Уменьшить">−</button><button type="button" data-screen-fit>Вписать</button><button type="button" data-screen-zoom-in aria-label="Увеличить">+</button><button type="button" data-screen-fullscreen>На весь экран</button></div>` +
		`<figure class="mermaid-diagram" data-mermaid-container data-screen-map-diagram><pre class="mermaid" data-mermaid-diagram aria-label="Карта экранов">` + escapeHTML(initialSource) + `</pre><p class="mermaid-error" data-mermaid-error role="alert" hidden>Не удалось отобразить карту экранов.</p><details class="mermaid-source"><summary>Показать исходный код</summary><div class="code-block"><span class="code-language">mermaid</span><pre><code class="language-mermaid">` + escapeHTML(initialSource) + `</code></pre></div></details></figure></div>` +
		`<script type="application/json" data-screen-map-data>` + screenMapJSON(model) + `</script></section>` +
		`<section class="dashboard-section screen-catalog" data-filter-scope><div class="section-heading"><div><h2>Каталог</h2><p>Поиск по ID, названию, маршруту, ошибкам и связанным сценариям.</p></div></div>` +
		`<div class="collection-controls screen-catalog-filters"><input type="search" data-filter-control="search" placeholder="Экран, ID или ошибка" aria-label="Поиск экранов"><input type="search" data-filter-control="route" placeholder="Маршрут" aria-label="Фильтр по маршруту"><select data-filter-control="module"><option value="all">Все модули</option>` + moduleOptions + `</select><select data-filter-control="status"><option value="all">Все статусы</option>` + screenStatusOptions(model) + `</select><select data-filter-control="usecase"><option value="all">Все сценарии</option>` + screenUseCaseOptions(model) + `</select><select data-filter-control="errors"><option value="all">Ошибки: любые</option><option value="yes">Есть ошибки</option><option value="no">Без ошибок</option></select><select data-filter-control="docs"><option value="all">Документация: любая</option><option value="yes">Есть документация</option><option value="no">Без документации</option></select></div>` +
		`<div class="collection-summary">Показано: <strong data-filter-count></strong></div><div class="screen-catalog-table"><table><thead><tr><th>ID</th><th>Экран</th><th>Модуль</th><th>Маршрут</th><th>Статус</th><th>Ошибки</th><th>Документ</th></tr></thead><tbody>` + screenCatalogRows(model, current) + `</tbody></table></div><div class="empty-state" data-filter-empty hidden>Экраны не найдены.</div></section>`
	return pageShell(model, current, "Экраны", "Карта экранов продукта", content, "")
}

func renderScreenConnections(model *Model, document *Document) string {
	id := document.Metadata["id"]
	var screen *KnowledgeScreen
	for index := range model.Knowledge.Screens {
		if model.Knowledge.Screens[index].ID == id {
			screen = &model.Knowledge.Screens[index]
			break
		}
	}
	if screen == nil {
		return ""
	}
	node := func(screenID string) string {
		label := screenID
		for _, candidate := range model.Knowledge.Screens {
			if candidate.ID != screenID {
				continue
			}
			label += " · " + candidate.Title
			if candidate.Document != "" {
				if target := model.DocByPath[candidate.Document]; target != nil {
					return `<a href="` + escapeAttr(relativeURL(document.OutputPath, target.OutputPath)) + `">` + escapeHTML(label) + `</a>`
				}
			}
			break
		}
		mapDocument := model.DocByPath["screens/map.md"]
		return `<a href="` + escapeAttr(relativeURL(document.OutputPath, mapDocument.OutputPath)+"#screen-"+slugify(screenID)) + `">` + escapeHTML(label) + `</a>`
	}
	var incoming, outgoing strings.Builder
	for _, transition := range model.Knowledge.Transitions {
		label := transition.Action
		if transition.Condition != "" {
			label += " · " + transition.Condition
		}
		if transition.ToID == id {
			incoming.WriteString(`<tr><td>` + node(transition.FromID) + `</td><td>` + escapeHTML(label) + `</td><td>` + escapeHTML(transition.Kind) + `</td></tr>`)
		}
		if transition.FromID == id {
			outgoing.WriteString(`<tr><td>` + escapeHTML(label) + `</td><td>` + node(transition.ToID) + `</td><td>` + escapeHTML(transition.Kind) + `</td></tr>`)
		}
	}
	table := func(headers string, rows strings.Builder) string {
		if rows.Len() == 0 {
			return `<p class="empty-state">Переходов нет.</p>`
		}
		return `<div class="data-table"><table><thead><tr>` + headers + `</tr></thead><tbody>` + rows.String() + `</tbody></table></div>`
	}
	var refs strings.Builder
	for _, useCaseID := range screen.UseCaseIDs {
		for _, useCase := range model.Knowledge.UseCases {
			if useCase.ID == useCaseID {
				if target := model.DocByPath[useCase.Document]; target != nil {
					refs.WriteString(`<li><a href="` + escapeAttr(relativeURL(document.OutputPath, target.OutputPath)) + `">` + escapeHTML(useCase.ID+" · "+useCase.Title) + `</a></li>`)
				}
			}
		}
	}
	for _, taskID := range screen.WorkItemIDs {
		for _, item := range model.Knowledge.WorkItems {
			if item.ID == taskID {
				if target := model.DocByPath[item.Document]; target != nil {
					refs.WriteString(`<li><a href="` + escapeAttr(relativeURL(document.OutputPath, target.OutputPath)+"#"+item.Anchor) + `">` + escapeHTML(item.ID+" · "+item.Title) + `</a></li>`)
				}
			}
		}
	}
	related := ""
	if refs.Len() > 0 {
		related = `<h3>Сценарии и задачи</h3><ul class="related-list">` + refs.String() + `</ul>`
	}
	return `<section class="dashboard-section screen-connections"><div class="section-heading"><div><h2>Переходы</h2><p>Вычислено из центральной карты экранов.</p></div><a href="` + escapeAttr(relativeURL(document.OutputPath, model.DocByPath["screens/map.md"].OutputPath)+"#screen-"+slugify(id)) + `">Открыть на карте →</a></div><h3>Входящие</h3>` + table(`<th>Откуда</th><th>Действие</th><th>Тип</th>`, incoming) + `<h3>Исходящие</h3>` + table(`<th>Действие</th><th>Куда</th><th>Тип</th>`, outgoing) + related + `</section>`
}
