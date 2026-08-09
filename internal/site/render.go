package site

import (
	"bytes"
	"html/template"
)

type ShellView struct {
	Lang           string
	HTMLAttributes template.HTMLAttr
	Revision       string
	Description    string
	Title          string
	Favicon        string
	AppearanceJS   string
	PortalCSS      string
	ServeCSS       string
	ExtraStyles    template.HTML
	Bootstrap      template.JS
	PortalJS       string
	ServeJS        string
	RootPrefix     string
	Header         template.HTML
	Navigation     template.HTML
	MainClass      string
	Content        template.HTML
	TOC            template.HTML
	Footer         template.HTML
}

var shellTemplate = template.Must(template.New("page-shell").Parse(`<!doctype html>
<html lang="{{.Lang}}"{{.HTMLAttributes}}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
{{if .Revision}}  <meta name="toudocu-revision" content="{{.Revision}}">
{{end}}
  <meta name="description" content="{{.Description}}">
  <title>{{.Title}}</title>
  <link rel="icon" href="{{.Favicon}}">
  <script src="{{.AppearanceJS}}"></script>
  <link rel="stylesheet" href="{{.PortalCSS}}">
{{with .ExtraStyles}}  {{.}}
{{end}}{{if .ServeCSS}}  <link rel="stylesheet" href="{{.ServeCSS}}">
{{end}}
  <script id="toudocu-page" type="application/json">{{.Bootstrap}}</script>
  <script type="module" src="{{.PortalJS}}"></script>
{{if .ServeJS}}  <script type="module" src="{{.ServeJS}}" data-toudocu-serve-navigation></script>
{{end}}
</head>
<body data-root-prefix="{{.RootPrefix}}" data-task-filter="all">
  <a class="skip-link" href="#main-content">Перейти к содержимому</a>
  {{.Header}}
  <div class="site-layout">
    <aside class="sidebar">{{.Navigation}}</aside>
    <div class="main-area">
      <main id="main-content" class="page-grid{{.MainClass}}"><div class="page-content">{{.Content}}</div>{{.TOC}}</main>
      <footer class="site-footer">{{.Footer}}</footer>
    </div>
  </div>
</body>
</html>`))

func RenderShell(view ShellView) (string, error) {
	var output bytes.Buffer
	if err := shellTemplate.Execute(&output, view); err != nil {
		return "", err
	}
	return output.String(), nil
}
