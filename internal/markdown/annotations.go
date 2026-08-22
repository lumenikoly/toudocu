package markdown

import "strings"

type annotationKind string

const (
	annotationMetadata annotationKind = "metadata"
	annotationSection  annotationKind = "section"
	annotationTable    annotationKind = "table"
)

type annotation struct {
	Kind     annotationKind
	Name     string
	Columns  []string
	Metadata []MetadataItem
	Range    SourceRange
}

func (d *Document) extractAnnotations(source []byte) ([]byte, []annotation, []Diagnostic) {
	clean := bytesClone(source)
	annotations := []annotation{}
	diagnostics := []Diagnostic{}
	inFence := byte(0)
	fenceSize := 0
	for offset := 0; offset < len(source); {
		lineEnd := offset
		for lineEnd < len(source) && source[lineEnd] != '\n' {
			lineEnd++
		}
		line := source[offset:lineEnd]
		trimmed, indent := trimLineIndent(line)
		if marker, size, ok := fenceMarker(trimmed); ok && indent <= 3 {
			if inFence == 0 {
				inFence, fenceSize = marker, size
			} else if marker == inFence && size >= fenceSize && fenceClosing(trimmed, size) {
				inFence, fenceSize = 0, 0
			}
			offset = nextLineOffset(lineEnd, len(source))
			continue
		}
		if inFence != 0 {
			offset = nextLineOffset(lineEnd, len(source))
			continue
		}
		start := offset + indent
		text := string(trimmed)
		switch {
		case strings.HasPrefix(text, "<!-- toudocu:"):
			end := lineEnd
			candidate, ok := parseSingleLineAnnotation(text, d.sourceRange(start, end))
			blankAnnotation(clean, start, end)
			if !ok {
				diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "invalid-toudocu-annotation", Message: "Invalid Toudocu annotation.", Range: d.sourceRange(start, end)})
			} else {
				annotations = append(annotations, candidate)
			}
		case reservedMetadataStart(text):
			end := findAnnotationEnd(source, start)
			if end < 0 {
				end = len(source)
				blankAnnotation(clean, start, end)
				diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "invalid-toudocu-annotation", Message: "Toudocu metadata annotation is not closed.", Range: d.sourceRange(start, end)})
				offset = len(source)
				continue
			}
			end += len("-->")
			r := d.sourceRange(start, end)
			candidate, ok := d.parseMetadataAnnotation(source[start:end], r)
			blankAnnotation(clean, start, end)
			if !ok {
				diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "invalid-toudocu-annotation", Message: "Invalid Toudocu metadata annotation.", Range: r})
			} else {
				annotations = append(annotations, candidate)
			}
			offset = end
			continue
		}
		offset = nextLineOffset(lineEnd, len(source))
	}
	return clean, annotations, diagnostics
}

func reservedMetadataStart(text string) bool {
	if !strings.HasPrefix(text, "<!-- toudocu") || strings.HasPrefix(text, "<!-- toudocu:") {
		return false
	}
	rest := strings.TrimPrefix(text, "<!-- toudocu")
	return rest == "" || rest[0] == ' ' || rest[0] == '\t'
}

func bytesClone(source []byte) []byte {
	result := make([]byte, len(source))
	copy(result, source)
	return result
}

func trimLineIndent(line []byte) ([]byte, int) {
	i := 0
	for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
		i++
	}
	return line[i:], i
}

func nextLineOffset(lineEnd, length int) int {
	if lineEnd < length {
		return lineEnd + 1
	}
	return lineEnd
}

func fenceMarker(line []byte) (byte, int, bool) {
	if len(line) < 3 || line[0] != '`' && line[0] != '~' {
		return 0, 0, false
	}
	marker := line[0]
	size := 0
	for size < len(line) && line[size] == marker {
		size++
	}
	return marker, size, size >= 3
}

func fenceClosing(line []byte, size int) bool {
	return strings.TrimSpace(string(line[size:])) == ""
}

func findAnnotationEnd(source []byte, start int) int {
	if end := strings.Index(string(source[start:]), "-->"); end >= 0 {
		return start + end
	}
	return -1
}

func blankAnnotation(source []byte, start, end int) {
	for i := start; i < end && i < len(source); i++ {
		if source[i] != '\n' {
			source[i] = ' '
		}
	}
}

func parseSingleLineAnnotation(text string, r SourceRange) (annotation, bool) {
	if !strings.HasSuffix(strings.TrimSpace(text), "-->") {
		return annotation{}, false
	}
	body := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(text), "<!--"), "-->"))
	fields := strings.Fields(body)
	if len(fields) == 2 && fields[0] == "toudocu:section" && canonicalName(fields[1]) {
		return annotation{Kind: annotationSection, Name: fields[1], Range: r}, true
	}
	if len(fields) != 3 || fields[0] != "toudocu:table" || !canonicalName(fields[1]) || !strings.HasPrefix(fields[2], "columns=") {
		return annotation{}, false
	}
	columns := strings.Split(strings.TrimPrefix(fields[2], "columns="), ",")
	if len(columns) == 0 {
		return annotation{}, false
	}
	for _, column := range columns {
		if !canonicalField(column) {
			return annotation{}, false
		}
	}
	return annotation{Kind: annotationTable, Name: fields[1], Columns: columns, Range: r}, true
}

func canonicalName(value string) bool {
	if value == "" || value[0] < 'a' || value[0] > 'z' {
		return false
	}
	for _, r := range value[1:] {
		if r != '-' && (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

func (d *Document) parseMetadataAnnotation(source []byte, r SourceRange) (annotation, bool) {
	text := strings.TrimSpace(string(source))
	if !strings.HasPrefix(text, "<!-- toudocu") || !strings.HasSuffix(text, "-->") {
		return annotation{}, false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(text, "<!-- toudocu"), "-->")
	if strings.TrimSpace(body) == "" {
		return annotation{}, false
	}
	items := []MetadataItem{}
	startLine := r.Start.Line
	for index, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if !ok || !canonicalField(key) || value == "" {
			return annotation{}, false
		}
		lineNo := startLine + index
		items = append(items, MetadataItem{Key: key, RawKey: key, Value: value, Range: SourceRange{Start: Position{Line: lineNo, Column: 1}, End: Position{Line: lineNo, Column: len(line) + 1}}})
	}
	return annotation{Kind: annotationMetadata, Metadata: items, Range: r}, len(items) > 0
}

func canonicalField(value string) bool {
	if value == "" || value[0] < 'a' || value[0] > 'z' {
		return false
	}
	for _, r := range value[1:] {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}
