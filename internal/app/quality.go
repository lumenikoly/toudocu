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

func typedDocumentID(document *Document, matcher *regexp.Regexp) string {
	id := strings.TrimSpace(document.Metadata["id"])
	if matcher.MatchString(id) {
		return id
	}
	for _, heading := range document.Headings {
		if heading.Level != 1 {
			continue
		}
		if value := strings.FieldsFunc(heading.Title, func(r rune) bool {
			return r == ':' || r == '—' || r == '–' || r == ' '
		}); len(value) > 0 && matcher.MatchString(value[0]) {
			return value[0]
		}
		break
	}
	return id
}

func sectionText(document *Document, names ...string) string {
	for _, section := range document.Sections {
		for _, name := range names {
			if canonicalText(section.Title) == canonicalText(name) {
				return strings.TrimSpace(section.Text)
			}
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

func standardStatus(value string) (string, bool) {
	statuses := map[string]string{
		"черновик": "draft", "draft": "draft",
		"действует": "active", "active": "active", "effective": "active",
		"устарел": "obsolete", "obsolete": "obsolete", "deprecated": "obsolete",
		"заменён": "superseded", "заменен": "superseded", "superseded": "superseded", "replaced": "superseded",
	}
	result, ok := statuses[canonicalText(value)]
	return result, ok
}

func runbookStatus(value string) (string, bool) {
	statuses := map[string]string{
		"черновик": "draft", "draft": "draft",
		"действует": "active", "active": "active",
		"требует проверки": "review-required", "requires review": "review-required", "review required": "review-required",
		"устарел": "obsolete", "obsolete": "obsolete", "deprecated": "obsolete",
	}
	result, ok := statuses[canonicalText(value)]
	return result, ok
}

func parseISODate(value string) (time.Time, bool) {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	return parsed, err == nil
}

func hasNumberedProcedure(document *Document) bool {
	parsed := analyzeMarkdownPath(document.Content, document.SourcePath)
	for _, section := range document.Sections {
		if canonicalText(section.Title) != "процедура" && canonicalText(section.Title) != "procedure" {
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
		id := typedDocumentID(document, standardIDRE)
		if !standardIDRE.MatchString(id) {
			typedError(model, document, "invalid-standard-id", "Стандарт должен иметь идентификатор STD-*.")
		} else if previous := standardByID[id]; previous != nil {
			typedError(model, document, "duplicate-standard-id", fmt.Sprintf("Стандарт %s уже объявлен в %s.", id, previous.SourcePath))
		} else {
			standardByID[id] = document
		}
		statusName, statusValid := standardStatus(document.Metadata["status"])
		if document.Metadata["owner"] == "" {
			typedWarning(model, document, "missing-standard-owner", "У стандарта не указан владелец.")
		}
		if document.Metadata["scope"] == "" {
			typedWarning(model, document, "missing-standard-scope", "У стандарта не указана область.")
		}
		if !statusValid {
			typedWarning(model, document, "invalid-standard-status", "У стандарта отсутствует или не распознан статус.")
		}
		if _, ok := parseISODate(document.Metadata["updated"]); !ok {
			typedWarning(model, document, "invalid-standard-updated", "У стандарта отсутствует или неверна ISO-дата обновления.")
		}
		rules := sectionText(document, "Правила", "Rules")
		checks := sectionText(document, "Автоматические проверки", "Automated checks", "Automatic checks")
		if rules == "" {
			typedWarning(model, document, "missing-standard-rules", "Раздел «Правила» должен быть непустым.")
		}
		if checks == "" {
			typedWarning(model, document, "missing-standard-automatic-checks", "Раздел «Автоматические проверки» должен быть непустым.")
		}
		if statusName == "superseded" && !standardIDRE.MatchString(document.Metadata["supersededBy"]) {
			typedError(model, document, "missing-standard-superseded-by", "Заменённый стандарт должен ссылаться полем «Заменён» на STD-*.")
		}
		standards = append(standards, KnowledgeStandard{
			ID: id, Title: document.Title, Status: document.Status, Owner: document.Metadata["owner"],
			Scope: document.Metadata["scope"], Updated: document.Metadata["updated"],
			SupersededBy: document.Metadata["supersededBy"], Rules: rules, AutomaticChecks: checks,
			Document: document.SourcePath,
		})
	}
	for index := range standards {
		standard := standards[index]
		if standard.SupersededBy == standard.ID && standard.ID != "" {
			typedError(model, model.DocByPath[standard.Document], "self-standard-replacement", "Стандарт не может заменять сам себя.")
			continue
		}
		if standard.SupersededBy != "" && standardByID[standard.SupersededBy] == nil {
			typedError(model, model.DocByPath[standard.Document], "dangling-standard-replacement", "Стандарт ссылается на неизвестную замену "+standard.SupersededBy+".")
		}
	}

	for _, document := range model.Collections["runbook"] {
		id := typedDocumentID(document, runbookIDRE)
		if !runbookIDRE.MatchString(id) {
			typedError(model, document, "invalid-runbook-id", "Runbook должен иметь идентификатор RB-*.")
		} else if previous := runbookByID[id]; previous != nil {
			typedError(model, document, "duplicate-runbook-id", fmt.Sprintf("Runbook %s уже объявлен в %s.", id, previous.SourcePath))
		} else {
			runbookByID[id] = document
		}
		statusName, statusValid := runbookStatus(document.Metadata["status"])
		if document.Metadata["owner"] == "" {
			typedWarning(model, document, "missing-runbook-owner", "У runbook не указан владелец.")
		}
		if document.Metadata["environment"] == "" {
			typedWarning(model, document, "missing-runbook-environment", "У runbook не указана среда.")
		}
		if !statusValid {
			typedWarning(model, document, "invalid-runbook-status", "У runbook отсутствует или не распознан статус.")
		}
		risk := canonicalText(document.Metadata["risk"])
		validRisk := containsString([]string{"низкий", "low", "средний", "medium", "высокий", "high", "критический", "critical"}, risk)
		if !validRisk {
			typedWarning(model, document, "invalid-runbook-risk", "У runbook отсутствует или не распознан риск.")
		}
		for _, required := range []struct {
			names []string
			label string
		}{
			{[]string{"Предварительные условия", "Предпосылки", "Prerequisites"}, "Предварительные условия"},
			{[]string{"Процедура", "Procedure"}, "Процедура"},
			{[]string{"Проверка", "Проверка результата", "Verification", "Result verification"}, "Проверка"},
			{[]string{"Откат", "План отката", "Rollback", "Rollback plan"}, "Откат"},
		} {
			if sectionText(document, required.names...) == "" {
				typedWarning(model, document, "missing-runbook-section", "Runbook должен содержать непустой раздел «"+required.label+"».")
			}
		}
		if !hasNumberedProcedure(document) {
			typedWarning(model, document, "runbook-procedure-not-numbered", "Раздел «Процедура» должен содержать нумерованные шаги.")
		}
		for _, link := range document.ResolvedLinks {
			if link.Broken || link.Blocked {
				typedError(model, document, "invalid-runbook-link", "Runbook содержит недоступную или небезопасную ссылку: "+link.Destination+".")
			}
		}
		if (risk == "высокий" || risk == "high" || risk == "критический" || risk == "critical") &&
			sectionText(document, "Условия остановки", "Stop conditions") == "" {
			typedWarning(model, document, "missing-runbook-stop-conditions", "Runbook высокого или критического риска должен содержать «Условия остановки».")
		}
		freshness := "review-required"
		verified, dateValid := parseISODate(document.Metadata["lastVerified"])
		switch {
		case statusName == "review-required" || !dateValid || verified.After(model.GeneratedAt):
			freshness = "review-required"
			typedWarning(model, document, "runbook-review-required", "Runbook требует проверки: дата отсутствует, неверна, находится в будущем или статус требует review.")
		case statusName != "active":
			freshness = "not-applicable"
		case statusName == "active" && model.StaleDays > 0 && int(model.GeneratedAt.Sub(verified).Hours()/24) > model.StaleDays:
			freshness = "overdue"
			typedWarning(model, document, "stale-runbook", fmt.Sprintf("Runbook не проверялся более %d дн.", model.StaleDays))
		default:
			freshness = "recent"
		}
		runbooks = append(runbooks, KnowledgeRunbook{
			ID: id, Title: document.Title, Status: document.Status, Owner: document.Metadata["owner"],
			Environment: document.Metadata["environment"], Risk: document.Metadata["risk"],
			LastVerified: document.Metadata["lastVerified"], Freshness: freshness, Document: document.SourcePath,
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
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-standard-reference", fmt.Sprintf("Задача %s ссылается на неизвестный стандарт %s.", item.ID, id), item.line)
			}
		}
		for _, id := range item.RunbookIDs {
			if runbookByID[id] == nil {
				addKnowledgeIssue(model, item.ownerDoc, "error", "dangling-runbook-reference", fmt.Sprintf("Задача %s ссылается на неизвестный runbook %s.", item.ID, id), item.line)
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
				model.Issues = append(model.Issues, newIssue("warning", "missing-section-manifest", "Раздел "+directory+" должен содержать index.md.", directory, 0))
				continue
			}
		}
		if official[directory] || manifest == nil {
			continue
		}
		if canonicalText(manifest.Metadata["type"]) != "custom" {
			typedWarning(model, manifest, "invalid-custom-manifest-type", "Манифест пользовательского раздела должен содержать «Тип: Custom».")
		}
		if manifest.Metadata["owner"] == "" {
			typedWarning(model, manifest, "missing-custom-owner", "У пользовательского раздела не указан владелец.")
		}
		if manifest.Description == "" {
			typedWarning(model, manifest, "missing-custom-description", "Манифест пользовательского раздела должен содержать непустое описание.")
		}
	}
}
