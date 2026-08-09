package toudocu

import (
	"encoding/json"
	"io"
	"net/http"
	frontend "toudocu/internal/site"
)

const apiDocsUIPath = "/_toudocu/api-docs/"

func (s *documentationServer) serveAPIDocsUI(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeEditorError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Метод не поддерживается", nil)
		return
	}
	if len(s.model.openAPIContracts) == 0 {
		http.NotFound(w, request)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	if request.Method == http.MethodHead {
		return
	}
	type swaggerSpec struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	specs := make([]swaggerSpec, 0, len(s.model.openAPIContracts))
	for _, contract := range s.model.openAPIContracts {
		specs = append(specs, swaggerSpec{Name: contract.Title, URL: "/" + contract.Path})
	}
	encoded, _ := json.Marshal(specs)
	uiModel := workspaceModel(s.model)
	locale := uiModel.SiteConfig.Project.Locale
	if locale == "" {
		locale = "en"
	}
	html, err := frontend.RenderAPIDocs(frontend.WorkspaceView{
		Lang: locale, Title: "HTTP API — " + uiModel.Project.Title,
		Favicon: workspaceFavicon(uiModel),
		Styles:  []string{"/assets/" + mustFrontendAsset("swagger-ui.css")},
		Scripts: []frontend.ScriptAsset{
			{URL: "/assets/" + mustFrontendAsset("swagger-ui-bundle.js")},
			{URL: "/assets/" + mustFrontendAsset("swagger-ui-standalone-preset.js")},
			{URL: "/assets/" + mustFrontendAsset("api-docs.js"), Module: true},
		},
		Bootstrap: workspacePageBootstrap(uiModel, "_toudocu/api-docs/index.html", "../../assets/", frontend.Capabilities{}),
		SpecsJSON: string(encoded),
	})
	if err != nil {
		http.Error(w, "Не удалось сформировать каталог API", http.StatusInternalServerError)
		return
	}
	_, _ = io.WriteString(w, html)
}
