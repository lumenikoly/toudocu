package docudocu

import (
	"encoding/json"
	"fmt"
	"net/http"
)

const apiDocsUIPath = "/_docu-docu/api-docs/"

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
	title := escapeHTML(s.model.Project.Title)
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTTP API — %s</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/swagger-ui.css"><script src="/assets/swagger-ui-bundle.js" defer></script><script src="/assets/swagger-ui-standalone-preset.js" defer></script><script src="/assets/api-docs.js" defer></script></head><body><div id="swagger-ui" data-specs="%s"></div></body></html>`, title, escapeAttr(string(encoded)))
}
