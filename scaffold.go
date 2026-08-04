package docgent

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	taskAreaRE = regexp.MustCompile(`^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$`)
	taskIDRE   = regexp.MustCompile(`^TASK-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3,}$`)
	entityIDRE = regexp.MustCompile(`^[A-Z0-9]+(?:-[A-Z0-9]+)*$`)
)

func validTaskInitType(value string) bool {
	return containsString([]string{"Feature", "Bug", "Maintenance", "Documentation", "Research"}, value)
}

func validateScaffoldTitle(value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("--title не может быть пустым")
	}
	if strings.ContainsAny(value, "\r\n") {
		return fmt.Errorf("--title должен быть одной строкой")
	}
	return nil
}

func atomicCreateFile(target, content string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return err
	}
	file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("файл уже существует: %s", target)
		}
		return err
	}
	name := file.Name()
	ok := false
	defer func() {
		_ = file.Close()
		if !ok {
			_ = os.Remove(name)
		}
	}()
	if _, err := io.WriteString(file, content); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	ok = true
	return nil
}

func scaffoldDate(now time.Time) string {
	if now.IsZero() {
		now = time.Now()
	}
	return now.Format("2006-01-02")
}

func nextTaskNumber(docsDir, area string) (int, error) {
	entries, err := os.ReadDir(filepath.Join(docsDir, "work"))
	if err != nil && !os.IsNotExist(err) {
		return 0, err
	}
	prefix := "TASK-" + area + "-"
	maximum := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		suffix := strings.TrimPrefix(name, prefix)
		digits := strings.TrimLeftFunc(suffix, func(r rune) bool { return r >= '0' && r <= '9' })
		digits = suffix[:len(suffix)-len(digits)]
		number, err := strconv.Atoi(digits)
		if err == nil && number > maximum {
			maximum = number
		}
	}
	return maximum + 1, nil
}

func renderTaskScaffold(id, title, taskType, language, date string) string {
	if language == "ru" {
		return fmt.Sprintf(`# %s: %s

- Статус: Черновик
- Тип: %s
- Последнее обновление: %s

## Результат

## Изменение поведения

### Было

### Станет

## Область изменения

## Не входит в задачу

## Критерии приёмки

## План

## Проверка

## Влияние на документацию
`, id, title, taskType, date)
	}
	return fmt.Sprintf(`# %s: %s

- Status: Draft
- Type: %s
- Last updated: %s

## Result

## Behavior change

### Before

### After

## Scope

## Out of scope

## Acceptance criteria

## Plan

## Verification

## Documentation impact
`, id, title, taskType, date)
}

func InitTask(options Options) (TaskInitReport, error) {
	if info, err := os.Stat(options.InputDirectory); err != nil || !info.IsDir() {
		return TaskInitReport{}, fmt.Errorf("каталог документации не найден: %s", options.InputDirectory)
	}
	if !taskAreaRE.MatchString(options.Area) {
		return TaskInitReport{}, fmt.Errorf("--area должен состоять из A-Z, 0-9 и дефисов и начинаться с буквы")
	}
	if err := validateScaffoldTitle(options.Title); err != nil {
		return TaskInitReport{}, err
	}
	if options.Language == "" {
		options.Language = "en"
	}
	if options.Language != "en" && options.Language != "ru" {
		return TaskInitReport{}, fmt.Errorf("--lang должен быть en или ru")
	}
	if !validTaskInitType(options.TaskType) {
		return TaskInitReport{}, fmt.Errorf("--type должен быть Feature, Bug, Maintenance, Documentation или Research")
	}
	taskType := options.TaskType
	for attempts := 0; attempts < 100; attempts++ {
		number, err := nextTaskNumber(options.InputDirectory, options.Area)
		if err != nil {
			return TaskInitReport{}, err
		}
		id := fmt.Sprintf("TASK-%s-%03d", options.Area, number)
		relative := filepath.ToSlash(filepath.Join("work", id+".md"))
		target := filepath.Join(options.InputDirectory, filepath.FromSlash(relative))
		err = atomicCreateFile(target, renderTaskScaffold(id, options.Title, taskType, options.Language, scaffoldDate(options.Now)))
		if err != nil && strings.Contains(err.Error(), "уже существует") {
			continue
		}
		if err != nil {
			return TaskInitReport{}, err
		}
		return TaskInitReport{
			SchemaVersion: 1, Kind: "task-init", Generator: GeneratorInfo{Name: "Docgent", Version: Version},
			ID: id, Title: options.Title, Type: taskType, Language: options.Language, Path: relative,
		}, nil
	}
	return TaskInitReport{}, fmt.Errorf("не удалось выделить свободный TASK-ID после конкурентных изменений")
}

type scaffoldSpec struct {
	prefix    string
	directory string
}

var scaffoldSpecs = map[string]scaffoldSpec{
	"module":   {prefix: "MOD-", directory: "modules"},
	"use-case": {prefix: "UC-", directory: "use-cases"},
	"flow":     {prefix: "FLOW-", directory: "flows"},
	"screen":   {prefix: "SC-", directory: "screens"},
	"decision": {prefix: "ADR-", directory: "decisions"},
}

func validScaffoldID(kind, id string) bool {
	spec, ok := scaffoldSpecs[kind]
	if !ok || !strings.HasPrefix(id, spec.prefix) || !safeStableID(id) {
		return false
	}
	return entityIDRE.MatchString(strings.TrimPrefix(id, spec.prefix))
}

func renderEntityScaffold(kind, id, title, language, date string) string {
	if language == "ru" {
		switch kind {
		case "module":
			return fmt.Sprintf("# %s: %s\n\n- Идентификатор: %s\n- Статус: Черновик\n- Последнее обновление: %s\n\n## Назначение\n\n## Бизнес-правила\n\n## Инварианты\n\n## Интерфейсы\n", id, title, id, date)
		case "use-case":
			return fmt.Sprintf("# %s: %s\n\n- Идентификатор: %s\n- Статус: Черновик\n- Последнее обновление: %s\n\n## Основной сценарий\n\n## Альтернативные сценарии\n\n## Постусловия\n\n## Бизнес-правила\n", id, title, id, date)
		case "flow":
			return fmt.Sprintf("# %s: %s\n\n- Идентификатор: %s\n- Статус: Черновик\n- Последнее обновление: %s\n\n## Процесс\n", id, title, id, date)
		case "screen":
			return fmt.Sprintf("# %s: %s\n\n- Идентификатор: %s\n- Статус: Черновик\n- Последнее обновление: %s\n\n## Назначение\n\n## Состояния\n\n## Переходы\n", id, title, id, date)
		default:
			return fmt.Sprintf("# %s: %s\n\n- Идентификатор: %s\n- Статус: Предложено\n- Дата: %s\n\n## Контекст\n\n## Решение\n\n## Последствия\n", id, title, id, date)
		}
	}
	switch kind {
	case "module":
		return fmt.Sprintf("# %s: %s\n\n- Identifier: %s\n- Status: Draft\n- Last updated: %s\n\n## Purpose\n\n## Business rules\n\n## Invariants\n\n## Interfaces\n", id, title, id, date)
	case "use-case":
		return fmt.Sprintf("# %s: %s\n\n- Identifier: %s\n- Status: Draft\n- Last updated: %s\n\n## Main scenario\n\n## Alternative scenarios\n\n## Postconditions\n\n## Business rules\n", id, title, id, date)
	case "flow":
		return fmt.Sprintf("# %s: %s\n\n- Identifier: %s\n- Status: Draft\n- Last updated: %s\n\n## Process\n", id, title, id, date)
	case "screen":
		return fmt.Sprintf("# %s: %s\n\n- Identifier: %s\n- Status: Draft\n- Last updated: %s\n\n## Purpose\n\n## States\n\n## Transitions\n", id, title, id, date)
	default:
		return fmt.Sprintf("# %s: %s\n\n- Identifier: %s\n- Status: Proposed\n- Date: %s\n\n## Context\n\n## Decision\n\n## Consequences\n", id, title, id, date)
	}
}

func Scaffold(options Options) (ScaffoldReport, error) {
	if info, err := os.Stat(options.InputDirectory); err != nil || !info.IsDir() {
		return ScaffoldReport{}, fmt.Errorf("каталог документации не найден: %s", options.InputDirectory)
	}
	spec, ok := scaffoldSpecs[options.EntityKind]
	if !ok || !validScaffoldID(options.EntityKind, options.EntityID) {
		return ScaffoldReport{}, fmt.Errorf("некорректный %s ID: %s", options.EntityKind, options.EntityID)
	}
	if err := validateScaffoldTitle(options.Title); err != nil {
		return ScaffoldReport{}, err
	}
	if options.Language == "" {
		options.Language = "en"
	}
	if options.Language != "en" && options.Language != "ru" {
		return ScaffoldReport{}, fmt.Errorf("--lang должен быть en или ru")
	}
	relative := filepath.ToSlash(filepath.Join(spec.directory, options.EntityID+".md"))
	target := filepath.Join(options.InputDirectory, filepath.FromSlash(relative))
	if err := atomicCreateFile(target, renderEntityScaffold(options.EntityKind, options.EntityID, options.Title, options.Language, scaffoldDate(options.Now))); err != nil {
		return ScaffoldReport{}, err
	}
	return ScaffoldReport{
		SchemaVersion: 1, Kind: "scaffold", Generator: GeneratorInfo{Name: "Docgent", Version: Version},
		EntityType: options.EntityKind, ID: options.EntityID, Title: options.Title, Language: options.Language, Path: relative,
	}, nil
}
