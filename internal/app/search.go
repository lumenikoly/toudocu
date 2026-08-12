package toudocu

import (
	"fmt"
	"io"
	"sort"
	"strings"
	"unicode"
)

func searchWords(value string) []string {
	value = strings.ReplaceAll(strings.ToLower(value), "ё", "е")
	return strings.FieldsFunc(value, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

func containsAllWords(value string, terms []string) bool {
	words := searchWords(value)
	set := map[string]bool{}
	for _, word := range words {
		set[word] = true
	}
	for _, term := range terms {
		if !set[term] {
			return false
		}
	}
	return true
}

func documentStableID(document *Document) string {
	if id := strings.TrimSpace(document.Metadata["id"]); id != "" {
		return id
	}
	if document.Type == "work" {
		if match := workItemHeadingRE.FindStringSubmatch(document.Title); match != nil {
			return match[1]
		}
	}
	return ""
}

func metadataSearchTerms(document *Document, includeKeys bool) []string {
	keys := make([]string, 0, len(document.Metadata))
	for key := range document.Metadata {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	terms := make([]string, 0, len(keys)*2+len(document.MetadataExtras)*2)
	for _, key := range keys {
		if includeKeys {
			terms = append(terms, key)
		}
		terms = append(terms, document.Metadata[key])
	}
	for _, extra := range document.MetadataExtras {
		if includeKeys {
			terms = append(terms, extra.Key)
		}
		terms = append(terms, extra.Value)
	}
	return terms
}

func SearchDocumentation(model *Model, query string, limit int) (SearchReport, error) {
	terms := uniqueStrings(searchWords(query))
	if len(terms) == 0 {
		return SearchReport{}, fmt.Errorf("search query cannot be empty")
	}
	if limit < 1 || limit > 100 {
		return SearchReport{}, fmt.Errorf("--limit must be a number from 1 to 100")
	}
	type ranked struct {
		match SearchMatch
		rank  int
	}
	found := []ranked{}
	for _, document := range model.Documents {
		id := documentStableID(document)
		metadata := metadataSearchTerms(document, true)
		all := strings.Join([]string{id, document.Title, strings.Join(metadata, " "), document.SourcePath, document.PlainText}, " ")
		if !containsAllWords(all, terms) {
			continue
		}
		sections := []string{}
		for _, section := range document.Sections {
			if containsAllWords(section.Title+" "+section.Text, terms) {
				sections = append(sections, section.Title)
			}
		}
		rank := 5
		normalizedQuery := strings.Join(terms, " ")
		if id != "" && strings.Join(searchWords(id), " ") == normalizedQuery {
			rank = 0
		} else {
			titleValue := document.Title
			if id != "" {
				titleValue = strings.TrimSpace(strings.TrimLeft(strings.TrimPrefix(titleValue, id), ":—- "))
			}
			title := strings.Join(searchWords(titleValue), " ")
			switch {
			case title == normalizedQuery || strings.HasPrefix(title, normalizedQuery+" "):
				rank = 1
			case containsAllWords(document.Title, terms):
				rank = 2
			default:
				for _, section := range document.Sections {
					if containsAllWords(section.Title, terms) {
						rank = 3
						break
					}
				}
				if rank == 5 && containsAllWords(strings.Join(metadata, " ")+" "+document.SourcePath, terms) {
					rank = 4
				}
			}
		}
		archived, archiveYear, _ := taskArchivePathInfo(document.SourcePath)
		match := SearchMatch{
			Type: document.Type, Title: document.Title, Path: document.SourcePath,
			Archived: archived, ArchiveYear: archiveYear, MatchedSections: sections,
		}
		if containsType([]string{"module", "use-case", "flow", "screen", "decision", "work"}, document.Type) {
			match.ID = id
		}
		found = append(found, ranked{match: match, rank: rank})
	}
	sort.SliceStable(found, func(i, j int) bool {
		if found[i].rank != found[j].rank {
			return found[i].rank < found[j].rank
		}
		return naturalCompare(found[i].match.Path, found[j].match.Path) < 0
	})
	total := len(found)
	if len(found) > limit {
		found = found[:limit]
	}
	results := make([]SearchMatch, len(found))
	for index := range found {
		results[index] = found[index].match
	}
	return SearchReport{
		SchemaVersion: 1, Kind: "search", Generator: GeneratorInfo{Name: "Toudocu", Version: Version},
		Query: query, Total: total, Limit: limit, Results: results,
	}, nil
}

func printSearchText(w io.Writer, report SearchReport) {
	for _, result := range report.Results {
		label := result.Title
		if result.ID != "" {
			label = result.ID + " — " + label
		}
		fmt.Fprintf(w, "%s [%s] %s\n", label, result.Type, result.Path)
		if len(result.MatchedSections) > 0 {
			fmt.Fprintf(w, "  Разделы: %s\n", strings.Join(result.MatchedSections, ", "))
		}
	}
	fmt.Fprintf(w, "Найдено: %d\n", report.Total)
}
