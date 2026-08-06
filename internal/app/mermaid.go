package docudocu

import (
	"fmt"
	"strings"

	markdowncore "docu-docu/internal/markdown"
)

const mermaidMaxBytes = markdowncore.MermaidMaxBytes

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
	return markdowncore.CheckMermaid(source).DiagramType
}

func containsMermaidConfiguration(source string) bool {
	return markdowncore.CheckMermaid(source).ConfigurationForbidden
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
	policy := markdowncore.CheckMermaid(source)
	if policy.TooLarge {
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
	block.DiagramType = policy.DiagramType
	if block.DiagramType == "" {
		block.Problems = append(block.Problems, mermaidProblem{
			Code:    "unsupported-mermaid-diagram-type",
			Message: "Первая строка Mermaid должна объявлять flowchart, stateDiagram-v2 или sequenceDiagram.",
		})
	}
	return block
}

func scanMermaidBlocks(lines []string) []mermaidBlock {
	parsed := analyzeMarkdown(strings.Join(lines, "\n"))
	return mermaidBlocksFromAnalysis(parsed)
}

func mermaidBlocksFromAnalysis(parsed markdownAnalysis) []mermaidBlock {
	blocks := []mermaidBlock{}
	for _, block := range parsed.CodeBlocks {
		if !isMermaidFenceInfo(block.Info) {
			continue
		}
		blocks = append(blocks, analyzeMermaidBlock(block.Range.Start.Line-1, block.Range.End.Line-1, block.Source, block.Closed))
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
		blocks := document.mermaidBlocks
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
