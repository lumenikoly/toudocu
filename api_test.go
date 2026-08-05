package docudocu_test

import (
	"os"
	"strings"
	"testing"

	"docu-docu"
)

func TestPublicAPIFacadeDelegatesToInternalImplementation(t *testing.T) {
	if docudocu.Version != "0.0.1" {
		t.Fatalf("Version = %q, want 0.0.1", docudocu.Version)
	}
	if actual := docudocu.ClassifyDocument("architecture/overview.md"); actual != "architecture" {
		t.Fatalf("ClassifyDocument() = %q, want architecture", actual)
	}
	parsed := docudocu.AnalyzeMarkdown("# Title\n\nBody.\n")
	if parsed.Title != "Title" {
		t.Fatalf("AnalyzeMarkdown() title = %q, want Title", parsed.Title)
	}
}

func TestRootDocumentationMatchesPublishedState(t *testing.T) {
	english, err := os.ReadFile("README.md")
	if err != nil {
		t.Fatal(err)
	}
	russian, err := os.ReadFile("README.ru.md")
	if err != nil {
		t.Fatal(err)
	}
	text := string(english)
	for _, forbidden := range []string{"github.com/your-org/", "scaffold module payments"} {
		if strings.Contains(text, forbidden) || strings.Contains(string(russian), forbidden) {
			t.Errorf("README files contain stale placeholder or invalid example %q", forbidden)
		}
	}
	for _, expected := range []string{
		"## Supported Markdown",
		"scaffold module MOD-PAYMENTS",
		"## Public Go API",
		"[Project source documentation](docs/index.md)",
	} {
		if !strings.Contains(text, expected) {
			t.Errorf("English README does not contain %q", expected)
		}
	}
	for _, expected := range []string{
		"## Поддерживаемый Markdown",
		"## Публичный Go API",
		"[Исходная документация проекта](docs/index.md)",
	} {
		if !strings.Contains(string(russian), expected) {
			t.Errorf("Russian README does not contain %q", expected)
		}
	}
}
