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

func TestMetadataHasOneASTBoundary(t *testing.T) {
	cases := []struct {
		name, source string
		count        int
	}{
		{"first-list", "# H\n\n- Status: Active\n- Owner: Team\n\nBody\n", 2},
		{"content-before", "# H\n\nBody\n\n- Status: Active\n", 0},
		{"ordered", "# H\n\n1. Status: Active\n", 0},
		{"nested-block", "# H\n\n- Status: Active\n  - nested\n- Owner: Team\n", 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := len(Parse([]byte(tc.source), "").Analysis().Metadata); got != tc.count {
				t.Fatalf("metadata count = %d, want %d", got, tc.count)
			}
		})
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
