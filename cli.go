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
  docgent serve [каталог-документации] [параметры]
  docgent search "<запрос>" [каталог-документации] [--limit N] [--format text|json]
  docgent task init [каталог-документации] --area AREA --title TITLE --type TYPE [--lang en|ru]
  docgent scaffold module|use-case|flow|screen|decision|standard|runbook ID [каталог-документации] --title TITLE [--lang en|ru]
  docgent task ready TASK-ID [каталог-документации] [--strict] [--format text|json]
  docgent task context TASK-ID [каталог-документации] [параметры]
  docgent task verify TASK-ID [каталог-документации] (--dry-run|--run) [параметры]
  docgent task archive TASK-ID [каталог-документации] [--format text|json]
  docgent task restore TASK-ID [каталог-документации] [--format text|json]
  docgent version

Примеры:
  docgent build ./docs --output ./build/project-docs --clean
  docgent check ./docs --strict
  docgent serve ./docs --host 0.0.0.0 --port 8080
  docgent search "task workflow" ./docs --format json
  docgent task init ./docs --area CORE --title "Новая задача" --type Feature
  docgent task ready TASK-CORE-001 ./docs --format json
  docgent task context TASK-CORE-001 ./docs --format json
  docgent task verify TASK-CORE-001 ./docs --dry-run --format json
  docgent task archive TASK-CORE-001 ./docs --format json
  docgent task restore TASK-CORE-001 ./docs --format json

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
      --screen-map             Генерировать карту экранов (по умолчанию)
      --no-screen-map          Не генерировать страницу карты экранов
      --host <адрес>           Адрес serve, по умолчанию 127.0.0.1
      --port <число>           Порт serve, по умолчанию 8080
      --format text|json       Формат машинных отчётов
      --report <файл>          Сохранить JSON-отчёт task verify
      --timeout <duration>     Timeout каждой команды task verify, по умолчанию 10m
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
	options := Options{Command: "build", StaleDays: 90, RepositoryRef: "main", Format: "text", Timeout: 10 * time.Minute, Host: "127.0.0.1", Port: 8080, Language: "en", Limit: 20}
	help, version := false, false
	timeoutSpecified, hostSpecified, portSpecified := false, false, false
	titleSpecified, languageSpecified, limitSpecified, outputSpecified := false, false, false, false
	screenMapOption := ""
	args := append([]string{}, argv...)
	if len(args) > 0 {
		switch args[0] {
		case "build", "check", "serve":
			options.Command = args[0]
			args = args[1:]
		case "search":
			if len(args) < 2 {
				return options, false, false, fmt.Errorf("использование: docgent search \"<query>\" [каталог-документации]")
			}
			options.Command, options.Query = "search", args[1]
			args = args[2:]
		case "scaffold":
			if len(args) < 3 {
				return options, false, false, fmt.Errorf("использование: docgent scaffold module|use-case|flow|screen|decision|standard|runbook ID [каталог-документации]")
			}
			options.Command, options.EntityKind, options.EntityID = "scaffold", args[1], args[2]
			args = args[3:]
		case "init", "refresh":
			return options, false, false, fmt.Errorf("неизвестная команда: %s", args[0])
		case "version":
			version = true
			args = args[1:]
		case "help":
			help = true
			args = args[1:]
		case "task":
			if len(args) < 2 {
				return options, false, false, fmt.Errorf("использование: docgent task init|ready|context|verify|archive|restore ...")
			}
			switch args[1] {
			case "init":
				options.Command = "task-init"
				args = args[2:]
				goto parseOptions
			case "ready", "context", "verify", "archive", "restore":
				if len(args) < 3 {
					return options, false, false, fmt.Errorf("для task %s требуется TASK-ID", args[1])
				}
				options.Command = "task-" + args[1]
			default:
				return options, false, false, fmt.Errorf("использование: docgent task init|ready|context|verify|archive|restore ...")
			}
			options.TaskID = args[2]
			args = args[3:]
		}
	}
parseOptions:
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
			outputSpecified = true
		case strings.HasPrefix(arg, "--output="):
			options.OutputDirectory = strings.TrimPrefix(arg, "--output=")
			outputSpecified = true
		case arg == "-t" || arg == "--title":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Title = v
			titleSpecified = true
		case strings.HasPrefix(arg, "--title="):
			options.Title = strings.TrimPrefix(arg, "--title=")
			titleSpecified = true
		case arg == "--area":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Area = v
		case strings.HasPrefix(arg, "--area="):
			options.Area = strings.TrimPrefix(arg, "--area=")
		case arg == "--type":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.TaskType = v
		case strings.HasPrefix(arg, "--type="):
			options.TaskType = strings.TrimPrefix(arg, "--type=")
		case arg == "--lang":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Language = v
			languageSpecified = true
		case strings.HasPrefix(arg, "--lang="):
			options.Language = strings.TrimPrefix(arg, "--lang=")
			languageSpecified = true
		case arg == "--limit":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			n, e := strconv.Atoi(v)
			if e != nil || n < 1 || n > 100 {
				return options, false, false, fmt.Errorf("--limit должен быть числом от 1 до 100")
			}
			options.Limit = n
			limitSpecified = true
		case strings.HasPrefix(arg, "--limit="):
			n, e := strconv.Atoi(strings.TrimPrefix(arg, "--limit="))
			if e != nil || n < 1 || n > 100 {
				return options, false, false, fmt.Errorf("--limit должен быть числом от 1 до 100")
			}
			options.Limit = n
			limitSpecified = true
		case arg == "--dry-run":
			if options.VerifyMode != "" {
				return options, false, false, fmt.Errorf("--dry-run и --run нельзя использовать вместе")
			}
			options.VerifyMode = "dry-run"
		case arg == "--run":
			if options.VerifyMode != "" {
				return options, false, false, fmt.Errorf("--dry-run и --run нельзя использовать вместе")
			}
			options.VerifyMode = "run"
		case arg == "--target":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Target = strings.ToUpper(v)
		case strings.HasPrefix(arg, "--target="):
			options.Target = strings.ToUpper(strings.TrimPrefix(arg, "--target="))
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
		case arg == "--host":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.Host = v
			hostSpecified = true
		case strings.HasPrefix(arg, "--host="):
			options.Host = strings.TrimPrefix(arg, "--host=")
			hostSpecified = true
		case arg == "--port":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			port, e := strconv.Atoi(v)
			if e != nil || port < 1 || port > 65535 {
				return options, false, false, fmt.Errorf("--port должен быть числом от 1 до 65535")
			}
			options.Port = port
			portSpecified = true
		case strings.HasPrefix(arg, "--port="):
			port, e := strconv.Atoi(strings.TrimPrefix(arg, "--port="))
			if e != nil || port < 1 || port > 65535 {
				return options, false, false, fmt.Errorf("--port должен быть числом от 1 до 65535")
			}
			options.Port = port
			portSpecified = true
		case arg == "--clean":
			options.Clean = true
		case arg == "--open":
			options.Open = true
		case arg == "--strict":
			options.Strict = true
		case arg == "--screen-map":
			if screenMapOption == "off" {
				return options, false, false, fmt.Errorf("--screen-map и --no-screen-map нельзя использовать вместе")
			}
			screenMapOption = "on"
			options.NoScreenMap = false
		case arg == "--no-screen-map":
			if screenMapOption == "on" {
				return options, false, false, fmt.Errorf("--screen-map и --no-screen-map нельзя использовать вместе")
			}
			screenMapOption = "off"
			options.NoScreenMap = true
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
	if strings.TrimSpace(options.Host) == "" {
		return options, false, false, fmt.Errorf("--host не может быть пустым")
	}
	if options.Command != "serve" && (hostSpecified || portSpecified) {
		return options, false, false, fmt.Errorf("--host и --port доступны только для serve")
	}
	if screenMapOption != "" && options.Command != "build" && options.Command != "serve" {
		return options, false, false, fmt.Errorf("--screen-map и --no-screen-map доступны только для build и serve")
	}
	if options.Command == "task-ready" || options.Command == "task-context" || options.Command == "task-verify" ||
		options.Command == "task-archive" || options.Command == "task-restore" {
		if !taskIDRE.MatchString(options.TaskID) {
			return options, false, false, fmt.Errorf("идентификатор рабочего элемента должен иметь формат TASK-AREA-NNN или BUG-AREA-NNN")
		}
	}
	if options.Command == "task-verify" {
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
		if options.VerifyMode == "" {
			return options, false, false, fmt.Errorf("task verify требует ровно один режим: --dry-run или --run")
		}
	} else if options.ReportPath != "" || timeoutSpecified || options.VerifyMode != "" || options.Target != "" {
		return options, false, false, fmt.Errorf("--dry-run, --run, --target, --report и --timeout доступны только для task verify")
	}
	if options.Command == "task-init" {
		if options.Area == "" || !titleSpecified || strings.TrimSpace(options.Title) == "" || options.TaskType == "" {
			return options, false, false, fmt.Errorf("task init требует --area, --title и --type")
		}
		if !taskAreaRE.MatchString(options.Area) {
			return options, false, false, fmt.Errorf("--area должен состоять из A-Z, 0-9 и дефисов и начинаться с буквы")
		}
		if !validTaskInitType(options.TaskType) {
			return options, false, false, fmt.Errorf("--type должен быть Feature, Bug, Maintenance, Documentation или Research")
		}
	}
	if options.Command == "scaffold" && (!titleSpecified || strings.TrimSpace(options.Title) == "") {
		return options, false, false, fmt.Errorf("scaffold требует --title")
	}
	if (options.Command == "task-init" || options.Command == "scaffold") && strings.ContainsAny(options.Title, "\r\n") {
		return options, false, false, fmt.Errorf("--title должен быть одной строкой")
	}
	if options.Command == "scaffold" && !validScaffoldID(options.EntityKind, options.EntityID) {
		return options, false, false, fmt.Errorf("некорректный %s ID: %s", options.EntityKind, options.EntityID)
	}
	if options.Command == "search" && len(searchWords(options.Query)) == 0 {
		return options, false, false, fmt.Errorf("поисковый запрос не может быть пустым")
	}
	if options.Language != "en" && options.Language != "ru" {
		return options, false, false, fmt.Errorf("--lang должен быть en или ru")
	}
	if languageSpecified && options.Command != "task-init" && options.Command != "scaffold" {
		return options, false, false, fmt.Errorf("--lang доступен только для task init и scaffold")
	}
	if limitSpecified && options.Command != "search" {
		return options, false, false, fmt.Errorf("--limit доступен только для search")
	}
	if options.Area != "" && options.Command != "task-init" || options.TaskType != "" && options.Command != "task-init" {
		return options, false, false, fmt.Errorf("--area и --type доступны только для task init")
	}
	if titleSpecified && options.Command != "build" && options.Command != "serve" && options.Command != "task-init" && options.Command != "scaffold" {
		return options, false, false, fmt.Errorf("--title недоступен для этой команды")
	}
	if outputSpecified && options.Command != "build" && options.Command != "serve" {
		return options, false, false, fmt.Errorf("--output доступен только для build и serve")
	}
	if (options.Clean || options.Open) && options.Command != "build" && options.Command != "serve" {
		return options, false, false, fmt.Errorf("--clean и --open доступны только для build и serve")
	}
	if options.Strict && options.Command != "build" && options.Command != "check" && options.Command != "serve" && options.Command != "task-ready" {
		return options, false, false, fmt.Errorf("--strict недоступен для этой команды")
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
	if options.Command == "task-init" {
		report, err := InitTask(options)
		if err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 1
		}
		if options.Format == "json" {
			data, _ := json.MarshalIndent(report, "", "  ")
			fmt.Fprintln(stdout, string(data))
		} else {
			fmt.Fprintf(stdout, "Создана задача %s: %s\n", report.ID, report.Path)
		}
		return 0
	}
	if options.Command == "scaffold" {
		report, err := Scaffold(options)
		if err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 1
		}
		if options.Format == "json" {
			data, _ := json.MarshalIndent(report, "", "  ")
			fmt.Fprintln(stdout, string(data))
		} else {
			fmt.Fprintf(stdout, "Создан %s %s: %s\n", report.EntityType, report.ID, report.Path)
		}
		return 0
	}
	if options.Command == "serve" {
		if err := serveDocumentation(options, stdout, stderr); err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 1
		}
		return 0
	}
	model, err := BuildDocumentationModel(options)
	if err != nil {
		fmt.Fprintln(stderr, "Ошибка:", err)
		return 1
	}
	if options.Command == "search" {
		report, err := SearchDocumentation(model, options.Query, options.Limit)
		if err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 1
		}
		if options.Format == "json" {
			data, _ := json.MarshalIndent(report, "", "  ")
			fmt.Fprintln(stdout, string(data))
		} else {
			printSearchText(stdout, report)
		}
		return 0
	}
	if options.Command == "task-archive" || options.Command == "task-restore" {
		operation := strings.TrimPrefix(options.Command, "task-")
		report, err := MoveTask(model, options, operation)
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
			printTaskMoveText(stdout, report)
		}
		if report.Status == "archived" || report.Status == "restored" {
			return 0
		}
		return 1
	}
	if options.Command == "task-verify" {
		report := executeTaskVerify(model, options, stdout, stderr, osCommandRunner{})
		data, marshalErr := marshalTaskVerifyReport(report)
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
			printTaskVerifyText(stdout, report)
		}
		if (report.Status != "passed" && report.Status != "planned") || reportWriteFailed {
			return 1
		}
		return 0
	}
	if options.Command == "task-ready" {
		report := BuildTaskReady(model, options.TaskID, options.Strict)
		if options.Format == "json" {
			data, _ := json.MarshalIndent(report, "", "  ")
			fmt.Fprintln(stdout, string(data))
		} else {
			printTaskReadyText(stdout, report)
		}
		if report.Status == "contract_ready" || report.Status == "ready" {
			return 0
		}
		return 1
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
