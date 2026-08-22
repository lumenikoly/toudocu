package toudocu

import (
	"strings"

	markdowncore "toudocu/internal/markdown"
)

type markdownAnalysis struct {
	Document           *markdowncore.Document
	Content            string
	Title, Description string
	Headings           []Heading
	Metadata           Metadata
	MetadataExtras     []MetadataExtra
	MetadataLocations  map[string]int
	MetadataCounts     map[string]int
	Tasks              []Task
	ListItems          []markdowncore.ListItem
	Links              []Link
	Sections           []Section
	Tables             []markdowncore.Table
	OrderedLists       []markdowncore.SourceRange
	CodeBlocks         []markdowncore.CodeBlock
	MermaidBlocks      []markdowncore.MermaidBlock
	Diagnostics        []markdowncore.Diagnostic
	PlainText          string
	MetadataBlocks     int
}

func analyzeMarkdown(content string) markdownAnalysis { return analyzeMarkdownPath(content, "") }

func analyzeMarkdownPath(content, sourcePath string) markdownAnalysis {
	document := markdowncore.Parse([]byte(content), sourcePath)
	a := document.Analysis()
	result := markdownAnalysis{Document: document, Content: string(document.Source()), Title: a.Title, Description: a.Description,
		Metadata: Metadata{}, MetadataLocations: map[string]int{}, MetadataCounts: map[string]int{}, Tables: a.Tables, OrderedLists: a.OrderedLists, ListItems: a.ListItems, CodeBlocks: a.CodeBlocks, MermaidBlocks: a.MermaidBlocks, Diagnostics: a.Diagnostics, PlainText: a.PlainText, MetadataBlocks: a.MetadataBlocks}
	for _, h := range a.Headings {
		result.Headings = append(result.Headings, Heading{Level: h.Level, Title: h.Title, ID: h.ID, Line: h.Range.Start.Line - 1, startOffset: h.Range.Start.Offset, endOffset: h.Range.End.Offset})
	}
	for _, m := range a.Metadata {
		key := m.Key
		value := strings.TrimSpace(m.Value)
		result.MetadataCounts[key]++
		if _, exists := result.MetadataLocations[key]; !exists {
			result.MetadataLocations[key] = m.Range.Start.Line
		}
		if _, exists := result.Metadata[key]; !exists {
			result.Metadata[key] = value
		}
	}
	for _, t := range a.Tasks {
		result.Tasks = append(result.Tasks, Task{Line: t.Range.Start.Line, Indent: t.Indent, Completed: t.Completed, Text: t.Text, HeadingID: t.HeadingID, HeadingTitle: t.HeadingTitle})
	}
	for _, l := range a.Links {
		result.Links = append(result.Links, Link{Line: l.Range.Start.Line - 1, Image: l.Image, Label: l.Label, Destination: l.Destination, Title: l.Title})
	}
	for _, s := range a.Sections {
		if s.Heading.Level == 2 {
			result.Sections = append(result.Sections, convertSection(s))
		}
	}
	return result
}

func convertSection(s markdowncore.Section) Section {
	metadata := Metadata{}
	for _, m := range s.Metadata {
		if _, ok := metadata[m.Key]; !ok {
			metadata[m.Key] = m.Value
		}
	}
	tasks := []Task{}
	for _, t := range s.Tasks {
		tasks = append(tasks, Task{Line: t.Range.Start.Line, Indent: t.Indent, Completed: t.Completed, Text: t.Text, HeadingID: t.HeadingID, HeadingTitle: t.HeadingTitle})
	}
	children := []Section{}
	for _, child := range s.Children {
		children = append(children, convertSection(child))
	}
	return Section{Kind: SectionKind(s.Kind), Title: s.Heading.Title, ID: s.Heading.ID, StartLine: s.Heading.Range.Start.Line - 1, EndLine: s.Range.End.Line - 1, Metadata: metadata, Tasks: tasks, Text: s.Text, Markdown: s.Markdown, children: children}
}

func sectionByKind(document *Document, kind SectionKind) *Section {
	for i := range document.Sections {
		if document.Sections[i].Kind == kind {
			return &document.Sections[i]
		}
	}
	return nil
}
