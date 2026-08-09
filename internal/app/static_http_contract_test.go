package toudocu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStaticHTTPDocumentationContract(t *testing.T) {
	public := []string{
		filepath.Join("..", "..", "README.md"),
		filepath.Join("..", "..", "README.ru.md"),
		filepath.Join("..", "..", "docs", "index.md"),
		filepath.Join("..", "..", "docs", "use-cases", "build-portal.md"),
		filepath.Join("..", "..", "docs", "flows", "FLOW-DOCS-BUILD.md"),
		filepath.Join("..", "..", "docs", "guides", "deployment.md"),
		filepath.Join("..", "..", "docs", "guides", "local-workflow.md"),
		filepath.Join("..", "..", "docs", "contracts", "cli.md"),
	}
	for _, name := range public {
		content, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		lower := strings.ToLower(string(content))
		for _, forbidden := range []string{
			"opens through `file://`",
			"opened directly from disk",
			"open directly from disk",
			"открывается через `file://`",
			"работает через `file://`",
			"открыть портал через file://",
		} {
			if strings.Contains(lower, strings.ToLower(forbidden)) {
				t.Fatalf("%s still promises disk-open compatibility: %q", name, forbidden)
			}
		}
	}

	deployment, err := os.ReadFile(filepath.Join("..", "..", "docs", "guides", "deployment.md"))
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{"HTTP(S) static hosting", "вложенном пути", "toudocu serve"} {
		if !strings.Contains(string(deployment), required) {
			t.Fatalf("deployment guide misses %q", required)
		}
	}
}
