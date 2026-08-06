package docudocu

import (
	"reflect"
	"sort"
	"strings"
)

func buildScreenDiffMetadata(oldContent, newContent []byte, oldPath, newPath string) *ScreenDiffMetadata {
	beforeNode, beforeTransitions := screenSnapshot(oldContent, oldPath)
	afterNode, afterTransitions := screenSnapshot(newContent, newPath)
	return compareScreenSnapshots(beforeNode, afterNode, beforeTransitions, afterTransitions)
}

func compareScreenSnapshots(beforeNode, afterNode *ScreenNodeSnapshot, beforeTransitions, afterTransitions map[string]ScreenTransitionSnapshot) *ScreenDiffMetadata {
	result := &ScreenDiffMetadata{Before: beforeNode, After: afterNode, Transitions: []ScreenTransitionChange{}}
	ids := map[string]bool{}
	for id := range beforeTransitions {
		ids[id] = true
	}
	for id := range afterTransitions {
		ids[id] = true
	}
	ordered := make([]string, 0, len(ids))
	for id := range ids {
		ordered = append(ordered, id)
	}
	sort.Strings(ordered)
	for _, id := range ordered {
		before, beforeOK := beforeTransitions[id]
		after, afterOK := afterTransitions[id]
		status := "modified"
		if !beforeOK {
			status = "added"
		}
		if !afterOK {
			status = "removed"
		}
		if beforeOK && afterOK && reflect.DeepEqual(before, after) {
			continue
		}
		change := ScreenTransitionChange{ID: id, Status: status}
		if beforeOK {
			snapshot := before
			change.Before = &snapshot
		}
		if afterOK {
			snapshot := after
			change.After = &snapshot
		}
		result.Transitions = append(result.Transitions, change)
	}
	return result
}

func buildScreenDiffFromSnapshots(beforeNode, afterNode *ScreenNodeSnapshot, before, after *ScreenDiffMetadata) *ScreenDiffMetadata {
	beforeTransitions, afterTransitions := map[string]ScreenTransitionSnapshot{}, map[string]ScreenTransitionSnapshot{}
	if before != nil {
		for _, change := range before.Transitions {
			if change.Before != nil {
				beforeTransitions[change.ID] = *change.Before
			}
		}
	}
	if after != nil {
		for _, change := range after.Transitions {
			if change.After != nil {
				afterTransitions[change.ID] = *change.After
			}
		}
	}
	return compareScreenSnapshots(beforeNode, afterNode, beforeTransitions, afterTransitions)
}

func screenSnapshot(content []byte, path string) (*ScreenNodeSnapshot, map[string]ScreenTransitionSnapshot) {
	transitions := map[string]ScreenTransitionSnapshot{}
	if len(content) == 0 {
		return nil, transitions
	}
	parsed := analyzeMarkdown(string(content))
	id := parsed.Metadata["id"]
	if id == "" {
		id = stableEntityIDRE.FindString(parsed.Title)
	}
	node := &ScreenNodeSnapshot{ID: id, Title: screenSnapshotTitle(parsed.Title, id), Route: parsed.Metadata["route"], Module: parsed.Metadata["module"], Status: parsed.Metadata["status"], Kind: parsed.Metadata["type"]}
	document := &Document{SourcePath: path, Content: string(content), Title: parsed.Title, Headings: parsed.Headings, Sections: parsed.Sections, Metadata: parsed.Metadata, markdownTables: markdownTablesFromAnalysis(parsed)}
	table, found := parseScreenTable(document, "Переходы", "Transitions")
	if !found {
		return node, transitions
	}
	columns := map[string]int{}
	for index, header := range table.Headers {
		if key := canonicalScreenHeader(header); key != "" {
			columns[key] = index
		}
	}
	for _, row := range table.Rows {
		transitionID := strings.ToUpper(tableCell(row, columns, "id"))
		if transitionID == "" {
			continue
		}
		transitions[transitionID] = ScreenTransitionSnapshot{ID: transitionID, Source: id, Target: strings.ToUpper(tableCell(row, columns, "target")), Action: tableCell(row, columns, "action"), Condition: tableCell(row, columns, "condition"), State: strings.ToUpper(tableCell(row, columns, "state")), Error: strings.ToUpper(tableCell(row, columns, "error")), UseCase: strings.ToUpper(tableCell(row, columns, "useCase")), Line: row.Line}
	}
	return node, transitions
}

func screenSnapshotTitle(title, id string) string {
	for _, separator := range []string{":", "—"} {
		if strings.HasPrefix(title, id+separator) {
			return strings.TrimSpace(strings.TrimPrefix(title, id+separator))
		}
	}
	return title
}
