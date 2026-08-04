package docgent

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func completeTaskFixture(status string) string {
	return `# TASK-AUTH-021: Add verification workflow

- Status: ` + status + `
- Type: Feature
- Module: MOD-AUTH
- Use case: UC-AUTH-01

## Result

The requested behavior is implemented.

## Behavior change

### Before

The workflow is unavailable.

### After

The workflow is available and verified.

## Scope

- ` + "`new.go`" + `

## Out of scope

Unrelated commands.

## Acceptance criteria

- [ ] ` + "`AC-01`" + ` The workflow succeeds.

## Plan

1. Implement the workflow.
2. Verify the result.

## Verification

- ` + "`AC-01`" + ` -> ` + "`go version`" + `
- ` + "`ALL`" + ` -> ` + "`go version`" + `
- ` + "`DOCS`" + ` -> ` + "`go version`" + `

## Documentation impact

Update ` + "`docs/index.md`" + `.
`
}

func TestNewCLIFormsAndRemovedTaskCheck(t *testing.T) {
	cases := [][]string{
		{"search", "task workflow", "./docs", "--limit", "5", "--format", "json"},
		{"task", "init", "./docs", "--area", "CLI", "--title", "Title", "--type", "Feature"},
		{"scaffold", "module", "MOD-CLI", "./docs", "--title", "CLI"},
		{"task", "ready", "TASK-CLI-001", "./docs", "--strict", "--format", "json"},
		{"task", "context", "TASK-CLI-001", "./docs", "--format", "json"},
		{"task", "verify", "TASK-CLI-001", "./docs", "--dry-run", "--target", "AC-01"},
	}
	for _, args := range cases {
		if _, _, _, err := ParseArguments(args); err != nil {
			t.Fatalf("%v: %v", args, err)
		}
	}
	if _, _, _, err := ParseArguments([]string{"task", "check", "TASK-CLI-001"}); err == nil {
		t.Fatal("task check must be removed")
	}
	if _, _, _, err := ParseArguments([]string{"task", "verify", "TASK-CLI-001", "--dry-run", "--run"}); err == nil {
		t.Fatal("verify modes must be mutually exclusive")
	}
}

func TestSearchDocumentationRankingAndSections(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Обзор\n\nПоиск документации.\n")
	writeTestFile(t, docs, "guides/plain.md", "# Обычный документ\n\n## Поиск\n\nЁж и Search CLI workflow.\n")
	writeTestFile(t, docs, "modules/search.md", "# Search workflow\n\n- Identifier: MOD-SEARCH\n- Status: Planned\n\nSearch module.\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	report, err := SearchDocumentation(model, "search workflow", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Results) < 2 || report.Results[0].ID != "MOD-SEARCH" {
		t.Fatalf("ranking: %#v", report.Results)
	}
	ru, err := SearchDocumentation(model, "еж cli", 20)
	if err != nil || len(ru.Results) != 1 || ru.Results[0].ID != "" || strings.Join(ru.Results[0].MatchedSections, ",") != "Поиск" {
		t.Fatalf("normalized search: %#v %v words=%#v text=%q words=%#v", ru, err, searchWords("Ёж и Search CLI workflow."), model.DocByPath["guides/plain.md"].PlainText, searchWords(model.DocByPath["guides/plain.md"].PlainText))
	}
}

func TestTaskInitAndScaffoldAtomicCreate(t *testing.T) {
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	if err := os.MkdirAll(filepath.Join(docs, "work"), 0755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, docs, "work/TASK-CLI-999-old.md", "# Existing\n")
	report, err := InitTask(Options{InputDirectory: docs, Area: "CLI", Title: "Next", TaskType: "Bug", Language: "en"})
	if err != nil {
		t.Fatal(err)
	}
	if report.ID != "TASK-CLI-1000" || report.Path != "work/TASK-CLI-1000.md" {
		t.Fatalf("allocation: %#v", report)
	}
	data, _ := os.ReadFile(filepath.Join(docs, filepath.FromSlash(report.Path)))
	if !strings.Contains(string(data), "- Status: Draft") || !strings.Contains(string(data), "## Behavior change") {
		t.Fatalf("english scaffold: %s", data)
	}
	entity, err := Scaffold(Options{InputDirectory: docs, EntityKind: "decision", EntityID: "ADR-002", Title: "Boundary", Language: "ru"})
	if err != nil || entity.Path != "decisions/ADR-002.md" {
		t.Fatalf("scaffold: %#v %v", entity, err)
	}
	if _, err := Scaffold(Options{InputDirectory: docs, EntityKind: "decision", EntityID: "ADR-002", Title: "Overwrite", Language: "ru"}); err == nil {
		t.Fatal("scaffold must not overwrite")
	}
	for _, title := range []string{"Injected\n- Module: MOD-OTHER", "Injected\r\n## Rules"} {
		if _, err := InitTask(Options{InputDirectory: docs, Area: "CLI", Title: title, TaskType: "Feature", Language: "en"}); err == nil {
			t.Fatalf("task init accepted multiline title %q", title)
		}
		if _, err := Scaffold(Options{InputDirectory: docs, EntityKind: "module", EntityID: "MOD-INJECTED", Title: title, Language: "en"}); err == nil {
			t.Fatalf("scaffold accepted multiline title %q", title)
		}
	}
	if _, _, _, err := ParseArguments([]string{"task", "init", docs, "--area", "CLI", "--title", "Injected\nmetadata", "--type", "Feature"}); err == nil {
		t.Fatal("CLI accepted multiline task title")
	}
}

func TestTaskReadyContextAndVerifyDryRun(t *testing.T) {
	root, docs, _ := createFixture(t)
	writeTestFile(t, docs, "work/TASK-AUTH-021.md", completeTaskFixture("Draft"))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	ready := BuildTaskReady(model, "TASK-AUTH-021", false)
	if ready.Status != "contract_ready" || !ready.ContractComplete || ready.ReadyForWork {
		t.Fatalf("draft readiness: %#v", ready)
	}
	if _, err := BuildTaskContext(model, "TASK-AUTH-021"); err == nil {
		t.Fatal("draft context must be rejected")
	}

	writeTestFile(t, docs, "work/TASK-AUTH-021.md", strings.Replace(completeTaskFixture("Draft"), "- Module: MOD-AUTH\n", "", 1))
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	missingModule := BuildTaskReady(model, "TASK-AUTH-021", false)
	if missingModule.Status != "contract_incomplete" || !hasIssueCode(missingModule.Issues, "missing-task-module") {
		t.Fatalf("draft without module passed readiness: %#v", missingModule)
	}

	writeTestFile(t, docs, "work/TASK-AUTH-021.md", strings.Replace(completeTaskFixture("Draft"), "`new.go`", "`new-directory/`", 1))
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	missingDirectory := BuildTaskReady(model, "TASK-AUTH-021", false)
	if missingDirectory.Status != "contract_incomplete" || !hasIssueCode(missingDirectory.Issues, "missing-scope-path") {
		t.Fatalf("missing scope directory passed readiness: %#v", missingDirectory)
	}

	writeTestFile(t, docs, "work/TASK-AUTH-021.md", completeTaskFixture("Ready"))
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	context, err := BuildTaskContext(model, "TASK-AUTH-021")
	if err != nil || context.SchemaVersion != 1 || len(context.RequiredReads) == 0 || context.Task.Before == "" {
		t.Fatalf("context: %#v %v", context, err)
	}
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"task", "verify", "TASK-AUTH-021", docs, "--repository-root", root, "--dry-run", "--format", "json", "--stale-days", "0"}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("code=%d stderr=%s", code, stderr.String())
	}
	var report TaskVerifyReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil || report.Status != "planned" || len(report.Commands) != 1 || report.Commands[0].Status != "planned" {
		t.Fatalf("dry-run: %#v %v\n%s", report, err, stdout.String())
	}
}

func TestTaskVerifyTargetAndUnknownTarget(t *testing.T) {
	root, docs, _ := createFixture(t)
	writeTestFile(t, docs, "work/TASK-AUTH-021.md", completeTaskFixture("Ready"))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{"go version": {}}}
	report := executeTaskVerify(model, Options{
		TaskID: "TASK-AUTH-021", VerifyMode: "run", Target: "AC-01", Format: "json",
	}, io.Discard, io.Discard, runner)
	if report.Status != "passed" || report.FullVerification || len(report.Criteria) != 1 || len(report.Targets) != 1 || strings.Join(runner.commands, ",") != "go version" {
		t.Fatalf("targeted verify: %#v commands=%#v", report, runner.commands)
	}
	blocked := executeTaskVerify(model, Options{
		TaskID: "TASK-AUTH-021", VerifyMode: "dry-run", Target: "AC-99", Format: "json",
	}, io.Discard, io.Discard, runner)
	if blocked.Status != "blocked" || len(blocked.Commands) != 0 {
		t.Fatalf("unknown target: %#v", blocked)
	}
}
