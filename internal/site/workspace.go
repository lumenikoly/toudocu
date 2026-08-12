package site

import (
	"bytes"
	"html/template"
)

type ScriptAsset struct {
	URL    string
	Module bool
}

type WorkspaceView struct {
	UI             UI
	Lang           string
	HTMLAttributes template.HTMLAttr
	Title          string
	Favicon        string
	AppearanceJS   string
	Styles         []string
	Scripts        []ScriptAsset
	Bootstrap      template.JS
	Header         template.HTML
	ProjectTitle   string
	SpecsJSON      string
	Body           template.HTML
}

func renderWorkspace(view WorkspaceView, body string) (string, error) {
	if view.UI.messages == nil {
		view.UI = NewUI(view.Lang)
	}
	var renderedBody bytes.Buffer
	if err := pageTemplates.ExecuteTemplate(&renderedBody, body, view); err != nil {
		return "", err
	}
	view.Body = template.HTML(renderedBody.String())
	var output bytes.Buffer
	if err := pageTemplates.ExecuteTemplate(&output, "workspace", view); err != nil {
		return "", err
	}
	return output.String(), nil
}

func RenderEditor(view WorkspaceView) (string, error) {
	return renderWorkspace(view, "editor")
}

func RenderChanges(view WorkspaceView) (string, error) {
	return renderWorkspace(view, "changes")
}

func RenderAPIDocs(view WorkspaceView) (string, error) {
	return renderWorkspace(view, "api-docs")
}
