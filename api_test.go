package docudocu_test

import (
	"os"
	"regexp"
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

func TestPublicAPIFacadeIsDocumented(t *testing.T) {
	api, err := os.ReadFile("api.go")
	if err != nil {
		t.Fatal(err)
	}
	contract, err := os.ReadFile("docs/contracts/go-api.md")
	if err != nil {
		t.Fatal(err)
	}
	exportedFunction := regexp.MustCompile(`(?m)^func ([A-Z][A-Za-z0-9]*)\(`)
	for _, match := range exportedFunction.FindAllStringSubmatch(string(api), -1) {
		name := match[1]
		if !strings.Contains(string(contract), "`"+name+"`") {
			t.Errorf("public function %s is missing from Go API contract", name)
		}
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
		"[Public Go API](docs/contracts/go-api.md)",
		"[Project source documentation](docs/index.md)",
	} {
		if !strings.Contains(text, expected) {
			t.Errorf("English README does not contain %q", expected)
		}
	}
	for _, expected := range []string{
		"## Поддерживаемый Markdown",
		"[Публичный Go API](docs/contracts/go-api.md)",
		"[Исходная документация проекта](docs/index.md)",
	} {
		if !strings.Contains(string(russian), expected) {
			t.Errorf("Russian README does not contain %q", expected)
		}
	}
}
