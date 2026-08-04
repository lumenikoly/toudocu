package docudocu

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func filterDocumentationChanges(report *ChangeSetReport, options Options) {
	taskPaths, taskEntities := map[string]bool{}, map[string]bool{}
	if options.ChangeTaskID != "" {
		content := reportTaskDocumentContent(report, options.ChangeTaskID)
		for _, path := range declaredTaskDocumentation(content) {
			taskPaths[path] = true
		}
		for _, path := range taskScopePaths(content) {
			taskPaths[path] = true
		}
		for _, id := range stableEntityIDRE.FindAllString(string(content), -1) {
			taskEntities[id] = true
		}
	}
	filtered := make([]DocumentationChange, 0, len(report.Changes))
	for _, change := range report.Changes {
		if options.ChangeFile != "" && filepath.ToSlash(options.ChangeFile) != change.Path && filepath.ToSlash(options.ChangeFile) != change.OldPath {
			continue
		}
		if options.ChangeStatus != "" && options.ChangeStatus != change.Status {
			continue
		}
		if options.ChangePermanentOnly && change.Classification != "permanent-documentation" {
			continue
		}
		if options.ChangeEntityType != "" {
			matched := false
			for _, entity := range append(append([]ChangeEntity{}, change.EntitiesBefore...), change.EntitiesAfter...) {
				if entity.Type == options.ChangeEntityType {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		if options.ChangeModule != "" && !changeContainsValue(change, options.ChangeModule) {
			continue
		}
		if options.ChangeTaskID != "" && !changeRelatedToTask(change, options.ChangeTaskID, taskPaths, taskEntities) {
			continue
		}
		filtered = append(filtered, change)
	}
	report.Changes = filtered
	report.Summary = ChangeSummary{Entities: map[string]int{}, Classifications: map[string]int{}}
	for _, change := range report.Changes {
		addChangeSummary(&report.Summary, change)
	}
	report.ChangeSetDigest = digestChangeSet(report)
}

func changeRelatedToTask(change DocumentationChange, taskID string, paths, entities map[string]bool) bool {
	if strings.Contains(filepath.Base(change.Path), taskID) || strings.Contains(filepath.Base(change.OldPath), taskID) || paths[change.Path] || paths[change.OldPath] {
		return true
	}
	for _, entity := range append(append([]ChangeEntity{}, change.EntitiesBefore...), change.EntitiesAfter...) {
		if entities[entity.ID] {
			return true
		}
	}
	for _, relation := range change.RelationChanges {
		if entities[relation.Source.ID] || entities[relation.Target.ID] {
			return true
		}
	}
	return false
}

func changeContainsValue(change DocumentationChange, value string) bool {
	value = strings.ToLower(value)
	if strings.Contains(strings.ToLower(change.Path), value) {
		return true
	}
	for _, entity := range append(append([]ChangeEntity{}, change.EntitiesBefore...), change.EntitiesAfter...) {
		if strings.Contains(strings.ToLower(entity.ID+" "+entity.Title), value) {
			return true
		}
	}
	for _, semantic := range change.SemanticChanges {
		if strings.Contains(strings.ToLower(semantic.Summary), value) {
			return true
		}
	}
	return false
}

func writeChangesReport(w io.Writer, report *ChangeSetReport, format string) error {
	switch format {
	case "json":
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		return encoder.Encode(report)
	case "markdown":
		printChangesMarkdown(w, report)
	default:
		printChangesText(w, report)
	}
	return nil
}

func printChangesText(w io.Writer, report *ChangeSetReport) {
	fmt.Fprintf(w, "Изменения документации\nBase: %s — %s\nTarget: %s", report.Comparison.Base.DisplayRef, shortObjectID(report.Comparison.Base.Resolved), report.Comparison.Target.DisplayRef)
	if report.Comparison.Target.Resolved != "" {
		fmt.Fprintf(w, " — %s", shortObjectID(report.Comparison.Target.Resolved))
	}
	fmt.Fprintf(w, "\nBranch: %s\nState: %s\n\n", emptyLabel(report.Repository.Branch, "detached HEAD"), map[bool]string{true: "dirty", false: "clean"}[report.Repository.Dirty])
	fmt.Fprintf(w, "Добавлено: %d  Изменено: %d  Удалено: %d  Переименовано: %d\nСтрок: +%d −%d\n", report.Summary.Files.Added+report.Summary.Files.Untracked, report.Summary.Files.Modified, report.Summary.Files.Deleted, report.Summary.Files.Renamed, report.Summary.Lines.Added, report.Summary.Lines.Deleted)
	for _, change := range report.Changes {
		fmt.Fprintf(w, "%s %s", statusSymbol(change.Status), change.Path)
		if change.OldPath != "" {
			fmt.Fprintf(w, " ← %s", change.OldPath)
		}
		fmt.Fprintf(w, "  +%d −%d\n", change.Lines.Added, change.Lines.Deleted)
		for _, semantic := range change.SemanticChanges {
			fmt.Fprintf(w, "    %s\n", semantic.Summary)
		}
	}
	for _, diagnostic := range report.Diagnostics {
		fmt.Fprintf(w, "[%s] %s — %s\n", strings.ToUpper(diagnostic.Severity), diagnostic.Code, diagnostic.Message)
	}
}

func printChangesMarkdown(w io.Writer, report *ChangeSetReport) {
	fmt.Fprintln(w, "# Documentation changes")
	fmt.Fprintln(w)
	fmt.Fprintf(w, "Base: `%s` (`%s`)  \nTarget: `%s`", report.Comparison.Base.DisplayRef, shortObjectID(report.Comparison.Base.Resolved), report.Comparison.Target.DisplayRef)
	if report.Comparison.Target.Resolved != "" {
		fmt.Fprintf(w, " (`%s`)", shortObjectID(report.Comparison.Target.Resolved))
	}
	fmt.Fprintln(w, "\n\n## Summary")
	fmt.Fprintln(w)
	fmt.Fprintf(w, "- Added: %d\n- Modified: %d\n- Deleted: %d\n- Renamed: %d\n- Lines: +%d −%d\n", report.Summary.Files.Added+report.Summary.Files.Untracked, report.Summary.Files.Modified, report.Summary.Files.Deleted, report.Summary.Files.Renamed, report.Summary.Lines.Added, report.Summary.Lines.Deleted)
	fmt.Fprintln(w, "\n## Semantic changes")
	changes := append([]DocumentationChange{}, report.Changes...)
	sort.Slice(changes, func(i, j int) bool { return changes[i].Path < changes[j].Path })
	for _, change := range changes {
		if len(change.SemanticChanges) == 0 {
			continue
		}
		fmt.Fprintf(w, "\n### `%s`\n\n", change.Path)
		for _, semantic := range change.SemanticChanges {
			fmt.Fprintf(w, "- %s\n", semantic.Summary)
		}
	}
	if report.TaskImpact != nil {
		fmt.Fprintln(w, "\n## Task impact")
		for _, diagnostic := range report.TaskImpact.Diagnostics {
			fmt.Fprintf(w, "\n- `%s`: %s\n", diagnostic.Code, diagnostic.Message)
		}
	}
}

func statusSymbol(status string) string {
	switch status {
	case "added", "untracked":
		return "+"
	case "deleted":
		return "−"
	case "renamed":
		return "→"
	case "copied":
		return "⧉"
	default:
		return "~"
	}
}
func emptyLabel(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func outputChangesReport(options Options, report *ChangeSetReport, stdout io.Writer) error {
	if options.ChangeOutput == "" {
		return writeChangesReport(stdout, report, options.Format)
	}
	directory := filepath.Dir(options.ChangeOutput)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".docu-docu-changes-*")
	if err != nil {
		return err
	}
	name := temporary.Name()
	ok := false
	defer func() {
		temporary.Close()
		if !ok {
			os.Remove(name)
		}
	}()
	if err := writeChangesReport(temporary, report, options.Format); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(name, options.ChangeOutput); err != nil {
		return err
	}
	ok = true
	fmt.Fprintf(stdout, "Отчёт сохранён: %s\n", options.ChangeOutput)
	return nil
}
