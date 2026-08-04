package docudocu

import (
	"encoding/json"
	"errors"
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
	fmt.Fprintf(w, `Docu-docu %s

Использование:
  docu-docu COMMAND [параметры]

Команды:
  check       Проверить исходную документацию без изменений
  build       Собрать автономный read-only портал
  serve       Запустить локальный портал, редактор и live rebuild
  changes     Показать Git-backed изменения документации
  search      Найти документы в исходном Markdown
  scaffold    Создать один типизированный документ
  task        Операции жизненного цикла work item
  version     Показать версию

Для справки по применимым параметрам и побочным эффектам:
  docu-docu COMMAND --help
  docu-docu task --help
`, Version)
}

func PrintCommandHelp(w io.Writer, topic string) {
	help := map[string]string{
		"build": `Собирает автономный read-only портал и записывает output.

Использование:
  docu-docu build [docs-dir] [-o DIR] [--clean] [--open] [--strict]
                [--exclude PATHS] [--stale-days N] [--repository-root DIR]
                [--repository-url URL] [--repository-ref REF]
                [--screen-map|--no-screen-map] [-t TITLE]

Пример:
  docu-docu build ./docs -o ./build/project-docs --clean

Побочные эффекты: создаёт output; --clean предварительно очищает только безопасный output.`,
		"check": `Проверяет структуру, ссылки, ID и явные связи без изменения файлов.

Использование:
  docu-docu check [docs-dir] [--strict] [--format text|json]
                [--exclude PATHS] [--stale-days N] [--repository-root DIR]

Пример:
  docu-docu check ./docs --strict

Побочные эффекты: отсутствуют. Без --strict warnings не меняют exit code.`,
		"serve": `Собирает портал и запускает локальный HTTP/editor workspace с live rebuild.

Использование:
  docu-docu serve [docs-dir] [-o DIR] [--host ADDRESS] [--port N]
                [--open] [--strict] [--exclude PATHS] [--stale-days N]
                [--repository-root DIR] [--screen-map|--no-screen-map] [-t TITLE]

Пример:
  docu-docu serve ./docs --host 127.0.0.1 --port 8080

Побочные эффекты: записывает output, запускает HTTP; browser save изменяет workspace.`,
		"changes": `Строит read-only Git-backed отчёт об изменениях документации.

Использование:
  docu-docu changes [docs-dir] [--base REV|--branch-base REF]
                  [--target working-tree|index|HEAD|REV]
                  [--status STATUS] [--module ID] [--type TYPE]
                  [--permanent-only] [--format text|json|markdown] [-o FILE]
  docu-docu changes file PATH [docs-dir] [те же параметры]

Пример:
  docu-docu changes ./docs --base main --target working-tree --format markdown

Побочные эффекты: отсутствуют; команда только читает Git и workspace.`,
		"changes-file": `Показывает detail одного изменённого пути без изменения файлов.

Использование:
  docu-docu changes file PATH [docs-dir] [--base REV|--branch-base REF]
                       [--target working-tree|index|HEAD|REV]
                       [--format text|json|markdown] [-o FILE]`,
		"search": `Ищет по свежим исходным Markdown без изменения файлов.

Использование:
  docu-docu search "QUERY" [docs-dir] [--limit N] [--format text|json]

Пример:
  docu-docu search "task workflow" ./docs --format json`,
		"scaffold": `Атомарно создаёт один типизированный Markdown-файл.

Использование:
  docu-docu scaffold module|use-case|flow|screen|decision|standard|runbook ID
                   [docs-dir] --title TITLE [--lang en|ru] [--format text|json]

Без --lang язык берётся из .docu-docu/config.yml; fallback — en.
Пример:
  docu-docu scaffold module MOD-CLI ./docs --title "CLI"`,
		"task": `Операции жизненного цикла work item.

Использование:
  docu-docu task init|ready|context|verify|archive|restore|changes ...

Для параметров операции:
  docu-docu task OPERATION --help`,
		"task-init": `Атомарно создаёт новый Draft TASK-* или BUG-*.

Использование:
  docu-docu task init [docs-dir] --area AREA --title TITLE --type TYPE
                    [--lang en|ru] [--format text|json]

TYPE: Feature, Bug, Maintenance, Documentation или Research.
Без --lang язык берётся из .docu-docu/config.yml; fallback — en.`,
		"task-ready": `Проверяет полноту Draft/Ready контракта без изменения файлов.

Использование:
  docu-docu task ready TASK-ID [docs-dir] [--strict] [--format text|json]`,
		"task-context": `Возвращает компактный read-only контекст Ready+ задачи.

Использование:
  docu-docu task context TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]`,
		"task-verify": `Планирует или выполняет доверенные команды проверки задачи.

Использование:
  docu-docu task verify TASK-ID [docs-dir] (--dry-run|--run)
                      [--target TARGET] [--report FILE] [--timeout DURATION]
                      [--repository-root DIR] [--format text|json]

Побочный эффект есть только у --run: выполняются команды задачи.`,
		"task-archive": `Перемещает валидную Done/Cancelled задачу в work/archive/YYYY без перезаписи.

Использование:
  docu-docu task archive TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]`,
		"task-restore": `Возвращает архивную задачу в work/ без перезаписи.

Использование:
  docu-docu task restore TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]`,
		"task-changes": `Строит единственный task-scoped read-only отчёт изменений и impact diagnostics.

Использование:
  docu-docu task changes TASK-ID [docs-dir] [--base REV|--branch-base REF]
                       [--target working-tree|index|HEAD|REV]
                       [--format text|json|markdown] [-o FILE]`,
		"version": "Показывает версию Docu-docu без побочных эффектов.\n\nИспользование:\n  docu-docu version",
	}
	if text, ok := help[topic]; ok {
		fmt.Fprintln(w, text)
		return
	}
	PrintHelp(w)
}

func helpTopic(argv []string) (string, bool) {
	hasHelp := false
	for _, arg := range argv {
		if arg == "-h" || arg == "--help" {
			hasHelp = true
		}
	}
	if len(argv) > 0 && argv[0] == "help" {
		hasHelp = true
		argv = argv[1:]
	}
	if !hasHelp {
		return "", false
	}
	words := []string{}
	for _, arg := range argv {
		if arg == "-h" || arg == "--help" || strings.HasPrefix(arg, "-") {
			continue
		}
		words = append(words, arg)
	}
	if len(words) == 0 {
		return "", true
	}
	if words[0] == "changes" && len(words) > 1 && words[1] == "file" {
		return "changes-file", true
	}
	if words[0] == "task" && len(words) > 1 {
		return "task-" + words[1], true
	}
	return words[0], true
}

func takeArgValue(args []string, index *int, option string) (string, error) {
	if *index+1 >= len(args) || strings.HasPrefix(args[*index+1], "-") {
		return "", fmt.Errorf("для параметра %s требуется значение", option)
	}
	*index++
	return args[*index], nil
}

// ParseArguments parses explicit subcommands.
func ParseArguments(argv []string) (Options, bool, bool, error) {
	options := Options{StaleDays: 90, RepositoryRef: "main", Format: "text", Timeout: 10 * time.Minute, Host: "127.0.0.1", Port: 8080, Limit: 20}
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
				return options, false, false, fmt.Errorf("использование: docu-docu search \"<query>\" [каталог-документации]")
			}
			options.Command, options.Query = "search", args[1]
			args = args[2:]
		case "changes":
			options.Command = "changes"
			args = args[1:]
			if len(args) > 0 && args[0] == "file" {
				if len(args) < 2 {
					return options, false, false, fmt.Errorf("использование: docu-docu changes file PATH [каталог-документации]")
				}
				options.Command, options.ChangeFile = "changes-file", filepath.ToSlash(args[1])
				args = args[2:]
			}
		case "scaffold":
			if len(args) < 3 {
				return options, false, false, fmt.Errorf("использование: docu-docu scaffold module|use-case|flow|screen|decision|standard|runbook ID [каталог-документации]")
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
				return options, false, false, fmt.Errorf("использование: docu-docu task init|ready|context|verify|archive|restore ...")
			}
			switch args[1] {
			case "init":
				options.Command = "task-init"
				args = args[2:]
				goto parseOptions
			case "ready", "context", "verify", "archive", "restore", "changes":
				if len(args) < 3 {
					return options, false, false, fmt.Errorf("для task %s требуется TASK-ID", args[1])
				}
				options.Command = "task-" + args[1]
			default:
				return options, false, false, fmt.Errorf("использование: docu-docu task init|ready|context|verify|archive|restore ...")
			}
			options.TaskID = args[2]
			args = args[3:]
		default:
			if !strings.HasPrefix(args[0], "-") {
				return options, false, false, fmt.Errorf("неизвестная команда: %s", args[0])
			}
		}
	}
	if options.Command == "" && !help && !version {
		return options, false, false, fmt.Errorf("требуется команда; используйте docu-docu --help")
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
			if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
				options.ChangeOutput = v
			} else {
				options.OutputDirectory = v
			}
			outputSpecified = true
		case strings.HasPrefix(arg, "--output="):
			if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
				options.ChangeOutput = strings.TrimPrefix(arg, "--output=")
			} else {
				options.OutputDirectory = strings.TrimPrefix(arg, "--output=")
			}
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
			if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
				options.ChangeEntityType = v
			} else {
				options.TaskType = v
			}
		case strings.HasPrefix(arg, "--type="):
			if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
				options.ChangeEntityType = strings.TrimPrefix(arg, "--type=")
			} else {
				options.TaskType = strings.TrimPrefix(arg, "--type=")
			}
		case arg == "--base":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.ChangeBase = v
		case strings.HasPrefix(arg, "--base="):
			options.ChangeBase = strings.TrimPrefix(arg, "--base=")
		case arg == "--branch-base":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.ChangeBranchBase = v
		case strings.HasPrefix(arg, "--branch-base="):
			options.ChangeBranchBase = strings.TrimPrefix(arg, "--branch-base=")
		case arg == "--status":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.ChangeStatus = v
		case strings.HasPrefix(arg, "--status="):
			options.ChangeStatus = strings.TrimPrefix(arg, "--status=")
		case arg == "--module":
			v, e := takeArgValue(args, &i, arg)
			if e != nil {
				return options, false, false, e
			}
			options.ChangeModule = v
		case strings.HasPrefix(arg, "--module="):
			options.ChangeModule = strings.TrimPrefix(arg, "--module=")
		case arg == "--permanent-only":
			options.ChangePermanentOnly = true
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
			if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
				options.ChangeTarget = v
			} else {
				options.Target = strings.ToUpper(v)
			}
		case strings.HasPrefix(arg, "--target="):
			if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
				options.ChangeTarget = strings.TrimPrefix(arg, "--target=")
			} else {
				options.Target = strings.ToUpper(strings.TrimPrefix(arg, "--target="))
			}
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
	if !languageSpecified && (options.Command == "task-init" || options.Command == "scaffold") {
		options.Language = configuredScaffoldLanguage(options.RepositoryRoot)
	}
	options.RepositoryURL = strings.TrimRight(options.RepositoryURL, "/")
	if options.RepositoryURL != "" && !strings.HasPrefix(strings.ToLower(options.RepositoryURL), "http://") && !strings.HasPrefix(strings.ToLower(options.RepositoryURL), "https://") {
		return options, false, false, fmt.Errorf("--repository-url должен быть HTTP(S) URL")
	}
	if strings.TrimSpace(options.RepositoryRef) == "" {
		return options, false, false, fmt.Errorf("--repository-ref не может быть пустым")
	}
	if options.Format != "text" && options.Format != "json" && !((options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes") && options.Format == "markdown") {
		return options, false, false, fmt.Errorf("--format должен быть text, json или markdown для changes")
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
	if options.Command == "task-ready" || options.Command == "task-context" || options.Command == "task-verify" || options.Command == "task-changes" ||
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
	if (options.Command == "task-init" || options.Command == "scaffold") && options.Language != "en" && options.Language != "ru" {
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
	if outputSpecified && options.Command != "build" && options.Command != "serve" && options.Command != "changes" && options.Command != "changes-file" && options.Command != "task-changes" {
		return options, false, false, fmt.Errorf("--output доступен только для build и serve")
	}
	if (options.Clean || options.Open) && options.Command != "build" && options.Command != "serve" {
		return options, false, false, fmt.Errorf("--clean и --open доступны только для build и serve")
	}
	if options.Strict && options.Command != "build" && options.Command != "check" && options.Command != "serve" && options.Command != "task-ready" {
		return options, false, false, fmt.Errorf("--strict недоступен для этой команды")
	}
	if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
		if options.ChangeBranchBase != "" && options.ChangeBase != "" {
			return options, false, false, fmt.Errorf("--base и --branch-base нельзя использовать вместе")
		}
		if options.ChangeOutput != "" {
			absolute, err := filepath.Abs(options.ChangeOutput)
			if err != nil {
				return options, false, false, err
			}
			options.ChangeOutput = absolute
		}
		if options.Command == "task-changes" {
			options.ChangeTaskID = options.TaskID
		}
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

func configuredScaffoldLanguage(repositoryRoot string) string {
	data, err := os.ReadFile(filepath.Join(repositoryRoot, ".docu-docu", "config.yml"))
	if err != nil {
		return "en"
	}
	config, err := parseSiteConfig(data)
	if err != nil {
		return "en"
	}
	language := strings.ToLower(strings.Split(config.Project.Locale, "-")[0])
	if language == "ru" || language == "en" {
		return language
	}
	return "en"
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
	if topic, ok := helpTopic(argv); ok {
		PrintCommandHelp(stdout, topic)
		return 0
	}
	if len(argv) == 0 {
		PrintHelp(stdout)
		return 0
	}
	options, help, version, err := ParseArguments(argv)
	if err != nil {
		fmt.Fprintln(stderr, "Ошибка:", err)
		if len(argv) > 0 && (argv[0] == "changes" || (argv[0] == "task" && len(argv) > 1 && argv[1] == "changes")) {
			return 2
		}
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
	if options.Command == "changes" || options.Command == "changes-file" || options.Command == "task-changes" {
		report, err := BuildDocumentationChanges(options)
		if err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			var failure *changeFailure
			if errors.As(err, &failure) {
				return failure.Code
			}
			return 4
		}
		filterDocumentationChanges(report, options)
		if err := outputChangesReport(options, report, stdout); err != nil {
			fmt.Fprintln(stderr, "Ошибка:", err)
			return 4
		}
		for _, diagnostic := range report.Diagnostics {
			if diagnostic.Severity == "error" {
				return 1
			}
		}
		if report.TaskImpact != nil {
			for _, diagnostic := range report.TaskImpact.Diagnostics {
				if diagnostic.Severity == "error" {
					return 1
				}
			}
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
