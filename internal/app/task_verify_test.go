package toudocu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeCommandOutcome struct {
	exitCode   int
	stdout     string
	stderr     string
	startError bool
	wait       bool
}

type fakeCommandRunner struct {
	mu       sync.Mutex
	outcomes map[string]fakeCommandOutcome
	commands []string
}

func hasIssueCode(issues []Issue, code string) bool {
	for _, issue := range issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}

func (runner *fakeCommandRunner) Run(ctx context.Context, command, _ string, stdout, stderr io.Writer) (int, error) {
	runner.mu.Lock()
	runner.commands = append(runner.commands, command)
	outcome := runner.outcomes[command]
	runner.mu.Unlock()
	_, _ = io.WriteString(stdout, outcome.stdout)
	_, _ = io.WriteString(stderr, outcome.stderr)
	if outcome.wait {
		<-ctx.Done()
		return -1, ctx.Err()
	}
	if outcome.startError {
		return -1, errors.New("start failed")
	}
	if outcome.exitCode != 0 {
		return outcome.exitCode, errors.New("command failed")
	}
	return 0, nil
}

func taskVerifyFixture(status string, completed bool, commands map[string]string, extra string) string {
	mark := " "
	if completed {
		mark = "x"
	}
	return `# TASK-AUTH-020: Проверить выполнение

- Статус: ` + status + `
- Тип: Feature
- Модуль: MOD-AUTH
- Сценарий: UC-AUTH-01

## Результат

Проверки выполнены и записаны в отчёт.

## Изменение поведения

### Было

Проверки не выполнялись.

### Станет

Проверки выполняются по контракту.

## Область изменения

- ` + "`docs/`" + `

## Не входит в задачу

Изменение поведения.

## Критерии приёмки

- [` + mark + `] ` + "`AC-01`" + ` Первая проверка проходит.
- [` + mark + `] ` + "`AC-02`" + ` Вторая проверка проходит.

## План

1. Подготовить команды.
2. Выполнить проверки.
3. Сформировать отчёт и обновить документацию.

## Проверка

- ` + "`AC-01`" + ` → ` + "`" + commands["AC-01"] + "`" + `
- ` + "`AC-02`" + ` → ` + "`" + commands["AC-02"] + "`" + `
- ` + "`ALL`" + ` → ` + "`" + commands["ALL"] + "`" + `
- ` + "`DOCS`" + ` → ` + "`" + commands["DOCS"] + "`" + `

## Влияние на документацию

Не требуется: тестовая задача.
` + extra
}

func TestTaskVerificationTargetsComeOnlyFromMappingLeftSide(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{
		"AC-01": "make docs-check",
		"AC-02": "printf 'ALL AC-99'",
		"ALL":   "test -f ./docs/index.md",
		"DOCS":  "go run ./cmd/toudocu check ./docs --strict",
	}
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture("Готово к работе", false, commands, ""))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	ready := BuildTaskReady(model, "TASK-AUTH-020", false)
	if !ready.ContractComplete || !ready.ReadyForWork {
		t.Fatalf("command target names made the contract invalid: %#v", ready)
	}
	item, err := findWorkItem(model, "TASK-AUTH-020")
	if err != nil {
		t.Fatal(err)
	}
	if len(item.Checks) != len(commands) {
		t.Fatalf("unexpected checks: %#v", item.Checks)
	}
	for _, check := range item.Checks {
		if got := strings.Join(check.Commands, "\n"); got != commands[check.Target] {
			t.Fatalf("%s command = %q, want %q", check.Target, got, commands[check.Target])
		}
	}
	report := executeTaskVerify(model, Options{
		TaskID: "TASK-AUTH-020", VerifyMode: "dry-run", Target: "AC-01", Format: "json",
	}, io.Discard, io.Discard, &fakeCommandRunner{})
	if report.Status != "planned" || len(report.Commands) != 1 || report.Commands[0].Command != commands["AC-01"] {
		t.Fatalf("targeted dry-run: %#v", report)
	}
}

func TestTaskVerificationStillRejectsMultipleLeftSideTargets(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	content := strings.Replace(
		taskVerifyFixture("Готово к работе", false, commands, ""),
		"- `AC-01` → `pass`",
		"- `AC-01` `DOCS` → `pass`",
		1,
	)
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", content)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	if !hasIssueCode(model.Issues, "ambiguous-verification-target") {
		t.Fatalf("multiple left-side targets were accepted: %#v", model.Issues)
	}
}

func TestTaskVerificationLegacyCodeSpansWithoutArrow(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "make docs-check", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	content := strings.Replace(
		taskVerifyFixture("Готово к работе", false, commands, ""),
		"- `AC-01` → `make docs-check`",
		"- `AC-01` `make docs-check`",
		1,
	)
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", content)
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	ready := BuildTaskReady(model, "TASK-AUTH-020", false)
	if !ready.ContractComplete || !ready.ReadyForWork {
		t.Fatalf("legacy code-span mapping failed: %#v", ready)
	}
}

func TestExecuteTaskVerifyDeduplicatesAndContinues(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "fail", "DOCS": "timeout"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture("В работе", false, commands, ""))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{
		"pass":    {stdout: strings.Repeat("x", taskOutputLimit+5)},
		"fail":    {exitCode: 2, stderr: "failed\n"},
		"timeout": {wait: true},
	}}
	report := executeTaskVerify(model, Options{TaskID: "TASK-AUTH-020", VerifyMode: "run", Format: "json", Timeout: 50 * time.Millisecond}, io.Discard, io.Discard, runner)
	if report.Status != "failed" || !report.FullVerification || len(report.Commands) != 3 {
		t.Fatalf("unexpected report: %#v", report)
	}
	if strings.Join(runner.commands, ",") != "pass,fail,timeout" {
		t.Fatalf("commands: %#v", runner.commands)
	}
	if len(report.Commands[0].Targets) != 2 || report.Commands[0].Status != "passed" || report.Commands[1].Status != "failed" || report.Commands[2].Status != "timed_out" {
		t.Fatalf("statuses: %s, %s, %s", report.Commands[0].Status, report.Commands[1].Status, report.Commands[2].Status)
	}
	if !report.Commands[0].StdoutTruncated || len(report.Commands[0].Stdout) != taskOutputLimit {
		t.Fatalf("stdout was not bounded: %d %#v", len(report.Commands[0].Stdout), report.Commands[0])
	}
	if report.Summary.PassedCommands != 1 || report.Summary.FailedCommands != 2 || report.Summary.TimedOutCommands != 1 || report.Summary.CriteriaPassed != 2 {
		t.Fatalf("summary: %#v", report.Summary)
	}
}

func TestExecuteTaskVerifyReportsStartError(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "start", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture("В работе", false, commands, ""))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{
		"start": {startError: true},
		"pass":  {},
	}}
	report := executeTaskVerify(model, Options{TaskID: "TASK-AUTH-020", VerifyMode: "run", Format: "json"}, io.Discard, io.Discard, runner)
	if report.Status != "failed" || report.Commands[0].Status != "start_error" || report.Commands[0].ExitCode != nil || len(runner.commands) != 2 {
		t.Fatalf("report: %#v commands=%#v", report, runner.commands)
	}
}

func TestTaskVerifyValidationGateIsTaskLocal(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture("В работе", false, commands, ""))
	writeTestFile(t, docs, "modules/duplicate.md", "# Duplicate\n\n- Идентификатор: MOD-AUTH\n- Статус: В работе\n\nDuplicate module.\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{"pass": {}}}
	report := executeTaskVerify(model, Options{TaskID: "TASK-AUTH-020", VerifyMode: "run", Format: "json"}, io.Discard, io.Discard, runner)
	if report.Status != "blocked" || len(report.ValidationIssues) == 0 || len(report.Issues) == 0 || len(runner.commands) != 0 {
		t.Fatalf("linked duplicate ID must block task: %#v %#v", report, runner.commands)
	}

	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", strings.Replace(taskVerifyFixture("В работе", false, commands, ""), "`docs/`", "`missing/`", 1))
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner = &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{"pass": {}}}
	report = executeTaskVerify(model, Options{TaskID: "TASK-AUTH-020", VerifyMode: "run", Format: "json"}, io.Discard, io.Discard, runner)
	if report.Status != "blocked" || len(report.ValidationIssues) == 0 || len(runner.commands) != 0 {
		t.Fatalf("task-local issue did not block: %#v %#v", report, runner.commands)
	}
}

func TestTaskVerifyRunRejectsDraftAndCancelled(t *testing.T) {
	for _, status := range []string{"Черновик", "Отменено"} {
		t.Run(status, func(t *testing.T) {
			root, docs, _ := createFixture(t)
			commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
			extra := ""
			if status == "Отменено" {
				extra = "\n## Причина отмены\n\nРабота отменена.\n"
			}
			writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture(status, false, commands, extra))
			model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
			if err != nil {
				t.Fatal(err)
			}
			runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{"pass": {}}}
			report := executeTaskVerify(model, Options{TaskID: "TASK-AUTH-020", VerifyMode: "run", Format: "json"}, io.Discard, io.Discard, runner)
			if report.Status != "blocked" || !hasIssueCode(report.ValidationIssues, "invalid-task-verify-state") {
				t.Fatalf("run must be blocked for %s: %#v", status, report)
			}
			if len(runner.commands) != 0 {
				t.Fatalf("commands executed for %s: %#v", status, runner.commands)
			}
		})
	}
}

func TestTaskVerifyCLIJSONAndReportFile(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "go version", "AC-02": "go version", "ALL": "go version", "DOCS": "go version"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture("Готово к работе", false, commands, ""))
	reportPath := filepath.Join(root, "reports", "task.json")
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{
		"task", "verify", "TASK-AUTH-020", docs, "--run",
		"--repository-root", root, "--format", "json", "--report", reportPath, "--timeout", "30s", "--stale-days", "0",
	}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("code=%d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var report TaskVerifyReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("stdout is not pure JSON: %v\n%s", err, stdout.String())
	}
	if report.SchemaVersion != 1 || report.Status != "passed" || len(report.Commands) != 1 || len(report.Commands[0].Targets) != 4 {
		t.Fatalf("report: %#v", report)
	}
	fileData, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatal(err)
	}
	var fileReport TaskVerifyReport
	if err := json.Unmarshal(fileData, &fileReport); err != nil || fileReport.Task.ID != report.Task.ID {
		t.Fatalf("saved report: %v %#v", err, fileReport)
	}
}

func TestTaskContextCLIJSONDoesNotExecuteCommands(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{
		"AC-01": "command-that-must-never-execute",
		"AC-02": "command-that-must-never-execute",
		"ALL":   "command-that-must-never-execute",
		"DOCS":  "command-that-must-never-execute",
	}
	writeTestFile(t, docs, "work/TASK-AUTH-020-context.md", taskVerifyFixture("Готово к работе", false, commands, ""))

	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{
		"task", "context", "TASK-AUTH-020", docs,
		"--repository-root", root, "--format", "json", "--stale-days", "0",
	}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("code=%d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var report TaskContextReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("stdout is not task context JSON: %v\n%s", err, stdout.String())
	}
	if report.Kind != "task-context" || report.Task.ID != "TASK-AUTH-020" || report.Module == nil || report.UseCase == nil {
		t.Fatalf("context: %#v", report)
	}
	if len(report.BusinessRules) != 1 || report.BusinessRules[0].ID != "BR-AUTH-001" || report.Documents == nil || report.Dependencies == nil || report.Dependents == nil || report.Issues == nil {
		t.Fatalf("incomplete or unstable context: %#v", report)
	}
}

func TestOrdinaryCheckDoesNotExecuteTaskCommands(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{
		"AC-01": "command-that-must-never-execute",
		"AC-02": "command-that-must-never-execute",
		"ALL":   "command-that-must-never-execute",
		"DOCS":  "command-that-must-never-execute",
	}
	writeTestFile(t, docs, "work/TASK-AUTH-020-verify.md", taskVerifyFixture("Черновик", false, commands, ""))
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"check", docs, "--repository-root", root, "--stale-days", "0"}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "Errors: 0") {
		t.Fatalf("ordinary check attempted execution or failed: code=%d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
}

func TestTailBufferKeepsLastBytes(t *testing.T) {
	buffer := newTailBuffer(5)
	_, _ = buffer.Write([]byte("abc"))
	_, _ = buffer.Write([]byte("defg"))
	value, truncated := buffer.snapshot()
	if value != "cdefg" || !truncated {
		t.Fatalf("value=%q truncated=%v", value, truncated)
	}
}
