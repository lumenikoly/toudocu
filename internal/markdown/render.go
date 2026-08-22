package markdown

import (
	"bytes"
	"fmt"
	"html"
	"io"
	"strings"
	"unicode"

	"github.com/yuin/goldmark/ast"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/util"
)

type LinkResolution struct {
	Href                      string
	External, Broken, Blocked bool
}

type LinkResolver func(destination string, image bool, title string) LinkResolution

type RenderConfig struct {
	ResolveLink          LinkResolver
	TaskCompletionByLine map[int]bool
	SkipH1               bool
	SuppressMetadata     bool
	InteractiveMermaid   bool
	TaskUncheckedLabel   string
	TaskCheckedLabel     string
	UnsafeLinkTitle      string
	ExternalImageLabel   string
	MermaidZoomLabel     string
	MermaidZoomOut       string
	MermaidFit           string
	MermaidZoomIn        string
	MermaidFullscreen    string
	MermaidLabel         string
	MermaidError         string
	MermaidSource        string
}

func Render(document *Document, config RenderConfig) (string, error) {
	defaults := map[*string]string{
		&config.TaskUncheckedLabel: "Not completed", &config.TaskCheckedLabel: "Completed",
		&config.UnsafeLinkTitle: "Unsafe link blocked", &config.ExternalImageLabel: "Image: %s",
		&config.MermaidZoomLabel: "Diagram zoom", &config.MermaidZoomOut: "Zoom out", &config.MermaidFit: "Fit",
		&config.MermaidZoomIn: "Zoom in", &config.MermaidFullscreen: "Fullscreen", &config.MermaidLabel: "Mermaid diagram",
		&config.MermaidError: "Could not render the diagram.", &config.MermaidSource: "Show source code",
	}
	for target, value := range defaults {
		if *target == "" {
			*target = value
		}
	}
	r := &nodeRenderer{document: document, config: config, headingIDs: map[ast.Node]string{}, suppressed: map[ast.Node]bool{}, skippedHeadings: map[ast.Node]bool{}, blockedLinks: map[ast.Node]bool{}, taskTextOpen: map[ast.Node]bool{}, frontMatterNodes: map[ast.Node]bool{}}
	if frontMatter, ok := frontMatterRange(document.source, document.lineIndex); ok {
		r.frontMatterEnd = frontMatter.End.Offset
	}
	for i, h := range document.analysis.Headings {
		if n := headingNode(document.tree, i); n != nil {
			r.headingIDs[n] = h.ID
		}
	}
	engine := renderer.NewRenderer(renderer.WithNodeRenderers(util.Prioritized(r, 1000)))
	var out bytes.Buffer
	if err := engine.Render(&out, document.source, document.tree); err != nil {
		return "", err
	}
	return out.String(), nil
}

func headingNode(root ast.Node, index int) ast.Node {
	count := 0
	var found ast.Node
	_ = ast.Walk(root, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering && n.Kind() == ast.KindHeading {
			if count == index {
				found = n
				return ast.WalkStop, nil
			}
			count++
		}
		return ast.WalkContinue, nil
	})
	return found
}

type nodeRenderer struct {
	document         *Document
	config           RenderConfig
	headingIDs       map[ast.Node]string
	suppressed       map[ast.Node]bool
	skippedHeadings  map[ast.Node]bool
	blockedLinks     map[ast.Node]bool
	taskTextOpen     map[ast.Node]bool
	frontMatterEnd   int
	frontMatterNodes map[ast.Node]bool
}

func (r *nodeRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	for _, pair := range []struct {
		k ast.NodeKind
		f renderer.NodeRendererFunc
	}{
		{ast.KindDocument, r.documentNode}, {ast.KindHeading, r.heading}, {ast.KindBlockquote, r.simple("blockquote")},
		{ast.KindCodeBlock, r.codeBlock}, {ast.KindFencedCodeBlock, r.fencedCodeBlock}, {ast.KindHTMLBlock, r.rawBlock},
		{ast.KindList, r.list}, {ast.KindListItem, r.listItem}, {ast.KindParagraph, r.paragraph}, {ast.KindTextBlock, r.textBlock},
		{ast.KindThematicBreak, r.void("hr")}, {ast.KindLinkReferenceDefinition, r.skip},
		{ast.KindAutoLink, r.autoLink}, {ast.KindCodeSpan, r.codeSpan}, {ast.KindEmphasis, r.emphasis}, {ast.KindImage, r.image}, {ast.KindLink, r.link},
		{ast.KindRawHTML, r.rawInline}, {ast.KindText, r.text}, {ast.KindString, r.stringNode},
		{extast.KindStrikethrough, r.simple("del")}, {extast.KindTaskCheckBox, r.taskCheckbox},
		{extast.KindTable, r.table}, {extast.KindTableHeader, r.simple("thead")}, {extast.KindTableRow, r.simple("tr")}, {extast.KindTableCell, r.tableCell},
	} {
		reg.Register(pair.k, r.policyGuard(pair.f))
	}
}

func (r *nodeRenderer) policyGuard(next renderer.NodeRendererFunc) renderer.NodeRendererFunc {
	return func(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
		if n.Kind() != ast.KindDocument && r.frontMatterEnd > 0 {
			if entering && n.Pos() >= 0 && n.Pos() < r.frontMatterEnd {
				r.frontMatterNodes[n] = true
				return ast.WalkSkipChildren, nil
			}
			if r.frontMatterNodes[n] {
				return ast.WalkContinue, nil
			}
		}
		return next(w, source, n, entering)
	}
}

func (r *nodeRenderer) documentNode(w util.BufWriter, source []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering && r.frontMatterEnd > 0 {
		_, _ = io.WriteString(w, `<pre class="forbidden-front-matter">`+html.EscapeString(string(source[:r.frontMatterEnd]))+`</pre>`)
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) skip(_ util.BufWriter, _ []byte, _ ast.Node, _ bool) (ast.WalkStatus, error) {
	return ast.WalkSkipChildren, nil
}
func (r *nodeRenderer) simple(tag string) renderer.NodeRendererFunc {
	return func(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
		if r.suppressed[n] {
			return ast.WalkSkipChildren, nil
		}
		if entering {
			_, _ = io.WriteString(w, "<"+tag+">")
		} else {
			_, _ = io.WriteString(w, "</"+tag+">")
		}
		return ast.WalkContinue, nil
	}
}
func (r *nodeRenderer) void(tag string) renderer.NodeRendererFunc {
	return func(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering {
			_, _ = io.WriteString(w, "<"+tag+">")
		}
		return ast.WalkContinue, nil
	}
}

func (r *nodeRenderer) heading(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	h := n.(*ast.Heading)
	if r.config.SkipH1 && h.Level == 1 {
		if entering {
			r.skippedHeadings[n] = true
			return ast.WalkSkipChildren, nil
		}
		if r.skippedHeadings[n] {
			return ast.WalkContinue, nil
		}
	}
	id := r.headingIDs[n]
	if entering {
		_, _ = fmt.Fprintf(w, `<h%d id="%s"><a class="heading-anchor" href="#%s" aria-hidden="true" tabindex="-1">#</a>`, h.Level, attr(id), attr(id))
	} else {
		_, _ = fmt.Fprintf(w, "</h%d>", h.Level)
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) rawBlock(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = io.WriteString(w, html.EscapeString(rawNode(n, source)))
	}
	return ast.WalkSkipChildren, nil
}
func (r *nodeRenderer) rawInline(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = io.WriteString(w, html.EscapeString(rawNode(n, source)))
	}
	return ast.WalkSkipChildren, nil
}
func rawNode(n ast.Node, source []byte) string {
	switch v := n.(type) {
	case *ast.RawHTML:
		var b strings.Builder
		for i := 0; i < v.Segments.Len(); i++ {
			segment := v.Segments.At(i)
			b.Write(segment.Value(source))
		}
		return b.String()
	case *ast.HTMLBlock:
		return linesValue(v, source)
	}
	return ""
}

func (r *nodeRenderer) codeBlock(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = io.WriteString(w, `<div class="code-block"><pre><code>`+html.EscapeString(linesValue(n, source))+`</code></pre></div>`)
	}
	return ast.WalkSkipChildren, nil
}
func (r *nodeRenderer) fencedCodeBlock(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkSkipChildren, nil
	}
	f := n.(*ast.FencedCodeBlock)
	info := ""
	if f.Info != nil {
		info = strings.TrimSpace(string(f.Info.Value(source)))
	}
	body := linesValue(f, source)
	if strings.EqualFold(info, "mermaid") {
		_, _ = io.WriteString(w, renderMermaid(body, mermaidValid(body), r.config.InteractiveMermaid, r.config))
		return ast.WalkSkipChildren, nil
	}
	language := sanitizeLanguage(info)
	label := ""
	class := ""
	if language != "" {
		label = `<span class="code-language">` + html.EscapeString(language) + `</span>`
		class = ` class="language-` + attr(language) + `"`
	}
	_, _ = io.WriteString(w, `<div class="code-block">`+label+`<pre><code`+class+`>`+html.EscapeString(body)+`</code></pre></div>`)
	return ast.WalkSkipChildren, nil
}
func sanitizeLanguage(v string) string {
	var b strings.Builder
	for _, c := range v {
		if unicode.IsLetter(c) || unicode.IsDigit(c) || strings.ContainsRune("_+.-", c) {
			b.WriteRune(c)
		} else {
			break
		}
	}
	return b.String()
}

func (r *nodeRenderer) list(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if r.suppressed[n] {
		return ast.WalkSkipChildren, nil
	}
	l := n.(*ast.List)
	if entering && n.Parent() != nil && n.Parent().Kind() == ast.KindListItem && r.taskTextOpen[n.Parent()] {
		_, _ = io.WriteString(w, "</span>")
		r.taskTextOpen[n.Parent()] = false
	}
	tag := "ul"
	if l.IsOrdered() {
		tag = "ol"
	}
	if entering {
		start := ""
		if l.IsOrdered() && l.Start != 1 {
			start = fmt.Sprintf(` start="%d"`, l.Start)
		}
		class := ""
		if containsTask(l) {
			class = ` class="task-list"`
		}
		_, _ = fmt.Fprintf(w, "<%s%s%s>", tag, start, class)
	} else {
		_, _ = fmt.Fprintf(w, "</%s>", tag)
	}
	return ast.WalkContinue, nil
}
func containsTask(n ast.Node) bool {
	found := false
	_ = ast.Walk(n, func(c ast.Node, e bool) (ast.WalkStatus, error) {
		if e && c.Kind() == extast.KindTaskCheckBox {
			found = true
			return ast.WalkStop, nil
		}
		return ast.WalkContinue, nil
	})
	return found
}
func (r *nodeRenderer) listItem(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	task := firstTask(n)
	if entering {
		if task == nil {
			_, _ = io.WriteString(w, "<li>")
		} else {
			checked := r.taskChecked(n, task.IsChecked)
			state, class := "open", "is-open"
			if checked {
				state, class = "complete", "is-complete"
			}
			_, _ = fmt.Fprintf(w, `<li class="task-item %s" data-task-state="%s">`, class, state)
		}
	} else {
		if r.taskTextOpen[n] {
			_, _ = io.WriteString(w, "</span>")
			r.taskTextOpen[n] = false
		}
		_, _ = io.WriteString(w, "</li>")
	}
	return ast.WalkContinue, nil
}
func firstTask(n ast.Node) *extast.TaskCheckBox {
	var result *extast.TaskCheckBox
	_ = ast.Walk(n, func(c ast.Node, e bool) (ast.WalkStatus, error) {
		if e {
			if v, ok := c.(*extast.TaskCheckBox); ok {
				result = v
				return ast.WalkStop, nil
			}
		}
		return ast.WalkContinue, nil
	})
	return result
}
func (r *nodeRenderer) taskCheckbox(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		item := ancestor(n, ast.KindListItem)
		checked := r.taskChecked(item, n.(*extast.TaskCheckBox).IsChecked)
		label, mark := r.config.TaskUncheckedLabel, ""
		if label == "" {
			label = "Not completed"
		}
		if checked {
			label, mark = r.config.TaskCheckedLabel, "✓"
			if label == "" {
				label = "Completed"
			}
		}
		_, _ = fmt.Fprintf(w, `<span class="task-checkbox" role="img" aria-label="%s">%s</span><span class="task-text">`, label, mark)
		if item != nil {
			r.taskTextOpen[item] = true
		}
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) taskChecked(item ast.Node, fallback bool) bool {
	if item != nil && r.config.TaskCompletionByLine != nil {
		line := r.document.position(item.Pos()).Line
		if value, ok := r.config.TaskCompletionByLine[line-1]; ok {
			return value
		}
	}
	return fallback
}
func (r *nodeRenderer) paragraph(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if item := ancestor(n, ast.KindListItem); item != nil && firstTask(item) != nil {
		return ast.WalkContinue, nil
	}
	if entering {
		_, _ = io.WriteString(w, "<p>")
	} else {
		_, _ = io.WriteString(w, "</p>")
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) textBlock(_ util.BufWriter, _ []byte, _ ast.Node, _ bool) (ast.WalkStatus, error) {
	return ast.WalkContinue, nil
}

func (r *nodeRenderer) table(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = io.WriteString(w, `<div class="table-wrap"><table>`)
	} else {
		_, _ = io.WriteString(w, "</table></div>")
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) tableCell(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	cell := n.(*extast.TableCell)
	tag := "td"
	if n.Parent() != nil && n.Parent().Kind() == extast.KindTableHeader {
		tag = "th"
	}
	style := ""
	if cell.Alignment != extast.AlignNone {
		style = ` style="text-align:` + cell.Alignment.String() + `"`
	}
	if entering {
		_, _ = fmt.Fprintf(w, "<%s%s>", tag, style)
	} else {
		_, _ = fmt.Fprintf(w, "</%s>", tag)
	}
	return ast.WalkContinue, nil
}

func (r *nodeRenderer) text(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	t := n.(*ast.Text)
	_, _ = io.WriteString(w, html.EscapeString(string(t.Segment.Value(source))))
	if t.HardLineBreak() {
		_, _ = io.WriteString(w, "<br>")
	} else if t.SoftLineBreak() {
		_ = w.WriteByte('\n')
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) stringNode(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = io.WriteString(w, html.EscapeString(string(n.(*ast.String).Value)))
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) codeSpan(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = io.WriteString(w, "<code>"+html.EscapeString(textOf(n, source))+"</code>")
	}
	return ast.WalkSkipChildren, nil
}
func (r *nodeRenderer) emphasis(w util.BufWriter, _ []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	tag := "em"
	if n.(*ast.Emphasis).Level == 2 {
		tag = "strong"
	}
	if entering {
		_, _ = io.WriteString(w, "<"+tag+">")
	} else {
		_, _ = io.WriteString(w, "</"+tag+">")
	}
	return ast.WalkContinue, nil
}

func (r *nodeRenderer) autoLink(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkSkipChildren, nil
	}
	a := n.(*ast.AutoLink)
	dest := string(a.URL(source))
	if a.AutoLinkType == ast.AutoLinkEmail && !strings.HasPrefix(strings.ToLower(dest), "mailto:") {
		dest = "mailto:" + dest
	}
	r.writeLink(w, dest, string(a.Label(source)), "", false)
	return ast.WalkSkipChildren, nil
}
func (r *nodeRenderer) link(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	l := n.(*ast.Link)
	if entering {
		resolved := r.resolve(string(l.Destination), false, string(l.Title))
		if resolved.Blocked {
			r.blockedLinks[n] = true
		}
		return r.openResolvedLink(w, resolved)
	}
	if r.blockedLinks[n] {
		_, _ = io.WriteString(w, "</span>")
	} else {
		_, _ = io.WriteString(w, "</a>")
	}
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) image(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		i := n.(*ast.Image)
		r.writeLink(w, string(i.Destination), textOf(i, source), string(i.Title), true)
	}
	return ast.WalkSkipChildren, nil
}
func (r *nodeRenderer) openResolvedLink(w util.BufWriter, res LinkResolution) (ast.WalkStatus, error) {
	if res.Blocked {
		_, _ = io.WriteString(w, `<span class="unsafe-link" title="`+attr(r.config.UnsafeLinkTitle)+`">`)
		return ast.WalkContinue, nil
	}
	classes := ""
	attrs := ""
	if res.External {
		classes = ` class="external-link"`
		attrs = ` target="_blank" rel="noopener noreferrer"`
	}
	if res.Broken {
		classes = ` class="broken-link"`
	}
	_, _ = fmt.Fprintf(w, `<a href="%s"%s%s>`, attr(res.Href), classes, attrs)
	return ast.WalkContinue, nil
}
func (r *nodeRenderer) writeLink(w util.BufWriter, dest, label, title string, image bool) {
	res := r.resolve(dest, image, title)
	if res.Blocked {
		_, _ = io.WriteString(w, `<span class="unsafe-link" title="`+attr(r.config.UnsafeLinkTitle)+`">`+html.EscapeString(label)+`</span>`)
		return
	}
	if image {
		if res.External {
			_, _ = io.WriteString(w, `<span class="external-image-placeholder">`+html.EscapeString(fmt.Sprintf(r.config.ExternalImageLabel, label))+`</span>`)
			return
		}
		broken := ""
		if res.Broken {
			broken = " is-broken"
		}
		_, _ = fmt.Fprintf(w, `<img class="doc-image%s" src="%s" alt="%s" loading="lazy">`, broken, attr(res.Href), attr(label))
		return
	}
	classes := ""
	attrs := ""
	if res.External {
		classes = ` class="external-link"`
		attrs = ` target="_blank" rel="noopener noreferrer"`
	}
	_, _ = fmt.Fprintf(w, `<a href="%s"%s%s>%s</a>`, attr(res.Href), classes, attrs, html.EscapeString(label))
}
func (r *nodeRenderer) resolve(dest string, image bool, title string) LinkResolution {
	if r.config.ResolveLink != nil {
		return r.config.ResolveLink(dest, image, title)
	}
	lower := strings.ToLower(strings.TrimSpace(dest))
	external := strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "tel:") || strings.HasPrefix(lower, "//")
	blocked := hasScheme(dest) && !external
	href := dest
	if blocked || href == "" {
		href = "#"
	}
	return LinkResolution{Href: href, External: external, Blocked: blocked}
}
func hasScheme(v string) bool {
	for i, r := range v {
		if i == 0 && !unicode.IsLetter(r) {
			return false
		}
		if r == ':' {
			return true
		}
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !strings.ContainsRune("+.-", r) {
			return false
		}
	}
	return false
}
func attr(v string) string { return html.EscapeString(v) }

func mermaidValid(source string) bool {
	return CheckMermaid(source).Valid()
}
func containsStringValue(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
func renderMermaid(source string, valid, interactive bool, config RenderConfig) string {
	escaped := html.EscapeString(source)
	var b strings.Builder
	b.WriteString(`<figure class="mermaid-diagram" data-mermaid-container>`)
	if valid {
		if interactive {
			b.WriteString(`<div class="mermaid-stage" data-mermaid-stage><div class="diagram-tools" role="group" aria-label="` + attr(config.MermaidZoomLabel) + `"><button type="button" data-mermaid-zoom-out aria-label="` + attr(config.MermaidZoomOut) + `">−</button><button type="button" data-mermaid-fit>` + html.EscapeString(config.MermaidFit) + `</button><button type="button" data-mermaid-zoom-in aria-label="` + attr(config.MermaidZoomIn) + `">+</button><button type="button" data-mermaid-fullscreen>` + html.EscapeString(config.MermaidFullscreen) + `</button></div>`)
		}
		b.WriteString(`<pre class="mermaid" data-mermaid-diagram aria-label="` + attr(config.MermaidLabel) + `">` + escaped + `</pre><p class="mermaid-error" data-mermaid-error role="alert" hidden>` + html.EscapeString(config.MermaidError) + `</p>`)
		if interactive {
			b.WriteString(`</div>`)
		}
	} else {
		b.WriteString(`<p class="mermaid-error" role="alert">` + html.EscapeString(config.MermaidError) + `</p>`)
	}
	b.WriteString(`<details class="mermaid-source"><summary>` + html.EscapeString(config.MermaidSource) + `</summary><div class="code-block"><span class="code-language">mermaid</span><pre><code class="language-mermaid">` + escaped + `</code></pre></div></details></figure>`)
	return b.String()
}
