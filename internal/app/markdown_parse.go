package docgent

import (
	"regexp"
	"strings"
)

var fieldAliases = map[string]string{
	"status": "status", "статус": "status", "состояние": "status",
	"stage": "stage", "этап": "stage",
	"version": "version", "версия": "version",
	"owner": "owner", "владелец": "owner", "команда": "owner", "team": "owner",
	"author": "author", "автор": "author",
	"actor": "actor", "актор": "actor",
	"priority": "priority", "приоритет": "priority",
	"severity": "severity", "серьёзность": "severity", "серьезность": "severity",
	"reproducibility": "reproducibility", "воспроизводимость": "reproducibility",
	"regression": "regression", "регрессия": "regression",
	"type": "type", "тип": "type",
	"document type": "documentType", "тип документа": "documentType",
	"architecture question": "architectureQuestion", "архитектурный вопрос": "architectureQuestion",
	"source": "source", "источник": "source",
	"criticality": "criticality", "критичность": "criticality",
	"module": "module", "модуль": "module",
	"use case": "useCase", "scenario": "useCase", "сценарий": "useCase", "связанный сценарий": "useCase",
	"flow": "flow", "process": "flow", "процесс": "flow",
	"screens": "screens", "screens affected": "screens", "экраны": "screens", "затронутые экраны": "screens",
	"transitions": "transitions", "transitions affected": "transitions", "переходы": "transitions", "затронутые переходы": "transitions",
	"standards": "standards", "стандарты": "standards",
	"affected runbooks": "runbooks", "runbooks affected": "runbooks", "затронутые runbooks": "runbooks",
	"route": "route", "маршрут": "route",
	"preview": "preview", "превью": "preview",
	"parent screen": "parentScreen", "parent": "parentScreen", "родительский экран": "parentScreen", "родитель": "parentScreen",
	"start screen": "startScreen", "initial screen": "startScreen", "начальный экран": "startScreen",
	"terminal screens": "terminalScreens", "end screens": "terminalScreens", "конечные экраны": "terminalScreens",
	"allow cycle": "allowCycle", "разрешить цикл": "allowCycle",
	"component": "component", "компонент": "component",
	"errors": "errors", "ошибки": "errors",
	"depends on": "dependsOn", "dependencies": "dependsOn", "зависит от": "dependsOn",
	"date": "date", "дата": "date",
	"planned date": "plannedDate", "target date": "plannedDate", "due date": "plannedDate", "плановая дата": "plannedDate", "целевая дата": "plannedDate",
	"updated": "updated", "last updated": "updated", "последнее обновление": "updated", "обновлено": "updated",
	"probability": "probability", "вероятность": "probability",
	"impact": "impact", "влияние": "impact",
	"id": "id", "identifier": "id", "идентификатор": "id",
	"tags": "tags", "теги": "tags",
	"scope": "scope", "область": "scope",
	"environment": "environment", "среда": "environment",
	"risk": "risk", "риск": "risk",
	"last verified": "lastVerified", "last review": "lastVerified", "последняя проверка": "lastVerified",
	"superseded by": "supersededBy", "replaced by": "supersededBy", "заменён": "supersededBy", "заменен": "supersededBy",
}

var displayFieldNames = map[string]string{
	"status": "Статус", "stage": "Этап", "version": "Версия", "owner": "Владелец",
	"author": "Автор", "actor": "Актор", "priority": "Приоритет", "criticality": "Критичность",
	"severity": "Серьёзность", "reproducibility": "Воспроизводимость", "regression": "Регрессия",
	"module": "Модуль", "useCase": "Сценарий", "dependsOn": "Зависит от", "date": "Дата",
	"flow":            "Процесс",
	"screens":         "Экраны",
	"transitions":     "Переходы",
	"standards":       "Стандарты",
	"runbooks":        "Затронутые runbooks",
	"route":           "Маршрут",
	"preview":         "Превью",
	"parentScreen":    "Родительский экран",
	"startScreen":     "Начальный экран",
	"terminalScreens": "Конечные экраны",
	"allowCycle":      "Разрешить цикл",
	"component":       "Компонент",
	"errors":          "Ошибки",
	"plannedDate":     "Плановая дата", "updated": "Последнее обновление", "probability": "Вероятность",
	"impact": "Влияние", "id": "Идентификатор", "tags": "Теги", "type": "Тип",
	"documentType": "Тип документа", "architectureQuestion": "Архитектурный вопрос", "source": "Источник",
	"scope": "Область", "environment": "Среда", "risk": "Риск", "lastVerified": "Последняя проверка",
	"supersededBy": "Заменён",
}

var (
	metadataLineRE = regexp.MustCompile(`^\s*[-*+]\s+([^:：]{1,80})\s*[:：]\s*(.+?)\s*$`)
	headingRE      = regexp.MustCompile(`^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$`)
	taskRE         = regexp.MustCompile(`^(\s*)[-*+]\s+\[([ xX])\]\s+(.+?)\s*$`)
	listLineRE     = regexp.MustCompile(`^(\s*)([-+*]|[0-9]+[.)])\s+(?:\[([ xX])\]\s+)?(.+)$`)
)

type ParsedMarkdown struct {
	Content             string
	Lines               []string
	Title               string
	Description         string
	Headings            []Heading
	HeadingByLine       map[int]Heading
	Metadata            Metadata
	MetadataExtras      []MetadataExtra
	MetadataLineIndexes map[int]struct{}
	Tasks               []Task
	Links               []Link
	Sections            []Section
	PlainText           string
}

type parsedMetadataLine struct {
	Key    string
	RawKey string
	Value  string
}

type metadataExtraction struct {
	Values      Metadata
	Extras      []MetadataExtra
	LineIndexes map[int]struct{}
}

func normalizeFieldName(name string) string { return fieldAliases[canonicalText(name)] }

func parseMetadataLine(line string) (parsedMetadataLine, bool) {
	match := metadataLineRE.FindStringSubmatch(line)
	if match == nil {
		return parsedMetadataLine{}, false
	}
	rawKey := stripInlineMarkdown(match[1])
	value := stripInlineMarkdown(match[2])
	if rawKey == "" || value == "" {
		return parsedMetadataLine{}, false
	}
	return parsedMetadataLine{Key: normalizeFieldName(rawKey), RawKey: rawKey, Value: value}, true
}

func extractMetadata(lines []string, start, end int, onlyKnown bool) metadataExtraction {
	if start < 0 {
		start = 0
	}
	if end > len(lines) {
		end = len(lines)
	}
	result := metadataExtraction{Values: Metadata{}, LineIndexes: map[int]struct{}{}}
	for i := start; i < end; i++ {
		line := lines[i]
		if match := headingRE.FindStringSubmatch(line); match != nil && len(match[1]) >= 2 {
			break
		}
		if strings.TrimSpace(line) == "" {
			continue
		}
		parsed, ok := parseMetadataLine(line)
		if !ok || (onlyKnown && parsed.Key == "") {
			break
		}
		result.LineIndexes[i] = struct{}{}
		if parsed.Key != "" {
			if _, exists := result.Values[parsed.Key]; !exists {
				result.Values[parsed.Key] = parsed.Value
			}
		} else {
			result.Extras = append(result.Extras, MetadataExtra{Key: parsed.RawKey, Value: parsed.Value})
		}
	}
	return result
}

func fenceAt(line string) (marker byte, length int, tail string, ok bool) {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 || len(trimmed) < 3 {
		return 0, 0, "", false
	}
	if trimmed[0] != '`' && trimmed[0] != '~' {
		return 0, 0, "", false
	}
	marker = trimmed[0]
	for length < len(trimmed) && trimmed[length] == marker {
		length++
	}
	if length < 3 {
		return 0, 0, "", false
	}
	return marker, length, strings.TrimSpace(trimmed[length:]), true
}

func extractHeadings(lines []string) ([]Heading, map[int]Heading) {
	headings := []Heading{}
	byLine := map[int]Heading{}
	used := map[string]struct{}{}
	inFence := false
	var fenceMarker byte
	for i, line := range lines {
		if marker, _, _, ok := fenceAt(line); ok {
			if !inFence {
				inFence = true
				fenceMarker = marker
			} else if marker == fenceMarker {
				inFence = false
				fenceMarker = 0
			}
			continue
		}
		if inFence {
			continue
		}
		match := headingRE.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		title := stripInlineMarkdown(match[2])
		heading := Heading{Level: len(match[1]), Title: title, ID: uniqueSlug(title, used), Line: i}
		headings = append(headings, heading)
		byLine[i] = heading
	}
	return headings, byLine
}

func extractTasks(lines []string, headings []Heading, lineOffset int) []Task {
	result := []Task{}
	inFence := false
	var fenceMarker byte
	headingIndex := 0
	var current *Heading
	for i, line := range lines {
		absoluteLine := i + lineOffset
		for headingIndex < len(headings) && headings[headingIndex].Line <= absoluteLine {
			copy := headings[headingIndex]
			current = &copy
			headingIndex++
		}
		if marker, _, _, ok := fenceAt(line); ok {
			if !inFence {
				inFence = true
				fenceMarker = marker
			} else if marker == fenceMarker {
				inFence = false
				fenceMarker = 0
			}
			continue
		}
		if inFence {
			continue
		}
		match := taskRE.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		task := Task{
			Line:      absoluteLine + 1,
			Indent:    len(strings.ReplaceAll(match[1], "\t", "    ")),
			Completed: strings.EqualFold(match[2], "x"),
			Text:      stripInlineMarkdown(match[3]),
		}
		if current != nil {
			task.HeadingID = current.ID
			task.HeadingTitle = current.Title
		}
		result = append(result, task)
	}
	return result
}

func splitDestination(raw string) (destination, title string) {
	text := strings.TrimSpace(raw)
	if len(text) >= 2 {
		quote := text[len(text)-1]
		if quote == '"' || quote == '\'' {
			for i := len(text) - 2; i > 0; i-- {
				if text[i] == quote && (text[i-1] == ' ' || text[i-1] == '\t') {
					title = text[i+1 : len(text)-1]
					text = strings.TrimSpace(text[:i])
					break
				}
			}
		}
	}
	if strings.HasPrefix(text, "<") && strings.HasSuffix(text, ">") {
		text = text[1 : len(text)-1]
	}
	return text, title
}

func parseLinksInLine(line string, lineNumber int) []Link {
	result := []Link{}
	for cursor := 0; cursor < len(line); {
		openRel := strings.IndexByte(line[cursor:], '[')
		if openRel < 0 {
			break
		}
		open := cursor + openRel
		image := open > 0 && line[open-1] == '!'
		labelEndRel := strings.Index(line[open+1:], "](")
		if labelEndRel < 0 {
			cursor = open + 1
			continue
		}
		labelEnd := open + 1 + labelEndRel
		destinationStart := labelEnd + 2
		depth := 1
		destinationEnd := -1
		for i := destinationStart; i < len(line); i++ {
			switch line[i] {
			case '(':
				depth++
			case ')':
				depth--
				if depth == 0 {
					destinationEnd = i
				}
			}
			if destinationEnd >= 0 {
				break
			}
		}
		if destinationEnd < 0 {
			cursor = open + 1
			continue
		}
		destination, title := splitDestination(line[destinationStart:destinationEnd])
		result = append(result, Link{
			Line: lineNumber, Image: image, Label: stripInlineMarkdown(line[open+1 : labelEnd]),
			Destination: destination, Title: title,
		})
		cursor = destinationEnd + 1
	}
	return result
}

func extractLinks(lines []string) []Link {
	result := []Link{}
	inFence := false
	var fenceMarker byte
	for i, line := range lines {
		if marker, _, _, ok := fenceAt(line); ok {
			if !inFence {
				inFence = true
				fenceMarker = marker
			} else if marker == fenceMarker {
				inFence = false
				fenceMarker = 0
			}
			continue
		}
		if !inFence {
			result = append(result, parseLinksInLine(line, i)...)
		}
	}
	return result
}

func findDescription(lines []string, metadataIndexes map[int]struct{}, headings []Heading) string {
	start := 0
	for _, heading := range headings {
		if heading.Level == 1 {
			start = heading.Line + 1
			break
		}
	}
	paragraph := []string{}
	inFence := false
	for i := start; i < len(lines); i++ {
		if _, suppressed := metadataIndexes[i]; suppressed {
			continue
		}
		line := lines[i]
		if _, _, _, ok := fenceAt(line); ok {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		if match := headingRE.FindStringSubmatch(line); match != nil && len(match[1]) >= 2 {
			break
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if len(paragraph) > 0 {
				break
			}
			continue
		}
		if listLineRE.MatchString(line) || strings.HasPrefix(strings.TrimLeft(line, " "), ">") {
			if len(paragraph) > 0 {
				break
			}
			continue
		}
		paragraph = append(paragraph, trimmed)
	}
	return stripMarkdown(strings.Join(paragraph, " "))
}

func extractSections(lines []string, headings []Heading) []Section {
	levelTwo := []Heading{}
	for _, heading := range headings {
		if heading.Level == 2 {
			levelTwo = append(levelTwo, heading)
		}
	}
	result := make([]Section, 0, len(levelTwo))
	for position, heading := range levelTwo {
		end := len(lines)
		if position+1 < len(levelTwo) {
			end = levelTwo[position+1].Line
		}
		metadata := extractMetadata(lines, heading.Line+1, end, false)
		body := []string{}
		for i := heading.Line + 1; i < end; i++ {
			if _, suppressed := metadata.LineIndexes[i]; !suppressed {
				body = append(body, lines[i])
			}
		}
		result = append(result, Section{
			Title: heading.Title, ID: heading.ID, StartLine: heading.Line, EndLine: end,
			Metadata: metadata.Values, MetadataExtras: metadata.Extras,
			Tasks: extractTasks(lines[heading.Line+1:end], nil, heading.Line+1),
			Text:  stripMarkdown(strings.Join(body, "\n")), Markdown: strings.TrimSpace(strings.Join(body, "\n")),
		})
	}
	return result
}

// AnalyzeMarkdown parses the supported Markdown subset without executing embedded HTML.
func AnalyzeMarkdown(content string) ParsedMarkdown {
	normalized := strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	normalized = strings.TrimPrefix(normalized, "\ufeff")
	lines := strings.Split(normalized, "\n")
	headings, headingByLine := extractHeadings(lines)
	title := ""
	metadataStart := 0
	firstH2Line := -1
	for _, heading := range headings {
		if heading.Level == 1 && title == "" {
			title = heading.Title
			metadataStart = heading.Line + 1
		}
		if heading.Level == 2 && firstH2Line < 0 {
			firstH2Line = heading.Line
		}
	}
	if firstH2Line < 0 {
		firstH2Line = metadataStart + 60
		if firstH2Line > len(lines) {
			firstH2Line = len(lines)
		}
	}
	metadataEnd := firstH2Line
	if metadataEnd < metadataStart+1 {
		metadataEnd = metadataStart + 1
	}
	if metadataEnd > len(lines) {
		metadataEnd = len(lines)
	}
	metadata := extractMetadata(lines, metadataStart, metadataEnd, false)
	return ParsedMarkdown{
		Content: normalized, Lines: lines, Title: title,
		Description: findDescription(lines, metadata.LineIndexes, headings),
		Headings:    headings, HeadingByLine: headingByLine,
		Metadata: metadata.Values, MetadataExtras: metadata.Extras, MetadataLineIndexes: metadata.LineIndexes,
		Tasks: extractTasks(lines, headings, 0), Links: extractLinks(lines), Sections: extractSections(lines, headings),
		PlainText: stripMarkdown(normalized),
	}
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
