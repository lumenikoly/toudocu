package toudocu

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func runAgentCLI(argv []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(argv) == 0 || argv[0] != "agent" {
		return -1
	}
	if len(argv) == 1 || argv[1] == "--help" || argv[1] == "-h" {
		printAgentHelp(stdout)
		return 0
	}
	operation := argv[1]
	if operation != "next" && operation != "respond" {
		return writeAgentCLIError(stderr, false, "AGENT_INVALID_MESSAGE", "agent supports next or respond")
	}
	repositoryRoot, inputPath, jsonOutput := "", "", false
	for index := 2; index < len(argv); index++ {
		switch argument := argv[index]; {
		case argument == "--json":
			jsonOutput = true
		case argument == "--repository-root":
			if index+1 >= len(argv) || strings.HasPrefix(argv[index+1], "-") {
				return writeAgentCLIError(stderr, jsonOutput, "AGENT_INVALID_PATH", "--repository-root requires DIR")
			}
			index++
			repositoryRoot = argv[index]
		case strings.HasPrefix(argument, "--repository-root="):
			repositoryRoot = strings.TrimPrefix(argument, "--repository-root=")
		case argument == "--input":
			if index+1 >= len(argv) || strings.HasPrefix(argv[index+1], "-") {
				return writeAgentCLIError(stderr, jsonOutput, "AGENT_INVALID_MESSAGE", "--input requires a JSON file")
			}
			index++
			inputPath = argv[index]
		case strings.HasPrefix(argument, "--input="):
			inputPath = strings.TrimPrefix(argument, "--input=")
		case argument == "--help" || argument == "-h":
			printAgentHelp(stdout)
			return 0
		default:
			return writeAgentCLIError(stderr, jsonOutput, "AGENT_INVALID_MESSAGE", "unknown option: "+argument)
		}
	}
	if operation == "next" && !jsonOutput {
		return writeAgentCLIError(stderr, false, "AGENT_INVALID_MESSAGE", "agent next requires --json")
	}
	if operation == "next" && inputPath != "" {
		return writeAgentCLIError(stderr, true, "AGENT_INVALID_MESSAGE", "agent next does not accept --input")
	}
	root, err := resolveReviewCLIRoot(repositoryRoot)
	if err != nil {
		return writeAgentCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	service, err := newReviewService(Options{RepositoryRoot: root})
	if err != nil {
		return writeAgentCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	if operation == "next" {
		request, nextErr := service.claimNext()
		if nextErr != nil {
			return writeAgentCLIError(stderr, true, reviewErrorCode(nextErr), nextErr.Error())
		}
		return writeAgentJSON(stdout, request)
	}
	content, err := readAgentResponseInput(inputPath, stdin)
	if err != nil {
		return writeAgentCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	var response AgentResponse
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&response); err != nil {
		return writeAgentCLIError(stderr, jsonOutput, "AGENT_INVALID_MESSAGE", "invalid response JSON: "+err.Error())
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return writeAgentCLIError(stderr, jsonOutput, "AGENT_INVALID_MESSAGE", "response JSON must contain exactly one object")
	}
	if err := reviewResponseSize(response); err != nil {
		return writeAgentCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	state, err := service.respond(response)
	if err != nil {
		return writeAgentCLIError(stderr, jsonOutput, reviewErrorCode(err), err.Error())
	}
	ack := map[string]any{"schemaVersion": reviewSchemaVersion, "accepted": true, "revision": state.Revision, "stateDigest": state.StateDigest}
	if jsonOutput {
		return writeAgentJSON(stdout, ack)
	}
	fmt.Fprintf(stdout, "Ответ для %s принят.\n", response.DeliveryID)
	return 0
}

func readAgentResponseInput(inputPath string, stdin io.Reader) ([]byte, error) {
	reader := stdin
	var file *os.File
	if inputPath != "" {
		absolute, err := filepath.Abs(inputPath)
		if err != nil {
			return nil, agentFailure("AGENT_INVALID_PATH", 400, err.Error())
		}
		info, err := os.Lstat(absolute)
		if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return nil, agentFailure("AGENT_INVALID_PATH", 400, "--input must be a regular non-symlink JSON file")
		}
		if info.Size() > reviewResponseLimit {
			return nil, agentFailure("AGENT_PAYLOAD_TOO_LARGE", 413, "agent response exceeds 64 KiB")
		}
		file, err = os.Open(absolute)
		if err != nil {
			return nil, err
		}
		defer file.Close()
		reader = file
	}
	if reader == nil {
		return nil, agentFailure("AGENT_INVALID_MESSAGE", 400, "agent respond requires JSON on stdin or --input")
	}
	content, err := io.ReadAll(io.LimitReader(reader, reviewResponseLimit+1))
	if err != nil {
		return nil, err
	}
	if len(content) > reviewResponseLimit {
		return nil, agentFailure("AGENT_PAYLOAD_TOO_LARGE", 413, "agent response exceeds 64 KiB")
	}
	return content, nil
}

func resolveReviewCLIRoot(requested string) (string, error) {
	if strings.TrimSpace(requested) == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return "", err
		}
		probe := execGit(cwd, "rev-parse", "--show-toplevel")
		if probe.err != nil {
			return "", agentFailure("AGENT_INVALID_PATH", 400, "current directory is not inside an available Git repository")
		}
		requested = strings.TrimSpace(string(probe.out))
	}
	g, err := openGitRepositorySource(requested, 60)
	if err != nil {
		return "", mapReviewPathError(err)
	}
	return g.root, nil
}

func printAgentHelp(w io.Writer) {
	fmt.Fprint(w, `Читает локальную очередь Toudocu и сохраняет структурированный ответ.

Использование:
  toudocu agent next [--repository-root DIR] --json
  toudocu agent respond [--input response.json] [--repository-root DIR] [--json]

Без --input команда respond читает один JSON-объект из stdin.
Команды не запускают языковую модель и не записывают файлы репозитория.
`)
}

func reviewErrorCode(err error) string {
	var failure *reviewFailure
	if errors.As(err, &failure) {
		return failure.Code
	}
	return "AGENT_STATE_CORRUPTED"
}

func writeAgentJSON(w io.Writer, value any) int {
	data, _ := json.MarshalIndent(value, "", "  ")
	fmt.Fprintln(w, string(data))
	return 0
}

func writeAgentCLIError(w io.Writer, jsonOutput bool, code, message string) int {
	if jsonOutput {
		data, _ := json.Marshal(map[string]any{"schemaVersion": reviewSchemaVersion, "diagnostics": []Issue{{Severity: "error", Code: code, Message: message}}})
		fmt.Fprintln(w, string(data))
	} else {
		fmt.Fprintf(w, "Error %s: %s\n", code, message)
	}
	return 1
}
