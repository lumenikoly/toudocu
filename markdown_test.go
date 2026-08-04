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
