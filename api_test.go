package docgent_test

import (
	"testing"

	"docgent"
)

func TestPublicAPIFacadeDelegatesToInternalImplementation(t *testing.T) {
	if actual := docgent.ClassifyDocument("architecture/overview.md"); actual != "architecture" {
		t.Fatalf("ClassifyDocument() = %q, want architecture", actual)
	}
	parsed := docgent.AnalyzeMarkdown("# Title\n\nBody.\n")
	if parsed.Title != "Title" {
		t.Fatalf("AnalyzeMarkdown() title = %q, want Title", parsed.Title)
	}
}
