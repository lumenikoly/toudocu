package docgent

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

func taskCheckFixture(status string, completed bool, commands map[string]string, extra string) string {
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

func TestExecuteTaskCheckDeduplicatesAndContinues(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "fail", "DOCS": "timeout"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", taskCheckFixture("В работе", false, commands, ""))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{
		"pass":    {stdout: strings.Repeat("x", taskOutputLimit+5)},
		"fail":    {exitCode: 2, stderr: "failed\n"},
		"timeout": {wait: true},
	}}
	report := executeTaskCheck(model, Options{TaskID: "TASK-AUTH-020", Format: "json", Timeout: 50 * time.Millisecond}, io.Discard, io.Discard, runner)
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

func TestExecuteTaskCheckReportsStartError(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "start", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", taskCheckFixture("Черновик", false, commands, ""))
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{
		"start": {startError: true},
		"pass":  {},
	}}
	report := executeTaskCheck(model, Options{TaskID: "TASK-AUTH-020", Format: "json"}, io.Discard, io.Discard, runner)
	if report.Status != "failed" || report.Commands[0].Status != "start_error" || report.Commands[0].ExitCode != nil || len(runner.commands) != 2 {
		t.Fatalf("report: %#v commands=%#v", report, runner.commands)
	}
}

func TestTaskCheckValidationGateIsTaskLocal(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "pass", "AC-02": "pass", "ALL": "pass", "DOCS": "pass"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", taskCheckFixture("Отменено", false, commands, "\n## Причина отмены\n\nПроверяется допустимость запуска для любого статуса.\n"))
	writeTestFile(t, docs, "modules/duplicate.md", "# Duplicate\n\n- Идентификатор: MOD-AUTH\n- Статус: В работе\n\nDuplicate module.\n")
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{"pass": {}}}
	report := executeTaskCheck(model, Options{TaskID: "TASK-AUTH-020", Format: "json"}, io.Discard, io.Discard, runner)
	if report.Status != "passed" || len(report.ValidationIssues) != 0 || len(report.Issues) == 0 || len(runner.commands) != 1 {
		t.Fatalf("unrelated issue blocked task: %#v %#v", report, runner.commands)
	}

	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", strings.Replace(taskCheckFixture("В работе", false, commands, ""), "`docs/`", "`missing/`", 1))
	model, err = BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	runner = &fakeCommandRunner{outcomes: map[string]fakeCommandOutcome{"pass": {}}}
	report = executeTaskCheck(model, Options{TaskID: "TASK-AUTH-020", Format: "json"}, io.Discard, io.Discard, runner)
	if report.Status != "blocked" || len(report.ValidationIssues) == 0 || len(runner.commands) != 0 {
		t.Fatalf("task-local issue did not block: %#v %#v", report, runner.commands)
	}
}

func TestTaskCheckCLIJSONAndReportFile(t *testing.T) {
	root, docs, _ := createFixture(t)
	commands := map[string]string{"AC-01": "go version", "AC-02": "go version", "ALL": "go version", "DOCS": "go version"}
	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", taskCheckFixture("Черновик", false, commands, ""))
	reportPath := filepath.Join(root, "reports", "task.json")
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{
		"task", "check", "TASK-AUTH-020", docs,
		"--repository-root", root, "--format", "json", "--report", reportPath, "--timeout", "30s", "--stale-days", "0",
	}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("code=%d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var report TaskCheckReport
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
	var fileReport TaskCheckReport
	if err := json.Unmarshal(fileData, &fileReport); err != nil || fileReport.Task.ID != report.Task.ID {
		t.Fatalf("saved report: %v %#v", err, fileReport)
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
	writeTestFile(t, docs, "work/TASK-AUTH-020-check.md", taskCheckFixture("Черновик", false, commands, ""))
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"check", docs, "--repository-root", root, "--stale-days", "0"}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "Ошибок: 0") {
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
