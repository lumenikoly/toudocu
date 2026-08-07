package skills

import (
	"strings"
	"testing"
)

func TestLoadContainsCompleteSkill(t *testing.T) {
	bundle, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if bundle.ID != SkillID || bundle.Version != "0.0.1" || len(bundle.Files) < 20 || len(bundle.Checksum) != 64 {
		t.Fatalf("unexpected bundle: %#v", bundle)
	}
	foundSkill, foundReference, foundEnglish, foundRussian := false, false, false, false
	for _, file := range bundle.Files {
		if strings.Contains(file.Path, "..") || len(file.Data) == 0 {
			t.Fatalf("invalid bundled file %q", file.Path)
		}
		switch file.Path {
		case "SKILL.md":
			foundSkill = true
		case "references/workflows.md":
			foundReference = true
		case "assets/templates/en/index.md":
			foundEnglish = true
		case "assets/templates/ru/index.md":
			foundRussian = true
		}
	}
	if !foundSkill || !foundReference || !foundEnglish || !foundRussian {
		t.Fatal("bundle does not include metadata, references, and both template locales")
	}
}

func TestLoadReturnsIndependentData(t *testing.T) {
	first, _ := Load()
	first.Files[0].Data[0] ^= 0xff
	second, err := Load()
	if err != nil || first.Files[0].Data[0] == second.Files[0].Data[0] {
		t.Fatal("bundle data was not copied")
	}
}
