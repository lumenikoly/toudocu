package toudocu

import markdowncore "toudocu/internal/markdown"

type renderContext struct {
	ResolveLink          LinkResolver
	TaskCompletionByLine map[int]bool
}

type renderOptions struct {
	SkipH1             bool
	SuppressMetadata   bool
	InteractiveMermaid bool
}

func renderMarkdown(document markdownAnalysis, context renderContext, options renderOptions) string {
	config := markdowncore.RenderConfig{TaskCompletionByLine: context.TaskCompletionByLine, SkipH1: options.SkipH1, SuppressMetadata: options.SuppressMetadata, InteractiveMermaid: options.InteractiveMermaid}
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

func renderDocumentMarkdown(document *Document, resolver LinkResolver, taskCompletionByLine map[int]bool) string {
	parsed := analyzeMarkdownPath(document.Content, document.SourcePath)
	return renderMarkdown(parsed, renderContext{ResolveLink: resolver, TaskCompletionByLine: taskCompletionByLine}, renderOptions{
		SkipH1: true, SuppressMetadata: true, InteractiveMermaid: document.Type == "flow",
	})
}

func renderMarkdownFragment(source string, context renderContext) string {
	return renderMarkdown(analyzeMarkdown(source), context, renderOptions{})
}
