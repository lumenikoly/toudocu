package toudocu

import "strings"

type semanticSchema struct {
	allowed  []string
	required []string
}

var semanticSchemas = map[string]semanticSchema{
	"status":   {[]string{"version", "status", "stage", "updated"}, []string{"version", "status"}},
	"roadmap":  {[]string{"version", "updated"}, []string{"version"}},
	"risks":    {[]string{"version", "updated"}, []string{"version"}},
	"module":   {[]string{"version", "id", "status", "updated"}, []string{"version", "id", "status"}},
	"use-case": {[]string{"version", "id", "status", "priority", "module", "screens", "startScreen", "terminalScreens", "allowCycle", "updated"}, []string{"version", "id", "status", "module"}},
	"flow":     {[]string{"version", "id", "module", "useCase", "updated"}, []string{"version", "id"}},
	"decision": {[]string{"version", "id", "status", "date", "author", "updated"}, []string{"version", "id", "status"}},
	"contract": {[]string{"version", "id", "status", "updated"}, []string{"version", "id"}},
	"standard": {[]string{"version", "id", "status", "scope", "updated", "supersededBy"}, []string{"version", "id", "status", "scope", "updated"}},
	"runbook":  {[]string{"version", "id", "status", "environment", "risk", "lastVerified"}, []string{"version", "id", "status", "risk", "lastVerified"}},
	"work":     {[]string{"version", "id", "status", "taskType", "priority", "severity", "reproducibility", "regression", "observedIn", "module", "useCase", "flow", "screens", "transitions", "standards", "runbooks", "dependsOn", "parentTask", "updated"}, []string{"version", "id", "status", "taskType"}},
	"screen":   {[]string{"version", "id", "screenKind", "module", "status", "route", "preview", "parentScreen", "component", "updated"}, []string{"version", "id", "screenKind", "module", "status"}},
}

var semanticSectionKinds = map[SectionKind]bool{
	SectionKindSummary: true, SectionKindAcceptanceCriteria: true, SectionKindVerification: true,
	SectionKindRules: true, SectionKindAutomatedChecks: true, SectionKindPrerequisites: true,
	SectionKindProcedure: true, SectionKindRollback: true, SectionKindStopConditions: true,
	SectionKindMainScenario: true, SectionKindPostconditions: true, SectionKindBusinessRules: true,
	SectionKindImplementation: true, SectionKindCodeLocation: true, SectionKindBoundaries: true,
	SectionKindInvariants: true, SectionKindStableInterfaces: true, SectionKindRelatedUseCases: true,
	SectionKindContext: true, SectionKindDecision: true, SectionKindConsequences: true,
	SectionKindResult: true, SectionKindBehaviorChange: true, SectionKindBefore: true,
	SectionKindAfter: true, SectionKindScope: true, SectionKindOutOfScope: true,
	SectionKindPlan: true, SectionKindDocumentationImpact: true, SectionKindBlocker: true,
	SectionKindCancellationReason: true, SectionKindUseCaseOmissionReason: true,
	SectionKindSymptom: true, SectionKindExpectedBehavior: true, SectionKindActualBehavior: true,
	SectionKindStepsToReproduce: true, SectionKindEvidence: true, SectionKindCause: true,
	SectionKindRegressionTest: true, SectionKindRelationshipToUserBehavior: true,
	SectionKindRoadmapStage: true, SectionKindRisk: true,
}

var semanticTableSchemas = map[string]semanticSchema{
	"states":      {[]string{"id", "title", "preview"}, []string{"id", "title", "preview"}},
	"transitions": {[]string{"id", "useCase", "action", "condition", "target", "state", "error", "message", "contract", "kind"}, []string{"id", "useCase", "action", "condition", "target", "kind"}},
	"errors":      {[]string{"id", "message"}, []string{"id", "message"}},
}

func validateSemanticAnnotations(model *Model, document *Document) {
	if document.metadataBlocks > 1 {
		addDocumentIssue(model, document, newIssue("error", "duplicate-toudocu-metadata", "A document may contain only one Toudocu metadata block.", document.SourcePath, 0))
	}
	for key, count := range document.metadataCounts {
		if count > 1 {
			addDocumentIssue(model, document, newIssue("error", "duplicate-toudocu-metadata", "Semantic field "+key+" is declared more than once.", document.SourcePath, document.metadataLocations[key]))
		}
	}
	schema, typed := semanticSchemas[document.Type]
	if document.SourcePath == "architecture/overview.md" {
		schema, typed = semanticSchema{allowed: []string{"version", "updated"}, required: []string{"version"}}, true
	} else if document.Type == "architecture" {
		schema, typed = semanticSchema{allowed: []string{"version", "architectureQuestion", "updated"}, required: []string{"version", "architectureQuestion"}}, true
	}
	if typed {
		allowed := semanticSet(schema.allowed)
		for key := range document.Metadata {
			if !allowed[key] {
				addDocumentIssue(model, document, newIssue("error", "unknown-semantic-field", "Unknown semantic field "+key+" for "+document.Type+".", document.SourcePath, document.metadataLocations[key]))
			}
		}
		for _, key := range schema.required {
			if strings.TrimSpace(document.Metadata[key]) == "" {
				addDocumentIssue(model, document, newIssue("error", "missing-semantic-field", "Missing required semantic field "+key+".", document.SourcePath, 0))
			}
		}
	}
	if version := document.Metadata["version"]; version != "" && version != "1" {
		addDocumentIssue(model, document, newIssue("error", "unsupported-toudocu-version", "Unsupported Toudocu annotation version "+version+".", document.SourcePath, document.metadataLocations["version"]))
	}
	validateSemanticValues(model, document)
	validateSemanticSections(model, document)
	validateSemanticTables(model, document)
}

func semanticSet(values []string) map[string]bool {
	result := map[string]bool{}
	for _, value := range values {
		result[value] = true
	}
	return result
}

func validateSemanticValues(model *Model, document *Document) {
	invalid := func(key string) {
		addDocumentIssue(model, document, newIssue("error", "invalid-semantic-value", "Invalid canonical value for "+key+": "+document.Metadata[key]+".", document.SourcePath, document.metadataLocations[key]))
	}
	if value := document.Metadata["status"]; value != "" {
		valid := StatusFor(value).Recognized
		switch document.Type {
		case "standard":
			_, valid = standardStatus(value)
		case "runbook":
			_, valid = runbookStatus(value)
		case "work":
			_, valid = taskStatus(value)
		case "screen":
			valid = containsString([]string{"done", "in-progress", "planned", "blocked", "obsolete"}, value)
		}
		if !valid {
			invalid("status")
		}
	}
	if value := document.Metadata["taskType"]; value != "" {
		if _, ok := taskType(value); !ok {
			invalid("taskType")
		}
	}
	if value := document.Metadata["screenKind"]; value != "" {
		if _, ok := parseScreenKind(value); !ok {
			invalid("screenKind")
		}
	}
	if value := document.Metadata["risk"]; value != "" && !containsString([]string{"low", "medium", "high", "critical"}, value) {
		invalid("risk")
	}
	if value := document.Metadata["allowCycle"]; value != "" && value != "true" && value != "false" {
		invalid("allowCycle")
	}
	for key, allowed := range map[string][]string{
		"priority":        {"low", "normal", "medium", "high", "urgent"},
		"severity":        {"low", "medium", "high", "critical"},
		"reproducibility": {"always", "often", "sometimes", "rarely", "not-reproduced", "unknown"},
		"regression":      {"true", "false"},
	} {
		if value := document.Metadata[key]; value != "" && !containsString(allowed, value) {
			invalid(key)
		}
	}
	for _, key := range []string{"updated", "date", "lastVerified"} {
		if value := document.Metadata[key]; value != "" {
			if _, ok := parseISODate(value); !ok {
				invalid(key)
			}
		}
	}
}

func validateSemanticSections(model *Model, document *Document) {
	seen := map[SectionKind]bool{}
	var visit func([]Section)
	visit = func(sections []Section) {
		for _, section := range sections {
			if section.Kind != "" {
				if !semanticSectionKinds[section.Kind] {
					addDocumentIssue(model, document, newIssue("error", "unknown-section-kind", "Unknown semantic section kind "+string(section.Kind)+".", document.SourcePath, section.StartLine+1))
				} else if seen[section.Kind] && section.Kind != SectionKindRoadmapStage && section.Kind != SectionKindRisk {
					addDocumentIssue(model, document, newIssue("error", "duplicate-section-kind", "Semantic section kind "+string(section.Kind)+" is declared more than once.", document.SourcePath, section.StartLine+1))
				}
				seen[section.Kind] = true
			}
			validateSemanticSectionMetadata(model, document, section)
			visit(section.children)
		}
	}
	visit(document.Sections)
}

func validateSemanticSectionMetadata(model *Model, document *Document, section Section) {
	var schema semanticSchema
	switch section.Kind {
	case SectionKindRoadmapStage:
		schema = semanticSchema{allowed: []string{"status", "plannedDate"}, required: []string{"status"}}
	case SectionKindRisk:
		schema = semanticSchema{allowed: []string{"status", "probability", "impact"}, required: []string{"status", "probability", "impact"}}
	default:
		if len(section.Metadata) == 0 {
			return
		}
	}
	allowed := semanticSet(schema.allowed)
	for key := range section.Metadata {
		if !allowed[key] {
			addDocumentIssue(model, document, newIssue("error", "unknown-semantic-field", "Unknown semantic field "+key+" for section "+string(section.Kind)+".", document.SourcePath, section.StartLine+1))
		}
	}
	for _, key := range schema.required {
		if strings.TrimSpace(section.Metadata[key]) == "" {
			addDocumentIssue(model, document, newIssue("error", "missing-semantic-field", "Missing required semantic field "+key+" for section "+string(section.Kind)+".", document.SourcePath, section.StartLine+1))
		}
	}
	if value := section.Metadata["status"]; value != "" && !StatusFor(value).Recognized {
		addDocumentIssue(model, document, newIssue("error", "invalid-semantic-value", "Invalid canonical value for status: "+value+".", document.SourcePath, section.StartLine+1))
	}
	for _, key := range []string{"probability", "impact"} {
		if value := section.Metadata[key]; value != "" && !containsString([]string{"low", "medium", "high", "critical"}, value) {
			addDocumentIssue(model, document, newIssue("error", "invalid-semantic-value", "Invalid canonical value for "+key+": "+value+".", document.SourcePath, section.StartLine+1))
		}
	}
	if value := section.Metadata["plannedDate"]; value != "" {
		if _, ok := parseISODate(value); !ok {
			addDocumentIssue(model, document, newIssue("error", "invalid-semantic-value", "Invalid canonical value for plannedDate: "+value+".", document.SourcePath, section.StartLine+1))
		}
	}
}

func validateSemanticTables(model *Model, document *Document) {
	seen := map[string]bool{}
	for _, table := range document.markdownTables {
		if table.Kind == "" {
			continue
		}
		schema, ok := semanticTableSchemas[table.Kind]
		if !ok {
			addDocumentIssue(model, document, newIssue("error", "unknown-table-kind", "Unknown semantic table kind "+table.Kind+".", document.SourcePath, table.StartLine))
			continue
		}
		valid := !seen[table.Kind] && len(table.Columns) == len(table.Headers)
		seen[table.Kind] = true
		allowed, columns := semanticSet(schema.allowed), map[string]bool{}
		for _, column := range table.Columns {
			if !allowed[column] || columns[column] {
				valid = false
			}
			columns[column] = true
		}
		for _, required := range schema.required {
			valid = valid && columns[required]
		}
		if !valid {
			addDocumentIssue(model, document, newIssue("error", "invalid-table-columns", "Semantic table columns are invalid for "+table.Kind+".", document.SourcePath, table.StartLine))
		}
	}
}
