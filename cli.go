package docgent

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func PrintHelp(w io.Writer) {
	fmt.Fprintf(w, `Docgent %s

Использование:
  docgent [build] [каталог-документации] [параметры]
  docgent check [каталог-документации] [параметры]
  docgent task check TASK-ID [каталог-документации] [параметры]
  docgent task context TASK-ID [каталог-документации] [параметры]
  docgent init [каталог-документации] [--force]
  docgent version

Примеры:
  docgent build ./docs --output ./build/project-docs --clean
  docgent check ./docs --strict
  docgent task check TASK-CORE-001 ./docs --format json
  docgent task context TASK-CORE-001 ./docs --format json
  docgent init ./docs

Параметры:
  -o, --output <каталог>       Выходной каталог
  -t, --title <название>       Переопределить название проекта
      --exclude <пути>         Исключить пути, через запятую или повторением
      --stale-days <число>     Порог устаревания; 0 отключает проверку
      --repository-root <путь> Корень репозитория для ссылок на код
      --repository-url <url>   URL GitHub-репозитория
      --repository-ref <ref>   Точный git ref, по умолчанию main
      --clean                  Очистить выходной каталог
      --open                   Открыть результат в браузере
      --strict                 Предупреждения дают ненулевой exit code
      --format text|json       Формат check, task context и task check
      --report <файл>          Сохранить JSON-отчёт task check
      --timeout <duration>     Timeout каждой команды task check, по умолчанию 10m
      --force                  Перезаписать шаблоны при init
  -h, --help                   Справка
  -v, --version                Версия
`, Version)
}

func takeArgValue(args []string, index *int, option string) (string, error) {
	if *index+1 >= len(args) || strings.HasPrefix(args[*index+1], "-") {
		return "", fmt.Errorf("для параметра %s требуется значение", option)
	}
	*index++
	return args[*index], nil
}

// ParseArguments parses both the backwards-compatible build form and explicit subcommands.
func ParseArguments(argv []string) (Options, bool, bool, error) {
	options := Options{Command: "build", StaleDays: 90, RepositoryRef: "main", Format: "text", Timeout: 10 * time.Minute}
	help, version := false, false
	timeoutSpecified := false
	args := append([]string{}, argv...)
	if len(args) > 0 {
		switch args[0] {
		case "build", "check", "init":
			options.Command = args[0]
			args = args[1:]
		case "version":
			version = true
			args = args[1:]
		case "help":
			help = true
			args = args[1:]
		case "task":
			if len(args) < 3 {
				return options, false, false, fmt.Errorf("использование: docgent task check|context TASK-ID [каталог-документации]")
			}
			switch args[1] {
			case "check":
				options.Command = "task-check"
			case "context":
				options.Command = "task-context"
			default:
				return options, false, false, fmt.Errorf("использование: docgent task check|context TASK-ID [каталог-документации]")
			}
			options.TaskID = args[2]
			args = args[3:]
		}
	}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--":
			if i+1 < len(args) && options.InputDirectory == "" {
				options.InputDirectory = args[i+1]
			}
			i = len(args)
		case arg == "-h" || arg == "--help":
			help = true
		case arg == "-v" || arg == "--version":
			version = true
		case arg == "-o" || arg == "--output":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.OutputDirectory = v
		case strings.HasPrefix(arg, "--output="):
			options.OutputDirectory = strings.TrimPrefix(arg, "--output=")
		case arg == "-t" || arg == "--title":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Title = v
		case strings.HasPrefix(arg, "--title="):
			options.Title = strings.TrimPrefix(arg, "--title=")
		case arg == "--exclude":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Excludes = append(options.Excludes, splitCSV(v)...)
		case strings.HasPrefix(arg, "--exclude="):
			options.Excludes = append(options.Excludes, splitCSV(strings.TrimPrefix(arg, "--exclude="))...)
		case arg == "--stale-days":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			n, e := strconv.Atoi(v)
			if e != nil || n < 0 {
				return options, false, false, fmt.Errorf("--stale-days должен быть неотрицательным числом")
			}
			options.StaleDays = n
		case strings.HasPrefix(arg, "--stale-days="):
			n, e := strconv.Atoi(strings.TrimPrefix(arg, "--stale-days="))
			if e != nil || n < 0 {
				return options, false, false, fmt.Errorf("--stale-days должен быть неотрицательным числом")
			}
			options.StaleDays = n
		case arg == "--repository-root":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.RepositoryRoot = v
		case strings.HasPrefix(arg, "--repository-root="):
			options.RepositoryRoot = strings.TrimPrefix(arg, "--repository-root=")
		case arg == "--repository-url":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.RepositoryURL = v
		case strings.HasPrefix(arg, "--repository-url="):
			options.RepositoryURL = strings.TrimPrefix(arg, "--repository-url=")
		case arg == "--repository-ref":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.RepositoryRef = v
		case strings.HasPrefix(arg, "--repository-ref="):
			options.RepositoryRef = strings.TrimPrefix(arg, "--repository-ref=")
		case arg == "--format":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Format = v
		case strings.HasPrefix(arg, "--format="):
			options.Format = strings.TrimPrefix(arg, "--format=")
		case arg == "--report":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.ReportPath = v
		case strings.HasPrefix(arg, "--report="):
			options.ReportPath = strings.TrimPrefix(arg, "--report=")
		case arg == "--timeout":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			duration, e := time.ParseDuration(v)
			if e != nil || duration <= 0 {
				return options, false, false, fmt.Errorf("--timeout должен быть положительной duration, например 10m")
			}
			options.Timeout = duration
			timeoutSpecified = true
		case strings.HasPrefix(arg, "--timeout="):
			duration, e := time.ParseDuration(strings.TrimPrefix(arg, "--timeout="))
			if e != nil || duration <= 0 {
				return options, false, false, fmt.Errorf("--timeout должен быть положительной duration, например 10m")
			}
			options.Timeout = duration
			timeoutSpecified = true
		case arg == "--clean":
			options.Clean = true
		case arg == "--open":
			options.Open = true
		case arg == "--strict":
			options.Strict = true
		case arg == "--force":
			options.Force = true
		case strings.HasPrefix(arg, "-"):
			return options, false, false, fmt.Errorf("неизвестный параметр: %s", arg)
		default:
			if options.InputDirectory == "" {
				options.InputDirectory = arg
			} else {
				return options, false, false, fmt.Errorf("лишний позиционный аргумент: %s", arg)
			}
		}
	}
	if options.InputDirectory == "" {
		options.InputDirectory = "./docs"
	}
	input, err := filepath.Abs(options.InputDirectory)
	if err != nil {
		return options, false, false, err
	}
	options.InputDirectory = input
	if options.OutputDirectory == "" {
		options.OutputDirectory = filepath.Join(filepath.Dir(input), "project-docs")
	}
	output, err := filepath.Abs(options.OutputDirectory)
	if err != nil {
		return options, false, false, err
	}
	options.OutputDirectory = output
	if options.RepositoryRoot == "" {
		options.RepositoryRoot = filepath.Dir(input)
	}
	repo, err := filepath.Abs(options.RepositoryRoot)
	if err != nil {
		return options, false, false, err
	}
	options.RepositoryRoot = repo
	options.RepositoryURL = strings.TrimRight(options.RepositoryURL, "/")
	if options.RepositoryURL != "" && !strings.HasPrefix(strings.ToLower(options.RepositoryURL), "http://") && !strings.HasPrefix(strings.ToLower(options.RepositoryURL), "https://") {
		return options, false, false, fmt.Errorf("--repository-url должен быть HTTP(S) URL")
	}
	if strings.TrimSpace(options.RepositoryRef) == "" {
		return options, false, false, fmt.Errorf("--repository-ref не может быть пустым")
	}
	if options.Format != "text" && options.Format != "json" {
		return options, false, false, fmt.Errorf("--format должен быть text или json")
	}
	if options.Command == "task-check" || options.Command == "task-context" {
		if workItemHeadingRE.FindStringSubmatch(options.TaskID+": check") == nil {
			return options, false, false, fmt.Errorf("TASK-ID должен иметь формат TASK-AREA-NNN")
		}
	}
	if options.Command == "task-check" {
		if options.ReportPath != "" {
			report, err := filepath.Abs(options.ReportPath)
			if err != nil {
				return options, false, false, err
			}
			if !strings.EqualFold(filepath.Ext(report), ".json") {
				return options, false, false, fmt.Errorf("--report должен указывать JSON-файл")
			}
			resolvedInput, err := resolvePathForSafety(options.InputDirectory)
			if err != nil {
				return options, false, false, err
			}
			resolvedReport, err := resolvePathForSafety(report)
			if err != nil {
				return options, false, false, err
			}
			if ensureInside(options.InputDirectory, report) || ensureInside(resolvedInput, resolvedReport) {
				return options, false, false, fmt.Errorf("--report не может перезаписывать каталог исходной документации")
			}
			if info, err := os.Stat(report); err == nil && info.IsDir() {
				return options, false, false, fmt.Errorf("--report должен указывать файл, а не каталог")
			}
			options.ReportPath = report
		}
	} else if options.ReportPath != "" || timeoutSpecified {
		return options, false, false, fmt.Errorf("--report и --timeout доступны только для task check")
	}
	return options, help, version, nil
}

func splitCSV(value string) []string {
	out := []string{}
	for _, part := range strings.Split(value, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func openGeneratedSite(file string) error {
	var command string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		command = "open"
		args = []string{file}
	case "windows":
		command = "cmd"
		args = []string{"/c", "start", "", file}
	default:
		command = "xdg-open"
		args = []string{file}
	}
	return exec.Command(command, args...).Start()
}

func printCheckText(w io.Writer, model *Model) {
	fmt.Fprintf(w, "Документов: %d\nПредупреждений: %d\nОшибок: %d\n", model.Stats.Documents, model.Stats.Warnings, model.Stats.Errors)
	for _, issue := range model.Issues {
		location := issue.DocumentPath
		if issue.Line > 0 {
			location += fmt.Sprintf(":%d", issue.Line)
		}
		fmt.Fprintf(w, "[%s] %s %s — %s\n", strings.ToUpper(issue.Severity), issue.Code, location, issue.Message)
	}
}

// RunCLI executes one command and returns a process exit code.
func RunCLI(argv []string, stdout, stderr io.Writer) int {
	options, help, version, err := ParseArguments(argv)
	if err != nil {
		fmt.Fprintln(stderr, "Ошибка:", err)
		return 1
	}
	if help {
		PrintHelp(stdout)
		return 0
	}
	if version {
		fmt.Fprintln(stdout, Version)
		return 0
	}
	if options.Command == "init" {
		count, err := InitDocumentation(options.InputDirectory, options.Force)
		if err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 1
		}
		fmt.Fprintf(stdout, "Создано файлов: %d\nКаталог: %s\n", count, options.InputDirectory)
		return 0
	}
	model, err := BuildDocumentationModel(options)
	if err != nil {
		fmt.Fprintln(stderr, "Ошибка:", err)
		return 1
	}
	if options.Command == "task-check" {
		report := executeTaskCheck(model, options, stdout, stderr, osCommandRunner{})
		data, marshalErr := marshalTaskCheckReport(report)
		if marshalErr != nil {
			fmt.Fprintln(stderr, "Ошибка:", marshalErr)
			return 1
		}
		reportWriteFailed := false
		if options.ReportPath != "" {
			if err := writeReportAtomically(options.ReportPath, data); err != nil {
				fmt.Fprintln(stderr, "Не удалось сохранить отчёт:", err)
				reportWriteFailed = true
			}
		}
		if options.Format == "json" {
			fmt.Fprintln(stdout, string(data))
		} else {
			printTaskCheckText(stdout, report)
		}
		if report.Status != "passed" || reportWriteFailed {
			return 1
		}
		return 0
	}
	if options.Command == "task-context" {
		report, err := BuildTaskContext(model, options.TaskID)
		if err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 1
		}
		if options.Format == "json" {
			data, marshalErr := json.MarshalIndent(report, "", "  ")
			if marshalErr != nil {
				fmt.Fprintln(stderr, "Ошибка:", marshalErr)
				return 1
			}
			fmt.Fprintln(stdout, string(data))
		} else {
			printTaskContextText(stdout, report)
		}
		return 0
	}
	if options.Command == "check" {
		if options.Format == "json" {
			data, _ := json.MarshalIndent(BuildReport(model), "", "  ")
			fmt.Fprintln(stdout, string(data))
		} else {
			printCheckText(stdout, model)
		}
		if model.Stats.Errors > 0 || (options.Strict && model.Stats.Warnings > 0) {
			return 1
		}
		return 0
	}
	result, err := GenerateSite(model, options)
	if err != nil {
		fmt.Fprintln(stderr, "Ошибка:", err)
		return 1
	}
	fmt.Fprintf(stdout, "\nДокументация создана.\nКаталог:        %s\nСтраниц:        %d\nДокументов:     %d\nЗадач roadmap:  %d\nВыполнено:      %d\nПредупреждений: %d\nОшибок:         %d\nГлавная:        %s\n", result.OutputDirectory, result.Pages, model.Stats.Documents, model.Stats.TotalTasks, model.Stats.CompletedTasks, model.Stats.Warnings, model.Stats.Errors, filepath.Join(result.OutputDirectory, "index.html"))
	if options.Open {
		if err := openGeneratedSite(filepath.Join(result.OutputDirectory, "index.html")); err != nil {
			fmt.Fprintln(stderr, "Не удалось открыть браузер автоматически:", err)
		}
	}
	if model.Stats.Errors > 0 || (options.Strict && model.Stats.Warnings > 0) {
		return 1
	}
	return 0
}

func Main() { os.Exit(RunCLI(os.Args[1:], os.Stdout, os.Stderr)) }
