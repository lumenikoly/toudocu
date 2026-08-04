package docgent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const taskOutputLimit = 1 << 20

type commandRunner interface {
	Run(context.Context, string, string, io.Writer, io.Writer) (int, error)
}

type osCommandRunner struct{}

func (osCommandRunner) Run(ctx context.Context, command, directory string, stdout, stderr io.Writer) (int, error) {
	cmd := newShellCommand(ctx, command)
	cmd.Dir = directory
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	err := cmd.Run()
	if err == nil {
		return 0, nil
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return exitError.ExitCode(), err
	}
	return -1, err
}

type tailBuffer struct {
	mu        sync.Mutex
	data      []byte
	limit     int
	truncated bool
}

func newTailBuffer(limit int) *tailBuffer {
	return &tailBuffer{limit: limit}
}

func (buffer *tailBuffer) Write(data []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	originalLength := len(data)
	if buffer.limit <= 0 {
		buffer.truncated = buffer.truncated || originalLength > 0
		return originalLength, nil
	}
	if len(data) >= buffer.limit {
		buffer.data = append(buffer.data[:0], data[len(data)-buffer.limit:]...)
		buffer.truncated = true
		return originalLength, nil
	}
	if len(buffer.data)+len(data) > buffer.limit {
		drop := len(buffer.data) + len(data) - buffer.limit
		buffer.data = append(buffer.data[:0], buffer.data[drop:]...)
		buffer.truncated = true
	}
	buffer.data = append(buffer.data, data...)
	return originalLength, nil
}

func (buffer *tailBuffer) snapshot() (string, bool) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return string(append([]byte{}, buffer.data...)), buffer.truncated
}

type plannedCommand struct {
	Command string
	Targets []string
}

func planTaskCommands(item WorkItem) ([]plannedCommand, bool) {
	commands := []plannedCommand{}
	byCommand := map[string]int{}
	targets := map[string]bool{}
	for _, check := range item.Checks {
		targets[check.Target] = true
		for _, command := range check.Commands {
			command = strings.TrimSpace(command)
			if command == "" {
				continue
			}
			if index, exists := byCommand[command]; exists {
				commands[index].Targets = uniqueStrings(append(commands[index].Targets, check.Target))
				continue
			}
			byCommand[command] = len(commands)
			commands = append(commands, plannedCommand{Command: command, Targets: []string{check.Target}})
		}
	}
	return commands, targets["ALL"] && targets["DOCS"]
}

func taskCheckValidation(model *Model, taskID string, strict bool) (*WorkItem, []Issue) {
	item, err := findWorkItem(model, taskID)
	if err != nil {
		return nil, []Issue{{Severity: "error", Code: "task-selection-failed", Message: err.Error()}}
	}
	issues := []Issue{}
	for _, issue := range model.Issues {
		if issue.DocumentPath != item.Document {
			continue
		}
		if issue.Severity == "error" || (strict && issue.Severity == "warning") {
			issues = append(issues, issue)
		}
	}
	commands, _ := planTaskCommands(*item)
	if len(commands) == 0 {
		issues = append(issues, Issue{
			Severity: "error", Code: "missing-task-command",
			Message: "У задачи отсутствуют исполняемые команды проверки.", DocumentPath: item.Document, Line: item.line,
		})
	}
	return item, issues
}

func taskSnapshot(item *WorkItem, requestedID string) TaskCheckTask {
	if item == nil {
		return TaskCheckTask{ID: requestedID}
	}
	return TaskCheckTask{
		ID: item.ID, Title: item.Title, Status: item.Status, Type: item.Type, Document: item.Document,
	}
}

func aggregateTargetStatus(target string, commands []CommandExecutionResult) string {
	found := false
	for _, command := range commands {
		if !containsString(command.Targets, target) {
			continue
		}
		found = true
		if command.Status != "passed" {
			return "failed"
		}
	}
	if !found {
		return "not_run"
	}
	return "passed"
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func finishTaskCheckReport(report *TaskCheckReport, item *WorkItem) {
	report.FinishedAt = time.Now().UTC()
	report.DurationMillis = report.FinishedAt.Sub(report.StartedAt).Milliseconds()
	report.Summary.TotalCommands = len(report.Commands)
	failed := false
	for _, command := range report.Commands {
		switch command.Status {
		case "passed":
			report.Summary.PassedCommands++
		case "timed_out":
			report.Summary.TimedOutCommands++
			report.Summary.FailedCommands++
			failed = true
		default:
			report.Summary.FailedCommands++
			failed = true
		}
	}
	if item != nil {
		for _, criterion := range item.Verification {
			status := aggregateTargetStatus(criterion.CriterionID, report.Commands)
			report.Criteria = append(report.Criteria, CriterionExecutionResult{
				ID: criterion.CriterionID, Description: criterion.Criterion,
				DocumentCompleted: criterion.Completed, Status: status,
			})
			if status == "passed" {
				report.Summary.CriteriaPassed++
			} else {
				report.Summary.CriteriaFailed++
			}
		}
		seenTargets := map[string]bool{}
		for _, check := range item.Checks {
			if seenTargets[check.Target] {
				continue
			}
			seenTargets[check.Target] = true
			report.Targets = append(report.Targets, TargetExecutionResult{
				Target: check.Target, Status: aggregateTargetStatus(check.Target, report.Commands),
			})
		}
	}
	switch {
	case len(report.ValidationIssues) > 0:
		report.Status = "blocked"
	case failed:
		report.Status = "failed"
	default:
		report.Status = "passed"
	}
}

func executeTaskCheck(model *Model, options Options, stdout, stderr io.Writer, runner commandRunner) TaskCheckReport {
	startedAt := time.Now().UTC()
	item, validationIssues := taskCheckValidation(model, options.TaskID, options.Strict)
	report := TaskCheckReport{
		SchemaVersion: 1, Kind: "task-check",
		Generator: GeneratorInfo{Name: "Docgent", Version: Version},
		Task:      taskSnapshot(item, options.TaskID), StartedAt: startedAt,
		ValidationIssues: append([]Issue{}, validationIssues...),
		Issues:           append([]Issue{}, model.Issues...),
		Commands:         []CommandExecutionResult{},
		Criteria:         []CriterionExecutionResult{},
		Targets:          []TargetExecutionResult{},
	}
	if item != nil {
		_, report.FullVerification = planTaskCommands(*item)
	}
	if item == nil || len(validationIssues) > 0 {
		finishTaskCheckReport(&report, item)
		return report
	}
	commands, _ := planTaskCommands(*item)
	timeout := options.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	for index, planned := range commands {
		if options.Format != "json" {
			fmt.Fprintf(stdout, "\n[%d/%d] %s\n", index+1, len(commands), planned.Command)
		}
		stdoutBuffer := newTailBuffer(taskOutputLimit)
		stderrBuffer := newTailBuffer(taskOutputLimit)
		commandStdout, commandStderr := io.Writer(stdoutBuffer), io.Writer(stderrBuffer)
		if options.Format != "json" {
			commandStdout = io.MultiWriter(stdout, stdoutBuffer)
			commandStderr = io.MultiWriter(stderr, stderrBuffer)
		}
		commandStarted := time.Now().UTC()
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		exitCode, err := runner.Run(ctx, planned.Command, model.RepositoryRoot, commandStdout, commandStderr)
		timedOut := ctx.Err() == context.DeadlineExceeded
		cancel()
		commandFinished := time.Now().UTC()
		status := "passed"
		if timedOut {
			status = "timed_out"
		} else if err != nil && exitCode < 0 {
			status = "start_error"
		} else if err != nil || exitCode != 0 {
			status = "failed"
		}
		var exitCodePointer *int
		if status == "passed" || status == "failed" {
			value := exitCode
			exitCodePointer = &value
		}
		capturedStdout, stdoutTruncated := stdoutBuffer.snapshot()
		capturedStderr, stderrTruncated := stderrBuffer.snapshot()
		report.Commands = append(report.Commands, CommandExecutionResult{
			Sequence: index + 1, Command: planned.Command, Targets: planned.Targets,
			Status: status, ExitCode: exitCodePointer, StartedAt: commandStarted, FinishedAt: commandFinished,
			DurationMillis: commandFinished.Sub(commandStarted).Milliseconds(),
			Stdout:         capturedStdout, Stderr: capturedStderr,
			StdoutTruncated: stdoutTruncated, StderrTruncated: stderrTruncated,
		})
	}
	finishTaskCheckReport(&report, item)
	return report
}

func marshalTaskCheckReport(report TaskCheckReport) ([]byte, error) {
	return json.MarshalIndent(report, "", "  ")
}

func writeReportAtomically(target string, data []byte) error {
	target, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	directory := filepath.Dir(target)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".docgent-task-report-*")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer func() { _ = os.Remove(temporaryName) }()
	if err := temporary.Chmod(0600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, target); err == nil {
		return nil
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(temporaryName, target)
}

func printTaskCheckText(stdout io.Writer, report TaskCheckReport) {
	fmt.Fprintf(stdout, "\nЗадача: %s\nСтатус проверки: %s\nКоманд: %d, успешно: %d, с ошибкой: %d\nКритериев успешно: %d, неуспешно: %d\n",
		report.Task.ID, report.Status, report.Summary.TotalCommands, report.Summary.PassedCommands,
		report.Summary.FailedCommands, report.Summary.CriteriaPassed, report.Summary.CriteriaFailed)
	for _, issue := range report.ValidationIssues {
		fmt.Fprintf(stdout, "[%s] %s — %s\n", strings.ToUpper(issue.Severity), issue.Code, issue.Message)
	}
}
