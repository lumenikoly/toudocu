package docgent

import (
	"fmt"
	"strings"
)

const mermaidMaxBytes = 50_000

type mermaidBlock struct {
	OpeningLine int
	ClosingLine int
	Source      string
	DiagramType string
	Closed      bool
	Problems    []mermaidProblem
}

type mermaidProblem struct {
	Code    string
	Message string
}

func isMermaidFenceInfo(value string) bool {
	return strings.EqualFold(strings.TrimSpace(value), "mermaid")
}

func mermaidDiagramType(source string) string {
	first := ""
	for _, line := range strings.Split(source, "\n") {
		if strings.TrimSpace(line) != "" {
			first = strings.TrimSpace(line)
			break
		}
	}
	if first == "" {
		return ""
	}
	fields := strings.Fields(first)
	switch fields[0] {
	case "flowchart":
		if len(fields) == 1 {
			return "flowchart"
		}
		if len(fields) == 2 && containsString([]string{"TD", "TB", "BT", "LR", "RL"}, fields[1]) {
			return "flowchart"
		}
	case "stateDiagram-v2":
		if len(fields) == 1 {
			return "stateDiagram-v2"
		}
	case "sequenceDiagram":
		if len(fields) == 1 {
			return "sequenceDiagram"
		}
	}
	return ""
}

func containsMermaidConfiguration(source string) bool {
	lines := strings.Split(source, "\n")
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "%%{") {
			return true
		}
	}
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		return strings.TrimSpace(line) == "---"
	}
	return false
}

func analyzeMermaidBlock(openingLine, closingLine int, source string, closed bool) mermaidBlock {
	block := mermaidBlock{
		OpeningLine: openingLine,
		ClosingLine: closingLine,
		Source:      source,
		Closed:      closed,
	}
	if !closed {
		block.Problems = append(block.Problems, mermaidProblem{
			Code:    "unterminated-mermaid-diagram",
			Message: "Блок Mermaid не закрыт.",
		})
	}
	if strings.TrimSpace(source) == "" {
		block.Problems = append(block.Problems, mermaidProblem{
			Code:    "empty-mermaid-diagram",
			Message: "Блок Mermaid не должен быть пустым.",
		})
		return block
	}
	if len([]byte(source)) > mermaidMaxBytes {
		block.Problems = append(block.Problems, mermaidProblem{
			Code:    "mermaid-diagram-too-large",
			Message: fmt.Sprintf("Размер блока Mermaid превышает %d байт.", mermaidMaxBytes),
		})
	}
	if containsMermaidConfiguration(source) {
		block.Problems = append(block.Problems, mermaidProblem{
			Code:    "forbidden-mermaid-configuration",
			Message: "Mermaid front matter и directives %%{...}%% запрещены.",
		})
		return block
	}
	block.DiagramType = mermaidDiagramType(source)
	if block.DiagramType == "" {
		block.Problems = append(block.Problems, mermaidProblem{
			Code:    "unsupported-mermaid-diagram-type",
			Message: "Первая строка Mermaid должна объявлять flowchart, stateDiagram-v2 или sequenceDiagram.",
		})
	}
	return block
}

func scanMermaidBlocks(lines []string) []mermaidBlock {
	blocks := []mermaidBlock{}
	for index := 0; index < len(lines); index++ {
		marker, fenceLength, info, ok := fenceAt(lines[index])
		if !ok {
			continue
		}
		body := []string{}
		closingLine := len(lines) - 1
		closed := false
		cursor := index + 1
		for ; cursor < len(lines); cursor++ {
			closingMarker, closingLength, closingTail, closing := fenceAt(lines[cursor])
			if closing && closingMarker == marker && closingLength >= fenceLength && closingTail == "" {
				closingLine = cursor
				closed = true
				break
			}
			body = append(body, lines[cursor])
		}
		if isMermaidFenceInfo(info) {
			blocks = append(blocks, analyzeMermaidBlock(index, closingLine, strings.Join(body, "\n"), closed))
		}
		if closed {
			index = cursor
		} else {
			index = len(lines)
		}
	}
	return blocks
}

func documentLinksToType(document *Document, types ...string) bool {
	for _, targetType := range types {
		if document.Type == targetType {
			return true
		}
	}
	for _, link := range document.ResolvedLinks {
		if link.Blocked || link.Broken || link.Image || link.TargetDocument == nil {
			continue
		}
		for _, targetType := range types {
			if link.TargetDocument.Type == targetType {
				return true
			}
		}
	}
	return false
}

func documentsByStableID(model *Model) map[string]*Document {
	result := map[string]*Document{}
	for _, document := range model.Documents {
		if id := strings.TrimSpace(document.Metadata["id"]); id != "" {
			result[id] = document
		}
	}
	return result
}

func validFlowUseCaseReference(document *Document, byID map[string]*Document) bool {
	valid := false
	for _, id := range splitReferences(document.Metadata["useCase"]) {
		target := byID[id]
		if target == nil || target.Type != "use-case" {
			continue
		}
		valid = true
	}
	return valid
}

func validateFlowReferences(model *Model, document *Document, byID map[string]*Document) {
	for _, id := range splitReferences(document.Metadata["useCase"]) {
		target := byID[id]
		if target == nil || target.Type != "use-case" {
			addDocumentIssue(model, document, newIssue(
				"error", "dangling-use-case-reference",
				"Процесс ссылается на неизвестный пользовательский сценарий "+fallbackDash(id)+".",
				document.SourcePath, 0,
			))
		}
	}
	if moduleID := strings.TrimSpace(document.Metadata["module"]); moduleID != "" {
		target := byID[moduleID]
		if target == nil || target.Type != "module" {
			addDocumentIssue(model, document, newIssue(
				"error", "dangling-module-reference",
				"Процесс ссылается на неизвестный модуль "+fallbackDash(moduleID)+".",
				document.SourcePath, 0,
			))
		}
	}
}

func validateMermaidDocuments(model *Model) {
	byID := documentsByStableID(model)
	for _, document := range model.Documents {
		blocks := scanMermaidBlocks(document.Lines)
		if document.Type == "flow" {
			validateFlowReferences(model, document, byID)
			if len(blocks) == 0 {
				addDocumentIssue(model, document, newIssue(
					"error", "missing-flow-diagram",
					"Документ процесса должен содержать блок Mermaid.",
					document.SourcePath, 0,
				))
			}
		}
		if len(blocks) == 0 {
			continue
		}
		for _, block := range blocks {
			for _, problem := range block.Problems {
				addDocumentIssue(model, document, newIssue(
					"error", problem.Code, problem.Message,
					document.SourcePath, block.OpeningLine+1,
				))
			}
		}
		requirementsLinked := documentLinksToType(document, "use-case", "architecture")
		if document.Type == "flow" && validFlowUseCaseReference(document, byID) {
			requirementsLinked = true
		}
		if !requirementsLinked {
			addDocumentIssue(model, document, newIssue(
				"error", "unlinked-mermaid-diagram",
				"Документ с Mermaid должен быть связан с пользовательским сценарием или архитектурой.",
				document.SourcePath, blocks[0].OpeningLine+1,
			))
		}
	}
}
