package docgent

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

const Version = "1.1.0-go"

var fieldOrder = []string{"status", "type", "stage", "version", "owner", "author", "actor", "priority", "criticality", "module", "useCase", "flow", "screens", "transitions", "startScreen", "terminalScreens", "allowCycle", "route", "preview", "parentScreen", "component", "errors", "dependsOn", "source", "date", "plannedDate", "updated", "probability", "impact", "id", "tags"}

var typeIcons = map[string]string{"overview": "⌂", "status": "◐", "roadmap": "→", "risks": "!", "ideas": "✦", "notes": "✎", "changelog": "↻", "use-case": "◎", "module": "▦", "architecture": "◇", "contract": "⇄", "decision": "◆", "flow": "⇢", "screen-map": "⌗", "screen-index": "⌗", "screen": "▣", "guide": "◫", "work": "☑", "reference": "≡", "document": "•"}

func renderStatusChip(status StatusInfo) string {
	return fmt.Sprintf(`<span class="status-chip status-%s" title="%s"><span aria-hidden="true">%s</span><span>%s</span></span>`, escapeAttr(status.Kind), escapeAttr(status.Label), escapeHTML(status.Symbol), escapeHTML(status.Label))
}

func renderProgress(stats TaskStats, label string) string {
	if stats.Total == 0 {
		return ""
	}
	percent := percentOrZero(stats.Percent)
	complete := ""
	if percent == 100 {
		complete = " is-complete"
	}
	return fmt.Sprintf(`<div class="progress-block"><div class="progress-header"><span class="progress-label">%s · %d из %d</span><span class="progress-value">%d%%</span></div><div class="progress-track%s" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="%d"><div class="progress-fill" style="width:%d%%"></div></div></div>`, escapeHTML(label), stats.Completed, stats.Total, percent, complete, percent, percent)
}

func metricCard(label string, value any, detail string) string {
	out := fmt.Sprintf(`<div class="metric-card"><div class="metric-label">%s</div><div class="metric-value">%s</div>`, escapeHTML(label), escapeHTML(value))
	if detail != "" {
		out += `<div class="metric-detail">` + escapeHTML(detail) + `</div>`
	}
	return out + `</div>`
}

func outputForDirectory(model *Model, directory string) string {
	if directory == "processes" {
		return "processes/index.html"
	}
	if directory == "screens" && len(model.Knowledge.Screens) > 0 {
		return "screens/catalog.html"
	}
	if document := model.DocByPath[path.Join(directory, "index.md")]; document != nil {
		return document.OutputPath
	}
	return path.Join(directory, "index.html")
}

func renderNavigation(model *Model, current string) string {
	var b strings.Builder
	b.WriteString(`<nav aria-label="Документация"><div class="nav-title">Проект</div><ul class="nav-tree">`)
	rootDocs := []*Document{}
	groups := map[string][]*Document{}
	for _, document := range model.Documents {
		first := strings.Split(document.SourcePath, "/")[0]
		if !strings.Contains(document.SourcePath, "/") {
			rootDocs = append(rootDocs, document)
		} else if first == "flows" {
			groups["processes"] = append(groups["processes"], document)
		} else {
			groups[first] = append(groups[first], document)
		}
	}
	if len(model.Knowledge.UseCases) > 0 {
		if _, exists := groups["use-cases"]; !exists {
			groups["use-cases"] = []*Document{}
		}
	}
	if len(model.Knowledge.UseCases)+len(model.Knowledge.Flows) > 0 {
		if _, exists := groups["processes"]; !exists {
			groups["processes"] = []*Document{}
		}
	}
	if len(model.Knowledge.Screens) > 0 {
		if _, exists := groups["screens"]; !exists {
			groups["screens"] = []*Document{}
		}
	}
	writeDoc := func(document *Document) {
		active := ""
		aria := ""
		if document.OutputPath == current {
			active = " is-active"
			aria = ` aria-current="page"`
		}
		fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"%s><span class="nav-icon" aria-hidden="true">%s</span><span>%s</span></a></li>`, active, escapeAttr(relativeURL(current, document.OutputPath)), aria, typeIcons[document.Type], escapeHTML(document.Title))
	}
	for _, doc := range rootDocs {
		writeDoc(doc)
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	navigationOrder := map[string]int{
		"architecture": 10,
		"contracts":    20,
		"decisions":    30,
		"guides":       40,
		"modules":      50,
		"use-cases":    60,
		"processes":    70,
		"reference":    80,
		"screens":      90,
		"work":         100,
	}
	sort.SliceStable(keys, func(i, j int) bool {
		left, leftKnown := navigationOrder[keys[i]]
		right, rightKnown := navigationOrder[keys[j]]
		if leftKnown && rightKnown {
			return left < right
		}
		if leftKnown != rightKnown {
			return leftKnown
		}
		return naturalCompare(keys[i], keys[j]) < 0
	})
	for _, key := range keys {
		target := outputForDirectory(model, key)
		active := ""
		if target == current {
			active = " is-active"
		}
		if key == "use-cases" && strings.HasPrefix(current, "use-cases/") {
			active = " is-active"
		}
		if key == "processes" && (strings.HasPrefix(current, "processes/") || strings.HasPrefix(current, "flows/")) {
			active = " is-active"
		}
		if key == "screens" && strings.HasPrefix(current, "screens/") {
			active = " is-active"
		}
		label := directoryLabel(key)
		groupID := "nav-group-" + slugify(key)
		docs := groups[key]
		sort.SliceStable(docs, func(i, j int) bool { return documentLess(docs[i], docs[j]) })
		if key == "processes" {
			hasFlowDocuments := false
			for _, doc := range docs {
				if doc.Type == "flow" && !strings.EqualFold(doc.FileName, "index.md") {
					hasFlowDocuments = true
					break
				}
			}
			if !hasFlowDocuments {
				fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"><span class="nav-icon" aria-hidden="true">⇢</span><span>%s</span></a></li>`,
					active, escapeAttr(relativeURL(current, target)), escapeHTML(label))
				continue
			}
		}
		fmt.Fprintf(&b, `<li class="nav-item nav-folder" data-nav-folder="%s"><div class="nav-folder-row"><button class="nav-folder-toggle" type="button" data-nav-folder-toggle aria-expanded="true" aria-controls="%s" aria-label="Свернуть раздел %s"><span aria-hidden="true">▾</span></button><a class="nav-folder-link%s" href="%s"><span>%s</span></a></div><ul id="%s">`, escapeAttr(key), escapeAttr(groupID), escapeAttr(label), active, escapeAttr(relativeURL(current, target)), escapeHTML(label), escapeAttr(groupID))
		if key == "screens" && model.ScreenMapEnabled {
			activeClass := ""
			aria := ""
			if current == "screens/index.html" {
				activeClass = " is-active"
				aria = ` aria-current="page"`
			}
			fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"%s><span class="nav-icon" aria-hidden="true">⌗</span><span>Карта экранов</span></a></li>`,
				activeClass, escapeAttr(relativeURL(current, "screens/index.html")), aria)
		}
		if key == "processes" {
			for _, doc := range docs {
				if doc.Type == "flow" && !strings.EqualFold(doc.FileName, "index.md") {
					writeDoc(doc)
				}
			}
			b.WriteString(`</ul></li>`)
			continue
		}
		for _, doc := range docs {
			if strings.EqualFold(doc.FileName, "index.md") || doc.Type == "screen-map" {
				continue
			}
			writeDoc(doc)
		}
		b.WriteString(`</ul></li>`)
	}
	b.WriteString(`</ul><div class="nav-title">Контроль</div><ul class="nav-tree">`)
	active := ""
	if current == model.HealthOutputPath {
		active = " is-active"
	}
	fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"><span class="nav-icon">⚑</span><span>Качество документации</span></a></li>`, active, escapeAttr(relativeURL(current, model.HealthOutputPath)))
	if len(model.Knowledge.Screens) > 0 {
		active = ""
		if current == "traceability.html" {
			active = " is-active"
		}
		fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"><span class="nav-icon">⇥</span><span>Traceability</span></a></li>`, active, escapeAttr(relativeURL(current, "traceability.html")))
	}
	b.WriteString(`</ul></nav>`)
	return b.String()
}

func pageShell(model *Model, current, title, description, content, toc string) string {
	prefix := rootPrefix(current)
	config := model.SiteConfig
	fullTitle := title + " — " + model.Project.Title
	if current == "index.html" {
		fullTitle = model.Project.Title
	}
	tocHTML := ""
	gridClass := " no-toc"
	if toc != "" {
		tocHTML = `<aside class="page-toc" aria-label="Оглавление"><div class="page-toc-title">На странице</div>` + toc + `</aside>`
		gridClass = ""
	}
	mermaidScript := ""
	if strings.Contains(content, `data-mermaid-diagram`) {
		mermaidScript = `<script src="` + escapeAttr(prefix) + `assets/mermaid.tiny.js" defer></script>`
	}
	extraStyles, extraScripts := "", ""
	if strings.Contains(content, `data-screen-map`) {
		extraStyles += `<link rel="stylesheet" href="` + escapeAttr(prefix) + `assets/screen-map.css">`
		extraScripts += `<script src="` + escapeAttr(prefix) + `assets/screen-map.js" defer></script>`
	}
	if strings.Contains(content, `data-playable-flow`) {
		extraStyles += `<link rel="stylesheet" href="` + escapeAttr(prefix) + `assets/playable-flow.css">`
		extraScripts += `<script src="` + escapeAttr(prefix) + `assets/playable-flow.js" defer></script>`
	}
	favicon := "assets/favicon.svg"
	if custom := brandingOutput(model, "favicon"); custom != "" {
		favicon = custom
	}
	initialTheme := config.ColorScheme
	if initialTheme == "system" {
		initialTheme = "light"
	}
	earlyTheme := `<script>(function(){var m="` + escapeAttr(config.ColorScheme) + `",t="` + escapeAttr(config.Theme) + `";try{var s=localStorage.getItem("docgent-color-scheme"),u=localStorage.getItem("docgent-site-theme");if(s==="system"||s==="light"||s==="dark")m=s;if(u==="classic"||u==="paper"||u==="terminal")t=u}catch(e){}var d=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;document.documentElement.dataset.colorScheme=m;document.documentElement.dataset.theme=d;document.documentElement.dataset.siteTheme=t}())</script>`
	attributes := ` data-site-theme="` + escapeAttr(config.Theme) + `" data-color-scheme="` + escapeAttr(config.ColorScheme) + `" data-accent="` + escapeAttr(config.Accent) + `" data-density="` + escapeAttr(config.Density) + `" data-content-width="` + escapeAttr(config.ContentWidth) + `"`
	brandMark := `<span class="brand-mark" aria-hidden="true">DG</span>`
	if logo := brandingOutput(model, "logo"); logo != "" {
		brandMark = `<img class="brand-logo" src="` + escapeAttr(relativeURL(current, logo)) + `" alt="">`
	}
	footer := escapeHTML(config.Footer.Text)
	if config.Footer.URL != "" {
		footer = `<a href="` + escapeAttr(config.Footer.URL) + `" rel="noopener noreferrer">` + footer + `</a>`
	}
	themeLabel, themeIndicator := siteThemePresentation(config.Theme)
	schemeLabel := colorSchemeLabel(config.ColorScheme)
	themeSelect := `<label class="header-select site-theme-select"><span class="header-select-visual" aria-hidden="true"><span class="site-theme-indicator" data-site-theme-indicator>` + escapeHTML(themeIndicator) + `</span><span data-site-theme-label>` + escapeHTML(themeLabel) + `</span></span><select data-site-theme-select aria-label="Тема оформления">` + selectOptions(config.Theme, []selectOption{{"classic", "Классика"}, {"paper", "Бумага"}, {"terminal", "Терминал"}}) + `</select></label>`
	schemeSelect := `<label class="header-select scheme-select"><span class="header-select-visual" aria-hidden="true"><span class="scheme-toggle-indicator"></span><span data-theme-label>` + escapeHTML(schemeLabel) + `</span></span><select data-color-scheme-select aria-label="Цветовая схема">` + selectOptions(config.ColorScheme, []selectOption{{"system", "Система"}, {"light", "Светлая"}, {"dark", "Тёмная"}}) + `</select></label>`
	return `<!doctype html><html lang="ru" data-theme="` + escapeAttr(initialTheme) + `"` + attributes + `><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="` + escapeAttr(description) + `"><title>` + escapeHTML(fullTitle) + `</title><link rel="icon" href="` + escapeAttr(relativeURL(current, favicon)) + `">` + earlyTheme + `<link rel="stylesheet" href="` + escapeAttr(prefix) + `assets/style.css">` + extraStyles + `<script src="` + escapeAttr(prefix) + `assets/search-index.js" defer></script>` + mermaidScript + `<script src="` + escapeAttr(prefix) + `assets/app.js" defer></script>` + extraScripts + `</head><body data-root-prefix="` + escapeAttr(prefix) + `" data-task-filter="all"><a class="skip-link" href="#main-content">Перейти к содержимому</a><header class="site-header"><div class="brand-area"><button class="icon-button sidebar-toggle" type="button" data-sidebar-toggle aria-label="Открыть навигацию">☰</button><a class="brand" href="` + escapeAttr(relativeURL(current, "index.html")) + `">` + brandMark + `<span class="brand-text">` + escapeHTML(model.Project.Title) + `</span></a></div><div class="global-search" role="search"><div class="search-input-wrap"><input type="search" data-global-search placeholder="Поиск по документации" aria-label="Поиск по документации"><span class="search-shortcut">/</span></div><div class="search-results" id="global-search-results" data-search-results role="listbox" hidden></div></div><div class="header-actions"><button class="icon-button" type="button" data-print aria-label="Печать">⎙</button>` + themeSelect + schemeSelect + `</div></header><div class="site-layout"><aside class="sidebar">` + renderNavigation(model, current) + `</aside><div class="main-area"><main id="main-content" class="page-grid` + gridClass + `"><div class="page-content">` + content + `</div>` + tocHTML + `</main><footer class="site-footer">` + footer + `</footer></div></div></body></html>`
}

type selectOption struct {
	Value string
	Label string
}

func selectOptions(current string, options []selectOption) string {
	var b strings.Builder
	for _, option := range options {
		selected := ""
		if option.Value == current {
			selected = " selected"
		}
		b.WriteString(`<option value="` + escapeAttr(option.Value) + `"` + selected + `>` + escapeHTML(option.Label) + `</option>`)
	}
	return b.String()
}

func siteThemePresentation(theme string) (string, string) {
	switch theme {
	case "paper":
		return "Бумага", "P"
	case "terminal":
		return "Терминал", "T"
	default:
		return "Классика", "C"
	}
}

func colorSchemeLabel(scheme string) string {
	switch scheme {
	case "light":
		return "Светлая"
	case "dark":
		return "Тёмная"
	default:
		return "Система"
	}
}

func brandingOutput(model *Model, kind string) string {
	prefix := "assets/branding/" + kind + "."
	for output := range model.BrandingAssets {
		if strings.HasPrefix(output, prefix) {
			return output
		}
	}
	return ""
}

func breadcrumbs(model *Model, current, title string) string {
	return `<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="` + escapeAttr(relativeURL(current, "index.html")) + `">` + escapeHTML(model.Project.Title) + `</a><span>›</span><span>` + escapeHTML(title) + `</span></nav>`
}

func renderMetadata(document *Document) string {
	if len(document.Metadata) == 0 && len(document.MetadataExtras) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<dl class="metadata-grid">`)
	seen := map[string]bool{}
	for _, key := range fieldOrder {
		if value := document.Metadata[key]; value != "" {
			seen[key] = true
			label := displayFieldNames[key]
			if label == "" {
				label = key
			}
			b.WriteString(`<div><dt>` + escapeHTML(label) + `</dt><dd>` + escapeHTML(value) + `</dd></div>`)
		}
	}
	keys := []string{}
	for key := range document.Metadata {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		b.WriteString(`<div><dt>` + escapeHTML(key) + `</dt><dd>` + escapeHTML(document.Metadata[key]) + `</dd></div>`)
	}
	for _, extra := range document.MetadataExtras {
		b.WriteString(`<div><dt>` + escapeHTML(extra.Key) + `</dt><dd>` + escapeHTML(extra.Value) + `</dd></div>`)
	}
	return b.String() + `</dl>`
}

func renderTOC(document *Document) string {
	var b strings.Builder
	b.WriteString(`<ul>`)
	for _, h := range document.Headings {
		if h.Level < 2 || h.Level > 3 {
			continue
		}
		b.WriteString(`<li class="toc-level-` + fmt.Sprint(h.Level) + `"><a href="#` + escapeAttr(h.ID) + `">` + escapeHTML(h.Title) + `</a></li>`)
	}
	return b.String() + `</ul>`
}

func renderRelated(model *Model, document *Document) string {
	items := append([]*Document{}, document.RelatedDocuments...)
	items = append(items, document.Backlinks...)
	items = append(items, document.LinkedUseCases...)
	items = append(items, document.LinkedModules...)
	seen := map[string]bool{}
	var b strings.Builder
	for _, item := range items {
		if item == nil || item == document || seen[item.SourcePath] {
			continue
		}
		seen[item.SourcePath] = true
		b.WriteString(`<li><a href="` + escapeAttr(relativeURL(document.OutputPath, item.OutputPath)) + `">` + escapeHTML(item.Title) + `</a><span class="table-subtext">` + escapeHTML(item.TypeLabel) + `</span></li>`)
	}
	if b.Len() == 0 {
		return ""
	}
	return `<section class="dashboard-section"><h2>Связанные документы</h2><ul class="related-list">` + b.String() + `</ul></section>`
}

func renderDocumentPage(model *Model, document *Document) string {
	resolver := linkResolverFor(model, document)
	taskCompletionByLine := map[int]bool{}
	if document.Type == "roadmap" {
		for _, stage := range model.RoadmapStages {
			if stage.Document != document {
				continue
			}
			for _, item := range stage.Items {
				taskCompletionByLine[item.Line-1] = item.EffectiveCompleted
			}
		}
	}
	body := renderDocumentMarkdown(document, resolver, taskCompletionByLine)
	controls := ""
	if document.TaskStats.Total > 0 {
		controls = `<div class="document-toolbar task-toolbar"><span class="toolbar-label" id="task-filter-label">Чек-лист</span><div class="task-filter-group" role="group" aria-labelledby="task-filter-label"><button class="toolbar-button" type="button" data-task-filter="all">Все</button><button class="toolbar-button" type="button" data-task-filter="open">Невыполненные</button><button class="toolbar-button" type="button" data-task-filter="complete">Выполненные</button></div></div>`
	}
	issues := ""
	if len(document.Warnings)+len(document.Errors) > 0 {
		issues = fmt.Sprintf(`<a class="badge" href="%s">Замечания: %d</a>`, escapeAttr(relativeURL(document.OutputPath, model.HealthOutputPath)), len(document.Warnings)+len(document.Errors))
	}
	computedStatus := ""
	if document.Type == "status" {
		computedStatus = renderComputedStatus(model, document.OutputPath)
	}
	screenConnections := ""
	flowConnections := ""
	displayStatus := document.Status
	if document.Type == "screen" {
		screenConnections = renderScreenConnections(model, document)
		for _, screen := range model.Knowledge.Screens {
			if screen.ID == document.Metadata["id"] {
				displayStatus = screen.Status
				break
			}
		}
	}
	if document.Type == "flow" {
		flowConnections = renderFlowConnections(model, document)
	}
	content := breadcrumbs(model, document.OutputPath, document.Title) + `<header class="page-header"><div class="page-kicker">` + renderStatusChip(displayStatus) + `<span class="badge">` + escapeHTML(document.TypeLabel) + `</span>` + issues + `</div><h1>` + escapeHTML(document.Title) + `</h1><p class="page-lead">` + escapeHTML(document.Description) + `</p>` + renderMetadata(document) + renderProgress(document.TaskStats, "Готовность документа") + controls + `<div class="page-actions"><button class="collapse-all-button" type="button" data-collapse-all data-collapse-state="expanded" aria-expanded="true"><span class="collapse-all-icon" aria-hidden="true"><span class="collapse-icon collapse-icon-up">↑</span><span class="collapse-icon collapse-icon-down">↓</span></span><span data-collapse-label>Свернуть разделы</span></button></div></header>` + computedStatus + `<article class="doc-content">` + body + `</article>` + screenConnections + renderRelated(model, document)
	content += flowConnections
	return pageShell(model, document.OutputPath, document.Title, document.Description, content, renderTOC(document))
}

func docCard(current string, document *Document) string {
	return `<article class="document-card" data-filter-item data-search="` + escapeAttr(document.Title+" "+document.Description+" "+document.SourcePath) + `" data-status="` + escapeAttr(document.Status.Kind) + `" data-type="` + escapeAttr(document.Type) + `" data-owner="` + escapeAttr(document.Metadata["owner"]) + `"><div class="card-kicker">` + renderStatusChip(document.Status) + `<span class="badge">` + escapeHTML(document.TypeLabel) + `</span></div><h3><a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `">` + escapeHTML(document.Title) + `</a></h3><p>` + escapeHTML(truncate(document.Description, 180)) + `</p>` + renderProgress(document.TaskStats, "Задачи") + `<div class="card-path">` + escapeHTML(document.SourcePath) + `</div></article>`
}

func filterControls(includeStatus, includeType bool) string {
	statusControl := ""
	if includeStatus {
		statusControl = `<select data-filter-control="status"><option value="all">Все статусы</option><option value="done">Готово</option><option value="in-progress">В работе</option><option value="planned">Запланировано</option><option value="blocked">Заблокировано</option></select>`
	}
	typeControl := ""
	if includeType {
		typeControl = `<select data-filter-control="type"><option value="all">Все типы</option><option value="module">Модули</option><option value="use-case">Сценарии</option><option value="screen-map">Карты экранов</option><option value="screen">Экраны</option><option value="flow">Процессы</option><option value="architecture">Архитектура</option><option value="decision">Решения</option><option value="work">Задачи</option></select>`
	}
	return `<div class="collection-controls"><input type="search" data-filter-control="search" placeholder="Фильтр" aria-label="Фильтр">` + statusControl + typeControl + `</div>`
}

func documentsHaveDifferentStatuses(documents []*Document) bool {
	if len(documents) < 2 {
		return false
	}
	first := documents[0].Status.Kind
	for _, document := range documents[1:] {
		if document.Status.Kind != first {
			return true
		}
	}
	return false
}

func renderComputedStatus(model *Model, current string) string {
	var active strings.Builder
	for _, item := range model.CurrentStatus.ActiveWork {
		href := "#"
		if document := model.DocByPath[item.Document]; document != nil {
			href = relativeURL(current, document.OutputPath) + "#" + item.Anchor
		}
		active.WriteString(`<tr><td><a href="` + escapeAttr(href) + `">` + escapeHTML(item.ID) + `</a></td><td>` + escapeHTML(item.Title) + `</td><td>` + renderStatusChip(item.Status) + `</td><td>` + escapeHTML(item.ModuleID) + `</td></tr>`)
	}
	activeHTML := `<p class="empty-state">Активных задач нет.</p>`
	if active.Len() > 0 {
		activeHTML = `<div class="data-table"><table><thead><tr><th>ID</th><th>Задача</th><th>Статус</th><th>Модуль</th></tr></thead><tbody>` + active.String() + `</tbody></table></div>`
	}

	var blockers strings.Builder
	for _, blocker := range model.CurrentStatus.Blockers {
		href := "#"
		if document := model.DocByPath[blocker.Document]; document != nil {
			href = relativeURL(current, document.OutputPath) + "#" + blocker.Anchor
		}
		text := blocker.Text
		if text == "" {
			text = "Причина блокировки не указана."
		}
		blockers.WriteString(`<li><a href="` + escapeAttr(href) + `">` + escapeHTML(blocker.TaskID) + `</a> — ` + escapeHTML(text) + `</li>`)
	}
	blockersHTML := `<p>Критических блокеров нет.</p>`
	if blockers.Len() > 0 {
		blockersHTML = `<ul class="related-list">` + blockers.String() + `</ul>`
	}

	nextHTML := `<p>Все результаты roadmap выполнены.</p>`
	if next := model.CurrentStatus.NextResult; next != nil {
		target := next.TargetDocument
		if target == "" {
			target = next.Document
		}
		href := "#"
		if document := model.DocByPath[target]; document != nil {
			href = relativeURL(current, document.OutputPath)
		}
		status := StatusFor("Запланировано")
		if next.CompletionSource == "use-case-status" && next.TargetStatus != nil {
			status = *next.TargetStatus
		}
		text := strings.TrimSpace(strings.TrimLeft(strings.TrimPrefix(next.Text, next.ID), " :—-"))
		nextHTML = `<div class="card-kicker">` + renderStatusChip(status) + `</div><p><a href="` + escapeAttr(href) + `"><strong>` + escapeHTML(next.ID) + `</strong></a> — ` + escapeHTML(text) + `</p>`
	}

	return `<section class="dashboard-section"><div class="section-heading"><div><h2>Вычисляемое состояние</h2><p>Формируется из активных work items и эффективного состояния roadmap.</p></div></div><h3>Сейчас в работе</h3>` + activeHTML + `<h3>Блокеры</h3>` + blockersHTML + `<h3>Следующий результат</h3>` + nextHTML + `</section>`
}

func renderDashboard(model *Model) string {
	stats := model.Stats
	var docs strings.Builder
	for _, document := range model.Documents {
		if document.SourcePath == "index.md" {
			continue
		}
		docs.WriteString(docCard("index.html", document))
	}
	var stages strings.Builder
	for _, stage := range model.RoadmapStages {
		href := relativeURL("index.html", stage.Document.OutputPath) + "#" + stage.Anchor
		stages.WriteString(`<article class="timeline-card"><div>` + renderStatusChip(stage.Status) + `</div><h3><a href="` + escapeAttr(href) + `">` + escapeHTML(stage.Title) + `</a></h3>` + renderProgress(stage.TaskStats, "Этап") + `<p>` + escapeHTML(truncate(stage.Text, 160)) + `</p></article>`)
	}
	var risks strings.Builder
	for _, risk := range model.Risks {
		href := relativeURL("index.html", risk.Document.OutputPath) + "#" + risk.Anchor
		risks.WriteString(`<article class="risk-card"><div>` + renderStatusChip(risk.Status) + `</div><h3><a href="` + escapeAttr(href) + `">` + escapeHTML(risk.ID+": "+risk.Title) + `</a></h3><p>Вероятность: ` + escapeHTML(risk.Probability) + ` · Влияние: ` + escapeHTML(risk.Impact) + `</p>` + renderProgress(risk.TaskStats, "Снижение риска") + `</article>`)
	}
	status := ""
	if model.Project.OverviewDocument != nil && model.Project.OverviewDocument.Metadata["status"] != "" ||
		model.Project.StatusDocument != nil && model.Project.StatusDocument.Metadata["status"] != "" {
		status = `<div class="page-kicker">` + renderStatusChip(model.Project.Status) + `</div>`
	}
	summary := ""
	if model.Project.Summary != "" {
		summary = `<div class="hero-summary" data-hero-summary><p>` + escapeHTML(model.Project.Summary) + `</p><button type="button" data-hero-summary-toggle hidden aria-expanded="false">Показать полностью</button></div>`
	}
	meta := ""
	if values := nonEmpty([]string{model.Project.Stage, model.Project.Version, model.Project.Owner, model.Project.Updated}); len(values) > 0 {
		meta = `<div class="hero-meta">` + escapeHTML(strings.Join(values, " · ")) + `</div>`
	}
	overview := ""
	if document := model.Project.OverviewDocument; document != nil {
		body := renderDocumentMarkdown(document, linkResolverFor(model, document), nil)
		if body != "" {
			overview = `<article class="doc-content dashboard-overview">` + body + `</article>`
		}
	}
	var metrics strings.Builder
	if stats.TotalTasks > 0 {
		metrics.WriteString(metricCard("Прогресс", fmt.Sprintf("%d%%", percentOrZero(stats.TaskProgress)), fmt.Sprintf("%d из %d задач roadmap", stats.CompletedTasks, stats.TotalTasks)))
	}
	metrics.WriteString(metricCard("Документы", stats.Documents, fmt.Sprintf("%d замечаний", stats.Warnings+stats.Errors)))
	if stats.Modules > 0 || stats.UseCases > 0 {
		metrics.WriteString(metricCard("Модули", stats.Modules, fmt.Sprintf("%d сценариев", stats.UseCases)))
	}
	if stats.Risks > 0 {
		metrics.WriteString(metricCard("Риски", stats.OpenRisks, fmt.Sprintf("%d всего", stats.Risks)))
	}
	roadmap := ""
	if stages.Len() > 0 {
		roadmap = `<section class="dashboard-section"><div class="section-heading"><div><h2>Дорожная карта</h2><p>Roadmap определяет охват; состояние UC-элементов вычисляется из связанных сценариев.</p></div></div><div class="timeline-grid">` + stages.String() + `</div></section>`
	}
	computedStatus := ""
	if len(model.Knowledge.WorkItems) > 0 || stats.TotalTasks > 0 {
		computedStatus = renderComputedStatus(model, "index.html")
	}
	riskSection := ""
	if risks.Len() > 0 {
		riskSection = `<section class="dashboard-section"><div class="section-heading"><div><h2>Открытые риски</h2></div></div><div class="card-grid">` + risks.String() + `</div></section>`
	}
	documentList := `<p class="empty-state">Дополнительных документов нет.</p>`
	if docs.Len() > 0 {
		documentList = `<div data-filter-scope>` + filterControls(true, true) + `<div class="collection-summary">Показано: <strong data-filter-count></strong></div><div class="card-grid">` + docs.String() + `</div><div class="empty-state" data-filter-empty hidden>Ничего не найдено.</div></div>`
	}
	hero := `<header class="page-header"><h1>` + escapeHTML(model.Project.Title) + `</h1><p class="page-lead">` + escapeHTML(model.Project.Description) + `</p></header>`
	if model.SiteConfig.Hero.Enabled {
		heroLogo := ""
		if logo := brandingOutput(model, "logo"); logo != "" {
			heroLogo = `<img class="hero-logo" src="` + escapeAttr(logo) + `" alt="">`
		}
		heroImage := ""
		heroClass := "hero"
		if image := brandingOutput(model, "hero"); image != "" {
			heroClass += " has-image"
			heroImage = `<div class="hero-media"><img src="` + escapeAttr(image) + `" alt=""></div>`
		}
		hero = `<header class="` + heroClass + `"><div class="hero-copy">` + heroLogo + status + `<h1>` + escapeHTML(model.Project.Title) + `</h1><p class="hero-description">` + escapeHTML(model.Project.Description) + `</p>` + summary + meta + `</div>` + heroImage + `</header>`
	}
	content := hero + overview + `<section class="metric-grid">` + metrics.String() + `</section>` + roadmap + computedStatus + riskSection + `<section class="dashboard-section"><div class="section-heading"><div><h2>Документация проекта</h2><p>Поиск, фильтры, статусы и локальные чек-листы.</p></div><a class="section-link" href="` + escapeAttr(model.HealthOutputPath) + `">Качество →</a></div>` + documentList + `</section>`
	return pageShell(model, "index.html", model.Project.Title, model.Project.Description, content, "")
}

func nonEmpty(values []string) []string {
	out := []string{}
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			out = append(out, v)
		}
	}
	return out
}

func renderDirectoryPage(model *Model, directory string) string {
	current := path.Join(directory, "index.html")
	docs := []*Document{}
	prefix := directory + "/"
	for _, doc := range model.Documents {
		if strings.HasPrefix(doc.SourcePath, prefix) && !strings.EqualFold(doc.FileName, "index.md") {
			docs = append(docs, doc)
		}
	}
	var cards strings.Builder
	for _, doc := range docs {
		cards.WriteString(docCard(current, doc))
	}
	collection := `<div class="card-grid">` + cards.String() + `</div>`
	if len(docs) > 1 {
		collection = `<section data-filter-scope>` + filterControls(documentsHaveDifferentStatuses(docs), false) + `<div class="collection-summary">Показано: <strong data-filter-count></strong></div>` + collection + `<div class="empty-state" data-filter-empty hidden>Ничего не найдено.</div></section>`
	}
	content := breadcrumbs(model, current, directoryLabel(directory)) + `<header class="page-header"><h1>` + escapeHTML(directoryLabel(directory)) + `</h1><p class="page-lead">Документы раздела: ` + fmt.Sprint(len(docs)) + `.</p></header>` + collection
	return pageShell(model, current, directoryLabel(directory), directoryLabel(directory), content, "")
}

func renderHealthPage(model *Model) string {
	current := model.HealthOutputPath
	var rows strings.Builder
	for _, issue := range model.Issues {
		location := escapeHTML(issue.DocumentPath)
		if doc := model.DocByPath[issue.DocumentPath]; doc != nil {
			location = `<a href="` + escapeAttr(relativeURL(current, doc.OutputPath)) + `">` + escapeHTML(issue.DocumentPath) + `</a>`
		}
		fmt.Fprintf(&rows, `<div class="issue-row" data-filter-item data-search="%s" data-severity="%s" data-code="%s"><div class="issue-severity">%s</div><div><strong>%s</strong><span class="table-subtext">%s</span></div><div class="issue-location">%s%s</div></div>`, escapeAttr(issue.Message+" "+issue.Code+" "+issue.DocumentPath), escapeAttr(issue.Severity), escapeAttr(issue.Code), map[bool]string{true: "Ошибка", false: "Предупреждение"}[issue.Severity == "error"], escapeHTML(issue.Message), escapeHTML(issue.Code), location, func() string {
			if issue.Line > 0 {
				return fmt.Sprintf(" · строка %d", issue.Line)
			}
			return ""
		}())
	}
	content := breadcrumbs(model, current, "Качество документации") + `<header class="page-header"><h1>Качество документации</h1><p class="page-lead">Проверка структуры, идентификаторов, связей, безопасности и актуальности.</p></header><section class="metric-grid">` + metricCard("Документы", model.Stats.Documents, "") + metricCard("Предупреждения", model.Stats.Warnings, "") + metricCard("Ошибки", model.Stats.Errors, "") + metricCard("Битые ссылки", model.Stats.BrokenLinks, "") + `</section><section class="dashboard-section"><div class="section-heading"><h2>Замечания</h2><a href="` + escapeAttr(relativeURL(current, model.ReportOutputPath)) + `">report.json →</a></div><div data-filter-scope><div class="collection-controls"><input type="search" data-filter-control="search" placeholder="Поиск"><select data-filter-control="severity"><option value="all">Все уровни</option><option value="warning">Предупреждения</option><option value="error">Ошибки</option></select></div><div class="collection-summary">Показано: <strong data-filter-count></strong></div><div class="issue-list">` + rows.String() + `</div><div class="empty-state" data-filter-empty hidden>Замечаний нет.</div></div></section>`
	return pageShell(model, current, "Качество документации", "Проверка проектной документации", content, "")
}

func BuildReport(model *Model) ProjectReport {
	documents := []ReportDocument{}
	for _, doc := range model.Documents {
		links := []ReportLink{}
		for _, link := range doc.ResolvedLinks {
			target := ""
			kind := ""
			if link.TargetDocument != nil {
				target = link.TargetDocument.SourcePath
				kind = "document"
			} else if link.RepositoryPath != "" {
				target = link.RepositoryPath
				kind = "repository"
			} else if link.AssetPath != "" {
				target = link.AssetPath
				kind = "asset"
			} else if link.GeneratedTarget != "" {
				target = link.GeneratedTarget
				kind = "directory"
			} else if link.External {
				kind = "external"
			}
			links = append(links, ReportLink{
				Destination: link.Destination, Broken: link.Broken, Blocked: link.Blocked,
				TargetKind: kind, Target: target, Href: link.Href,
			})
		}
		backlinks := []string{}
		for _, item := range doc.Backlinks {
			backlinks = append(backlinks, item.SourcePath)
		}
		related := []string{}
		for _, item := range doc.RelatedDocuments {
			related = append(related, item.SourcePath)
		}
		documents = append(documents, ReportDocument{
			ID: doc.Metadata["id"], SourcePath: doc.SourcePath, OutputPath: doc.OutputPath,
			Type: doc.Type, Title: doc.Title, Description: doc.Description, Metadata: doc.Metadata,
			Status: doc.Status, TaskStats: doc.TaskStats, UpdatedAt: doc.UpdatedAt, Stale: doc.Stale,
			Warnings: len(doc.Warnings), Errors: len(doc.Errors), Links: links,
			Backlinks: backlinks, RelatedDocuments: related,
		})
	}
	roadmap := []ReportRoadmapStage{}
	for _, stage := range model.RoadmapStages {
		roadmap = append(roadmap, ReportRoadmapStage{
			Title: stage.Title, Status: stage.Status, PlannedDate: stage.PlannedDate,
			TaskStats: stage.TaskStats, Items: append([]RoadmapItem{}, stage.Items...),
			Document: stage.Document.SourcePath, Anchor: stage.Anchor,
		})
	}
	risks := []ReportRisk{}
	for _, risk := range model.Risks {
		risks = append(risks, ReportRisk{
			ID: risk.ID, Title: risk.Title, Status: risk.Status, Probability: risk.Probability,
			Impact: risk.Impact, Owner: risk.Owner, TaskStats: risk.TaskStats,
			Document: risk.Document.SourcePath, Anchor: risk.Anchor,
		})
	}
	project := ReportProject{
		Title: model.Project.Title, Description: model.Project.Description, Status: model.Project.Status,
		Stage: model.Project.Stage, Version: model.Project.Version, Owner: model.Project.Owner,
		Updated: model.Project.Updated, Summary: model.Project.Summary,
	}
	screens := make([]ReportScreen, 0, len(model.Knowledge.Screens))
	for _, screen := range model.Knowledge.Screens {
		status := screen.Status.Kind
		if status == "done" {
			status = "implemented"
		}
		screens = append(screens, ReportScreen{
			ID: screen.ID, Title: screen.Title, Description: screen.Description,
			Module: screen.ModuleID, Type: screen.Kind, Status: status,
			Route: screen.Route, Preview: screen.Preview, Component: screen.Component, Owner: screen.Owner,
			Updated: screen.Updated, Parent: screen.ParentID, States: append([]ScreenState{}, screen.States...),
			IncomingTransitions: append([]string{}, screen.IncomingTransitionIDs...),
			OutgoingTransitions: append([]string{}, screen.OutgoingTransitionIDs...),
			UseCases:            append([]string{}, screen.UseCaseIDs...), WorkItems: append([]string{}, screen.WorkItemIDs...),
			Contracts: append([]string{}, screen.ContractDocuments...), Document: screen.Document,
		})
	}
	return ProjectReport{
		SchemaVersion: 2, Generator: GeneratorInfo{Name: "Docgent", Version: Version},
		GeneratedAt: model.GeneratedAt, SourceDirectory: pathBase(model.RootDirectory),
		StaleDays: model.StaleDays, Project: project, CurrentStatus: model.CurrentStatus,
		Stats: model.Stats, Documents: documents, Roadmap: roadmap, Risks: risks,
		Knowledge: ReportKnowledge{
			Modules: model.Knowledge.Modules, UseCases: model.Knowledge.UseCases,
			Flows: model.Knowledge.Flows, BusinessRules: model.Knowledge.BusinessRules, WorkItems: model.Knowledge.WorkItems,
		},
		Screens: screens, Transitions: model.Knowledge.Transitions,
		PlayableFlows: model.Knowledge.PlayableFlows, Hotspots: model.Knowledge.Hotspots,
		ErrorDefinitions: model.Knowledge.Errors, Traceability: model.Knowledge.Traceability,
		Issues: append([]Issue{}, model.Issues...),
	}
}

func ensureOutputSafety(inputDirectory, outputDirectory string) error {
	input, _ := filepath.Abs(inputDirectory)
	output, _ := filepath.Abs(outputDirectory)
	resolvedInput, err := resolvePathForSafety(input)
	if err != nil {
		return err
	}
	resolvedOutput, err := resolvePathForSafety(output)
	if err != nil {
		return err
	}
	if samePath(resolvedInput, resolvedOutput) {
		return fmt.Errorf("выходной каталог не может совпадать с каталогом исходной документации")
	}
	volume := filepath.VolumeName(resolvedOutput)
	root := string(filepath.Separator)
	if volume != "" {
		root = volume + string(filepath.Separator)
	}
	if samePath(resolvedOutput, root) {
		return fmt.Errorf("корневой каталог нельзя использовать как выходной")
	}
	if ensureInside(resolvedOutput, resolvedInput) {
		return fmt.Errorf("выходной каталог не может быть родительским для каталога исходной документации")
	}
	return nil
}

// GenerateSite writes a fully static, file:// compatible portal.
func GenerateSite(model *Model, options Options) (GenerateResult, error) {
	model.ScreenMapEnabled = !options.NoScreenMap
	output, err := filepath.Abs(options.OutputDirectory)
	if err != nil {
		return GenerateResult{}, err
	}
	if err = ensureOutputSafety(model.RootDirectory, output); err != nil {
		return GenerateResult{}, err
	}
	if options.Clean {
		if _, statErr := os.Stat(output); statErr == nil {
			if err = safeRemoveDirectory(output, model.RootDirectory); err != nil {
				return GenerateResult{}, err
			}
		}
	}
	if err = mkdirp(output); err != nil {
		return GenerateResult{}, err
	}
	for _, asset := range []string{"style.css", "app.js", "favicon.svg", "screen-map.css", "screen-map.js", "playable-flow.css", "playable-flow.js", "mermaid.tiny.js", "mermaid.LICENSE.txt"} {
		if err = copyFSFile(EmbeddedFiles, "assets/"+asset, filepath.Join(output, "assets", asset)); err != nil {
			return GenerateResult{}, err
		}
	}
	searchJSON, err := jsonForScript(model.SearchIndex)
	if err != nil {
		return GenerateResult{}, err
	}
	if err = writeFileEnsured(filepath.Join(output, "assets", "search-index.js"), append([]byte("window.PROJECT_DOCS_SEARCH_INDEX = "), append(searchJSON, []byte(";\n")...)...)); err != nil {
		return GenerateResult{}, err
	}
	for outputPath, sourcePath := range model.Assets {
		if err = copyFileEnsured(sourcePath, filepath.Join(output, filepath.FromSlash(outputPath))); err != nil {
			return GenerateResult{}, err
		}
	}
	for outputPath, sourcePath := range model.BrandingAssets {
		if err = copyFileEnsured(sourcePath, filepath.Join(output, filepath.FromSlash(outputPath))); err != nil {
			return GenerateResult{}, err
		}
	}
	if err = writeFileEnsured(filepath.Join(output, "index.html"), []byte(renderDashboard(model))); err != nil {
		return GenerateResult{}, err
	}
	pages := 1
	for _, document := range model.Documents {
		directory := strings.Split(document.SourcePath, "/")[0]
		typedCatalogIndex := strings.EqualFold(document.FileName, "index.md") && (directory == "use-cases" || directory == "flows")
		if document.SourcePath == "index.md" || document.Type == "screen-index" || typedCatalogIndex {
			continue
		}
		pageHTML := renderDocumentPage(model, document)
		if document.Type == "use-case" {
			pageHTML = renderUseCasePage(model, document)
		}
		if err = writeFileEnsured(filepath.Join(output, filepath.FromSlash(document.OutputPath)), []byte(pageHTML)); err != nil {
			return GenerateResult{}, err
		}
		pages++
	}
	if len(model.Knowledge.UseCases)+len(model.Knowledge.Flows) > 0 {
		processPages := map[string]string{
			"processes/index.html": renderProcessCatalogPage(model, "processes/index.html", "flow"),
			"use-cases/index.html": renderProcessCatalogPage(model, "use-cases/index.html", "use-case"),
			"flows/index.html":     renderProcessCatalogPage(model, "flows/index.html", "flow"),
		}
		for target, pageHTML := range processPages {
			if err = writeFileEnsured(filepath.Join(output, filepath.FromSlash(target)), []byte(pageHTML)); err != nil {
				return GenerateResult{}, err
			}
			pages++
		}
	}
	if len(model.Knowledge.Screens) > 0 {
		generatedPages := map[string]string{
			"screens/catalog.html": renderScreenCatalogPage(model, "screens/catalog.html"),
			"traceability.html":    renderTraceabilityPage(model, "traceability.html"),
		}
		if model.ScreenMapEnabled {
			generatedPages["screens/index.html"] = renderScreenMapPage(model, "screens/index.html")
		}
		for target, pageHTML := range generatedPages {
			if err = writeFileEnsured(filepath.Join(output, filepath.FromSlash(target)), []byte(pageHTML)); err != nil {
				return GenerateResult{}, err
			}
			pages++
		}
	}
	directories := make([]string, 0, len(model.Directories))
	for d := range model.Directories {
		directories = append(directories, d)
	}
	sort.SliceStable(directories, func(i, j int) bool { return naturalCompare(directories[i], directories[j]) < 0 })
	for _, directory := range directories {
		if directory == "use-cases" || directory == "flows" {
			continue
		}
		if directoryHasSourceIndex(model, directory) {
			continue
		}
		target := path.Join(directory, "index.html")
		if err = writeFileEnsured(filepath.Join(output, filepath.FromSlash(target)), []byte(renderDirectoryPage(model, directory))); err != nil {
			return GenerateResult{}, err
		}
		pages++
	}
	if err = writeFileEnsured(filepath.Join(output, filepath.FromSlash(model.HealthOutputPath)), []byte(renderHealthPage(model))); err != nil {
		return GenerateResult{}, err
	}
	pages++
	report, err := json.MarshalIndent(BuildReport(model), "", "  ")
	if err != nil {
		return GenerateResult{}, err
	}
	report = append(report, '\n')
	if err = writeFileEnsured(filepath.Join(output, model.ReportOutputPath), report); err != nil {
		return GenerateResult{}, err
	}
	return GenerateResult{OutputDirectory: output, Pages: pages, Assets: len(model.Assets) + len(model.BrandingAssets) + 10}, nil
}
