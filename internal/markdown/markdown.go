// Package markdown owns Docu-docu's Markdown dialect, normalized analysis and
// safe HTML rendering. Goldmark AST values never leave this package.
package markdown

import (
	"bytes"
	"sort"
	"strings"
	"unicode"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
)

type Position struct {
	Offset int `json:"offset"`
	Line   int `json:"line"`
	Column int `json:"column"`
}

type SourceRange struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Diagnostic struct {
	Severity string
	Code     string
	Message  string
	Range    SourceRange
}

type Heading struct {
	Level int
	Title string
	ID    string
	Range SourceRange
}

type MetadataItem struct {
	Key, RawKey, Value string
	Range              SourceRange
}

type Task struct {
	Completed                     bool
	Text, HeadingID, HeadingTitle string
	Indent                        int
	Range                         SourceRange
}

type ListItem struct {
	Text    string
	Ordered bool
	Range   SourceRange
}

type Link struct {
	Image                     bool
	Label, Destination, Title string
	Automatic                 bool
	Range                     SourceRange
}

type CodeBlock struct {
	Info, Source string
	Fenced       bool
	Closed       bool
	Range        SourceRange
}

type MermaidBlock struct {
	Source string
	Range  SourceRange
}

type TableRow struct {
	Cells []string
	Range SourceRange
}

type Table struct {
	Headers    []string
	Rows       []TableRow
	Alignments []string
	Range      SourceRange
}

type Section struct {
	Heading  Heading
	Metadata []MetadataItem
	Tasks    []Task
	Text     string
	Markdown string
	Range    SourceRange
	Children []Section
}

type Analysis struct {
	Title, Description, PlainText string
	Headings                      []Heading
	Sections                      []Section
	Metadata                      []MetadataItem
	Tasks                         []Task
	ListItems                     []ListItem
	Links                         []Link
	CodeBlocks                    []CodeBlock
	MermaidBlocks                 []MermaidBlock
	Tables                        []Table
	OrderedLists                  []SourceRange
	Diagnostics                   []Diagnostic
}

type Document struct {
	source    []byte
	path      string
	lineIndex []int
	tree      ast.Node
	analysis  Analysis
}

func (d *Document) Source() []byte     { return bytes.Clone(d.source) }
func (d *Document) SourcePath() string { return d.path }
func (d *Document) Analysis() Analysis { return d.analysis }

func Engine() goldmark.Markdown {
	return goldmark.New(goldmark.WithExtensions(
		extension.Table,
		extension.TaskList,
		extension.Strikethrough,
		extension.Linkify,
	))
}

func Parse(source []byte, sourcePath string) *Document {
	source = bytes.TrimPrefix(bytes.ReplaceAll(bytes.ReplaceAll(source, []byte("\r\n"), []byte("\n")), []byte("\r"), []byte("\n")), []byte("\xef\xbb\xbf"))
	d := &Document{source: bytes.Clone(source), path: sourcePath, lineIndex: buildLineIndex(source)}
	d.tree = Engine().Parser().Parse(text.NewReader(d.source), parser.WithContext(parser.NewContext()))
	d.analysis = d.analyze()
	return d
}

func buildLineIndex(source []byte) []int {
	index := []int{0}
	for i, b := range source {
		if b == '\n' {
			index = append(index, i+1)
		}
	}
	return index
}

func (d *Document) position(offset int) Position {
	if offset < 0 {
		offset = 0
	}
	if offset > len(d.source) {
		offset = len(d.source)
	}
	i := sort.Search(len(d.lineIndex), func(i int) bool { return d.lineIndex[i] > offset }) - 1
	if i < 0 {
		i = 0
	}
	return Position{Offset: offset, Line: i + 1, Column: offset - d.lineIndex[i] + 1}
}

func (d *Document) sourceRange(start, end int) SourceRange {
	return SourceRange{Start: d.position(start), End: d.position(end)}
}

func nodeOffsets(n ast.Node, source []byte) (int, int) {
	start, end := len(source), -1
	if pos := n.Pos(); pos >= 0 && pos <= len(source) {
		start = pos
	}
	if n.Type() == ast.TypeBlock {
		lines := n.Lines()
		for i := 0; i < lines.Len(); i++ {
			seg := lines.At(i)
			if seg.Stop <= seg.Start {
				continue
			}
			if pos := n.Pos(); pos > 0 && seg.Start < pos {
				continue
			}
			if seg.Start < start {
				start = seg.Start
			}
			if seg.Stop > end {
				end = seg.Stop
			}
		}
	}
	switch v := n.(type) {
	case *ast.Text:
		start, end = v.Segment.Start, v.Segment.Stop
	case *ast.String:
		// Synthesized strings do not have a source segment; use their parent.
	case *ast.RawHTML:
		for i := 0; i < v.Segments.Len(); i++ {
			seg := v.Segments.At(i)
			if seg.Start < start {
				start = seg.Start
			}
			if seg.Stop > end {
				end = seg.Stop
			}
		}
	case *ast.FencedCodeBlock:
		if v.Info != nil && v.Info.Segment.Start < start {
			start = v.Info.Segment.Start
		}
	}
	for child := n.FirstChild(); child != nil; child = child.NextSibling() {
		cs, ce := nodeOffsets(child, source)
		if cs < start {
			start = cs
		}
		if ce > end {
			end = ce
		}
	}
	if end < 0 {
		return 0, 0
	}
	return start, end
}

func textOf(n ast.Node, source []byte) string {
	var b strings.Builder
	_ = ast.Walk(n, func(child ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if child != n && child.Type() == ast.TypeBlock && b.Len() > 0 {
			b.WriteByte(' ')
		}
		switch v := child.(type) {
		case *ast.Text:
			b.Write(v.Segment.Value(source))
			if v.SoftLineBreak() || v.HardLineBreak() {
				b.WriteByte(' ')
			}
		case *ast.String:
			b.Write(v.Value)
		case *ast.AutoLink:
			b.Write(v.Label(source))
			return ast.WalkSkipChildren, nil
		case *ast.CodeSpan:
			for c := v.FirstChild(); c != nil; c = c.NextSibling() {
				if t, ok := c.(*ast.Text); ok {
					b.Write(t.Segment.Value(source))
				}
			}
			return ast.WalkSkipChildren, nil
		case *ast.FencedCodeBlock, *ast.CodeBlock:
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	return strings.Join(strings.Fields(b.String()), " ")
}

func slugify(value string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(value) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			dash = false
			b.WriteRune(r)
		case unicode.IsSpace(r) || r == '_' || r == '-':
			dash = true
		}
	}
	result := b.String()
	if result == "" {
		return "section"
	}
	return result
}

func (d *Document) rangeFor(n ast.Node) SourceRange {
	s, e := nodeOffsets(n, d.source)
	return d.sourceRange(s, e)
}

func (d *Document) analyze() Analysis {
	var a Analysis
	used := map[string]int{}
	var current Heading
	_ = ast.Walk(d.tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch v := n.(type) {
		case *ast.Heading:
			title := textOf(v, d.source)
			base := slugify(title)
			used[base]++
			id := base
			if used[base] > 1 {
				id += "-" + itoa(used[base])
			}
			h := Heading{Level: v.Level, Title: title, ID: id, Range: d.rangeFor(v)}
			a.Headings = append(a.Headings, h)
			current = h
			if v.Level == 1 && a.Title == "" {
				a.Title = title
			}
		case *ast.Link:
			a.Links = append(a.Links, Link{Label: textOf(v, d.source), Destination: string(v.Destination), Title: string(v.Title), Range: d.rangeFor(v)})
		case *ast.Image:
			a.Links = append(a.Links, Link{Image: true, Label: textOf(v, d.source), Destination: string(v.Destination), Title: string(v.Title), Range: d.rangeFor(v)})
			return ast.WalkSkipChildren, nil
		case *ast.AutoLink:
			dest := string(v.URL(d.source))
			if v.AutoLinkType == ast.AutoLinkEmail && !strings.HasPrefix(strings.ToLower(dest), "mailto:") {
				dest = "mailto:" + dest
			}
			a.Links = append(a.Links, Link{Label: string(v.Label(d.source)), Destination: dest, Automatic: true, Range: d.rangeFor(v)})
			return ast.WalkSkipChildren, nil
		case *extast.TaskCheckBox:
			item := ancestor(n, ast.KindListItem)
			_, end := nodeOffsets(item, d.source)
			start := n.Pos()
			if item != nil && item.Pos() >= 0 {
				start = item.Pos()
			}
			r := d.sourceRange(start, end)
			a.Tasks = append(a.Tasks, Task{Completed: v.IsChecked, Text: taskText(item, d.source), HeadingID: current.ID, HeadingTitle: current.Title, Indent: listDepth(item) - 1, Range: r})
		case *ast.List:
			if v.IsOrdered() {
				a.OrderedLists = append(a.OrderedLists, d.rangeFor(v))
			}
		case *ast.ListItem:
			list, _ := v.Parent().(*ast.List)
			_, end := nodeOffsets(v, d.source)
			a.ListItems = append(a.ListItems, ListItem{Text: textOf(v, d.source), Ordered: list != nil && list.IsOrdered(), Range: d.sourceRange(v.Pos(), end)})
		case *ast.FencedCodeBlock:
			info := ""
			if v.Info != nil {
				info = strings.TrimSpace(string(v.Info.Text(d.source)))
			}
			source := linesValue(v, d.source)
			closed := fenceClosed(d.source, d.lineIndex, v, info)
			block := CodeBlock{Info: info, Source: source, Fenced: true, Closed: closed, Range: d.rangeFor(v)}
			a.CodeBlocks = append(a.CodeBlocks, block)
			if strings.EqualFold(info, "mermaid") {
				a.MermaidBlocks = append(a.MermaidBlocks, MermaidBlock{Source: source, Range: block.Range})
			}
			if !closed {
				a.Diagnostics = append(a.Diagnostics, Diagnostic{Severity: "error", Code: "unclosed-fence", Message: "Fenced code block is not closed.", Range: block.Range})
			}
			return ast.WalkSkipChildren, nil
		case *ast.CodeBlock:
			a.CodeBlocks = append(a.CodeBlocks, CodeBlock{Source: linesValue(v, d.source), Closed: true, Range: d.rangeFor(v)})
			return ast.WalkSkipChildren, nil
		case *ast.HTMLBlock, *ast.RawHTML:
			a.Diagnostics = append(a.Diagnostics, Diagnostic{Severity: "error", Code: "forbidden-raw-html", Message: "Raw HTML is forbidden.", Range: d.rangeFor(v)})
		case *extast.Table:
			a.Tables = append(a.Tables, d.analyzeTable(v))
		}
		return ast.WalkContinue, nil
	})
	a.Metadata = d.extractMetadata()
	d.analysis.Metadata = a.Metadata
	d.analysis.Tasks = a.Tasks
	a.Sections = d.extractSections(a.Headings)
	a.Description = d.description(a.Metadata)
	a.PlainText = textOf(d.tree, d.source)
	if r, ok := frontMatterRange(d.source, d.lineIndex); ok {
		a.Diagnostics = append(a.Diagnostics, Diagnostic{Severity: "error", Code: "forbidden-front-matter", Message: "Front matter is forbidden.", Range: r})
	}
	return a
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func ancestor(n ast.Node, kind ast.NodeKind) ast.Node {
	for n != nil && n.Kind() != kind {
		n = n.Parent()
	}
	return n
}
func listDepth(n ast.Node) int {
	depth := 0
	for n != nil {
		if n.Kind() == ast.KindListItem {
			depth++
		}
		n = n.Parent()
	}
	return depth
}
func taskText(item ast.Node, source []byte) string {
	if item == nil {
		return ""
	}
	s := textOf(item, source)
	return strings.TrimSpace(s)
}
func linesValue(n ast.Node, source []byte) string {
	var b strings.Builder
	lines := n.Lines()
	for i := 0; i < lines.Len(); i++ {
		segment := lines.At(i)
		b.Write(segment.Value(source))
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func (d *Document) extractMetadata() []MetadataItem {
	root := d.tree
	var h1 ast.Node
	for n := root.FirstChild(); n != nil; n = n.NextSibling() {
		if h, ok := n.(*ast.Heading); ok && h.Level == 1 {
			h1 = n
			break
		}
		if n.Kind() != ast.KindThematicBreak {
			return nil
		}
	}
	if h1 == nil {
		return nil
	}
	candidate := h1.NextSibling()
	list, ok := candidate.(*ast.List)
	if !ok || list.IsOrdered() {
		return nil
	}
	return d.metadataFromList(list)
}

func (d *Document) metadataFromList(list *ast.List) []MetadataItem {
	items := []MetadataItem{}
	for item := list.FirstChild(); item != nil; item = item.NextSibling() {
		if metadata, ok := d.metadataItem(item); ok {
			items = append(items, metadata)
		}
	}
	return items
}

func (d *Document) metadataItem(item ast.Node) (MetadataItem, bool) {
	if item.ChildCount() != 1 || containsNodeKind(item, extast.KindTaskCheckBox) {
		return MetadataItem{}, false
	}
	block := item.FirstChild()
	if block.Kind() != ast.KindTextBlock && block.Kind() != ast.KindParagraph {
		return MetadataItem{}, false
	}
	value := textOf(block, d.source)
	key, val, ok := strings.Cut(value, ":")
	if !ok {
		key, val, ok = strings.Cut(value, "：")
	}
	key = strings.TrimSpace(key)
	val = strings.TrimSpace(val)
	if !ok || key == "" || val == "" {
		return MetadataItem{}, false
	}
	return MetadataItem{RawKey: key, Key: strings.ToLower(key), Value: val, Range: d.rangeFor(item)}, true
}

func (d *Document) description(metadata []MetadataItem) string {
	var after ast.Node
	for n := d.tree.FirstChild(); n != nil; n = n.NextSibling() {
		if h, ok := n.(*ast.Heading); ok && h.Level == 1 {
			after = n.NextSibling()
			break
		}
	}
	if after != nil {
		if _, ok := after.(*ast.List); ok && len(metadata) > 0 {
			after = after.NextSibling()
		}
	}
	if after != nil && after.Kind() == ast.KindParagraph {
		return textOf(after, d.source)
	}
	return ""
}

func (d *Document) extractSections(headings []Heading) []Section {
	flat := make([]Section, 0, len(headings))
	for i, h := range headings {
		if h.Level == 1 {
			continue
		}
		end := len(d.source)
		for j := i + 1; j < len(headings); j++ {
			if headings[j].Level <= h.Level {
				end = headings[j].Range.Start.Offset
				break
			}
		}
		start := h.Range.End.Offset
		raw := strings.TrimSpace(string(d.source[start:end]))
		flat = append(flat, Section{Heading: h, Text: d.sectionPlainText(h), Markdown: raw, Range: d.sourceRange(h.Range.Start.Offset, end)})
	}
	// Existing consumers use the flat H2 list; Children still expose hierarchy.
	result := []Section{}
	stack := []*Section{}
	for _, s := range flat {
		for len(stack) > 0 && stack[len(stack)-1].Heading.Level >= s.Heading.Level {
			stack = stack[:len(stack)-1]
		}
		if len(stack) == 0 {
			result = append(result, s)
			stack = append(stack, &result[len(result)-1])
		} else {
			p := stack[len(stack)-1]
			p.Children = append(p.Children, s)
			stack = append(stack, &p.Children[len(p.Children)-1])
		}
	}
	for i := range result {
		d.fillSection(&result[i])
	}
	return result
}
func (d *Document) fillSection(s *Section) {
	_ = ast.Walk(d.tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		h, ok := n.(*ast.Heading)
		if !ok || h.Pos() != s.Heading.Range.Start.Offset {
			return ast.WalkContinue, nil
		}
		if list, ok := h.NextSibling().(*ast.List); ok && !list.IsOrdered() {
			s.Metadata = d.metadataFromList(list)
		}
		return ast.WalkStop, nil
	})
	for _, t := range d.analysis.Tasks {
		if t.Range.Start.Offset >= s.Range.Start.Offset && t.Range.End.Offset <= s.Range.End.Offset {
			s.Tasks = append(s.Tasks, t)
		}
	}
	for i := range s.Children {
		d.fillSection(&s.Children[i])
	}
}
func (d *Document) sectionPlainText(heading Heading) string {
	var node ast.Node
	for candidate := d.tree.FirstChild(); candidate != nil; candidate = candidate.NextSibling() {
		if h, ok := candidate.(*ast.Heading); ok && h.Pos() == heading.Range.Start.Offset {
			node = candidate
			break
		}
	}
	if node == nil {
		return ""
	}
	parts := []string{}
	first := true
	for candidate := node.NextSibling(); candidate != nil; candidate = candidate.NextSibling() {
		if h, ok := candidate.(*ast.Heading); ok && h.Level <= heading.Level {
			break
		}
		isFirst := first
		first = false
		value := textOf(candidate, d.source)
		if list, ok := candidate.(*ast.List); ok {
			items := []string{}
			for item := list.FirstChild(); item != nil; item = item.NextSibling() {
				if isFirst && !list.IsOrdered() {
					if _, metadata := d.metadataItem(item); metadata {
						continue
					}
				}
				if containsNodeKind(item, extast.KindTaskCheckBox) {
					items = append(items, taskText(item, d.source))
				} else {
					items = append(items, textOf(item, d.source))
				}
			}
			value = strings.Join(items, " ")
		}
		if value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(parts, " ")
}

func containsNodeKind(n ast.Node, kind ast.NodeKind) bool {
	found := false
	_ = ast.Walk(n, func(candidate ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering && candidate.Kind() == kind {
			found = true
			return ast.WalkStop, nil
		}
		return ast.WalkContinue, nil
	})
	return found
}

func (d *Document) analyzeTable(t *extast.Table) Table {
	result := Table{Range: d.rangeFor(t)}
	for _, a := range t.Alignments {
		result.Alignments = append(result.Alignments, a.String())
	}
	for row := t.FirstChild(); row != nil; row = row.NextSibling() {
		cells := []string{}
		for cell := row.FirstChild(); cell != nil; cell = cell.NextSibling() {
			cells = append(cells, textOf(cell, d.source))
		}
		if row.Kind() == extast.KindTableHeader {
			result.Headers = cells
		} else {
			result.Rows = append(result.Rows, TableRow{Cells: cells, Range: d.rangeFor(row)})
		}
	}
	return result
}

func frontMatterRange(source []byte, index []int) (SourceRange, bool) {
	if len(index) == 0 {
		return SourceRange{}, false
	}
	firstEnd := bytes.IndexByte(source, '\n')
	if firstEnd < 0 {
		return SourceRange{}, false
	}
	marker := strings.TrimSpace(string(source[:firstEnd]))
	if marker != "---" && marker != "+++" {
		return SourceRange{}, false
	}
	for _, start := range index[1:] {
		end := bytes.IndexByte(source[start:], '\n')
		if end < 0 {
			end = len(source) - start
		}
		if strings.TrimSpace(string(source[start:start+end])) == marker {
			return SourceRange{Start: Position{Offset: 0, Line: 1, Column: 1}, End: Position{Offset: start + end, Line: sort.SearchInts(index, start) + 1, Column: end + 1}}, true
		}
	}
	return SourceRange{}, false
}

func fenceClosed(source []byte, index []int, n *ast.FencedCodeBlock, info string) bool {
	start, _ := nodeOffsets(n, source)
	if n.Info != nil {
		start = n.Info.Segment.Start
	}
	line := sort.Search(len(index), func(i int) bool { return index[i] > start }) - 1
	if line < 0 {
		line = 0
	}
	opening := strings.TrimLeft(string(lineBytes(source, index, line)), " ")
	if len(opening) < 3 {
		return true
	}
	marker := opening[0]
	run := 0
	for run < len(opening) && opening[run] == marker {
		run++
	}
	for i := line + 1; i < len(index); i++ {
		candidate := strings.TrimSpace(string(lineBytes(source, index, i)))
		count := 0
		for count < len(candidate) && candidate[count] == marker {
			count++
		}
		if count >= run && strings.TrimSpace(candidate[count:]) == "" {
			return true
		}
	}
	return false
}
func lineBytes(source []byte, index []int, line int) []byte {
	start := index[line]
	end := len(source)
	if line+1 < len(index) {
		end = index[line+1] - 1
	}
	return source[start:end]
}
