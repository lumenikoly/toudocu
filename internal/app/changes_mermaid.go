package docudocu

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var mermaidExplicitIDRE = regexp.MustCompile(`(?mi)^\s*%%\s*(?:id|diagram-id)\s*:\s*([A-Za-z0-9._-]+)\s*$`)

type changeMermaidBlock struct {
	id, caption, source string
	line                int
}

func mermaidBlockDiff(oldContent, newContent []byte, oldPath, newPath string, diagnostics []Issue) ([]MermaidBlockChange, []Issue) {
	oldBlocks, oldAmbiguous := extractMermaidBlocks(string(oldContent))
	newBlocks, newAmbiguous := extractMermaidBlocks(string(newContent))
	if oldAmbiguous || newAmbiguous {
		diagnostics = append(diagnostics, Issue{Severity: "warning", Code: "mermaid-block-match-ambiguous", Message: "Mermaid-блоки невозможно сопоставить однозначно; используйте %% id: <stable-id>.", DocumentPath: newPath})
	}
	ids := map[string]bool{}
	for id := range oldBlocks {
		ids[id] = true
	}
	for id := range newBlocks {
		ids[id] = true
	}
	ordered := make([]string, 0, len(ids))
	for id := range ids {
		ordered = append(ordered, id)
	}
	sort.Strings(ordered)
	changes := []MermaidBlockChange{}
	for _, id := range ordered {
		old, oldOK := oldBlocks[id]
		newer, newOK := newBlocks[id]
		if oldOK && newOK && normalizeSemanticText(old.source) == normalizeSemanticText(newer.source) {
			continue
		}
		status := "modified"
		if !oldOK {
			status = "added"
		}
		if !newOK {
			status = "removed"
		}
		caption := newer.caption
		if caption == "" {
			caption = old.caption
		}
		change := MermaidBlockChange{ID: id, Status: status, Caption: caption}
		if oldOK {
			change.Before, change.SourceBefore = old.source, &ChangeLocation{Path: oldPath, Line: old.line}
			if !validMermaidSource(old.source) {
				diagnostics = append(diagnostics, Issue{Severity: "warning", Code: "mermaid-old-version-invalid", Message: "Старая версия Mermaid-блока не распознана; исходный текст остаётся доступен.", DocumentPath: oldPath, Line: old.line})
			}
		}
		if newOK {
			change.After, change.SourceAfter = newer.source, &ChangeLocation{Path: newPath, Line: newer.line}
			if !validMermaidSource(newer.source) {
				diagnostics = append(diagnostics, Issue{Severity: "warning", Code: "mermaid-new-version-invalid", Message: "Новая версия Mermaid-блока не распознана; исходный текст остаётся доступен.", DocumentPath: newPath, Line: newer.line})
			}
		}
		changes = append(changes, change)
	}
	return changes, diagnostics
}

// validMermaidSource intentionally performs only a conservative structural check.
// Rendering remains authoritative: one invalid side must never hide the other side
// or its source diff.
func validMermaidSource(source string) bool {
	known := map[string]bool{"flowchart": true, "graph": true, "sequencediagram": true, "classdiagram": true, "statediagram": true, "statediagram-v2": true, "erdiagram": true, "journey": true, "gantt": true, "pie": true, "mindmap": true, "timeline": true, "gitgraph": true, "quadrantchart": true, "xychart-beta": true, "block-beta": true, "sankey-beta": true}
	for _, line := range strings.Split(source, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "%%") {
			continue
		}
		return known[strings.ToLower(strings.Fields(line)[0])]
	}
	return false
}

func extractMermaidBlocks(content string) (map[string]changeMermaidBlock, bool) {
	parsed := AnalyzeMarkdown(content)
	blocks := map[string]changeMermaidBlock{}
	ambiguous := false
	sectionCounts := map[string]int{}
	for line := 0; line < len(parsed.Lines); line++ {
		if !strings.EqualFold(strings.TrimSpace(parsed.Lines[line]), "```mermaid") {
			continue
		}
		start := line
		line++
		body := []string{}
		for line < len(parsed.Lines) && strings.TrimSpace(parsed.Lines[line]) != "```" {
			body = append(body, parsed.Lines[line])
			line++
		}
		sectionID, caption := mermaidContext(parsed, start)
		sectionCounts[sectionID]++
		id := sectionID + "-mermaid-" + strconv.Itoa(sectionCounts[sectionID])
		if match := mermaidExplicitIDRE.FindStringSubmatch(strings.Join(body, "\n")); match != nil {
			id = "id-" + match[1]
		}
		if _, exists := blocks[id]; exists {
			ambiguous = true
			continue
		}
		blocks[id] = changeMermaidBlock{id: id, caption: caption, source: strings.Join(body, "\n"), line: start + 1}
	}
	return blocks, ambiguous
}

func mermaidContext(parsed ParsedMarkdown, line int) (string, string) {
	sectionID, caption := "document", ""
	for _, heading := range parsed.Headings {
		if heading.Line > line {
			break
		}
		if heading.Level <= 2 {
			sectionID, caption = heading.ID, heading.Title
		}
	}
	return sectionID, caption
}
