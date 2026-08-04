package docudocu_test

import (
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
