package docgent

import (
	"strings"
	"testing"
)

func TestBuiltinSectionsStableOrderAndLookups(t *testing.T) {
	want := []SectionType{SectionArchitecture, SectionModules, SectionUseCases, SectionFlows, SectionScreens, SectionDecisions, SectionContracts, SectionQuality, SectionRunbooks, SectionReference, SectionWork, SectionGuides}
	if len(BuiltinSections) != len(want) {
		t.Fatalf("sections: %#v", BuiltinSections)
	}
	for index, section := range want {
		if BuiltinSections[index].Type != section {
			t.Fatalf("section %d = %q, want %q", index, BuiltinSections[index].Type, section)
		}
		if got := sectionTypeForPath(BuiltinSections[index].SourceDir + "/entry.md"); got != section {
			t.Fatalf("source lookup = %q, want %q", got, section)
		}
		if got, ok := sectionSpec(section); !ok || got != BuiltinSections[index] {
			t.Fatalf("type lookup = %#v, %v", got, ok)
		}
	}
	if BuiltinSections[3].Route != "processes" || BuiltinSections[3].EnglishTitle != "Processes" {
		t.Fatal("flows section contract changed")
	}
}

func TestProjectLocaleConfiguration(t *testing.T) {
	for input, want := range map[string]string{"en-GB": "en-GB", "pt-br": "pt-BR", "sr-latn": "sr-Latn", "de-1901": "de-1901"} {
		config, err := parseSiteConfig([]byte("project:\n  locale: " + input + "\n"))
		if err != nil || config.Project.Locale != want {
			t.Fatalf("%s: %#v, %v", input, config.Project, err)
		}
	}
	for _, input := range []string{"???", "Russian language", "ru_", "e", "en-US-extra-"} {
		if _, err := parseSiteConfig([]byte("project:\n  locale: " + input + "\n")); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
	config, err := parseSiteConfig([]byte("project:\n  locale: en\n  sections:\n    architecture: Architecture\n    modules: Modules\n    use-cases: Use Cases\n    flows: Processes\n    screens: Screens\n    decisions: Decisions\n    contracts: Contracts\n    quality: Quality\n    runbooks: Runbooks\n    reference: Reference\n    work: Work\n    guides: Guides\n"))
	if err != nil || len(config.Project.Sections) != len(BuiltinSections) {
		t.Fatalf("project-only config: %#v, %v", config, err)
	}
}

func TestMissingProjectConfigurationUsesEnglishAndWarning(t *testing.T) {
	root, docs := configFixture(t)
	model := buildConfigFixture(t, root, docs, "")
	if modelDirectoryLabel(model, "architecture") != "Architecture" {
		t.Fatal("English fallback is missing")
	}
	if !strings.Contains(pageShell(model, "index.html", "x", "", "", ""), `<html lang="en"`) {
		t.Fatal("missing locale must render en")
	}
	if model.Stats.Warnings < 2 {
		t.Fatalf("missing configuration warnings: %#v", model.Issues)
	}
}
