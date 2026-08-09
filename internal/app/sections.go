package toudocu

import (
	"strings"
	"unicode"
)

// SectionType is the stable identity of a built-in documentation section.
type SectionType string

const (
	SectionArchitecture SectionType = "architecture"
	SectionModules      SectionType = "modules"
	SectionUseCases     SectionType = "use-cases"
	SectionFlows        SectionType = "flows"
	SectionScreens      SectionType = "screens"
	SectionDecisions    SectionType = "decisions"
	SectionContracts    SectionType = "contracts"
	SectionQuality      SectionType = "quality"
	SectionRunbooks     SectionType = "runbooks"
	SectionReference    SectionType = "reference"
	SectionWork         SectionType = "work"
	SectionGuides       SectionType = "guides"
)

// SectionSpec describes one built-in section. BuiltinSections order is the
// stable primary-navigation contract; callers must not derive order from maps.
type SectionSpec struct {
	Type         SectionType
	SourceDir    string
	EntryFile    string
	Route        string
	EnglishTitle string
}

var BuiltinSections = []SectionSpec{
	{SectionArchitecture, "architecture", "overview.md", "architecture", "Architecture"},
	{SectionModules, "modules", "index.md", "modules", "Modules"},
	{SectionUseCases, "use-cases", "index.md", "use-cases", "Use Cases"},
	{SectionFlows, "flows", "index.md", "processes", "Processes"},
	{SectionScreens, "screens", "index.md", "screens", "Screens"},
	{SectionDecisions, "decisions", "index.md", "decisions", "Decisions"},
	{SectionContracts, "contracts", "index.md", "contracts", "Contracts"},
	{SectionQuality, "quality", "index.md", "quality", "Quality Standards"},
	{SectionRunbooks, "runbooks", "index.md", "runbooks", "Runbooks"},
	{SectionReference, "reference", "index.md", "reference", "Reference"},
	{SectionWork, "work", "index.md", "work", "Work Items"},
	{SectionGuides, "guides", "index.md", "guides", "Guides"},
}

var sectionByType = func() map[SectionType]SectionSpec {
	result := make(map[SectionType]SectionSpec, len(BuiltinSections))
	for _, spec := range BuiltinSections {
		result[spec.Type] = spec
	}
	return result
}()

var sectionTypeBySourceDir = func() map[string]SectionType {
	result := make(map[string]SectionType, len(BuiltinSections))
	for _, spec := range BuiltinSections {
		result[spec.SourceDir] = spec.Type
	}
	return result
}()

func sectionTypeForPath(relativePath string) SectionType {
	first := strings.Split(strings.ToLower(normalizeSlashes(relativePath)), "/")[0]
	return sectionTypeBySourceDir[first]
}

func sectionSpec(section SectionType) (SectionSpec, bool) {
	spec, ok := sectionByType[section]
	return spec, ok
}

// sectionRoute returns the canonical portal route for a built-in section.
func sectionRoute(section SectionType) string {
	if spec, ok := sectionSpec(section); ok {
		return spec.Route
	}
	return ""
}

// sectionCatalogOutput returns the canonical catalog output for a built-in
// section. Individual documents retain their own output paths.
func sectionCatalogOutput(section SectionType) string {
	route := sectionRoute(section)
	if route == "" {
		return ""
	}
	return route + "/index.html"
}

func normalizeLocale(value string) (string, bool) {
	parts := strings.Split(value, "-")
	if len(parts) == 0 || len(parts[0]) < 2 || len(parts[0]) > 8 || !asciiLetters(parts[0]) {
		return "", false
	}
	result := []string{strings.ToLower(parts[0])}
	index := 1
	if index < len(parts) && len(parts[index]) == 4 && asciiLetters(parts[index]) {
		result = append(result, strings.ToUpper(parts[index][:1])+strings.ToLower(parts[index][1:]))
		index++
	}
	if index < len(parts) && ((len(parts[index]) == 2 && asciiLetters(parts[index])) || (len(parts[index]) == 3 && asciiDigits(parts[index]))) {
		result = append(result, strings.ToUpper(parts[index]))
		index++
	}
	for ; index < len(parts); index++ {
		part := parts[index]
		valid := (len(part) >= 5 && len(part) <= 8 && asciiAlphaNumeric(part)) || (len(part) == 4 && part[0] >= '0' && part[0] <= '9' && asciiAlphaNumeric(part))
		if !valid {
			return "", false
		}
		result = append(result, strings.ToLower(part))
	}
	return strings.Join(result, "-"), true
}

func asciiLetters(value string) bool {
	for _, r := range value {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return false
		}
	}
	return true
}
func asciiDigits(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
func asciiAlphaNumeric(value string) bool {
	for _, r := range value {
		if !unicode.IsDigit(r) && !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return false
		}
	}
	return true
}

var builtinSectionLocalePacks = map[string]map[SectionType]string{
	"en": {SectionArchitecture: "Architecture", SectionModules: "Modules", SectionUseCases: "Use Cases", SectionFlows: "Processes", SectionScreens: "Screens", SectionDecisions: "Architecture Decisions", SectionContracts: "Contracts", SectionQuality: "Quality Standards", SectionRunbooks: "Runbooks", SectionReference: "Reference", SectionWork: "Work Items", SectionGuides: "Guides"},
	"ru": {SectionArchitecture: "Архитектура", SectionModules: "Модули", SectionUseCases: "Пользовательские сценарии", SectionFlows: "Процессы", SectionScreens: "Экраны", SectionDecisions: "Архитектурные решения", SectionContracts: "Контракты", SectionQuality: "Стандарты качества", SectionRunbooks: "Runbooks", SectionReference: "Справочник", SectionWork: "Рабочие задачи", SectionGuides: "Руководства"},
}
