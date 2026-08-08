package docudocu

import (
	"fmt"
	"strings"
)

func processTitle(id, title string) string {
	for _, separator := range []string{":", "—"} {
		if strings.HasPrefix(title, id+separator) {
			return strings.TrimSpace(strings.TrimPrefix(title, id+separator))
		}
	}
	return title
}

func findKnowledgeFlow(model *Model, id string) *KnowledgeFlow {
	for index := range model.Knowledge.Flows {
		if model.Knowledge.Flows[index].ID == id {
			return &model.Knowledge.Flows[index]
		}
	}
	return nil
}

func findPlayableFlow(model *Model, id string) *PlayableFlow {
	for index := range model.Knowledge.PlayableFlows {
		if model.Knowledge.PlayableFlows[index].UseCaseID == id {
			return &model.Knowledge.PlayableFlows[index]
		}
	}
	return nil
}

func processModuleOptions(model *Model) string {
	var options strings.Builder
	for _, module := range model.Knowledge.Modules {
		options.WriteString(`<option value="` + escapeAttr(module.ID) + `">` +
			escapeHTML(module.ID+" · "+processTitle(module.ID, module.Title)) + `</option>`)
	}
	return options.String()
}

func processUseCaseOptions(model *Model) string {
	var options strings.Builder
	for _, useCase := range model.Knowledge.UseCases {
		options.WriteString(`<option value="` + escapeAttr(useCase.ID) + `">` +
			escapeHTML(useCase.ID+" · "+screenTitleForUseCase(useCase)) + `</option>`)
	}
	return options.String()
}

func processRelations(current string, model *Model, ids []string, kind string) string {
	if len(ids) == 0 {
		return `<span class="process-empty-value">—</span>`
	}
	var values strings.Builder
	for _, id := range ids {
		var document *Document
		if kind == "use-case" {
			if useCase := findUseCase(model, id); useCase != nil {
				document = model.DocByPath[useCase.Document]
			}
		} else if flow := findKnowledgeFlow(model, id); flow != nil {
			document = model.DocByPath[flow.Document]
		}
		label := `<span class="process-relation-chip">` + escapeHTML(id) + `</span>`
		if document != nil {
			label = `<a class="process-relation-chip" href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `">` + escapeHTML(id) + `</a>`
		}
		values.WriteString(label)
	}
	return `<div class="process-relations">` + values.String() + `</div>`
}

func renderProcessRows(model *Model, current, onlyType string) string {
	var rows strings.Builder
	if onlyType == "" || onlyType == "use-case" {
		for _, useCase := range model.Knowledge.UseCases {
			document := model.DocByPath[useCase.Document]
			if document == nil {
				continue
			}
			views := `<a href="` + escapeAttr(relativeURL(current, document.OutputPath)+"#overview") + `">Обзор</a>`
			if flow := findPlayableFlow(model, useCase.ID); flow != nil {
				views += `<a href="` + escapeAttr(relativeURL(current, document.OutputPath)+"#map") + `">Карта</a>`
				if flow.Valid {
					views += `<a href="` + escapeAttr(relativeURL(current, document.OutputPath)+"#play") + `">Проиграть</a>`
				}
			}
			search := strings.Join([]string{useCase.ID, useCase.Title, useCase.ModuleID, strings.Join(useCase.FlowIDs, " ")}, " ")
			fmt.Fprintf(&rows, `<tr data-filter-item data-search="%s" data-type="use-case" data-module="%s" data-status="%s" data-usecase="%s"><td><a class="process-title" href="%s">%s</a><code>%s</code></td><td><span class="process-kind process-kind-user">Пользовательский сценарий</span></td><td><code>%s</code></td><td>%s</td><td>%s</td><td><div class="process-view-links">%s</div></td></tr>`,
				escapeAttr(search), escapeAttr(useCase.ModuleID), escapeAttr(useCase.Status.Kind), escapeAttr(useCase.ID),
				escapeAttr(relativeURL(current, document.OutputPath)), escapeHTML(screenTitleForUseCase(useCase)), escapeHTML(useCase.ID),
				escapeHTML(useCase.ModuleID), renderStatusChip(useCase.Status), processRelations(current, model, useCase.FlowIDs, "flow"), views)
		}
	}
	if onlyType == "" || onlyType == "flow" {
		for _, flow := range model.Knowledge.Flows {
			document := model.DocByPath[flow.Document]
			if document == nil {
				continue
			}
			search := strings.Join([]string{flow.ID, flow.Title, flow.ModuleID, strings.Join(flow.UseCaseIDs, " ")}, " ")
			fmt.Fprintf(&rows, `<tr data-filter-item data-search="%s" data-type="flow" data-module="%s" data-status="%s" data-usecase="%s"><td><a class="process-title" href="%s">%s</a><code>%s</code></td><td><span class="process-kind process-kind-system">Визуальный процесс</span></td><td><code>%s</code></td><td>%s</td><td>%s</td><td><div class="process-view-links"><a href="%s">Диаграмма</a></div></td></tr>`,
				escapeAttr(search), escapeAttr(flow.ModuleID), escapeAttr(document.Status.Kind), escapeAttr(strings.Join(flow.UseCaseIDs, "|")),
				escapeAttr(relativeURL(current, document.OutputPath)), escapeHTML(processTitle(flow.ID, flow.Title)), escapeHTML(flow.ID),
				escapeHTML(flow.ModuleID), renderStatusChip(document.Status), processRelations(current, model, flow.UseCaseIDs, "use-case"),
				escapeAttr(relativeURL(current, document.OutputPath)))
		}
	}
	return rows.String()
}

func renderProcessCatalogPage(model *Model, current, onlyType string) string {
	title := modelDirectoryLabel(model, "flows")
	description := "Бизнес-, технические, операционные и межмодульные процессы."
	badge := title
	badgeTarget := sectionCatalogOutput(SectionFlows)
	summary := "FLOW связан с пользовательскими сценариями"
	if onlyType == "use-case" {
		title = "Пользовательские сценарии"
		description = "Цели пользователя, экранные пути и проверяемые результаты."
		badge = "Пользовательские сценарии"
		badgeTarget = "use-cases/index.html"
		summary = "UC связан с процессами и экранами"
	}
	rows := renderProcessRows(model, current, onlyType)
	content := breadcrumbs(model, current, title) +
		`<header class="page-header"><div class="page-kicker"><a class="badge" href="` + escapeAttr(relativeURL(current, badgeTarget)) + `">` + escapeHTML(badge) + `</a></div><h1>` +
		escapeHTML(title) + `</h1><p class="page-lead">` + escapeHTML(description) + `</p></header>` +
		`<section class="process-catalog" data-filter-scope><div class="process-filterbar">` +
		`<label class="screen-filter-field process-filter-search"><span>Поиск</span><input type="search" data-filter-control="search" placeholder="ID, название или модуль"></label>` +
		`<label class="screen-filter-field"><span>Модуль</span><select data-filter-control="module"><option value="all">Все модули</option>` + processModuleOptions(model) + `</select></label>` +
		`<label class="screen-filter-field"><span>Связанный сценарий</span><select data-filter-control="usecase"><option value="all">Все сценарии</option>` + processUseCaseOptions(model) + `</select></label>` +
		`<button class="toolbar-button screen-filter-reset" type="button" data-filter-reset>Сбросить</button></div>` +
		`<div class="screen-catalog-summary" aria-live="polite"><span>Найдено: <strong data-filter-count></strong></span><span>` + escapeHTML(summary) + `</span></div>` +
		`<div class="process-table"><table><thead><tr><th scope="col">Процесс</th><th scope="col">Тип</th><th scope="col">Модуль</th><th scope="col">Статус</th><th scope="col">Связи</th><th scope="col">Представления</th></tr></thead><tbody>` +
		rows + `</tbody></table></div><div class="empty-state" data-filter-empty hidden>Процессы не найдены.</div></section>`
	return pageShell(model, current, title, description, content, "")
}

func renderUseCaseRelations(model *Model, useCase KnowledgeUseCase, current string) string {
	var module, screens, activeTasks, archivedTasks, repositoryPaths, traceability strings.Builder
	for _, candidate := range model.Knowledge.Modules {
		if candidate.ID != useCase.ModuleID {
			continue
		}
		if document := model.DocByPath[candidate.Document]; document != nil {
			module.WriteString(`<li><a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `"><code>` +
				escapeHTML(candidate.ID) + `</code> · ` + escapeHTML(processTitle(candidate.ID, candidate.Title)) + `</a></li>`)
		}
	}
	for _, screenID := range useCase.ScreenIDs {
		for _, screen := range model.Knowledge.Screens {
			if screen.ID != screenID {
				continue
			}
			if document := model.DocByPath[screen.Document]; document != nil {
				screens.WriteString(`<li><a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `"><code>` + escapeHTML(screen.ID) + `</code> · ` + escapeHTML(screen.Title) + `</a></li>`)
			}
		}
	}
	for _, item := range model.Knowledge.WorkItems {
		if item.UseCaseID == useCase.ID {
			if document := model.DocByPath[item.Document]; document != nil {
				row := `<li><a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `"><code>` + escapeHTML(item.ID) + `</code> · ` + escapeHTML(item.Title) + `</a>`
				if item.Archived {
					row += ` <span class="badge">Архив ` + escapeHTML(item.ArchiveYear) + `</span>`
					archivedTasks.WriteString(row + `</li>`)
				} else {
					activeTasks.WriteString(row + `</li>`)
				}
			}
		}
	}
	tasks := activeTasks.String() + archivedTasks.String()
	for _, repositoryPath := range useCase.RepositoryPaths {
		repositoryPaths.WriteString(`<li><code>` + escapeHTML(repositoryPath) + `</code></li>`)
	}
	for _, row := range model.Knowledge.Traceability {
		if row.UseCaseID == useCase.ID {
			traceability.WriteString(`<tr><td><code>` + escapeHTML(row.TransitionID) + `</code></td><td>` + escapeHTML(row.TaskID) + `</td><td>` + escapeHTML(row.CriterionID) + `</td><td>` + escapeHTML(row.Verification) + `</td></tr>`)
		}
	}
	processLinks := processRelations(current, model, useCase.FlowIDs, "flow")
	return `<div class="usecase-relations-grid"><section><h2>Связанные процессы</h2>` + processLinks +
		`</section><section><h2>Модуль</h2><ul class="related-list">` + fallbackList(module.String()) +
		`</ul></section><section><h2>Экраны</h2><ul class="related-list">` + fallbackList(screens.String()) +
		`</ul></section><section><h2>Рабочие задачи</h2><ul class="related-list">` + fallbackList(tasks) +
		`</ul></section><section><h2>Расположение в коде</h2><ul class="related-list">` + fallbackList(repositoryPaths.String()) +
		`</ul></section></div><section class="dashboard-section"><h2>Проверяемость</h2><div class="data-table"><table><thead><tr><th>Переход</th><th>Задача</th><th>Критерий</th><th>Проверка</th></tr></thead><tbody>` +
		fallbackTraceability(traceability.String()) + `</tbody></table></div></section>`
}

func fallbackList(value string) string {
	if value == "" {
		return `<li class="process-empty-value">Связей нет.</li>`
	}
	return value
}

func fallbackTraceability(value string) string {
	if value == "" {
		return `<tr><td colspan="4" class="process-empty-value">Связи с критериями пока не описаны.</td></tr>`
	}
	return value
}

func renderUseCasePage(model *Model, document *Document) string {
	useCase := findUseCase(model, document.Metadata["id"])
	if useCase == nil {
		return renderDocumentPage(model, document)
	}
	current := document.OutputPath
	body := renderDocumentMarkdown(document, linkResolverFor(model, document), nil)
	flow := findPlayableFlow(model, useCase.ID)
	mapPanel := `<div class="empty-state"><strong>Карта пока недоступна</strong><p>Добавьте начальный экран и переходы этого сценария.</p></div>`
	playPanel := `<div class="empty-state"><strong>Сценарий пока нельзя проиграть</strong><p>Опишите экранную модель и переходы.</p></div>`
	if flow != nil && len(model.Knowledge.Screens) > 0 {
		mapPanel = renderScreenMapWorkspace(model, current, useCase.ID, true)
		playPanel = renderPlayableFlowComponent(model, *flow, current, true)
	}
	tabs := []struct {
		id    string
		label string
	}{
		{"overview", "Обзор"},
		{"map", "Карта"},
		{"play", "Проиграть"},
		{"links", "Связи"},
	}
	var tabLinks strings.Builder
	for index, tab := range tabs {
		selected := "false"
		tabIndex := `-1`
		active := ""
		if index == 0 {
			selected = "true"
			tabIndex = "0"
			active = " is-active"
		}
		fmt.Fprintf(&tabLinks, `<a class="usecase-tab%s" id="tab-%s" role="tab" aria-selected="%s" aria-controls="%s" tabindex="%s" href="#%s" data-usecase-tab="%s">%s</a>`,
			active, tab.id, selected, tab.id, tabIndex, tab.id, tab.id, tab.label)
	}
	content := breadcrumbs(model, current, useCase.ID) +
		`<header class="page-header usecase-header"><div class="page-kicker">` + renderStatusChip(useCase.Status) + `<span class="badge">Пользовательский сценарий</span></div><h1>` +
		escapeHTML(useCase.ID+" · "+screenTitleForUseCase(*useCase)) + `</h1><p class="page-lead">` + escapeHTML(document.Description) + `</p>` +
		renderMetadata(document) + `<div class="page-actions">` + renderDocumentContextButton(model, document) + `</div></header><div class="usecase-workspace" data-usecase-tabs><nav class="usecase-tabs" role="tablist" aria-label="Представления пользовательского сценария">` +
		tabLinks.String() + `</nav><section class="usecase-panel" id="overview" role="tabpanel" aria-labelledby="tab-overview" data-usecase-panel><article class="doc-content">` + body +
		`</article></section><section class="usecase-panel" id="map" role="tabpanel" aria-labelledby="tab-map" data-usecase-panel>` + mapPanel +
		`</section><section class="usecase-panel" id="play" role="tabpanel" aria-labelledby="tab-play" data-usecase-panel>` + playPanel +
		`</section><section class="usecase-panel" id="links" role="tabpanel" aria-labelledby="tab-links" data-usecase-panel>` +
		renderUseCaseRelations(model, *useCase, current) + renderRelated(model, document) + `</section></div>`
	return pageShell(model, current, document.Title, document.Description, content, "")
}

func renderFlowConnections(model *Model, document *Document) string {
	flow := findKnowledgeFlow(model, document.Metadata["id"])
	if flow == nil {
		return ""
	}
	return `<section class="dashboard-section dashboard-support-panel flow-connections"><h2>Связанные пользовательские сценарии</h2>` +
		processRelations(document.OutputPath, model, flow.UseCaseIDs, "use-case") + `</section>`
}
