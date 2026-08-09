package toudocu

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	frontend "toudocu/internal/site"
)

const Version = "0.0.1"

var fieldOrder = []string{"status", "type", "stage", "version", "owner", "author", "actor", "priority", "criticality", "module", "useCase", "flow", "screens", "transitions", "standards", "runbooks", "startScreen", "terminalScreens", "allowCycle", "route", "preview", "parentScreen", "component", "environment", "risk", "lastVerified", "supersededBy", "errors", "dependsOn", "source", "date", "plannedDate", "updated", "probability", "impact", "scope", "id", "tags"}

var typeIcons = map[string]string{"overview": "⌂", "status": "◐", "roadmap": "→", "risks": "!", "ideas": "✦", "notes": "✎", "changelog": "↻", "use-case": "◎", "module": "▦", "architecture": "◇", "contract": "⇄", "decision": "◆", "flow": "⇢", "screen-map": "⌗", "screen-index": "⌗", "screen": "▣", "guide": "◫", "work": "☐", "reference": "≡", "standard": "✓", "quality-index": "✓", "runbook": "↻", "runbook-index": "↻", "document": "•"}

func navigationDocumentIcon(document *Document) (glyph, statusClass, statusLabel string) {
	glyph = typeIcons[document.Type]
	if glyph == "" {
		glyph = typeIcons["document"]
	}
	if document.Type == "work" && document.Status.Kind == "done" {
		glyph = "☑"
	}

	if strings.TrimSpace(document.Metadata["status"]) == "" {
		return glyph, "", ""
	}
	statusLabel = document.Status.Label
	if document.Status.Recognized && document.Status.Kind != "neutral" {
		statusClass = " status-" + document.Status.Kind
	}
	return glyph, statusClass, statusLabel
}

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

func documentContextPath(model *Model, document *Document) string {
	if ensureInside(model.RepositoryRoot, document.AbsolutePath) {
		return toPosixRelative(model.RepositoryRoot, document.AbsolutePath)
	}
	return document.SourcePath
}

func renderDocumentContextButton(model *Model, document *Document) string {
	if document == nil || document == model.ProjectChangelog {
		return ""
	}
	copyButton := `<button class="document-context-button" type="button" data-copy-document-context data-document-context-title="` +
		escapeAttr(document.Title) + `" data-document-context-path="` + escapeAttr(documentContextPath(model, document)) +
		`"><span class="document-context-icon" aria-hidden="true">⧉</span><span data-copy-document-context-label aria-live="polite">Копировать контекст</span></button>`
	if !model.serveMode {
		return copyButton
	}
	encoded := url.QueryEscape(document.SourcePath)
	return `<div class="document-context-actions">` + copyButton +
		`<a class="document-context-button" href="/_toudocu/editor/?path=` + escapeAttr(encoded) + `">Редактировать</a>` +
		`<a class="document-context-button" href="` + escapeAttr(changesDocumentURL(documentContextPath(model, document))) + `">Показать изменения</a>` +
		`<a class="document-context-button" href="/_toudocu/api/editor/file?raw=1&amp;path=` + escapeAttr(encoded) + `" target="_blank" rel="noopener">Открыть исходник</a></div>`
}

func renderOpenAPIContractButton(model *Model, document *Document) string {
	if !model.serveMode || document == nil {
		return ""
	}
	for _, link := range document.Links {
		destination, _, _ := splitLinkDestination(link.Destination)
		if destination == "" || isExternalDestination(destination) {
			continue
		}
		candidate := path.Clean(path.Join(path.Dir(document.SourcePath), destination))
		for _, contract := range model.openAPIContracts {
			if candidate == contract.Path {
				return `<a class="document-context-button" href="` + apiDocsUIPath + `?spec=` + escapeAttr(url.QueryEscape(contract.Path)) + `">Открыть в Swagger UI</a>`
			}
		}
	}
	return ""
}

func renderRoadmapAddButton(model *Model, document *Document) string {
	if !model.serveMode || document == nil || document.Type != "roadmap" {
		return ""
	}
	return `<button class="document-context-button roadmap-add-button" type="button" data-roadmap-add>Добавить результат</button><span class="visually-hidden" data-roadmap-add-status role="status" aria-live="polite"></span>`
}

func metricCard(label string, value any, detail string) string {
	out := fmt.Sprintf(`<div class="metric-card"><div class="metric-label">%s</div><div class="metric-value">%s</div>`, escapeHTML(label), escapeHTML(value))
	if detail != "" {
		out += `<div class="metric-detail">` + escapeHTML(detail) + `</div>`
	}
	return out + `</div>`
}

func outputForDirectory(model *Model, directory string) string {
	section := sectionTypeForPath(directory)
	if sectionRoute(section) != "" && sectionRoute(section) != directory {
		return sectionCatalogOutput(section)
	}
	if section == SectionScreens && len(model.Knowledge.Screens) > 0 {
		return "screens/catalog.html"
	}
	if section == SectionQuality || section == SectionRunbooks {
		return path.Join(directory, "index.html")
	}
	if document := model.DocByPath[path.Join(directory, "index.md")]; document != nil {
		return document.OutputPath
	}
	return path.Join(directory, "index.html")
}

func modelDirectoryLabel(model *Model, directory string) string {
	if section := sectionTypeForPath(directory); section != "" {
		if model.SiteConfig.Project.Locale != "" && len(model.SiteConfig.Project.Sections) == len(BuiltinSections) && strings.TrimSpace(model.SiteConfig.Project.Sections[section]) != "" {
			title := model.SiteConfig.Project.Sections[section]
			return title
		}
		if spec, ok := sectionSpec(section); ok {
			return spec.EnglishTitle
		}
	}
	if manifest := model.DocByPath[path.Join(directory, "index.md")]; manifest != nil && manifest.Title != "" {
		return manifest.Title
	}
	return directoryLabel(directory)
}

func renderNavigation(model *Model, current string) string {
	var b strings.Builder
	b.WriteString(`<nav aria-label="Документация"><div class="nav-title">Проект</div><ul class="nav-tree">`)
	rootDocs := []*Document{}
	sectionGroups := map[SectionType][]*Document{}
	customGroups := map[string][]*Document{}
	for _, document := range model.Documents {
		first := strings.Split(document.SourcePath, "/")[0]
		if !strings.Contains(document.SourcePath, "/") {
			rootDocs = append(rootDocs, document)
		} else if document.SectionType != "" {
			sectionGroups[document.SectionType] = append(sectionGroups[document.SectionType], document)
		} else {
			customGroups[first] = append(customGroups[first], document)
		}
	}
	if len(model.Knowledge.UseCases) > 0 {
		if _, exists := sectionGroups[SectionUseCases]; !exists {
			sectionGroups[SectionUseCases] = []*Document{}
		}
	}
	if len(model.Knowledge.UseCases)+len(model.Knowledge.Flows) > 0 {
		if _, exists := sectionGroups[SectionFlows]; !exists {
			sectionGroups[SectionFlows] = []*Document{}
		}
	}
	if len(model.Knowledge.Screens) > 0 {
		if _, exists := sectionGroups[SectionScreens]; !exists {
			sectionGroups[SectionScreens] = []*Document{}
		}
	}
	writeDoc := func(document *Document, label string) {
		active := ""
		aria := ""
		if document.OutputPath == current {
			active = " is-active"
			aria = ` aria-current="page"`
		}
		glyph, statusClass, statusLabel := navigationDocumentIcon(document)
		statusTitle := ""
		accessibleStatus := ""
		if statusLabel != "" {
			statusTitle = ` title="` + escapeAttr("Статус: "+statusLabel) + `"`
			accessibleStatus = `<span class="visually-hidden"> · Статус: ` + escapeHTML(statusLabel) + `</span>`
		}
		if label == "" {
			label = document.Title
		}
		fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"%s><span class="nav-icon%s" aria-hidden="true"%s>%s</span><span>%s</span>%s</a></li>`, active, escapeAttr(relativeURL(current, document.OutputPath)), aria, escapeAttr(statusClass), statusTitle, escapeHTML(glyph), escapeHTML(label), accessibleStatus)
	}
	for _, doc := range rootDocs {
		writeDoc(doc, "")
	}
	if model.ProjectChangelog != nil {
		writeDoc(model.ProjectChangelog, "Журнал изменений проекта")
	}
	writeGroup := func(section SectionType, directory, groupKey string, docs []*Document) {
		target := outputForDirectory(model, directory)
		active := ""
		if target == current || strings.HasPrefix(current, directory+"/") || sectionRoute(section) != "" && strings.HasPrefix(current, sectionRoute(section)+"/") {
			active = " is-active"
		}
		if section == SectionUseCases && strings.HasPrefix(current, "use-cases/") {
			active = " is-active"
		}
		if section == SectionFlows && (strings.HasPrefix(current, sectionRoute(section)+"/") || strings.HasPrefix(current, "flows/")) {
			active = " is-active"
		}
		if section == SectionScreens && strings.HasPrefix(current, "screens/") {
			active = " is-active"
		}
		label := modelDirectoryLabel(model, directory)
		groupID := "nav-group-" + slugify(groupKey)
		sort.SliceStable(docs, func(i, j int) bool { return documentLess(docs[i], docs[j]) })
		if section == SectionFlows {
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
				return
			}
		}
		fmt.Fprintf(&b, `<li class="nav-item nav-folder" data-nav-folder="%s"><div class="nav-folder-row"><button class="nav-folder-toggle" type="button" data-nav-folder-toggle aria-expanded="true" aria-controls="%s" aria-label="Свернуть раздел %s"><span aria-hidden="true">▾</span></button><a class="nav-folder-link%s" href="%s"><span>%s</span></a></div><ul id="%s">`, escapeAttr(groupKey), escapeAttr(groupID), escapeAttr(label), active, escapeAttr(relativeURL(current, target)), escapeHTML(label), escapeAttr(groupID))
		if section == SectionScreens && model.ScreenMapEnabled {
			activeClass := ""
			aria := ""
			if current == "screens/index.html" {
				activeClass = " is-active"
				aria = ` aria-current="page"`
			}
			fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"%s><span class="nav-icon" aria-hidden="true">⌗</span><span>Карта экранов</span></a></li>`,
				activeClass, escapeAttr(relativeURL(current, "screens/index.html")), aria)
		}
		if section == SectionFlows {
			for _, doc := range docs {
				if doc.Type == "flow" && !strings.EqualFold(doc.FileName, "index.md") {
					writeDoc(doc, "")
				}
			}
			b.WriteString(`</ul></li>`)
			return
		}
		for _, doc := range docs {
			if strings.EqualFold(doc.FileName, "index.md") || doc.Type == "screen-map" || doc.OutputPath == target {
				continue
			}
			if section == SectionArchitecture && strings.EqualFold(doc.FileName, "overview.md") {
				writeDoc(doc, "Обзор архитектуры")
				continue
			}
			if section == SectionWork {
				archived, _, _ := taskArchivePathInfo(doc.SourcePath)
				if archived {
					continue
				}
			}
			writeDoc(doc, "")
		}
		b.WriteString(`</ul></li>`)
	}
	for _, spec := range BuiltinSections {
		docs, exists := sectionGroups[spec.Type]
		if !exists {
			continue
		}
		writeGroup(spec.Type, spec.SourceDir, spec.Route, docs)
	}
	keys := make([]string, 0, len(customGroups))
	for key := range customGroups {
		keys = append(keys, key)
	}
	sort.SliceStable(keys, func(i, j int) bool { return naturalCompare(keys[i], keys[j]) < 0 })
	for _, key := range keys {
		writeGroup("", key, key, customGroups[key])
	}
	b.WriteString(`</ul><div class="nav-title">Контроль</div><ul class="nav-tree">`)
	active := ""
	if current == model.HealthOutputPath {
		active = " is-active"
	}
	fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"><span>Качество документации</span></a></li>`, active, escapeAttr(relativeURL(current, model.HealthOutputPath)))
	if model.serveMode {
		fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link" href="/changes/"><span>Изменения</span></a></li>`)
		if len(model.openAPIContracts) > 0 {
			fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link" href="/_toudocu/api-docs/"><span>HTTP API</span></a></li>`)
		}
	}
	if len(model.Knowledge.Screens) > 0 {
		active = ""
		if current == "traceability.html" {
			active = " is-active"
		}
		fmt.Fprintf(&b, `<li class="nav-item"><a class="nav-link%s" href="%s"><span>Трассируемость</span></a></li>`, active, escapeAttr(relativeURL(current, "traceability.html")))
	}
	b.WriteString(`</ul></nav>`)
	return b.String()
}

func projectChangelogSearchItem(document *Document) SearchItem {
	description := document.Description
	if description == "" {
		description = document.PlainText
	}
	return SearchItem{
		Title: document.Title, Path: projectChangelogFile, URL: document.OutputPath,
		Type: document.Type, TypeLabel: document.TypeLabel, Description: truncate(description, 220),
		Text: canonicalText(strings.Join([]string{document.Title, projectChangelogFile, document.PlainText}, " ")),
	}
}

func mustFrontendAsset(logical string) string {
	asset, err := frontend.AssetName(logical)
	if err != nil {
		panic(err)
	}
	return asset
}

func pageReference(model *Model, current string) (kind, id string) {
	kind = "document"
	var document *Document
	for _, candidate := range model.Documents {
		if candidate.OutputPath == current {
			document = candidate
			break
		}
	}
	if document == nil && model.ProjectChangelog != nil && model.ProjectChangelog.OutputPath == current {
		document = model.ProjectChangelog
	}
	if document == nil {
		if strings.HasPrefix(current, "screens/") {
			return "screen", ""
		}
		return kind, ""
	}
	id = stableDocumentID(model, document.SourcePath)
	switch document.Type {
	case "architecture", "module", "use-case", "flow", "screen", "standard", "runbook":
		kind = document.Type
	case "work":
		kind = "task"
	case "screen-map", "screen-index":
		kind = "screen"
	case "quality-index":
		kind = "standard"
	}
	return kind, id
}

func stableDocumentID(model *Model, sourcePath string) string {
	for _, module := range model.Knowledge.Modules {
		if module.Document == sourcePath {
			return module.ID
		}
	}
	for _, useCase := range model.Knowledge.UseCases {
		if useCase.Document == sourcePath {
			return useCase.ID
		}
	}
	for _, flow := range model.Knowledge.Flows {
		if flow.Document == sourcePath {
			return flow.ID
		}
	}
	for _, screen := range model.Knowledge.Screens {
		if screen.Document == sourcePath {
			return screen.ID
		}
	}
	for _, standard := range model.Knowledge.Standards {
		if standard.Document == sourcePath {
			return standard.ID
		}
	}
	for _, runbook := range model.Knowledge.Runbooks {
		if runbook.Document == sourcePath {
			return runbook.ID
		}
	}
	for _, item := range model.Knowledge.WorkItems {
		if item.Document == sourcePath {
			return item.ID
		}
	}
	return ""
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
	extraStyles := ""
	if strings.Contains(content, `data-screen-map`) {
		extraStyles += `<link rel="stylesheet" data-page-style="screen-map" href="` + escapeAttr(prefix+"assets/"+mustFrontendAsset("screen-map.css")) + `">`
	}
	if strings.Contains(content, `data-playable-flow`) {
		extraStyles += `<link rel="stylesheet" data-page-style="playable-flow" href="` + escapeAttr(prefix+"assets/"+mustFrontendAsset("playable-flow.css")) + `">`
	}
	favicon := "assets/" + mustFrontendAsset("favicon.svg")
	if custom := brandingOutput(model, "favicon"); custom != "" {
		favicon = custom
	}
	attributes := appearanceAttributes(config)
	brandMark := `<span class="brand-mark" aria-hidden="true">DD</span>`
	if logo := brandingOutput(model, "logo"); logo != "" {
		brandMark = `<img class="brand-logo" src="` + escapeAttr(relativeURL(current, logo)) + `" alt="">`
	}
	footer := renderFooter(config.Footer)
	themeLabel, themeIndicator := siteThemePresentation(config.Theme)
	schemeLabel := colorSchemeLabel(config.ColorScheme)
	themeSelect := `<label class="header-select site-theme-select"><span class="header-select-visual" aria-hidden="true"><span class="site-theme-indicator" data-site-theme-indicator>` + escapeHTML(themeIndicator) + `</span><span data-site-theme-label>` + escapeHTML(themeLabel) + `</span></span><select data-site-theme-select aria-label="Тема оформления">` + selectOptions(config.Theme, []selectOption{{"classic", "Классика"}, {"paper", "Бумага"}, {"terminal", "Терминал"}}) + `</select></label>`
	schemeSelect := `<label class="header-select scheme-select"><span class="header-select-visual" aria-hidden="true"><span class="scheme-toggle-indicator"></span><span data-theme-label>` + escapeHTML(schemeLabel) + `</span></span><select data-color-scheme-select aria-label="Цветовая схема">` + selectOptions(config.ColorScheme, []selectOption{{"system", "Система"}, {"light", "Светлая"}, {"dark", "Тёмная"}}) + `</select></label>`
	languageSelect := renderLanguageSelect(model.languageTargets[current])
	serveControls, serveCSS, serveJS, serveRevision := "", "", "", ""
	if model.serveMode {
		serveControls = workspaceNavigation(workspacePortal) + `<button class="icon-button server-rebuild" type="button" data-server-rebuild aria-label="Пересобрать документацию" title="Пересобрать документацию"><svg class="server-rebuild-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6"/></svg></button><span class="visually-hidden" data-server-rebuild-status role="status" aria-live="polite"></span>`
		serveCSS = prefix + "assets/" + mustFrontendAsset("serve.css")
		serveJS = prefix + "assets/" + mustFrontendAsset("serve.js")
		serveRevision = model.serveRevision
	}
	locale := model.SiteConfig.Project.Locale
	if locale == "" {
		locale = "en"
	}
	kind, id := pageReference(model, current)
	runtime := frontend.RuntimeStatic
	capabilities := frontend.Capabilities{Search: true, Diagrams: true}
	var endpoints *frontend.Endpoints
	if model.serveMode {
		runtime = frontend.RuntimeServe
		capabilities.Editor, capabilities.Changes, capabilities.Rebuild, capabilities.TaskWorkspace = true, true, true, true
		capabilities.Review = model.translationLocale == ""
		capabilities.UpdateCheck = model.updateCheckEnabled
		endpoints = &frontend.Endpoints{Editor: editorAPIBase, Changes: changesAPIBase, Rebuild: rebuildEndpoint}
		if capabilities.Review {
			endpoints.Review = reviewAPIBase
		}
		if capabilities.UpdateCheck {
			endpoints.Version = versionEndpoint
		}
	}
	bootstrap, err := frontend.MarshalBootstrap(frontend.PageBootstrap{
		SchemaVersion: 1,
		Runtime:       runtime,
		Page:          frontend.PageReference{Kind: kind, ID: id, Path: current},
		Portal:        frontend.PortalReference{AssetBase: prefix + "assets/", DataBase: prefix + "data/"},
		UI: frontend.UISettings{
			Locale: locale, Theme: config.Theme, ColorScheme: config.ColorScheme,
			Accent: config.Accent, Density: config.Density, ContentWidth: config.ContentWidth,
		},
		Capabilities: capabilities,
		Endpoints:    endpoints,
	})
	if err != nil {
		panic(err)
	}
	header := `<header class="site-header"><div class="brand-area"><button class="icon-button sidebar-toggle" type="button" data-sidebar-toggle aria-label="Открыть навигацию">☰</button><a class="brand" href="` + escapeAttr(relativeURL(current, "index.html")) + `">` + brandMark + `<span class="brand-text">` + escapeHTML(model.Project.Title) + `</span></a></div><div class="global-search" role="search"><div class="search-input-wrap"><input type="search" data-global-search placeholder="Поиск по документации" aria-label="Поиск по документации" aria-expanded="false" aria-controls="global-search-results"><span class="search-shortcut">/</span></div><div class="search-results" id="global-search-results" data-search-results role="listbox" hidden></div></div><div class="header-actions"><button class="icon-button" type="button" data-print aria-label="Печать">⎙</button>` + serveControls + languageSelect + themeSelect + schemeSelect + `</div></header>`
	rendered, err := frontend.RenderShell(frontend.ShellView{
		Lang: locale, HTMLAttributes: template.HTMLAttr(attributes), Revision: serveRevision,
		Description: description, Title: fullTitle, Favicon: relativeURL(current, favicon),
		AppearanceJS: prefix + "assets/" + mustFrontendAsset("appearance.js"),
		PortalCSS:    prefix + "assets/" + mustFrontendAsset("portal.css"), ServeCSS: serveCSS,
		ExtraStyles: template.HTML(extraStyles), Bootstrap: bootstrap,
		PortalJS: prefix + "assets/" + mustFrontendAsset("portal.js"), ServeJS: serveJS,
		RootPrefix: prefix, Header: template.HTML(header), Navigation: template.HTML(renderNavigation(model, current)),
		MainClass: gridClass, Content: template.HTML(content), TOC: template.HTML(tocHTML), Footer: template.HTML(footer),
	})
	if err != nil {
		panic(err)
	}
	return rendered
}

func renderFooter(config FooterConfig) string {
	if config.Text == "Сгенерировано Toudocu "+Version && config.URL == defaultFooterURL {
		return `Сгенерировано <a href="` + escapeAttr(config.URL) + `" rel="noopener noreferrer">Toudocu</a> ` + escapeHTML(Version)
	}
	footer := escapeHTML(config.Text)
	if config.URL != "" {
		footer = `<a href="` + escapeAttr(config.URL) + `" rel="noopener noreferrer">` + footer + `</a>`
	}
	return footer
}

func renderLanguageSelect(targets []LanguageTarget) string {
	if len(targets) < 2 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<label class="header-select language-select"><span class="header-select-visual" aria-hidden="true">⌘</span><select aria-label="Язык документации" onchange="location.href=this.value">`)
	for _, target := range targets {
		selected := ""
		if target.Active {
			selected = " selected"
		}
		b.WriteString(`<option value="` + escapeAttr(target.URL) + `"` + selected + `>` + escapeHTML(target.Locale) + `</option>`)
	}
	b.WriteString(`</select></label>`)
	return b.String()
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
	return `<section class="dashboard-section dashboard-support-panel"><h2>Связанные документы</h2><ul class="related-list">` + b.String() + `</ul></section>`
}

func renderRiskStatus(model *Model, document *Document) string {
	if document == nil || document.Type != "risks" {
		return ""
	}
	counts := map[string]int{}
	labels := []string{}
	total := 0
	for _, risk := range model.Risks {
		if risk.Document != document {
			continue
		}
		label := risk.Status.Label
		if counts[label] == 0 {
			labels = append(labels, label)
		}
		counts[label]++
		total++
	}
	if total == 0 {
		return ""
	}
	statusCounts := make([]string, 0, len(labels))
	for _, label := range labels {
		statusCounts = append(statusCounts, fmt.Sprintf(`<span>%d %s</span>`, counts[label], escapeHTML(strings.ToLower(label))))
	}
	return `<section class="risk-status" aria-labelledby="risk-status-title"><div><h2 id="risk-status-title">Статус рисков</h2><p class="risk-status-total">Незакрытых рисков: ` + fmt.Sprintf(`%d из %d`, model.Stats.OpenRisks, total) + `</p><p class="risk-status-counts">` + strings.Join(statusCounts, ` <span aria-hidden="true">·</span> `) + `</p></div><ul class="risk-status-explanations"><li><strong>Открыт</strong> — требует решения.</li><li><strong>Снижается</strong> — меры выполняются, риск ещё не закрыт.</li><li><strong>Риск принят</strong> — владелец осознанно принимает риск; в незакрытые не входит.</li></ul></section>`
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
		label := "Чек-лист"
		if document.Type == "risks" {
			label = "Меры снижения"
		}
		controls = `<div class="document-toolbar task-toolbar"><span class="toolbar-label" id="task-filter-label">` + label + `</span><div class="task-filter-group" role="group" aria-labelledby="task-filter-label"><button class="toolbar-button" type="button" data-task-filter="all">Все</button><button class="toolbar-button" type="button" data-task-filter="open">Невыполненные</button><button class="toolbar-button" type="button" data-task-filter="complete">Выполненные</button></div></div>`
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
	if model.serveMode && document.Type == "work" {
		id := stableEntityIDRE.FindString(document.Title)
		computedStatus = `<nav class="task-page-tabs" aria-label="Представления задачи"><span aria-current="page">Контракт задачи</span><a href="/changes/?task=` + escapeAttr(url.QueryEscape(id)) + `&amp;path=` + escapeAttr(url.QueryEscape(documentContextPath(model, document))) + `">Изменения</a></nav>` + computedStatus
	}
	statusChip := ""
	if strings.TrimSpace(document.Metadata["status"]) != "" {
		statusChip = renderStatusChip(displayStatus)
	}
	progressLabel := "Готовность документа"
	if document.Type == "risks" {
		progressLabel = "Выполнение мер снижения"
	}
	content := breadcrumbs(model, document.OutputPath, document.Title) + `<header class="page-header"><div class="page-kicker">` + statusChip + `<span class="badge">` + escapeHTML(document.TypeLabel) + `</span>` + issues + `</div><h1>` + escapeHTML(document.Title) + `</h1><p class="page-lead">` + escapeHTML(document.Description) + `</p>` + renderMetadata(document) + renderRiskStatus(model, document) + renderProgress(document.TaskStats, progressLabel) + controls + `<div class="page-actions">` + renderRoadmapAddButton(model, document) + renderDocumentContextButton(model, document) + renderOpenAPIContractButton(model, document) + `<button class="collapse-all-button" type="button" data-collapse-all data-collapse-state="expanded" aria-expanded="true"><span class="collapse-all-icon" aria-hidden="true"><span class="collapse-icon collapse-icon-up">↑</span><span class="collapse-icon collapse-icon-down">↓</span></span><span data-collapse-label>Свернуть разделы</span></button></div></header>` + computedStatus + `<article class="doc-content">` + body + `</article>` + screenConnections + renderRelated(model, document)
	content += flowConnections
	return pageShell(model, document.OutputPath, document.Title, document.Description, content, renderTOC(document))
}

func docCard(current string, document *Document) string {
	archived, archiveYear, _ := taskArchivePathInfo(document.SourcePath)
	archiveState := "active"
	archiveBadge := ""
	if archived {
		archiveState = "archived"
		archiveBadge = `<span class="badge">Архив ` + escapeHTML(archiveYear) + `</span>`
	}
	workType := ""
	workDetails := ""
	if document.Type == "work" {
		if normalized, ok := taskType(document.Metadata["type"]); ok {
			workType = strings.ToLower(normalized)
		}
		if workType == "bug" {
			workDetails = `<p class="table-subtext">Серьёзность: ` + escapeHTML(fallbackDash(document.Metadata["severity"])) +
				` · Приоритет: ` + escapeHTML(fallbackDash(document.Metadata["priority"])) +
				` · Воспроизводимость: ` + escapeHTML(fallbackDash(document.Metadata["reproducibility"])) +
				` · Регрессия: ` + escapeHTML(fallbackDash(document.Metadata["regression"])) +
				` · Модуль: ` + escapeHTML(fallbackDash(document.Metadata["module"])) + `</p>`
		}
	}
	searchText := strings.Join([]string{document.Title, document.Description, document.SourcePath, document.Metadata["module"], document.Metadata["useCase"], document.Metadata["screens"]}, " ")
	severity, _ := normalizedEnum(document.Metadata["severity"], map[string]string{"критическая": "critical", "critical": "critical", "высокая": "high", "high": "high", "средняя": "medium", "medium": "medium", "низкая": "low", "low": "low"})
	regression, _ := normalizedEnum(document.Metadata["regression"], map[string]string{"да": "yes", "yes": "yes", "true": "yes", "нет": "no", "no": "no", "false": "no"})
	reproducibility, _ := normalizedEnum(document.Metadata["reproducibility"], map[string]string{"всегда": "always", "always": "always", "часто": "often", "often": "often", "иногда": "sometimes", "sometimes": "sometimes", "редко": "rarely", "rarely": "rarely", "не воспроизводится": "missing", "not reproduced": "missing", "неизвестно": "missing", "unknown": "missing"})
	causeState := ""
	regressionTestState := ""
	if workType == "bug" {
		causeState = "missing"
		regressionTestState = "missing"
		if items := parseWorkItems(document); len(items) == 1 {
			cause, found := workSection(items[0], "причина", "cause", "root cause")
			value := canonicalText(cause.Text)
			if found && value != "" && value != "не установлена" && value != "unknown" && value != "not established" {
				causeState = "established"
			}
			criteria, _ := workSection(items[0], "критерии приёмки", "критерии приемки", "acceptance criteria")
			if bugHasRegressionCoverage(items[0], criteria.Tasks) {
				regressionTestState = "present"
			}
		}
	}
	statusChip := ""
	if strings.TrimSpace(document.Metadata["status"]) != "" {
		statusChip = renderStatusChip(document.Status)
	}
	return `<article class="document-card" data-filter-item data-search="` + escapeAttr(searchText) + `" data-status="` + escapeAttr(document.Status.Kind) + `" data-type="` + escapeAttr(document.Type) + `" data-work-type="` + escapeAttr(workType) + `" data-severity="` + escapeAttr(severity) + `" data-regression="` + escapeAttr(regression) + `" data-reproducibility="` + escapeAttr(reproducibility) + `" data-cause="` + escapeAttr(causeState) + `" data-regression-test="` + escapeAttr(regressionTestState) + `" data-owner="` + escapeAttr(document.Metadata["owner"]) + `" data-archive="` + archiveState + `"><div class="card-kicker">` + statusChip + `<span class="badge">` + escapeHTML(document.TypeLabel) + `</span>` + archiveBadge + `</div><h3><a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `">` + escapeHTML(document.Title) + `</a></h3><p>` + escapeHTML(truncate(document.Description, 180)) + `</p>` + workDetails + renderProgress(document.TaskStats, "Задачи") + `<div class="card-path">` + escapeHTML(document.SourcePath) + `</div></article>`
}

func filterControls(includeStatus, includeType bool) string {
	statusControl := ""
	if includeStatus {
		statusControl = `<select data-filter-control="status"><option value="all">Все статусы</option><option value="not-started">Черновик</option><option value="done">Готово</option><option value="in-progress">В работе</option><option value="planned">Запланировано</option><option value="blocked">Заблокировано</option><option value="cancelled">Отменено</option></select>`
	}
	typeControl := ""
	if includeType {
		typeControl = `<select data-filter-control="type"><option value="all">Все типы</option><option value="module">Модули</option><option value="use-case">Сценарии</option><option value="screen-map">Карты экранов</option><option value="screen">Экраны</option><option value="flow">Процессы</option><option value="architecture">Архитектура</option><option value="decision">Решения</option><option value="work">Задачи</option></select>`
	}
	return `<div class="collection-controls"><input type="search" data-filter-control="search" placeholder="Фильтр" aria-label="Фильтр">` + statusControl + typeControl + `</div>`
}

func workFilterControls(includeStatus bool) string {
	statusControl := ""
	if includeStatus {
		statusControl = `<select data-filter-control="status"><option value="all">Все статусы</option><option value="not-started">Черновик</option><option value="done">Готово</option><option value="in-progress">В работе</option><option value="planned">Запланировано</option><option value="blocked">Заблокировано</option><option value="cancelled">Отменено</option></select>`
	}
	return `<div class="collection-controls"><input type="search" data-filter-control="search" placeholder="Фильтр" aria-label="Фильтр">` +
		statusControl +
		`<select data-filter-control="workType"><option value="all">Все</option><option value="feature">Features</option><option value="bug">Bugs</option><option value="maintenance">Maintenance</option><option value="documentation">Documentation</option><option value="research">Research</option></select>` +
		`<select data-filter-control="severity"><option value="all">Любая серьёзность</option><option value="critical">Критические</option><option value="high">Высокой серьёзности</option></select>` +
		`<select data-filter-control="regression"><option value="all">Любая регрессия</option><option value="yes">Регрессии</option></select>` +
		`<select data-filter-control="reproducibility"><option value="all">Любая воспроизводимость</option><option value="always">Воспроизводятся всегда</option><option value="missing">Без воспроизведения</option></select>` +
		`<select data-filter-control="cause"><option value="all">Любая причина</option><option value="missing">Без установленной причины</option></select>` +
		`<select data-filter-control="regressionTest"><option value="all">Любой регрессионный тест</option><option value="missing">Без регрессионного теста</option></select>` +
		`<select data-filter-control="archive" data-filter-default="active"><option value="active" selected>Активные</option><option value="archived">Архив</option><option value="all">Все</option></select></div>`
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

	return `<section class="dashboard-section dashboard-support-panel"><div class="section-heading"><div><h2>Вычисляемое состояние</h2><p>Формируется из активных work items и эффективного состояния roadmap.</p></div></div><h3>Сейчас в работе</h3>` + activeHTML + `<h3>Блокеры</h3>` + blockersHTML + `<h3>Следующий результат</h3>` + nextHTML + `</section>`
}

func renderRecommendedEntries(model *Model) string {
	type entry struct{ title, description, href string }
	entries := []entry{}
	seen := map[string]bool{}
	add := func(title, description, href string) {
		if href == "" || seen[href] || len(entries) >= 5 {
			return
		}
		seen[href] = true
		entries = append(entries, entry{title: title, description: description, href: href})
	}
	if overview := model.DocByPath["architecture/overview.md"]; overview != nil {
		add("Архитектура", "Граница системы и карта архитектурных вопросов.", overview.OutputPath)
	}
	if len(model.Knowledge.UseCases) > 0 {
		add("Пользовательские сценарии", "Наблюдаемое поведение и критерии результата.", "use-cases/index.html")
	}
	hasGuides := false
	for _, document := range model.Documents {
		if document.Directory == "guides" {
			hasGuides = true
			break
		}
	}
	if hasGuides {
		add("Руководства", "Практические пути выполнения типовых задач.", outputForDirectory(model, "guides"))
	}
	if len(model.Knowledge.WorkItems) > 0 {
		add("Рабочие задачи", "Текущий scope, критерии и проверки work items.", "work/index.html")
	}
	add("Качество документации", "Ошибки, warnings и структурная целостность.", model.HealthOutputPath)
	for _, document := range model.Documents {
		if len(entries) >= 3 {
			break
		}
		if document.SourcePath != "index.md" {
			add(document.Title, document.Description, document.OutputPath)
		}
	}
	var cards strings.Builder
	for _, item := range entries {
		cards.WriteString(`<a class="recommended-entry" href="` + escapeAttr(item.href) + `"><strong>` + escapeHTML(item.title) + `</strong><span>` + escapeHTML(item.description) + `</span></a>`)
	}
	return `<section class="dashboard-section recommended-entries"><div class="section-heading"><div><h2>С чего начать</h2><p>До пяти рекомендуемых точек входа в документацию проекта.</p></div></div><div class="recommended-entry-grid">` + cards.String() + `</div></section>`
}

func renderDashboardFocus(model *Model) string {
	roadmap := model.DocByPath["roadmap.md"]
	risksDocument := model.DocByPath["risks.md"]
	statusDocument := model.Project.StatusDocument
	if statusDocument == nil && roadmap == nil && len(model.Knowledge.WorkItems) == 0 && risksDocument == nil {
		return ""
	}

	nextLabel := "Следующий результат не определён."
	nextHref := ""
	if next := model.CurrentStatus.NextResult; next != nil {
		target := next.TargetDocument
		if target == "" {
			target = next.Document
		}
		href := "#"
		if document := model.DocByPath[target]; document != nil {
			href = relativeURL("index.html", document.OutputPath)
		}
		text := strings.TrimSpace(strings.TrimLeft(strings.TrimPrefix(next.Text, next.ID), " :—-"))
		if text == "" {
			text = next.ID
		}
		nextLabel = strings.TrimSpace(next.ID + " · " + text)
		if href != "#" {
			nextHref = href
		}
	}

	workTarget := ""
	if len(model.Knowledge.WorkItems) > 0 {
		workTarget = "work/index.html"
	}
	workHref := ""
	if workTarget != "" {
		workHref = relativeURL("index.html", workTarget)
	}
	riskHref := ""
	if risksDocument != nil {
		riskHref = relativeURL("index.html", risksDocument.OutputPath)
	}
	target := ""
	if statusDocument != nil {
		target = relativeURL("index.html", statusDocument.OutputPath)
	} else if nextHref != "" {
		target = nextHref
	} else if workHref != "" {
		target = workHref
	} else {
		target = riskHref
	}
	statusLabel := strings.TrimSpace(model.Project.Status.Label)
	if statusLabel == "" {
		statusLabel = "Состояние проекта"
	}
	content := `<span class="focus-status">` + escapeHTML(statusLabel) + `</span><span class="focus-result"><span>Ближайший результат</span><strong>` + escapeHTML(nextLabel) + `</strong></span><span class="focus-arrow" aria-hidden="true">→</span>`
	if target == "" {
		return `<div class="dashboard-section dashboard-focus" aria-label="Текущий фокус">` + content + `</div>`
	}
	return `<a class="dashboard-section dashboard-focus" aria-label="Текущий фокус: ` + escapeAttr(nextLabel) + `" href="` + escapeAttr(target) + `">` + content + `</a>`
}

func dashboardOverviewBody(model *Model, document *Document) string {
	body := strings.TrimSpace(renderDocumentMarkdown(document, linkResolverFor(model, document), nil))
	description := strings.TrimSpace(document.Description)
	if description == "" {
		return body
	}
	prefix := `<p>` + escapeHTML(description) + `</p>`
	if strings.HasPrefix(body, prefix) {
		return strings.TrimSpace(strings.TrimPrefix(body, prefix))
	}
	return body
}

func renderDashboard(model *Model) string {
	meta := ""
	if values := nonEmpty([]string{model.Project.Stage, model.Project.Version, model.Project.Owner, model.Project.Updated}); len(values) > 0 {
		meta = `<div class="hero-meta">` + escapeHTML(strings.Join(values, " · ")) + `</div>`
	}
	overview := ""
	if document := model.Project.OverviewDocument; document != nil {
		body := dashboardOverviewBody(model, document)
		if body != "" {
			overview = `<section class="dashboard-section dashboard-overview" data-dashboard-overview aria-labelledby="dashboard-overview-title"><div class="dashboard-overview-heading"><div><h2 id="dashboard-overview-title">Обзор проекта</h2><small>Полное содержание index.md</small></div><div class="page-actions dashboard-page-actions">` + renderDocumentContextButton(model, document) + `</div></div><div class="dashboard-overview-body"><article class="doc-content">` + body + `</article></div></section>`
		}
	}
	title := `<div class="dashboard-title"><h1>` + escapeHTML(model.Project.Title) + `</h1><span class="beta-badge">Beta</span></div>`
	hero := `<header class="page-header dashboard-about">` + title + `<p class="page-lead">` + escapeHTML(model.Project.Description) + `</p>` + meta + `</header>`
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
		hero = `<header class="` + heroClass + ` dashboard-about"><div class="hero-copy">` + heroLogo + title + `<p class="hero-description">` + escapeHTML(model.Project.Description) + `</p>` + meta + `</div>` + heroImage + `</header>`
	}
	content := hero + renderDashboardFocus(model) + renderRecommendedEntries(model) + overview
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
	if len(docs) > 1 || directory == "work" && len(docs) > 0 {
		controls := filterControls(documentsHaveDifferentStatuses(docs), false)
		if directory == "work" {
			controls = workFilterControls(documentsHaveDifferentStatuses(docs))
		}
		collection = `<section data-filter-scope>` + controls + `<div class="collection-summary">Показано: <strong data-filter-count></strong></div>` + collection + `<div class="empty-state" data-filter-empty hidden>Ничего не найдено.</div></section>`
	}
	content := breadcrumbs(model, current, directoryLabel(directory)) + `<header class="page-header"><h1>` + escapeHTML(directoryLabel(directory)) + `</h1><p class="page-lead">Документы раздела: ` + fmt.Sprint(len(docs)) + `.</p></header>` + collection
	return pageShell(model, current, directoryLabel(directory), directoryLabel(directory), content, "")
}

func renderKnowledgeCatalogPage(model *Model, kind string) string {
	current := path.Join(kind, "index.html")
	title := modelDirectoryLabel(model, kind)
	var cards strings.Builder
	if kind == "quality" {
		for _, standard := range model.Knowledge.Standards {
			document := model.DocByPath[standard.Document]
			if document != nil {
				cards.WriteString(docCard(current, document))
			}
		}
		content := breadcrumbs(model, current, title) +
			`<header class="page-header"><h1>` + escapeHTML(title) + `</h1><p class="page-lead">Версионируемые стандарты проекта и их автоматические проверки.</p></header>` +
			`<section data-filter-scope>` + filterControls(true, false) + `<div class="collection-summary">Показано: <strong data-filter-count></strong></div><div class="card-grid">` +
			cards.String() + `</div><div class="empty-state" data-filter-empty hidden>Стандарты не найдены.</div></section>`
		return pageShell(model, current, title, title, content, "")
	}
	for _, runbook := range model.Knowledge.Runbooks {
		document := model.DocByPath[runbook.Document]
		if document == nil {
			continue
		}
		searchText := strings.Join([]string{runbook.ID, runbook.Title, runbook.Owner, runbook.Environment, runbook.Risk}, " ")
		cards.WriteString(`<article class="document-card" data-filter-item data-search="` + escapeAttr(searchText) +
			`" data-status="` + escapeAttr(document.Status.Kind) + `" data-freshness="` + escapeAttr(runbook.Freshness) +
			`"><div class="card-kicker">` + renderStatusChip(document.Status) + `<span class="badge">` + escapeHTML(runbook.Freshness) +
			`</span></div><h3><a href="` + escapeAttr(relativeURL(current, document.OutputPath)) + `">` + escapeHTML(runbook.Title) +
			`</a></h3><p>` + escapeHTML(truncate(document.Description, 180)) + `</p><p class="table-subtext">Среда: ` +
			escapeHTML(fallbackDash(runbook.Environment)) + ` · Риск: ` + escapeHTML(fallbackDash(runbook.Risk)) +
			` · Последняя проверка: ` + escapeHTML(fallbackDash(runbook.LastVerified)) + `</p><div class="card-path">` +
			escapeHTML(runbook.Document) + `</div></article>`)
	}
	controls := `<div class="collection-controls"><input type="search" data-filter-control="search" placeholder="Фильтр" aria-label="Фильтр runbooks">` +
		`<select data-filter-control="freshness"><option value="all">Любая свежесть</option><option value="recent">Recent</option><option value="review-required">Review required</option><option value="overdue">Overdue</option></select></div>`
	content := breadcrumbs(model, current, title) +
		`<header class="page-header"><h1>` + escapeHTML(title) + `</h1><p class="page-lead">Эксплуатационные процедуры и состояние их проверки.</p></header>` +
		`<section class="metric-grid">` + metricCard("Всего", model.Stats.RunbooksTotal, "") + metricCard("Recent", model.Stats.RunbooksRecent, "") +
		metricCard("Review required", model.Stats.RunbooksReviewRequired, "") + metricCard("Overdue", model.Stats.RunbooksOverdue, "") + `</section>` +
		`<section data-filter-scope>` + controls + `<div class="collection-summary">Показано: <strong data-filter-count></strong></div><div class="card-grid">` +
		cards.String() + `</div><div class="empty-state" data-filter-empty hidden>Runbooks не найдены.</div></section>`
	return pageShell(model, current, title, title, content, "")
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
			Type: doc.Type, SectionType: doc.SectionType, Title: doc.Title, Description: doc.Description, Metadata: doc.Metadata,
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
		SchemaVersion: 1, Generator: GeneratorInfo{Name: "Toudocu", Version: Version},
		GeneratedAt: model.GeneratedAt, SourceDirectory: pathBase(model.RootDirectory),
		StaleDays: model.StaleDays, Project: project, CurrentStatus: model.CurrentStatus,
		Stats: model.Stats, Documents: documents, Roadmap: roadmap, Risks: risks,
		Knowledge: ReportKnowledge{
			Modules: model.Knowledge.Modules, UseCases: model.Knowledge.UseCases,
			Flows: model.Knowledge.Flows, Standards: model.Knowledge.Standards, Runbooks: model.Knowledge.Runbooks,
			BusinessRules: model.Knowledge.BusinessRules, WorkItems: model.Knowledge.WorkItems,
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

// GenerateSite writes a backend-independent portal for HTTP(S) static hosting.
func GenerateSite(model *Model, options Options) (GenerateResult, error) {
	return generateSite(model, options, false)
}

func generateServeSite(model *Model, options Options) (GenerateResult, error) {
	return generateSite(model, options, true)
}

func generateSite(model *Model, options Options, serve bool) (GenerateResult, error) {
	model.serveMode = serve
	defer func() { model.serveMode = false }()
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
	runtime := "static"
	if serve {
		runtime = "serve"
	}
	assets, err := frontend.RuntimeAssets(runtime)
	if err != nil {
		return GenerateResult{}, err
	}
	generated, err := frontend.GeneratedFS()
	if err != nil {
		return GenerateResult{}, err
	}
	if !serve {
		serveAssets, manifestErr := frontend.RuntimeAssets("serve")
		if manifestErr != nil {
			return GenerateResult{}, manifestErr
		}
		staticSet := map[string]struct{}{}
		for _, asset := range assets {
			staticSet[asset] = struct{}{}
		}
		for _, asset := range serveAssets {
			if _, keep := staticSet[asset]; keep {
				continue
			}
			if removeErr := os.Remove(filepath.Join(output, "assets", filepath.FromSlash(asset))); removeErr != nil && !os.IsNotExist(removeErr) {
				return GenerateResult{}, removeErr
			}
		}
	}
	for _, asset := range assets {
		if err = copyFSFile(generated, asset, filepath.Join(output, "assets", filepath.FromSlash(asset))); err != nil {
			return GenerateResult{}, err
		}
	}
	searchIndex := append([]SearchItem{}, model.SearchIndex...)
	if model.ProjectChangelog != nil {
		searchIndex = append(searchIndex, projectChangelogSearchItem(model.ProjectChangelog))
	}
	if err = writeStaticData(output, model, searchIndex); err != nil {
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
	for _, contract := range model.openAPIContracts {
		if err = copyFileEnsured(filepath.Join(model.RootDirectory, filepath.FromSlash(contract.Path)), filepath.Join(output, filepath.FromSlash(contract.Path))); err != nil {
			return GenerateResult{}, err
		}
	}
	if err = writeFileEnsured(filepath.Join(output, "index.html"), []byte(renderDashboard(model))); err != nil {
		return GenerateResult{}, err
	}
	pages := 1
	for _, document := range model.Documents {
		directory := strings.Split(document.SourcePath, "/")[0]
		typedCatalogIndex := strings.EqualFold(document.FileName, "index.md") && (directory == "use-cases" || directory == "flows" || directory == "quality" || directory == "runbooks")
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
	if model.ProjectChangelog != nil {
		if err = writeFileEnsured(filepath.Join(output, projectChangelogOutput), []byte(renderDocumentPage(model, model.ProjectChangelog))); err != nil {
			return GenerateResult{}, err
		}
		pages++
	} else if removeErr := os.Remove(filepath.Join(output, projectChangelogOutput)); removeErr != nil && !os.IsNotExist(removeErr) {
		return GenerateResult{}, removeErr
	}
	if len(model.Knowledge.UseCases)+len(model.Knowledge.Flows) > 0 {
		processPages := map[string]string{
			sectionCatalogOutput(SectionFlows):    renderProcessCatalogPage(model, sectionCatalogOutput(SectionFlows), "flow"),
			sectionCatalogOutput(SectionUseCases): renderProcessCatalogPage(model, sectionCatalogOutput(SectionUseCases), "use-case"),
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
	for _, kind := range []string{"quality", "runbooks"} {
		if _, exists := model.Directories[kind]; !exists {
			continue
		}
		target := path.Join(kind, "index.html")
		if err = writeFileEnsured(filepath.Join(output, filepath.FromSlash(target)), []byte(renderKnowledgeCatalogPage(model, kind))); err != nil {
			return GenerateResult{}, err
		}
		pages++
	}
	directories := make([]string, 0, len(model.Directories))
	for d := range model.Directories {
		directories = append(directories, d)
	}
	sort.SliceStable(directories, func(i, j int) bool { return naturalCompare(directories[i], directories[j]) < 0 })
	for _, directory := range directories {
		if directory == "use-cases" || directory == "flows" || directory == "quality" || directory == "runbooks" {
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
	return GenerateResult{OutputDirectory: output, Pages: pages, Assets: len(model.Assets) + len(model.BrandingAssets) + len(assets) + 1}, nil
}
