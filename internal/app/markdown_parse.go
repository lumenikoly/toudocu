package toudocu

import (
	"strings"

	markdowncore "toudocu/internal/markdown"
)

var fieldAliases = map[string]string{
	"status": "status", "статус": "status", "состояние": "status", "stage": "stage", "этап": "stage",
	"version": "version", "версия": "version",
	"author": "author", "автор": "author", "actor": "actor", "актор": "actor", "priority": "priority", "приоритет": "priority",
	"severity": "severity", "серьёзность": "severity", "серьезность": "severity", "reproducibility": "reproducibility", "воспроизводимость": "reproducibility",
	"regression": "regression", "регрессия": "regression", "type": "type", "тип": "type", "document type": "documentType", "тип документа": "documentType",
	"architecture question": "architectureQuestion", "architectural question": "architectureQuestion", "архитектурный вопрос": "architectureQuestion", "source": "source", "источник": "source",
	"criticality": "criticality", "критичность": "criticality", "module": "module", "модуль": "module", "use case": "useCase", "scenario": "useCase",
	"сценарий": "useCase", "связанный сценарий": "useCase", "flow": "flow", "process": "flow", "процесс": "flow",
	"screens": "screens", "screens affected": "screens", "экраны": "screens", "затронутые экраны": "screens", "transitions": "transitions",
	"transitions affected": "transitions", "переходы": "transitions", "затронутые переходы": "transitions", "standards": "standards", "стандарты": "standards",
	"affected runbooks": "runbooks", "runbooks affected": "runbooks", "затронутые runbooks": "runbooks", "route": "route", "маршрут": "route",
	"preview": "preview", "превью": "preview", "parent screen": "parentScreen", "родительский экран": "parentScreen", "parent": "parentTask", "родительская задача": "parentTask", "родитель": "parentTask",
	"start screen": "startScreen", "initial screen": "startScreen", "начальный экран": "startScreen", "terminal screens": "terminalScreens", "end screens": "terminalScreens",
	"конечные экраны": "terminalScreens", "allow cycle": "allowCycle", "разрешить цикл": "allowCycle", "component": "component", "компонент": "component",
	"errors": "errors", "ошибки": "errors", "depends on": "dependsOn", "dependencies": "dependsOn", "зависит от": "dependsOn", "date": "date", "дата": "date",
	"planned date": "plannedDate", "target date": "plannedDate", "due date": "plannedDate", "плановая дата": "plannedDate", "целевая дата": "plannedDate",
	"updated": "updated", "last updated": "updated", "последнее обновление": "updated", "обновлено": "updated", "probability": "probability", "вероятность": "probability",
	"impact": "impact", "влияние": "impact", "id": "id", "identifier": "id", "идентификатор": "id", "tags": "tags", "теги": "tags",
	"scope": "scope", "область": "scope", "environment": "environment", "среда": "environment", "risk": "risk", "риск": "risk",
	"last verified": "lastVerified", "last review": "lastVerified", "последняя проверка": "lastVerified", "superseded by": "supersededBy",
	"replaced by": "supersededBy", "заменён": "supersededBy", "заменен": "supersededBy",
}

var displayFieldNames = map[string]string{
	"status": "Статус", "stage": "Этап", "version": "Версия", "author": "Автор", "actor": "Актор",
	"priority": "Приоритет", "criticality": "Критичность", "severity": "Серьёзность", "reproducibility": "Воспроизводимость", "regression": "Регрессия",
	"module": "Модуль", "useCase": "Сценарий", "dependsOn": "Зависит от", "date": "Дата", "flow": "Процесс", "screens": "Экраны",
	"transitions": "Переходы", "standards": "Стандарты", "runbooks": "Затронутые runbooks", "route": "Маршрут", "preview": "Превью",
	"parentScreen": "Родительский экран", "parentTask": "Родительская задача", "startScreen": "Начальный экран", "terminalScreens": "Конечные экраны", "allowCycle": "Разрешить цикл",
	"component": "Компонент", "errors": "Ошибки", "plannedDate": "Плановая дата", "updated": "Последнее обновление", "probability": "Вероятность",
	"impact": "Влияние", "id": "Идентификатор", "tags": "Теги", "type": "Тип", "documentType": "Тип документа",
	"architectureQuestion": "Архитектурный вопрос", "source": "Источник", "scope": "Область", "environment": "Среда", "risk": "Риск",
	"lastVerified": "Последняя проверка", "supersededBy": "Заменён",
}

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
}

func normalizeFieldName(name string) string { return fieldAliases[canonicalText(name)] }

func analyzeMarkdown(content string) markdownAnalysis { return analyzeMarkdownPath(content, "") }

func analyzeMarkdownPath(content, sourcePath string) markdownAnalysis {
	document := markdowncore.Parse([]byte(content), sourcePath)
	a := document.Analysis()
	result := markdownAnalysis{Document: document, Content: string(document.Source()), Title: a.Title, Description: a.Description,
		Metadata: Metadata{}, MetadataLocations: map[string]int{}, MetadataCounts: map[string]int{}, Tables: a.Tables, OrderedLists: a.OrderedLists, ListItems: a.ListItems, CodeBlocks: a.CodeBlocks, MermaidBlocks: a.MermaidBlocks, Diagnostics: a.Diagnostics, PlainText: a.PlainText}
	for _, h := range a.Headings {
		result.Headings = append(result.Headings, Heading{Level: h.Level, Title: h.Title, ID: h.ID, Line: h.Range.Start.Line - 1, startOffset: h.Range.Start.Offset, endOffset: h.Range.End.Offset})
	}
	for _, m := range a.Metadata {
		key := normalizeFieldName(m.RawKey)
		value := strings.TrimSpace(m.Value)
		if key == "" {
			result.MetadataExtras = append(result.MetadataExtras, MetadataExtra{Key: m.RawKey, Value: value})
			continue
		}
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
	extras := []MetadataExtra{}
	for _, m := range s.Metadata {
		key := normalizeFieldName(m.RawKey)
		if key == "" {
			extras = append(extras, MetadataExtra{Key: m.RawKey, Value: m.Value})
		} else if _, ok := metadata[key]; !ok {
			metadata[key] = m.Value
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
	return Section{Title: s.Heading.Title, ID: s.Heading.ID, StartLine: s.Heading.Range.Start.Line - 1, EndLine: s.Range.End.Line - 1, Metadata: metadata, MetadataExtras: extras, Tasks: tasks, Text: s.Text, Markdown: s.Markdown, children: children}
}

func sectionByNames(document *Document, names []string) *Section {
	targets := map[string]struct{}{}
	for _, name := range names {
		targets[canonicalText(name)] = struct{}{}
	}
	for i := range document.Sections {
		if _, ok := targets[canonicalText(document.Sections[i].Title)]; ok {
			return &document.Sections[i]
		}
	}
	return nil
}
