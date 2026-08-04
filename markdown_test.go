package docgent

import (
	"strings"
	"testing"
)

const sampleMarkdown = `# Документ

- Статус: В работе
- Владелец: Team A

Краткое описание.

## Раздел

- [x] Готово
- [ ] Не готово

| Поле | Значение |
|---|---|
| A | B |
`

func TestAnalyzeMarkdown(t *testing.T) {
	doc := AnalyzeMarkdown(sampleMarkdown)
	if doc.Title != "Документ" || doc.Description != "Краткое описание." {
		t.Fatalf("unexpected document: %#v", doc)
	}
	if doc.Metadata["status"] != "В работе" || doc.Metadata["owner"] != "Team A" {
		t.Fatalf("metadata: %#v", doc.Metadata)
	}
	if len(doc.Tasks) != 2 || !doc.Tasks[0].Completed {
		t.Fatalf("tasks: %#v", doc.Tasks)
	}
	if len(doc.Sections) != 1 || doc.Sections[0].Title != "Раздел" {
		t.Fatalf("sections: %#v", doc.Sections)
	}
}

func TestRenderMarkdownSafety(t *testing.T) {
	doc := AnalyzeMarkdown("# Безопасность\n\n<script>alert(1)</script>\n\n[опасно](javascript:alert(1))")
	html := RenderMarkdown(doc, RenderContext{ResolveLink: func(destination string, image bool, title string) LinkResolution {
		if strings.HasPrefix(destination, "javascript:") {
			return LinkResolution{Href: "#", Blocked: true}
		}
		return LinkResolution{Href: destination}
	}}, RenderOptions{})
	if !strings.Contains(html, "&lt;script&gt;alert(1)&lt;/script&gt;") || strings.Contains(html, "<script>") {
		t.Fatalf("unsafe html: %s", html)
	}
	if !strings.Contains(html, "unsafe-link") || strings.Contains(html, `href="javascript:`) {
		t.Fatalf("unsafe link: %s", html)
	}
}

func TestRenderMarkdownFormats(t *testing.T) {
	doc := AnalyzeMarkdown("# Форматы\n\n- Родитель\n  - Дочерний\n- [x] Задача\n\n| A | B |\n|:---|---:|\n| 1 | 2 |\n\n```js\nconst value = 1 < 2;\n```\n")
	html := RenderMarkdown(doc, RenderContext{}, RenderOptions{})
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
	valid := AnalyzeMarkdown("# Diagram\n\n```mermaid\nstateDiagram-v2\n[*] --> Ready\n```\n")
	html := RenderMarkdown(valid, RenderContext{}, RenderOptions{})
	for _, part := range []string{`data-mermaid-container`, `data-mermaid-diagram`, `class="mermaid-source"`, "Показать исходный код", "stateDiagram-v2"} {
		if !strings.Contains(html, part) {
			t.Fatalf("valid Mermaid HTML missing %q: %s", part, html)
		}
	}

	invalid := AnalyzeMarkdown("# Diagram\n\n```mermaid\njourney\n```\n")
	html = RenderMarkdown(invalid, RenderContext{}, RenderOptions{})
	if strings.Contains(html, `data-mermaid-diagram`) || !strings.Contains(html, "Не удалось отобразить диаграмму.") {
		t.Fatalf("invalid Mermaid must use fallback: %s", html)
	}
}
