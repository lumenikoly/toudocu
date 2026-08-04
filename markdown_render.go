package docgent

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var (
	tableDelimiterCellRE = regexp.MustCompile(`^:?-{3,}:?$`)
	horizontalStarRE     = regexp.MustCompile(`^\s{0,3}(?:\*\s*){3,}$`)
	horizontalDashRE     = regexp.MustCompile(`^\s{0,3}(?:-\s*){3,}$`)
	horizontalUnderRE    = regexp.MustCompile(`^\s{0,3}(?:_\s*){3,}$`)
	strikeRE             = regexp.MustCompile(`~~([^~]+)~~`)
	strongStarRE         = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	strongUnderRE        = regexp.MustCompile(`__([^_]+)__`)
	emStarRE             = regexp.MustCompile(`(^|[^*])\*([^*\n]+)\*`)
	emUnderRE            = regexp.MustCompile(`(^|[^_])_([^_\n]+)_`)
)

type RenderContext struct {
	ResolveLink          LinkResolver
	HeadingByLine        map[int]Heading
	TaskCompletionByLine map[int]bool
}

type RenderOptions struct {
	SkipH1           bool
	SuppressMetadata bool
}

type renderEntry struct {
	Text  string
	Index int
}

type listNode struct {
	SourceIndex int
	Indent      int
	Ordered     bool
	Start       int
	Task        bool
	Completed   bool
	Text        string
	Children    []*listNode
}

func parseListLine(text string, index int) (*listNode, bool) {
	match := listLineRE.FindStringSubmatch(text)
	if match == nil {
		return nil, false
	}
	ordered := len(match[2]) > 0 && match[2][0] >= '0' && match[2][0] <= '9'
	start := 0
	if ordered {
		start, _ = strconv.Atoi(strings.TrimRight(match[2], ".)"))
	}
	return &listNode{
		SourceIndex: index,
		Indent:      len(strings.ReplaceAll(match[1], "\t", "    ")),
		Ordered:     ordered,
		Start:       start,
		Task:        match[3] != "",
		Completed:   strings.EqualFold(match[3], "x"),
		Text:        match[4],
	}, true
}

func buildListTree(items []*listNode) []*listNode {
	root := &listNode{Indent: -1}
	stack := []*listNode{root}
	for _, item := range items {
		for len(stack) > 1 && stack[len(stack)-1].Indent >= item.Indent {
			stack = stack[:len(stack)-1]
		}
		parent := stack[len(stack)-1]
		parent.Children = append(parent.Children, item)
		stack = append(stack, item)
	}
	return root.Children
}

func renderListGroups(nodes []*listNode, context RenderContext) string {
	var b strings.Builder
	for index := 0; index < len(nodes); {
		ordered := nodes[index].Ordered
		startIndex := index
		for index < len(nodes) && nodes[index].Ordered == ordered {
			index++
		}
		group := nodes[startIndex:index]
		tag := "ul"
		if ordered {
			tag = "ol"
		}
		startAttr := ""
		if ordered && group[0].Start > 1 {
			startAttr = fmt.Sprintf(` start="%d"`, group[0].Start)
		}
		taskClass := ""
		for _, node := range group {
			if node.Task {
				taskClass = ` class="task-list"`
				break
			}
		}
		fmt.Fprintf(&b, "<%s%s%s>", tag, startAttr, taskClass)
		for _, node := range group {
			completed := node.Completed
			if override, exists := context.TaskCompletionByLine[node.SourceIndex]; exists {
				completed = override
			}
			itemClass := ""
			if node.Task {
				state, class := "open", "is-open"
				if completed {
					state, class = "complete", "is-complete"
				}
				itemClass = fmt.Sprintf(` class="task-item %s" data-task-state="%s"`, class, state)
			}
			fmt.Fprintf(&b, "<li%s>", itemClass)
			if node.Task {
				label, mark := "Не выполнено", ""
				if completed {
					label, mark = "Выполнено", "✓"
				}
				fmt.Fprintf(&b, `<span class="task-checkbox" role="img" aria-label="%s">%s</span>`, label, mark)
			}
			fmt.Fprintf(&b, `<span class="task-text">%s</span>`, renderInline(node.Text, context, 0))
			if len(node.Children) > 0 {
				b.WriteString(renderListGroups(node.Children, context))
			}
			b.WriteString("</li>")
		}
		fmt.Fprintf(&b, "</%s>", tag)
	}
	return b.String()
}

func parseTableRow(line string) []string {
	text := strings.TrimSpace(line)
	text = strings.TrimPrefix(text, "|")
	text = strings.TrimSuffix(text, "|")
	cells := []string{}
	var current strings.Builder
	escaped := false
	for _, char := range text {
		if escaped {
			current.WriteRune(char)
			escaped = false
		} else if char == '\\' {
			escaped = true
		} else if char == '|' {
			cells = append(cells, strings.TrimSpace(current.String()))
			current.Reset()
		} else {
			current.WriteRune(char)
		}
	}
	cells = append(cells, strings.TrimSpace(current.String()))
	return cells
}

func isTableDelimiter(line string) bool {
	cells := parseTableRow(line)
	if len(cells) == 0 {
		return false
	}
	for _, cell := range cells {
		if !tableDelimiterCellRE.MatchString(strings.ReplaceAll(cell, " ", "")) {
			return false
		}
	}
	return true
}

func tableAlignment(delimiter string) string {
	compact := strings.ReplaceAll(delimiter, " ", "")
	left, right := strings.HasPrefix(compact, ":"), strings.HasSuffix(compact, ":")
	if left && right {
		return "center"
	}
	if right {
		return "right"
	}
	if left {
		return "left"
	}
	return ""
}

func isHorizontalRule(text string) bool {
	return horizontalStarRE.MatchString(text) || horizontalDashRE.MatchString(text) || horizontalUnderRE.MatchString(text)
}

func isBlockStart(entries []renderEntry, index int) bool {
	if index >= len(entries) {
		return true
	}
	text := entries[index].Text
	if strings.TrimSpace(text) == "" || headingRE.MatchString(text) || listLineRE.MatchString(text) || isHorizontalRule(text) {
		return true
	}
	if _, _, _, ok := fenceAt(text); ok {
		return true
	}
	if strings.HasPrefix(strings.TrimLeft(text, " "), ">") {
		return true
	}
	return index+1 < len(entries) && strings.Contains(text, "|") && isTableDelimiter(entries[index+1].Text)
}

type inlineLinkMatch struct {
	Start       int
	End         int
	Image       bool
	Label       string
	Destination string
	Title       string
}

func nextInlineLink(text string, from int) (inlineLinkMatch, bool) {
	for cursor := from; cursor < len(text); {
		openRel := strings.IndexByte(text[cursor:], '[')
		if openRel < 0 {
			return inlineLinkMatch{}, false
		}
		open := cursor + openRel
		image := open > 0 && text[open-1] == '!'
		start := open
		if image {
			start--
		}
		labelEndRel := strings.Index(text[open+1:], "](")
		if labelEndRel < 0 {
			cursor = open + 1
			continue
		}
		labelEnd := open + 1 + labelEndRel
		destinationStart := labelEnd + 2
		depth := 1
		destinationEnd := -1
		for i := destinationStart; i < len(text); i++ {
			if text[i] == '(' {
				depth++
			} else if text[i] == ')' {
				depth--
				if depth == 0 {
					destinationEnd = i
					break
				}
			}
		}
		if destinationEnd < 0 {
			cursor = open + 1
			continue
		}
		destination, title := splitDestination(text[destinationStart:destinationEnd])
		return inlineLinkMatch{
			Start: start, End: destinationEnd + 1, Image: image,
			Label: text[open+1 : labelEnd], Destination: destination, Title: title,
		}, true
	}
	return inlineLinkMatch{}, false
}

func destinationHasScheme(destination string) bool {
	if strings.HasPrefix(destination, "//") {
		return true
	}
	for i, r := range destination {
		if i == 0 && !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return false
		}
		if r == ':' {
			return true
		}
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '+' || r == '.' || r == '-') {
			return false
		}
	}
	return false
}

func renderInline(input string, context RenderContext, depth int) string {
	if depth > 5 {
		return escapeHTML(input)
	}
	placeholders := []string{}
	placeholder := func(value string) string {
		token := fmt.Sprintf("\x00PD%d\x00", len(placeholders))
		placeholders = append(placeholders, value)
		return token
	}

	var protected strings.Builder
	for cursor := 0; cursor < len(input); {
		if input[cursor] != '`' {
			protected.WriteByte(input[cursor])
			cursor++
			continue
		}
		run := 1
		for cursor+run < len(input) && input[cursor+run] == '`' {
			run++
		}
		closingRel := strings.Index(input[cursor+run:], strings.Repeat("`", run))
		if closingRel < 0 {
			protected.WriteString(input[cursor : cursor+run])
			cursor += run
			continue
		}
		closing := cursor + run + closingRel
		code := strings.TrimSpace(input[cursor+run : closing])
		protected.WriteString(placeholder("<code>" + escapeHTML(code) + "</code>"))
		cursor = closing + run
	}
	text := protected.String()

	var linked strings.Builder
	for cursor := 0; cursor < len(text); {
		match, ok := nextInlineLink(text, cursor)
		if !ok {
			linked.WriteString(text[cursor:])
			break
		}
		linked.WriteString(text[cursor:match.Start])
		resolution := LinkResolution{Href: match.Destination}
		if context.ResolveLink != nil {
			resolution = context.ResolveLink(match.Destination, match.Image, match.Title)
		} else {
			lower := strings.ToLower(match.Destination)
			resolution.External = strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "tel:") || strings.HasPrefix(lower, "//")
			if destinationHasScheme(match.Destination) && !resolution.External {
				resolution.Blocked = true
				resolution.Href = "#"
			}
		}
		label := match.Label
		if label == "" {
			label = match.Destination
		}
		if resolution.Blocked {
			linked.WriteString(placeholder(`<span class="unsafe-link" title="Небезопасная ссылка заблокирована">` + renderInline(label, context, depth+1) + `</span>`))
		} else if match.Image {
			if resolution.External {
				linked.WriteString(placeholder(`<span class="external-image-placeholder">Изображение: ` + escapeHTML(label) + `</span>`))
			} else {
				titleAttr := ""
				if match.Title != "" {
					titleAttr = ` title="` + escapeAttr(match.Title) + `"`
				}
				brokenClass := ""
				if resolution.Broken {
					brokenClass = " is-broken"
				}
				linked.WriteString(placeholder(`<img class="doc-image` + brokenClass + `" src="` + escapeAttr(resolution.Href) + `" alt="` + escapeAttr(match.Label) + `" loading="lazy"` + titleAttr + `>`))
			}
		} else {
			classes := []string{}
			if resolution.External {
				classes = append(classes, "external-link")
			}
			if resolution.Broken {
				classes = append(classes, "broken-link")
			}
			classAttr := ""
			if len(classes) > 0 {
				classAttr = ` class="` + strings.Join(classes, " ") + `"`
			}
			targetAttr := ""
			if resolution.External {
				targetAttr = ` target="_blank" rel="noopener noreferrer"`
			}
			titleAttr := ""
			if match.Title != "" {
				titleAttr = ` title="` + escapeAttr(match.Title) + `"`
			}
			href := resolution.Href
			if href == "" {
				href = "#"
			}
			linked.WriteString(placeholder(`<a href="` + escapeAttr(href) + `"` + classAttr + targetAttr + titleAttr + `>` + renderInline(label, context, depth+1) + `</a>`))
		}
		cursor = match.End
	}

	text = escapeHTML(linked.String())
	text = strikeRE.ReplaceAllString(text, "<del>$1</del>")
	text = strongStarRE.ReplaceAllString(text, "<strong>$1</strong>")
	text = strongUnderRE.ReplaceAllString(text, "<strong>$1</strong>")
	text = emStarRE.ReplaceAllString(text, "$1<em>$2</em>")
	text = emUnderRE.ReplaceAllString(text, "$1<em>$2</em>")
	for i, value := range placeholders {
		text = strings.ReplaceAll(text, fmt.Sprintf("\x00PD%d\x00", i), value)
	}
	return text
}

func renderMermaid(source string, valid bool) string {
	sourceHTML := escapeHTML(source)
	var b strings.Builder
	b.WriteString(`<figure class="mermaid-diagram" data-mermaid-container>`)
	if valid {
		b.WriteString(`<pre class="mermaid" data-mermaid-diagram aria-label="Диаграмма Mermaid">` + sourceHTML + `</pre>`)
		b.WriteString(`<p class="mermaid-error" data-mermaid-error role="alert" hidden>Не удалось отобразить диаграмму.</p>`)
	} else {
		b.WriteString(`<p class="mermaid-error" role="alert">Не удалось отобразить диаграмму.</p>`)
	}
	b.WriteString(`<details class="mermaid-source"><summary>Показать исходный код</summary>`)
	b.WriteString(`<div class="code-block"><span class="code-language">mermaid</span><pre><code class="language-mermaid">` + sourceHTML + `</code></pre></div>`)
	b.WriteString(`</details></figure>`)
	return b.String()
}

func renderBlocks(entries []renderEntry, context RenderContext, options RenderOptions, suppressed map[int]struct{}) string {
	var b strings.Builder
	for index := 0; index < len(entries); {
		entry := entries[index]
		line := entry.Text
		if _, skip := suppressed[entry.Index]; skip {
			index++
			continue
		}
		if strings.TrimSpace(line) == "" {
			index++
			continue
		}

		if marker, fenceLength, languageRaw, ok := fenceAt(line); ok {
			language := ""
			for _, r := range languageRaw {
				if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || strings.ContainsRune("_+.-", r) {
					language += string(r)
				}
			}
			code := []string{}
			closed := false
			index++
			for index < len(entries) {
				candidate := entries[index].Text
				closingMarker, closingLength, closingTail, closing := fenceAt(candidate)
				if closing && closingMarker == marker && closingLength >= fenceLength && closingTail == "" {
					closed = true
					index++
					break
				}
				code = append(code, candidate)
				index++
			}
			source := strings.Join(code, "\n")
			if isMermaidFenceInfo(languageRaw) {
				block := analyzeMermaidBlock(entry.Index, entry.Index+len(code)+1, source, closed)
				b.WriteString(renderMermaid(source, len(block.Problems) == 0))
				continue
			}
			languageClass, languageLabel := "", ""
			if language != "" {
				languageClass = ` class="language-` + escapeAttr(language) + `"`
				languageLabel = `<span class="code-language">` + escapeHTML(language) + `</span>`
			}
			b.WriteString(`<div class="code-block">` + languageLabel + `<pre><code` + languageClass + `>` + escapeHTML(source) + `</code></pre></div>`)
			continue
		}

		if match := headingRE.FindStringSubmatch(line); match != nil {
			level := len(match[1])
			if options.SkipH1 && level == 1 {
				index++
				continue
			}
			id := slugify(stripInlineMarkdown(match[2]))
			if heading, exists := context.HeadingByLine[entry.Index]; exists {
				id = heading.ID
			}
			fmt.Fprintf(&b, `<h%d id="%s"><a class="heading-anchor" href="#%s" aria-label="Ссылка на раздел">#</a>%s</h%d>`, level, escapeAttr(id), escapeAttr(id), renderInline(match[2], context, 0), level)
			index++
			continue
		}

		if isHorizontalRule(line) {
			b.WriteString("<hr>")
			index++
			continue
		}

		if strings.HasPrefix(strings.TrimLeft(line, " "), ">") {
			quoteEntries := []renderEntry{}
			for index < len(entries) {
				current := entries[index]
				trimmed := strings.TrimLeft(current.Text, " ")
				if !strings.HasPrefix(trimmed, ">") && strings.TrimSpace(current.Text) != "" {
					break
				}
				if strings.HasPrefix(trimmed, ">") {
					trimmed = strings.TrimPrefix(trimmed, ">")
					trimmed = strings.TrimPrefix(trimmed, " ")
				}
				quoteEntries = append(quoteEntries, renderEntry{Text: trimmed, Index: current.Index})
				index++
			}
			b.WriteString("<blockquote>" + renderBlocks(quoteEntries, context, options, map[int]struct{}{}) + "</blockquote>")
			continue
		}

		if index+1 < len(entries) && strings.Contains(line, "|") && isTableDelimiter(entries[index+1].Text) {
			headers := parseTableRow(line)
			delimiters := parseTableRow(entries[index+1].Text)
			rows := [][]string{}
			index += 2
			for index < len(entries) && strings.TrimSpace(entries[index].Text) != "" && strings.Contains(entries[index].Text, "|") {
				rows = append(rows, parseTableRow(entries[index].Text))
				index++
			}
			b.WriteString(`<div class="table-wrap"><table><thead><tr>`)
			for cellIndex, cell := range headers {
				delimiter := "---"
				if cellIndex < len(delimiters) {
					delimiter = delimiters[cellIndex]
				}
				style := ""
				if align := tableAlignment(delimiter); align != "" {
					style = ` style="text-align:` + align + `"`
				}
				b.WriteString("<th" + style + ">" + renderInline(cell, context, 0) + "</th>")
			}
			b.WriteString("</tr></thead><tbody>")
			for _, row := range rows {
				b.WriteString("<tr>")
				for cellIndex := range headers {
					delimiter := "---"
					if cellIndex < len(delimiters) {
						delimiter = delimiters[cellIndex]
					}
					style := ""
					if align := tableAlignment(delimiter); align != "" {
						style = ` style="text-align:` + align + `"`
					}
					cell := ""
					if cellIndex < len(row) {
						cell = row[cellIndex]
					}
					b.WriteString("<td" + style + ">" + renderInline(cell, context, 0) + "</td>")
				}
				b.WriteString("</tr>")
			}
			b.WriteString("</tbody></table></div>")
			continue
		}

		if listLineRE.MatchString(line) {
			items := []*listNode{}
			for index < len(entries) {
				current := entries[index]
				if _, skip := suppressed[current.Index]; skip {
					index++
					continue
				}
				if item, ok := parseListLine(current.Text, current.Index); ok {
					items = append(items, item)
					index++
					continue
				}
				if strings.TrimSpace(current.Text) == "" {
					lookAhead := index + 1
					for lookAhead < len(entries) && strings.TrimSpace(entries[lookAhead].Text) == "" {
						lookAhead++
					}
					if lookAhead < len(entries) && listLineRE.MatchString(entries[lookAhead].Text) {
						index = lookAhead
						continue
					}
				}
				break
			}
			b.WriteString(renderListGroups(buildListTree(items), context))
			continue
		}

		paragraphLines := []string{}
		for index < len(entries) {
			current := entries[index]
			if _, skip := suppressed[current.Index]; skip {
				index++
				continue
			}
			if strings.TrimSpace(current.Text) == "" {
				break
			}
			if len(paragraphLines) > 0 && isBlockStart(entries, index) {
				break
			}
			paragraphLines = append(paragraphLines, strings.TrimSpace(current.Text))
			index++
		}
		if paragraph := strings.Join(paragraphLines, " "); paragraph != "" {
			b.WriteString("<p>" + renderInline(paragraph, context, 0) + "</p>")
		}
	}
	return b.String()
}

// RenderMarkdown renders safe HTML. Callers should set both options explicitly.
func RenderMarkdown(document ParsedMarkdown, context RenderContext, options RenderOptions) string {
	entries := make([]renderEntry, len(document.Lines))
	for i, text := range document.Lines {
		entries[i] = renderEntry{Text: text, Index: i}
	}
	if context.HeadingByLine == nil {
		context.HeadingByLine = document.HeadingByLine
	}
	suppressed := map[int]struct{}{}
	if options.SuppressMetadata {
		for i := range document.MetadataLineIndexes {
			suppressed[i] = struct{}{}
		}
	}
	return renderBlocks(entries, context, options, suppressed)
}

func renderDocumentMarkdown(document *Document, resolver LinkResolver, taskCompletionByLine map[int]bool) string {
	parsed := ParsedMarkdown{
		Content: document.Content, Lines: document.Lines, Title: document.Title, Description: document.Description,
		Headings: document.Headings, HeadingByLine: document.HeadingByLine,
		Metadata: document.Metadata, MetadataExtras: document.MetadataExtras, MetadataLineIndexes: document.MetadataLineIndexes,
		Tasks: document.Tasks, Links: document.Links, Sections: document.Sections, PlainText: document.PlainText,
	}
	return RenderMarkdown(parsed, RenderContext{ResolveLink: resolver, HeadingByLine: document.HeadingByLine, TaskCompletionByLine: taskCompletionByLine}, RenderOptions{SkipH1: true, SuppressMetadata: true})
}

func RenderMarkdownFragment(markdown string, context RenderContext) string {
	fragment := AnalyzeMarkdown(markdown)
	return RenderMarkdown(fragment, context, RenderOptions{SkipH1: false, SuppressMetadata: false})
}
