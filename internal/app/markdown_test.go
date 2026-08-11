package toudocu

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"
)

const sampleMarkdown = `# Документ

- Статус: В работе

Краткое описание.

## Раздел

- [x] Готово
- [ ] Не готово

| Поле | Значение |
|---|---|
| A | B |
`

func TestMarkdownAnalysis(t *testing.T) {
	doc := analyzeMarkdown(sampleMarkdown)
	if doc.Title != "Документ" || doc.Description != "Краткое описание." {
		t.Fatalf("unexpected document: %#v", doc)
	}
	if doc.Metadata["status"] != "В работе" {
		t.Fatalf("metadata: %#v", doc.Metadata)
	}
	if len(doc.Tasks) != 2 || !doc.Tasks[0].Completed {
		t.Fatalf("tasks: %#v", doc.Tasks)
	}
	if len(doc.Sections) != 1 || doc.Sections[0].Title != "Раздел" {
		t.Fatalf("sections: %#v", doc.Sections)
	}
	if len(doc.Sections[0].Tasks) != 2 {
		t.Fatalf("section tasks: %#v; all: %#v", doc.Sections[0], doc.Tasks)
	}
	if !strings.Contains(doc.Sections[0].Text, "Готово") {
		t.Fatalf("section text: %#v", doc.Sections[0])
	}
}

func TestMarkdownPolicyErrorsFailCheckAndBuild(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Project\n\nDescription.\n\n| Value |\n|---|\n| <b>unsafe</b> |\n")
	writeTestFile(t, docs, "architecture/overview.md", "# Architecture\n\n- Type: Architecture Overview\n\nBoundary.\n")
	for _, command := range []string{"check", "build"} {
		args := []string{command, docs, "--repository-root", root}
		if command == "build" {
			args = append(args, "--output", filepath.Join(root, "site"))
		}
		var stdout, stderr bytes.Buffer
		if code := RunCLI(args, &stdout, &stderr); code == 0 {
			t.Fatalf("%s unexpectedly succeeded: %s %s", command, stdout.String(), stderr.String())
		}
		if command == "check" && !strings.Contains(stdout.String()+stderr.String(), "forbidden-raw-html") {
			t.Fatalf("%s did not report policy error: %s %s", command, stdout.String(), stderr.String())
		}
	}
}

func TestMetadataInlineCodePreservesRouteUnderscores(t *testing.T) {
	doc := analyzeMarkdown("# SC-SITE-API-DOCS: API\n\n- Маршрут: `/_toudocu/api-docs/`\n")
	if got := doc.Metadata["route"]; got != "/_toudocu/api-docs/" {
		t.Fatalf("route = %q", got)
	}
}

func TestMarkdownRenderSafety(t *testing.T) {
	doc := analyzeMarkdown("# Безопасность\n\n<script>alert(1)</script>\n\n[опасно](javascript:alert(1))")
	html := renderMarkdown(doc, renderContext{ResolveLink: func(destination string, image bool, title string) LinkResolution {
		if strings.HasPrefix(destination, "javascript:") {
			return LinkResolution{Href: "#", Blocked: true}
		}
		return LinkResolution{Href: destination}
	}}, renderOptions{})
	if !strings.Contains(html, "&lt;script&gt;alert(1)&lt;/script&gt;") || strings.Contains(html, "<script>") {
		t.Fatalf("unsafe html: %s", html)
	}
	if !strings.Contains(html, "unsafe-link") || strings.Contains(html, `href="javascript:`) {
		t.Fatalf("unsafe link: %s", html)
	}
}

func TestMarkdownRenderFormats(t *testing.T) {
	doc := analyzeMarkdown("# Форматы\n\n- Родитель\n  - Дочерний\n- [x] Задача\n\n| A | B |\n|:---|---:|\n| 1 | 2 |\n\n```js\nconst value = 1 < 2;\n```\n")
	html := renderMarkdown(doc, renderContext{}, renderOptions{})
	for _, part := range []string{"<ul>", "Дочерний", "task-item is-complete", "<table>", "text-align:left", "language-js", "1 &lt; 2"} {
		if !strings.Contains(html, part) {
			t.Fatalf("missing %q in %s", part, html)
		}
	}
}

func TestAnalyzeMermaidBlocks(t *testing.T) {
	source := "flowchart TD\n    Login --> Dashboard"
	block := analyzeMermaidBlock(4, 7, source, true)
	if block.DiagramType != "flowchart" || len(block.Problems) != 0 {
		t.Fatalf("valid Mermaid block: %#v", block)
	}

	cases := []struct {
		name   string
		source string
		closed bool
		code   string
	}{
		{"empty", "", true, "empty-mermaid-diagram"},
		{"unsupported", "journey\n  title Login", true, "unsupported-mermaid-diagram-type"},
		{"frontmatter", "---\nconfig:\n  theme: dark\n---\nflowchart TD\nA-->B", true, "forbidden-mermaid-configuration"},
		{"directive", "flowchart TD\n%%{init: {\"theme\":\"dark\"}}%%\nA-->B", true, "forbidden-mermaid-configuration"},
		{"unterminated", source, false, "unterminated-mermaid-diagram"},
		{"too-large", "flowchart TD\n" + strings.Repeat("A", mermaidMaxBytes), true, "mermaid-diagram-too-large"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			block := analyzeMermaidBlock(0, 1, test.source, test.closed)
			found := false
			for _, problem := range block.Problems {
				if problem.Code == test.code {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s missing from %#v", test.code, block.Problems)
			}
		})
	}

	nested := strings.Split("````md\n```mermaid\njourney\n```\n````", "\n")
	if blocks := scanMermaidBlocks(nested); len(blocks) != 0 {
		t.Fatalf("Mermaid-looking content inside another fence must remain code: %#v", blocks)
	}
}

func TestRenderMermaidBlockAndFallback(t *testing.T) {
	valid := analyzeMarkdown("# Diagram\n\n```mermaid\nstateDiagram-v2\n[*] --> Ready\n```\n")
	html := renderMarkdown(valid, renderContext{}, renderOptions{InteractiveMermaid: true})
	for _, part := range []string{
		`data-mermaid-container`, `data-mermaid-stage`, `data-mermaid-diagram`,
		`data-mermaid-zoom-out`, `data-mermaid-fit`, `data-mermaid-zoom-in`,
		`data-mermaid-fullscreen`, `class="mermaid-source"`, "Показать исходный код",
		"stateDiagram-v2",
	} {
		if !strings.Contains(html, part) {
			t.Fatalf("valid Mermaid HTML missing %q: %s", part, html)
		}
	}

	invalid := analyzeMarkdown("# Diagram\n\n```mermaid\njourney\n```\n")
	html = renderMarkdown(invalid, renderContext{}, renderOptions{})
	if strings.Contains(html, `data-mermaid-diagram`) || strings.Contains(html, `data-mermaid-stage`) || !strings.Contains(html, "Не удалось отобразить диаграмму.") {
		t.Fatalf("invalid Mermaid must use fallback: %s", html)
	}
}

func TestMermaidValidationMatchesRendering(t *testing.T) {
	cases := []struct {
		name   string
		source string
		valid  bool
	}{
		{"flowchart", "flowchart LR\nA --> B", true},
		{"state", "stateDiagram-v2\n[*] --> Ready", true},
		{"sequence", "sequenceDiagram\nA->>B: hello", true},
		{"directive", "flowchart TD\n%%{init: {}}%%\nA --> B", false},
		{"front-matter", "---\ntheme: dark\n---\nflowchart TD\nA --> B", false},
		{"embedded-directive-text", "flowchart TD\nA[caption %%{ text] --> B", true},
		{"unsupported", "journey\ntitle Trip", false},
		{"too-large", "flowchart TD\n" + strings.Repeat("A", mermaidMaxBytes), false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			block := analyzeMermaidBlock(0, 1, test.source, true)
			validated := len(block.Problems) == 0
			document := analyzeMarkdown("# Diagram\n\n```mermaid\n" + test.source + "\n```\n")
			html := renderMarkdown(document, renderContext{}, renderOptions{})
			rendered := strings.Contains(html, `data-mermaid-diagram`)
			if validated != test.valid || rendered != test.valid {
				t.Fatalf("validated=%t rendered=%t, want %t; problems=%#v", validated, rendered, test.valid, block.Problems)
			}
		})
	}
}
