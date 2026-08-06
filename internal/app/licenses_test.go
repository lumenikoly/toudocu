package docudocu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLicenseAndThirdPartyNotices(t *testing.T) {
	root := filepath.Join("..", "..")
	for file, expected := range map[string][]string{
		"LICENSE": {
			"Apache License",
			"Version 2.0, January 2004",
			"TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION",
		},
		"THIRD_PARTY_NOTICES.md": {
			"CodeMirror 6",
			"go.yaml.in/yaml/v3",
			"Kirill Simonov",
			"Canonical Ltd",
			"Mermaid Tiny and bundled dependencies",
			"DOMPurify",
		},
	} {
		content, err := os.ReadFile(filepath.Join(root, file))
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		for _, part := range expected {
			if !strings.Contains(string(content), part) {
				t.Errorf("%s does not contain %q", file, part)
			}
		}
	}
	if _, err := os.Stat(filepath.Join(root, "NOTICE")); !os.IsNotExist(err) {
		t.Errorf("NOTICE must not be part of this distribution model: %v", err)
	}

	asset, err := EmbeddedFiles.ReadFile("assets/generated/mermaid.LICENSE.txt")
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{"Knut Sveidqvist", "OpenJS Foundation", "Vitaly Puzrin", "DOMPurify", "Apache License"} {
		if !strings.Contains(string(asset), part) {
			t.Errorf("mermaid license notice does not contain %q", part)
		}
	}
}
