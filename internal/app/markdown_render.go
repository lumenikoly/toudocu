package toudocu

import (
	"strings"

	markdowncore "toudocu/internal/markdown"
	frontend "toudocu/internal/site"
)

type renderContext struct {
	ResolveLink          LinkResolver
	TaskCompletionByLine map[int]bool
}

type renderOptions struct {
	SkipH1             bool
	SuppressMetadata   bool
	InteractiveMermaid bool
	Locale             string
}

func applyMarkdownUI(config *markdowncore.RenderConfig, ui frontend.UI) {
	config.TaskUncheckedLabel = ui.Text("task.unchecked")
	config.TaskCheckedLabel = ui.Text("task.checked")
	config.UnsafeLinkTitle = ui.Text("markdown.unsafeLink")
	config.ExternalImageLabel = ui.Text("markdown.externalImage")
	config.MermaidZoomLabel = ui.Text("markdown.diagramZoom")
	config.MermaidZoomOut = ui.Text("markdown.zoomOut")
	config.MermaidFit = ui.Text("markdown.fit")
	config.MermaidZoomIn = ui.Text("markdown.zoomIn")
	config.MermaidFullscreen = ui.Text("markdown.fullscreen")
	config.MermaidLabel = ui.Text("markdown.mermaid")
	config.MermaidError = ui.Text("markdown.mermaidError")
	config.MermaidSource = ui.Text("markdown.showSource")
}

func renderMarkdown(document markdownAnalysis, context renderContext, options renderOptions) string {
	config := markdowncore.RenderConfig{TaskCompletionByLine: context.TaskCompletionByLine, SkipH1: options.SkipH1, SuppressMetadata: options.SuppressMetadata, InteractiveMermaid: options.InteractiveMermaid}
	applyMarkdownUI(&config, frontend.NewUI(options.Locale))
	if context.ResolveLink != nil {
		config.ResolveLink = func(destination string, image bool, title string) markdowncore.LinkResolution {
			resolved := context.ResolveLink(destination, image, title)
			return markdowncore.LinkResolution{Href: resolved.Href, External: resolved.External, Broken: resolved.Broken, Blocked: resolved.Blocked}
		}
	}
	html, err := markdowncore.Render(document.Document, config)
	if err != nil {
		return ""
	}
	return html
}

func renderDocumentMarkdown(model *Model, document *Document, resolver LinkResolver, taskCompletionByLine map[int]bool) string {
	parsed := analyzeMarkdownPath(document.Content, document.SourcePath)
	ui := portalUI(model)
	config := markdowncore.RenderConfig{TaskCompletionByLine: taskCompletionByLine, SkipH1: true, SuppressMetadata: true, InteractiveMermaid: document.Type == "flow"}
	applyMarkdownUI(&config, ui)
	if resolver != nil {
		config.ResolveLink = func(destination string, image bool, title string) markdowncore.LinkResolution {
			resolved := resolver(destination, image, title)
			return markdowncore.LinkResolution{Href: resolved.Href, External: resolved.External, Broken: resolved.Broken, Blocked: resolved.Blocked}
		}
	}
	html, err := markdowncore.Render(parsed.Document, config)
	if err != nil {
		return ""
	}
	return html
}

func renderDocumentBody(model *Model, document *Document, resolver LinkResolver, taskCompletionByLine map[int]bool) string {
	body := strings.TrimSpace(renderDocumentMarkdown(model, document, resolver, taskCompletionByLine))
	if document.Description != "" && strings.HasPrefix(body, "<p>") {
		if end := strings.Index(body, "</p>"); end >= 0 {
			return strings.TrimSpace(body[end+4:])
		}
	}
	return body
}

func renderMarkdownFragment(source string, context renderContext) string {
	return renderMarkdown(analyzeMarkdown(source), context, renderOptions{})
}
