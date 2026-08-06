package docudocu

import (
	frontend "docu-docu/internal/site"
	"html/template"
	"strings"
)

type workspaceSurface string

const (
	workspacePortal  workspaceSurface = "portal"
	workspaceEditor  workspaceSurface = "editor"
	workspaceChanges workspaceSurface = "changes"
)

func workspaceModel(model *Model) *Model {
	defaults := defaultSiteConfig()
	if model == nil {
		return &Model{Project: ProjectInfo{Title: "Docu-docu"}, SiteConfig: defaults}
	}
	copy := *model
	if copy.Project.Title == "" {
		copy.Project.Title = "Docu-docu"
	}
	if copy.SiteConfig.Theme == "" {
		copy.SiteConfig.Theme = defaults.Theme
	}
	if copy.SiteConfig.ColorScheme == "" {
		copy.SiteConfig.ColorScheme = defaults.ColorScheme
	}
	if copy.SiteConfig.Accent == "" {
		copy.SiteConfig.Accent = defaults.Accent
	}
	if copy.SiteConfig.Density == "" {
		copy.SiteConfig.Density = defaults.Density
	}
	if copy.SiteConfig.ContentWidth == "" {
		copy.SiteConfig.ContentWidth = defaults.ContentWidth
	}
	return &copy
}

func appearanceAttributes(config SiteConfig) string {
	initial := config.ColorScheme
	if initial == "system" {
		initial = "light"
	}
	return ` data-theme="` + escapeAttr(initial) + `" data-site-theme="` + escapeAttr(config.Theme) +
		`" data-color-scheme="` + escapeAttr(config.ColorScheme) + `" data-accent="` + escapeAttr(config.Accent) +
		`" data-density="` + escapeAttr(config.Density) + `" data-content-width="` + escapeAttr(config.ContentWidth) + `"`
}

func workspaceBrand(model *Model, href string) string {
	mark := `<span class="brand-mark" aria-hidden="true">DD</span>`
	if logo := brandingOutput(model, "logo"); logo != "" {
		mark = `<img class="brand-logo" src="/` + escapeAttr(logo) + `" alt="">`
	}
	return `<a class="workspace-brand brand" href="` + escapeAttr(href) + `">` + mark + `<span class="brand-text">` + escapeHTML(model.Project.Title) + `</span></a>`
}

func workspaceNavigation(active workspaceSurface) string {
	items := []struct {
		surface workspaceSurface
		href    string
		label   string
		icon    string
	}{
		{workspacePortal, "/", "Портал", "⌂"},
		{workspaceEditor, "/_docu-docu/editor/", "Редактор", "✎"},
		{workspaceChanges, "/changes/", "Изменения", "⇄"},
	}
	var b strings.Builder
	b.WriteString(`<nav class="workspace-nav" aria-label="Рабочие поверхности">`)
	for _, item := range items {
		current := ""
		if item.surface == active {
			current = ` aria-current="page"`
		}
		b.WriteString(`<a class="workspace-nav-link" href="` + item.href + `" aria-label="Открыть ` + strings.ToLower(item.label) + `"` + current + `><span aria-hidden="true">` + item.icon + `</span><span class="workspace-nav-label">` + item.label + `</span></a>`)
	}
	b.WriteString(`</nav>`)
	return b.String()
}

func workspaceAppearanceControls(config SiteConfig) string {
	themeLabel, themeIndicator := siteThemePresentation(config.Theme)
	return `<div class="workspace-appearance" aria-label="Оформление">` +
		`<label class="header-select site-theme-select"><span class="header-select-visual" aria-hidden="true"><span class="site-theme-indicator" data-site-theme-indicator>` + escapeHTML(themeIndicator) + `</span><span data-site-theme-label>` + escapeHTML(themeLabel) + `</span></span><select data-site-theme-select aria-label="Тема оформления">` + selectOptions(config.Theme, []selectOption{{"classic", "Классика"}, {"paper", "Бумага"}, {"terminal", "Терминал"}}) + `</select></label>` +
		`<label class="header-select scheme-select"><span class="header-select-visual" aria-hidden="true"><span class="scheme-toggle-indicator"></span><span data-theme-label>` + escapeHTML(colorSchemeLabel(config.ColorScheme)) + `</span></span><select data-color-scheme-select aria-label="Цветовая схема">` + selectOptions(config.ColorScheme, []selectOption{{"system", "Система"}, {"light", "Светлая"}, {"dark", "Тёмная"}}) + `</select></label></div>`
}

func workspaceHeader(model *Model, active workspaceSurface) string {
	return `<header class="workspace-header">` + workspaceBrand(model, "/") + workspaceNavigation(active) + workspaceAppearanceControls(model.SiteConfig) + `</header>`
}

func workspaceFavicon(model *Model) string {
	if favicon := brandingOutput(model, "favicon"); favicon != "" {
		return "/" + favicon
	}
	return "/assets/" + mustFrontendAsset("favicon.svg")
}

func workspacePageBootstrap(model *Model, pagePath, assetBase string, capabilities frontend.Capabilities) template.JS {
	locale := model.SiteConfig.Project.Locale
	if locale == "" {
		locale = "en"
	}
	bootstrap, err := frontend.MarshalBootstrap(frontend.PageBootstrap{
		SchemaVersion: 1,
		Runtime:       frontend.RuntimeServe,
		Page:          frontend.PageReference{Kind: "document", Path: pagePath},
		Portal:        frontend.PortalReference{AssetBase: assetBase, DataBase: strings.Replace(assetBase, "assets/", "data/", 1)},
		UI: frontend.UISettings{
			Locale: locale, Theme: model.SiteConfig.Theme, ColorScheme: model.SiteConfig.ColorScheme,
			Accent: model.SiteConfig.Accent, Density: model.SiteConfig.Density, ContentWidth: model.SiteConfig.ContentWidth,
		},
		Capabilities: capabilities,
		Endpoints: &frontend.Endpoints{
			Editor: editorAPIBase, EditorWorkspace: editorUIPath, Changes: changesAPIBase, Rebuild: rebuildEndpoint,
		},
	})
	if err != nil {
		panic(err)
	}
	return bootstrap
}
