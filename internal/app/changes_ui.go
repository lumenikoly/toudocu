package docudocu

import (
	frontend "docu-docu/internal/site"
	"html/template"
	"io"
	"net/http"
)

func (s *documentationServer) serveChangesUI(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if request.Method == http.MethodHead {
		return
	}
	uiModel := workspaceModel(s.model)
	locale := uiModel.SiteConfig.Project.Locale
	if locale == "" {
		locale = "en"
	}
	html, err := frontend.RenderChanges(frontend.WorkspaceView{
		Lang: locale, HTMLAttributes: template.HTMLAttr(appearanceAttributes(uiModel.SiteConfig)),
		Title: "Изменения — " + uiModel.Project.Title, Favicon: workspaceFavicon(uiModel),
		AppearanceJS: "/assets/" + mustFrontendAsset("appearance.js"),
		Styles: []string{
			"/assets/" + mustFrontendAsset("portal.css"),
			"/assets/" + mustFrontendAsset("serve.css"),
			"/assets/" + mustFrontendAsset("changes.css"),
		},
		Scripts: []frontend.ScriptAsset{
			{URL: "/assets/" + mustFrontendAsset("mermaid.tiny.js")},
			{URL: "/assets/" + mustFrontendAsset("codemirror.js"), Module: true},
			{URL: "/assets/" + mustFrontendAsset("changes.js"), Module: true},
		},
		Bootstrap: workspacePageBootstrap(uiModel, "changes/index.html", "../assets/", frontend.Capabilities{Changes: true}),
		Header:    template.HTML(workspaceHeader(uiModel, workspaceChanges)),
	})
	if err != nil {
		http.Error(w, "Не удалось сформировать просмотр изменений", http.StatusInternalServerError)
		return
	}
	_, _ = io.WriteString(w, html)
}
