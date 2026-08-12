package site

import (
	"bytes"
	"embed"
	"html/template"
)

//go:embed templates/site.tmpl
var templateFiles embed.FS

var pageTemplates = template.Must(template.ParseFS(templateFiles, "templates/site.tmpl"))

type ShellView struct {
	UI             UI
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

func RenderShell(view ShellView) (string, error) {
	if view.UI.messages == nil {
		view.UI = NewUI(view.Lang)
	}
	var output bytes.Buffer
	if err := pageTemplates.ExecuteTemplate(&output, "shell", view); err != nil {
		return "", err
	}
	return output.String(), nil
}
