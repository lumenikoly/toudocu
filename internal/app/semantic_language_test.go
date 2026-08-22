package toudocu

import (
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestRunbookMachineModelIsLanguageIndependent(t *testing.T) {
	variants := map[string][3]string{
		"ru":        {"Развёртывание", "Что нужно сделать", "Как проверить"},
		"en":        {"Deployment", "Procedure", "Verification"},
		"fr":        {"Déploiement", "Procédure", "Vérification"},
		"ja":        {"デプロイ", "手順", "確認"},
		"arbitrary": {"Banana spaceship", "Purple elephant", "Glass ocean"},
	}
	type snapshot struct {
		ID, Status, Risk, LastVerified string
		Sections                       []SectionKind
	}
	var baseline snapshot
	for name, labels := range variants {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			docs := filepath.Join(root, "docs")
			writeTestFile(t, docs, "index.md", "# Project\n\nDescription.\n")
			writeArchitectureOverview(t, docs, "")
			content := "<!-- toudocu\nversion: 1\nid: RB-TEST\nstatus: active\nrisk: high\nlastVerified: 2026-08-20\n-->\n\n# " + labels[0] + "\n\nDescription.\n\n<!-- toudocu:section procedure -->\n## " + labels[1] + "\n\n1. Step.\n\n<!-- toudocu:section verification -->\n## " + labels[2] + "\n\nVerified.\n"
			writeTestFile(t, docs, "runbooks/RB-TEST.md", content)
			model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0, Now: time.Date(2026, 8, 22, 0, 0, 0, 0, time.UTC)})
			if err != nil {
				t.Fatal(err)
			}
			for _, issue := range model.Issues {
				if issue.Severity == "error" {
					t.Fatalf("unexpected semantic error: %#v", issue)
				}
			}
			document := model.DocByPath["runbooks/RB-TEST.md"]
			sections := make([]SectionKind, 0, len(document.Sections))
			for _, section := range document.Sections {
				if section.Kind != "" {
					sections = append(sections, section.Kind)
				}
			}
			runbook := model.Knowledge.Runbooks[0]
			current := snapshot{runbook.ID, runbook.Status.Label, runbook.Risk, runbook.LastVerified, sections}
			if baseline.ID == "" {
				baseline = current
			} else if !reflect.DeepEqual(current, baseline) {
				t.Fatalf("machine model changed with reader language: got %#v, want %#v", current, baseline)
			}
		})
	}
}

func TestSemanticDiffUsesAnnotationsNotReaderLabels(t *testing.T) {
	metadata := "<!-- toudocu\nversion: 1\nid: RB-TEST\nstatus: active\nrisk: high\nlastVerified: 2026-08-20\n-->\n\n"
	oldContent := []byte(metadata + "# Deployment\n\n<!-- toudocu:section procedure -->\n## Procedure\n\n1. Step.\n")
	translated := []byte(metadata + "# Déploiement\n\n<!-- toudocu:section procedure -->\n## Procédure\n\n1. Step.\n")
	entity := []ChangeEntity{{ID: "RB-TEST", Type: "runbook"}}
	if changes := semanticMarkdownDiff(oldContent, translated, "docs/runbooks/RB-TEST.md", "docs/runbooks/RB-TEST.md", entity, entity); len(changes) != 0 {
		t.Fatalf("reader-facing translation changed semantics: %#v", changes)
	}
	changedKind := []byte(strings.Replace(string(translated), "section procedure", "section verification", 1))
	if changes := semanticMarkdownDiff(translated, changedKind, "docs/runbooks/RB-TEST.md", "docs/runbooks/RB-TEST.md", entity, entity); len(changes) == 0 {
		t.Fatal("section annotation change was not semantic")
	}

	oldTable := []byte("# Screen\n\n## Data\n\n<!-- toudocu:table transitions columns=id,useCase,action,condition,target,kind -->\n| ID | Use case | Action | Condition | Result | Type |\n|---|---|---|---|---|---|\n| TR-X-01 | UC-X-01 | Go | Always | SC-X-02 | navigation |\n")
	translatedTable := []byte(strings.Replace(string(oldTable), "| ID | Use case | Action | Condition | Result | Type |", "| 識別子 | シナリオ | 操作 | 条件 | 結果 | 種類 |", 1))
	if changes := semanticMarkdownDiff(oldTable, translatedTable, "docs/screens/SC-X-01.md", "docs/screens/SC-X-01.md", nil, nil); len(changes) != 0 {
		t.Fatalf("visible table headers changed semantics: %#v", changes)
	}
	changedColumns := []byte(strings.Replace(string(translatedTable), "action,condition", "condition,action", 1))
	changes := semanticMarkdownDiff(translatedTable, changedColumns, "docs/screens/SC-X-01.md", "docs/screens/SC-X-01.md", nil, nil)
	if len(changes) != 1 || changes[0].Field != "table.transitions" {
		t.Fatalf("table contract change was not reported: %#v", changes)
	}
}

func TestSemanticAnnotationDiagnostics(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Project\n\nDescription.\n")
	writeArchitectureOverview(t, docs, "")
	writeTestFile(t, docs, "runbooks/RB-BAD.md", `<!-- toudocu
version: 2
id: RB-BAD
status: Draft
risk: high
lastVerified: 2026-08-20
mystery: value
-->
<!-- toudocu
id: RB-BAD
-->

# Bad

<!-- toudocu:section procedure -->
## One

1. Step.

<!-- toudocu:section procedure -->
## Two

1. Step.

<!-- toudocu:section unknown-kind -->
## Unknown

<!-- toudocu:table unknown-kind columns=id -->
| ID |
|---|
| X |

<!-- toudocu:table transitions columns=id,action -->
| ID | Action |
|---|---|
| TR-X-01 | Go |

<!-- toudocu:section verification -->
`)
	writeTestFile(t, docs, "runbooks/RB-MISSING.md", "<!-- toudocu\nversion: 1\nid: RB-MISSING\nstatus: active\n-->\n\n# Missing\n")
	writeTestFile(t, docs, "guides/bad.md", "# Bad\n\n<!-- toudocu:section -->\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	for _, code := range []string{
		"invalid-toudocu-annotation", "duplicate-toudocu-metadata", "unsupported-toudocu-version",
		"unknown-semantic-field", "missing-semantic-field", "invalid-semantic-value",
		"unknown-section-kind", "duplicate-section-kind", "orphan-section-marker",
		"unknown-table-kind", "invalid-table-columns",
	} {
		if !hasIssueCode(model.Issues, code) {
			t.Errorf("missing diagnostic %s: %#v", code, model.Issues)
		}
	}
}
