package toudocu

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func runReviewFeedbackCLI(argv []string, stdout, stderr io.Writer) int {
	if len(argv) < 3 || argv[0] != "changes" || argv[1] != "feedback" {
		return -1
	}
	operation := argv[2]
	if operation == "--help" || operation == "-h" {
		printReviewFeedbackHelp(stdout)
		return 0
	}
	if operation != "pending" && operation != "respond" {
		fmt.Fprintln(stderr, "Error: changes feedback supports pending or respond")
		return 1
	}
	repositoryRoot, inputPath, jsonOutput := "", "", false
	args := argv[3:]
	for index := 0; index < len(args); index++ {
		switch argument := args[index]; {
		case argument == "--json":
			jsonOutput = true
		case argument == "--repository-root":
			if index+1 >= len(args) || strings.HasPrefix(args[index+1], "-") {
				return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_REQUEST", "--repository-root requires DIR")
			}
			index++
			repositoryRoot = args[index]
		case strings.HasPrefix(argument, "--repository-root="):
			repositoryRoot = strings.TrimPrefix(argument, "--repository-root=")
		case argument == "--input":
			if index+1 >= len(args) || strings.HasPrefix(args[index+1], "-") {
				return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_REQUEST", "--input requires a JSON file")
			}
			index++
			inputPath = args[index]
		case strings.HasPrefix(argument, "--input="):
			inputPath = strings.TrimPrefix(argument, "--input=")
		case argument == "--help" || argument == "-h":
			printReviewFeedbackHelp(stdout)
			return 0
		default:
			return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_REQUEST", "unknown option: "+argument)
		}
	}
	if operation == "pending" && !jsonOutput {
		return writeReviewCLIError(stderr, false, "REVIEW_INVALID_REQUEST", "pending requires --json")
	}
	if operation == "pending" && inputPath != "" || operation == "respond" && inputPath == "" {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_REQUEST", "respond requires --input; pending does not accept it")
	}
	root, err := resolveReviewCLIRoot(repositoryRoot)
	if err != nil {
		return writeReviewCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	service, err := newReviewService(Options{RepositoryRoot: root})
	if err != nil {
		return writeReviewCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	if operation == "pending" {
		envelope, pendingErr := service.pendingFeedback()
		if pendingErr != nil {
			return writeReviewCLIError(stderr, true, reviewErrorCode(pendingErr), pendingErr.Error())
		}
		data, _ := json.MarshalIndent(envelope, "", "  ")
		fmt.Fprintln(stdout, string(data))
		return 0
	}
	inputAbsolute, err := filepath.Abs(inputPath)
	if err != nil {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_RESPONSE", err.Error())
	}
	info, err := os.Lstat(inputAbsolute)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_RESPONSE", "--input must be a regular non-symlink JSON file")
	}
	if info.Size() > reviewResponseLimit {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_RESPONSE", "response exceeds 1 MiB")
	}
	content, err := os.ReadFile(inputAbsolute)
	if err != nil {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_RESPONSE", err.Error())
	}
	var response AgentFeedbackResponse
	decoder := json.NewDecoder(strings.NewReader(string(content)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&response); err != nil {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_RESPONSE", "invalid response JSON: "+err.Error())
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return writeReviewCLIError(stderr, jsonOutput, "REVIEW_INVALID_RESPONSE", "response JSON must contain exactly one object")
	}
	if err := reviewResponseSize(response); err != nil {
		return writeReviewCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	state, err := service.respond(response)
	if err != nil {
		return writeReviewCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	if jsonOutput {
		data, _ := json.MarshalIndent(map[string]any{"schemaVersion": reviewSchemaVersion, "accepted": true, "revision": state.Revision, "stateDigest": state.StateDigest}, "", "  ")
		fmt.Fprintln(stdout, string(data))
	} else {
		fmt.Fprintf(stdout, "Feedback %s принят: %d результатов\n", response.FeedbackID, len(response.Results))
	}
	return 0
}

func resolveReviewCLIRoot(requested string) (string, error) {
	if strings.TrimSpace(requested) == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return "", err
		}
		probe := execGit(cwd, "rev-parse", "--show-toplevel")
		if probe.err != nil {
			return "", &reviewFailure{Code: "REVIEW_GIT_UNAVAILABLE", Status: 503, Message: "current directory is not inside an available Git repository"}
		}
		requested = strings.TrimSpace(string(probe.out))
	}
	g, err := openGitRepositorySource(requested, 60)
	if err != nil {
		return "", err
	}
	return g.root, nil
}

func printReviewFeedbackHelp(w io.Writer) {
	fmt.Fprint(w, `Передаёт локальные review snapshots между Changes и установленным AI-skill.

Использование:
  toudocu changes feedback pending [--repository-root DIR] --json
  toudocu changes feedback respond --input response.json [--repository-root DIR] [--json]

pending возвращает oldest FIFO snapshot и повторяет его до успешного полного respond.
Команды не запускают агента и не изменяют Git.
`)
}

func reviewErrorCode(err error) string {
	if failure, ok := err.(*reviewFailure); ok {
		return failure.Code
	}
	return "REVIEW_INTERNAL"
}

func writeReviewCLIError(w io.Writer, jsonOutput bool, code, message string) int {
	if jsonOutput {
		data, _ := json.Marshal(map[string]any{"schemaVersion": reviewSchemaVersion, "diagnostics": []Issue{{Severity: "error", Code: code, Message: message}}})
		fmt.Fprintln(w, string(data))
	} else {
		fmt.Fprintf(w, "Error %s: %s\n", code, message)
	}
	return 1
}
