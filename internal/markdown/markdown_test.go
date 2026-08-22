package markdown

import (
	"strings"
	"testing"
)

func TestParseGoldmarkDialectAndRanges(t *testing.T) {
	doc := Parse([]byte("# Привет, Мир!\n\n## A_B\n## A-B\n## !!!\n\n- [x] done\n\n| A | B |\n|:---|---:|\n| x | y |\n\nhttps://example.com www.example.com test@example.com ~~old~~\n"), "docs/test.md")
	a := doc.Analysis()
	wantIDs := []string{"привет-мир", "a-b", "a-b-2", "section"}
	if len(a.Headings) != len(wantIDs) {
		t.Fatalf("headings = %#v", a.Headings)
	}
	for i, want := range wantIDs {
		if a.Headings[i].ID != want {
			t.Errorf("heading %d ID = %q, want %q", i, a.Headings[i].ID, want)
		}
	}
	if a.Headings[0].Range.Start.Offset != 0 || a.Headings[0].Range.Start.Line != 1 || a.Headings[0].Range.Start.Column != 1 {
		t.Fatalf("heading range = %+v", a.Headings[0].Range)
	}
	if len(a.Tasks) != 1 || !a.Tasks[0].Completed || a.Tasks[0].Range.Start.Line != 7 {
		t.Fatalf("tasks = %#v", a.Tasks)
	}
	if len(a.Tables) != 1 || strings.Join(a.Tables[0].Headers, ",") != "A,B" || a.Tables[0].Rows[0].Range.Start.Line != 11 {
		t.Fatalf("tables = %#v", a.Tables)
	}
	if len(a.Links) != 3 || !a.Links[0].Automatic || !a.Links[1].Automatic || !a.Links[2].Automatic || a.Links[1].Destination != "http://www.example.com" || a.Links[2].Destination != "mailto:test@example.com" {
		t.Fatalf("literal links = %#v", a.Links)
	}
}

func TestSemanticAnnotationsAreTypedHiddenAndFenceSafe(t *testing.T) {
	source := "<!-- toudocu\nid: RB-TEST\nstatus: active\n-->\n# Reader title\n\n<!-- toudocu:section procedure -->\n## Banana spaceship\n\n1. Step\n\n<!-- toudocu:table transitions columns=id,action,condition,target -->\n| Whatever | You | Like | Here |\n|---|---|---|---|\n| TR-X-001 | Go | Always | SC-X-END |\n\n```md\n<!-- toudocu:section verification -->\n```\n"
	doc := Parse([]byte(source), "test.md")
	a := doc.Analysis()
	if len(a.Metadata) != 2 || a.Metadata[0].Key != "id" || a.Metadata[0].Value != "RB-TEST" {
		t.Fatalf("metadata = %#v", a.Metadata)
	}
	if len(a.Sections) != 1 || a.Sections[0].Kind != "procedure" {
		t.Fatalf("sections = %#v", a.Sections)
	}
	if len(a.Tables) != 1 || a.Tables[0].Kind != "transitions" || strings.Join(a.Tables[0].Columns, ",") != "id,action,condition,target" {
		t.Fatalf("tables = %#v", a.Tables)
	}
	if strings.Contains(a.PlainText, "toudocu") || len(a.Diagnostics) != 0 {
		t.Fatalf("plain text or diagnostics = %q %#v", a.PlainText, a.Diagnostics)
	}
	html, err := Render(doc, RenderConfig{})
	if err != nil || strings.Contains(html, "toudocu:section procedure") || !strings.Contains(html, "toudocu:section verification") {
		t.Fatalf("render = %q, %v", html, err)
	}
}

func TestOnlyExactToudocuAnnotationsBypassRawHTMLPolicy(t *testing.T) {
	source := "<!-- toudocu\nid: X\n-->\n# H\n\n<!-- toudocuX -->\n<div>unsafe</div>\n"
	a := Parse([]byte(source), "test.md").Analysis()
	forbidden := 0
	for _, diagnostic := range a.Diagnostics {
		if diagnostic.Code == "forbidden-raw-html" {
			forbidden++
		}
	}
	if forbidden != 2 || a.MetadataBlocks != 1 || strings.Contains(a.PlainText, "toudocu\nid") {
		t.Fatalf("exact annotation boundary failed: metadata=%d plain=%q diagnostics=%#v", a.MetadataBlocks, a.PlainText, a.Diagnostics)
	}
}

func TestPolicyDiagnostics(t *testing.T) {
	source := "---\ntitle: x\n---\n# H\n\n<div>block</div>\n\n| A |\n|---|\n| <b>x</b> |\n\n~~~go\nunclosed\n"
	a := Parse([]byte(source), "unsafe.md").Analysis()
	codes := map[string]int{}
	for _, diagnostic := range a.Diagnostics {
		codes[diagnostic.Code]++
		if diagnostic.Range.Start.Line < 1 || diagnostic.Range.Start.Column < 1 {
			t.Fatalf("invalid diagnostic range: %#v", diagnostic)
		}
	}
	if codes["forbidden-front-matter"] != 1 || codes["forbidden-raw-html"] < 2 || codes["unclosed-fence"] != 1 {
		t.Fatalf("diagnostics = %#v", a.Diagnostics)
	}
}

func TestMermaidRecognitionIsExact(t *testing.T) {
	a := Parse([]byte("```MERMAID\nflowchart TD\nA-->B\n```\n\n```mermaid extra\nflowchart TD\n```\n"), "").Analysis()
	if len(a.MermaidBlocks) != 1 {
		t.Fatalf("mermaid blocks = %#v", a.MermaidBlocks)
	}
}

func TestFrontMatterAndMermaidPolicyRenderSafely(t *testing.T) {
	doc := Parse([]byte("---\ntitle: unsafe\n---\n# H\n\n```mermaid\nflowchart TD\n%%{theme: dark}%%\nA-->B\n```\n"), "")
	html, err := Render(doc, RenderConfig{InteractiveMermaid: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, `class="forbidden-front-matter"`) || !strings.Contains(html, "title: unsafe") || strings.Contains(html, "<hr>") || strings.Contains(html, `data-mermaid-diagram`) {
		t.Fatalf("policy rendering = %s", html)
	}
}

func TestSafeRendererEscapesAndResolvesEveryLink(t *testing.T) {
	doc := Parse([]byte("# H\n\n<script>x</script>\n\n[j](javascript:alert(1)) https://example.com ![x](asset.png)\n"), "")
	seen := []string{}
	html, err := Render(doc, RenderConfig{ResolveLink: func(destination string, image bool, title string) LinkResolution {
		seen = append(seen, destination)
		if strings.HasPrefix(destination, "javascript:") {
			return LinkResolution{Href: "#", Blocked: true}
		}
		return LinkResolution{Href: "/resolved", External: strings.HasPrefix(destination, "http")}
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(seen) != 3 || strings.Contains(html, "<script>") || !strings.Contains(html, "&lt;script&gt;x&lt;/script&gt;") || !strings.Contains(html, "unsafe-link") || strings.Contains(html, "javascript:") || !strings.Contains(html, `src="/resolved"`) {
		t.Fatalf("rendered HTML = %s; seen=%#v", html, seen)
	}
}
