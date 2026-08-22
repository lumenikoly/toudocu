package toudocu

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	standardIDRE = regexp.MustCompile(`^STD-[A-Z0-9]+(?:-[A-Z0-9]+)*$`)
	runbookIDRE  = regexp.MustCompile(`^RB-[A-Z0-9]+(?:-[A-Z0-9]+)*$`)
)

func sectionText(document *Document, kind SectionKind) string {
	for _, section := range document.Sections {
		if section.Kind == kind {
			return strings.TrimSpace(section.Text)
		}
	}
	return ""
}

func typedWarning(model *Model, document *Document, code, message string) {
	addDocumentIssue(model, document, newIssue("warning", code, message, document.SourcePath, 0))
}

func typedError(model *Model, document *Document, code, message string) {
	addDocumentIssue(model, document, newIssue("error", code, message, document.SourcePath, 0))
}

type StandardStatus string
type StandardID string

const (
	StandardDraft      StandardStatus = "draft"
	StandardActive     StandardStatus = "active"
	StandardObsolete   StandardStatus = "obsolete"
	StandardSuperseded StandardStatus = "superseded"
)

func standardStatus(value string) (StandardStatus, bool) {
	status := StandardStatus(strings.TrimSpace(value))
	return status, containsString([]string{string(StandardDraft), string(StandardActive), string(StandardObsolete), string(StandardSuperseded)}, string(status))
}

type StandardMeta struct {
	ID           StandardID
	Status       StandardStatus
	Scope        string
	Updated      time.Time
	UpdatedRaw   string
	SupersededBy StandardID
}

func parseStandardMeta(document *Document) (StandardMeta, bool) {
	status, statusValid := standardStatus(document.Metadata["status"])
	updated, dateValid := parseISODate(document.Metadata["updated"])
	return StandardMeta{
		ID: StandardID(strings.TrimSpace(document.Metadata["id"])), Status: status,
		Scope: strings.TrimSpace(document.Metadata["scope"]), Updated: updated,
		UpdatedRaw: strings.TrimSpace(document.Metadata["updated"]), SupersededBy: StandardID(strings.TrimSpace(document.Metadata["supersededBy"])),
	}, statusValid && dateValid
}

type RunbookStatus string
type RunbookID string

const (
	RunbookDraft          RunbookStatus = "draft"
	RunbookActive         RunbookStatus = "active"
	RunbookReviewRequired RunbookStatus = "review-required"
	RunbookObsolete       RunbookStatus = "obsolete"
)

type RiskLevel string

const (
	RiskLow      RiskLevel = "low"
	RiskMedium   RiskLevel = "medium"
	RiskHigh     RiskLevel = "high"
	RiskCritical RiskLevel = "critical"
)

func runbookStatus(value string) (RunbookStatus, bool) {
	status := RunbookStatus(strings.TrimSpace(value))
	return status, containsString([]string{string(RunbookDraft), string(RunbookActive), string(RunbookReviewRequired), string(RunbookObsolete)}, string(status))
}

type RunbookMeta struct {
	ID              RunbookID
	Status          RunbookStatus
	Risk            RiskLevel
	LastVerified    time.Time
	LastVerifiedRaw string
	Environment     string
}

func parseRunbookMeta(document *Document) (RunbookMeta, bool, bool, bool) {
	status, statusValid := runbookStatus(document.Metadata["status"])
	risk := RiskLevel(strings.TrimSpace(document.Metadata["risk"]))
	riskValid := containsString([]string{string(RiskLow), string(RiskMedium), string(RiskHigh), string(RiskCritical)}, string(risk))
	verified, dateValid := parseISODate(document.Metadata["lastVerified"])
	return RunbookMeta{
		ID: RunbookID(strings.TrimSpace(document.Metadata["id"])), Status: status, Risk: risk,
		LastVerified: verified, LastVerifiedRaw: strings.TrimSpace(document.Metadata["lastVerified"]), Environment: strings.TrimSpace(document.Metadata["environment"]),
	}, statusValid, riskValid, dateValid
}

func parseISODate(value string) (time.Time, bool) {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	return parsed, err == nil
}

func hasNumberedProcedure(document *Document) bool {
	parsed := analyzeMarkdownPath(document.Content, document.SourcePath)
	for _, section := range document.Sections {
		if section.Kind != SectionKindProcedure {
			continue
		}
		for _, list := range parsed.OrderedLists {
			line := list.Start.Line - 1
			if line > section.StartLine && line < section.EndLine {
				return true
			}
		}
	}
	return false
}

func validateTypedKnowledge(model *Model) {
	standards := []KnowledgeStandard{}
	runbooks := []KnowledgeRunbook{}
	standardByID := map[string]*Document{}
	runbookByID := map[string]*Document{}

	for _, document := range model.Collections["standard"] {
		meta, metaValid := parseStandardMeta(document)
		id := string(meta.ID)
		if !standardIDRE.MatchString(id) {
			typedError(model, document, "invalid-standard-id", "A standard must have an STD-* identifier.")
		} else if previous := standardByID[id]; previous != nil {
			typedError(model, document, "duplicate-standard-id", fmt.Sprintf("Standard %s is already declared in %s.", id, previous.SourcePath))
		} else {
			standardByID[id] = document
		}
		if meta.Scope == "" {
			typedWarning(model, document, "missing-standard-scope", "The standard has no scope.")
		}
		if _, valid := standardStatus(document.Metadata["status"]); !valid {
			typedWarning(model, document, "invalid-standard-status", "The standard status is missing or unrecognized.")
		}
		if !metaValid && meta.Updated.IsZero() {
			typedWarning(model, document, "invalid-standard-updated", "The standard update date is missing or is not a valid ISO date.")
		}
		rules := sectionText(document, SectionKindRules)
		checks := sectionText(document, SectionKindAutomatedChecks)
		if rules == "" {
			typedWarning(model, document, "missing-standard-rules", "The Rules section must not be empty.")
		}
		if checks == "" {
			typedWarning(model, document, "missing-standard-automatic-checks", "The Automated checks section must not be empty.")
		}
		if meta.Status == StandardSuperseded && !standardIDRE.MatchString(string(meta.SupersededBy)) {
			typedError(model, document, "missing-standard-superseded-by", "A superseded standard must reference an STD-* identifier in its Superseded by field.")
		}
		standards = append(standards, KnowledgeStandard{
			ID: id, Title: document.Title, Status: StatusFor(string(meta.Status)),
			Scope: meta.Scope, Updated: meta.UpdatedRaw,
			SupersededBy: string(meta.SupersededBy), Rules: rules, AutomaticChecks: checks,
			Document: document.SourcePath,
		})
	}
	for index := range standards {
		standard := standards[index]
		if standard.SupersededBy == standard.ID && standard.ID != "" {
			typedError(model, model.DocByPath[standard.Document], "self-standard-replacement", "A standard cannot supersede itself.")
			continue
		}
		if standard.SupersededBy != "" && standardByID[standard.SupersededBy] == nil {
			typedError(model, model.DocByPath[standard.Document], "dangling-standard-replacement", "The standard references unknown replacement "+standard.SupersededBy+".")
		}
	}

	for _, document := range model.Collections["runbook"] {
		meta, statusValid, validRisk, dateValid := parseRunbookMeta(document)
		id := string(meta.ID)
		if !runbookIDRE.MatchString(id) {
			typedError(model, document, "invalid-runbook-id", "A runbook must have an RB-* identifier.")
		} else if previous := runbookByID[id]; previous != nil {
			typedError(model, document, "duplicate-runbook-id", fmt.Sprintf("Runbook %s is already declared in %s.", id, previous.SourcePath))
		} else {
			runbookByID[id] = document
		}
		if meta.Environment == "" {
			typedWarning(model, document, "missing-runbook-environment", "The runbook has no environment.")
		}
		if !statusValid {
			typedWarning(model, document, "invalid-runbook-status", "The runbook status is missing or unrecognized.")
		}
		if !validRisk {
			typedWarning(model, document, "invalid-runbook-risk", "The runbook risk is missing or unrecognized.")
		}
		for _, required := range []struct {
			kind  SectionKind
			label string
		}{
			{SectionKindPrerequisites, "Prerequisites"},
			{SectionKindProcedure, "Procedure"},
			{SectionKindVerification, "Verification"},
			{SectionKindRollback, "Rollback"},
		} {
			if sectionText(document, required.kind) == "" {
				typedWarning(model, document, "missing-runbook-section", "The runbook must contain a non-empty "+required.label+" section.")
			}
		}
		if !hasNumberedProcedure(document) {
			typedWarning(model, document, "runbook-procedure-not-numbered", "The Procedure section must contain numbered steps.")
		}
		for _, link := range document.ResolvedLinks {
			if link.Broken || link.Blocked {
				typedError(model, document, "invalid-runbook-link", "The runbook contains an unavailable or unsafe link: "+link.Destination+".")
			}
		}
		if (meta.Risk == RiskHigh || meta.Risk == RiskCritical) && sectionText(document, SectionKindStopConditions) == "" {
			typedWarning(model, document, "missing-runbook-stop-conditions", "A high- or critical-risk runbook must contain Stop conditions.")
		}
		freshness := "review-required"
		switch {
		case meta.Status == RunbookReviewRequired || !dateValid || meta.LastVerified.After(model.GeneratedAt):
			freshness = "review-required"
			typedWarning(model, document, "runbook-review-required", "The runbook requires review because its date is missing, invalid, in the future, or its status requires review.")
		case meta.Status != RunbookActive:
			freshness = "not-applicable"
		case meta.Status == RunbookActive && model.StaleDays > 0 && int(model.GeneratedAt.Sub(meta.LastVerified).Hours()/24) > model.StaleDays:
			freshness = "overdue"
			typedWarning(model, document, "stale-runbook", fmt.Sprintf("The runbook has not been verified for more than %d days.", model.StaleDays))
		default:
			freshness = "recent"
		}
		runbooks = append(runbooks, KnowledgeRunbook{
			ID: id, Title: document.Title, Status: StatusFor(string(meta.Status)),
			Environment: meta.Environment, Risk: string(meta.Risk),
			LastVerified: meta.LastVerifiedRaw, Freshness: freshness, Document: document.SourcePath,
		})
	}
	sort.SliceStable(standards, func(i, j int) bool { return naturalCompare(standards[i].ID, standards[j].ID) < 0 })
	sort.SliceStable(runbooks, func(i, j int) bool { return naturalCompare(runbooks[i].ID, runbooks[j].ID) < 0 })
	model.Knowledge.Standards = standards
	model.Knowledge.Runbooks = runbooks
	for index := range model.Knowledge.WorkItems {
		item := &model.Knowledge.WorkItems[index]
		for _, id := range item.StandardIDs {
			if standardByID[id] == nil {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-standard-reference", fmt.Sprintf("Task %s references unknown standard %s.", item.ID, id), item.line)
			}
		}
		for _, id := range item.RunbookIDs {
			if runbookByID[id] == nil {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-runbook-reference", fmt.Sprintf("Task %s references unknown runbook %s.", item.ID, id), item.line)
			}
		}
	}
}

func validateSectionManifests(model *Model) {
	official := map[string]bool{
		"architecture": true, "contracts": true, "decisions": true, "flows": true, "guides": true,
		"modules": true, "quality": true, "reference": true, "runbooks": true, "screens": true,
		"use-cases": true, "work": true,
	}
	topLevel := map[string]bool{}
	for _, document := range model.Documents {
		parts := strings.Split(document.SourcePath, "/")
		if len(parts) > 1 {
			topLevel[parts[0]] = true
		}
	}
	for directory := range topLevel {
		manifest := model.DocByPath[path.Join(directory, "index.md")]
		if directory == "quality" || directory == "runbooks" || !official[directory] {
			if manifest == nil {
				model.Issues = append(model.Issues, newIssue("warning", "missing-section-manifest", "Section "+directory+" must contain index.md.", directory, 0))
				continue
			}
		}
		if official[directory] || manifest == nil {
			continue
		}
		if manifest.Description == "" {
			typedWarning(model, manifest, "missing-custom-description", "A custom section manifest must contain a non-empty description.")
		}
	}
}
