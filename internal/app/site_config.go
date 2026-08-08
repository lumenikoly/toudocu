package docudocu

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const defaultFooterURL = "https://lumenikoly.github.io/docu-docu/"

// FooterConfig configures the escaped footer text and its optional HTTPS link.
type FooterConfig struct {
	Text string
	URL  string
}

// HeroConfig configures the dashboard hero.
type HeroConfig struct {
	Enabled bool
	Image   string
}

type ChangesConfig struct {
	DefaultBaseRef       string
	RenameSimilarity     int
	IncludeTaskArtifacts bool
	IncludeAssets        bool
	SemanticDiff         bool
	RenderedDiff         bool
	MaxSourceDiffBytes   int
	MaxRenderedFileBytes int
	Exclude              []string
}

// SiteConfig configures the generated portal's built-in appearance and branding.
type SiteConfig struct {
	Title        string
	Logo         string
	Favicon      string
	Theme        string
	ColorScheme  string
	Accent       string
	Density      string
	ContentWidth string
	Footer       FooterConfig
	Hero         HeroConfig
	Changes      ChangesConfig
	Project      ProjectConfig
	// Translations describes independent documentation roots. It is deliberately
	// not folded into Project: a Docu-docu model is always monolingual.
	Translations      map[string]TranslationProfile
	translationErrors map[string]string
}

// ProjectConfig controls stable built-in section names for one portal locale.
type ProjectConfig struct {
	Locale   string
	Sections map[SectionType]string
}

// TranslationProfile configures one independently checked documentation tree.
// Root is relative to repository root and Sections must name every built-in
// section for Locale.
type TranslationProfile struct {
	Root     string
	Sections map[SectionType]string
}

func defaultSiteConfig() SiteConfig {
	return SiteConfig{
		Theme:        "classic",
		ColorScheme:  "system",
		Accent:       "indigo",
		Density:      "comfortable",
		ContentWidth: "standard",
		Footer: FooterConfig{
			Text: "Сгенерировано Docu-docu " + Version,
			URL:  defaultFooterURL,
		},
		Hero:    HeroConfig{Enabled: true},
		Changes: ChangesConfig{RenameSimilarity: 60, IncludeTaskArtifacts: true, IncludeAssets: true, SemanticDiff: true, RenderedDiff: true, MaxSourceDiffBytes: 2 * 1024 * 1024, MaxRenderedFileBytes: 1024 * 1024},
	}
}

type configScalar struct {
	value  string
	line   int
	quoted bool
}

func parseConfigScalar(raw string, line int) (string, bool, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false, nil
	}
	if strings.HasPrefix(raw, "[") || strings.HasPrefix(raw, "{") || strings.HasPrefix(raw, "-") ||
		strings.HasPrefix(raw, "&") || strings.HasPrefix(raw, "*") || raw == "|" || raw == ">" {
		return "", false, fmt.Errorf("config.yml:%d: неподдерживаемая YAML-конструкция", line)
	}
	if raw[0] == '"' || raw[0] == '\'' {
		quote := raw[0]
		end := -1
		escaped := false
		for i := 1; i < len(raw); i++ {
			if quote == '"' && raw[i] == '\\' && !escaped {
				escaped = true
				continue
			}
			if raw[i] == quote && !escaped {
				end = i
				break
			}
			escaped = false
		}
		if end < 0 || strings.TrimSpace(raw[end+1:]) != "" && !strings.HasPrefix(strings.TrimSpace(raw[end+1:]), "#") {
			return "", false, fmt.Errorf("config.yml:%d: неверная строка", line)
		}
		quoted := raw[:end+1]
		if quote == '\'' {
			return strings.ReplaceAll(quoted[1:len(quoted)-1], "''", "'"), true, nil
		}
		value, err := strconv.Unquote(quoted)
		if err != nil {
			return "", false, fmt.Errorf("config.yml:%d: неверная строка: %v", line, err)
		}
		return value, true, nil
	}
	inURL := false
	for i := 0; i < len(raw); i++ {
		if i+2 < len(raw) && raw[i:i+3] == "://" {
			inURL = true
		}
		if raw[i] == '#' && (i == 0 || raw[i-1] == ' ') {
			raw = strings.TrimSpace(raw[:i])
			break
		}
		if raw[i] == ':' && !inURL {
			return "", false, fmt.Errorf("config.yml:%d: двоеточие в строке нужно заключить в кавычки", line)
		}
	}
	return strings.TrimSpace(raw), false, nil
}

func parseSiteConfig(data []byte) (SiteConfig, error) {
	config := defaultSiteConfig()
	values := map[string]configScalar{}
	changeExcludes := []string{}
	stack := []string{}
	for index, rawLine := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		line := index + 1
		if strings.TrimSpace(rawLine) == "" || strings.HasPrefix(strings.TrimSpace(rawLine), "#") {
			continue
		}
		if strings.Contains(rawLine, "\t") {
			return config, fmt.Errorf("config.yml:%d: табуляция в отступах запрещена", line)
		}
		indent := len(rawLine) - len(strings.TrimLeft(rawLine, " "))
		if indent%2 != 0 || indent > 6 {
			return config, fmt.Errorf("config.yml:%d: неверный отступ", line)
		}
		level := indent / 2
		if level > len(stack) {
			return config, fmt.Errorf("config.yml:%d: неверная вложенность", line)
		}
		text := strings.TrimSpace(rawLine)
		if strings.HasPrefix(text, "- ") && strings.Join(stack, ".") == "changes.exclude" {
			value, _, err := parseConfigScalar(strings.TrimSpace(strings.TrimPrefix(text, "- ")), line)
			if err != nil || value == "" {
				return config, fmt.Errorf("config.yml:%d: неверный changes.exclude", line)
			}
			changeExcludes = append(changeExcludes, value)
			continue
		}
		colon := strings.IndexByte(text, ':')
		if colon <= 0 {
			return config, fmt.Errorf("config.yml:%d: ожидался ключ и двоеточие", line)
		}
		key := strings.TrimSpace(text[:colon])
		if strings.ContainsAny(key, " {}[]&*!|>'\"") {
			return config, fmt.Errorf("config.yml:%d: неверный ключ %q", line, key)
		}
		stack = stack[:level]
		rawValue := strings.TrimSpace(text[colon+1:])
		if strings.HasPrefix(rawValue, "#") {
			rawValue = ""
		}
		path := strings.Join(append(append([]string{}, stack...), key), ".")
		if _, duplicate := values[path]; duplicate {
			return config, fmt.Errorf("config.yml:%d: повторный ключ %q", line, path)
		}
		if rawValue == "" {
			values[path] = configScalar{line: line}
			stack = append(stack, key)
			continue
		}
		value, quoted, err := parseConfigScalar(rawValue, line)
		if err != nil {
			return config, err
		}
		values[path] = configScalar{value: value, line: line, quoted: quoted}
	}

	allowedMaps := map[string]bool{"site": true, "site.footer": true, "site.hero": true, "changes": true, "changes.exclude": true, "project": true, "project.sections": true, "translations": true}
	allowedScalars := map[string]bool{
		"site.title": true, "site.logo": true, "site.favicon": true, "site.theme": true,
		"site.colorScheme": true, "site.accent": true, "site.density": true, "site.contentWidth": true,
		"site.footer.text": true, "site.footer.url": true, "site.hero.enabled": true, "site.hero.image": true,
		"changes.defaultBaseRef": true, "changes.renameSimilarity": true, "changes.includeTaskArtifacts": true,
		"changes.includeAssets": true, "changes.semanticDiff": true, "changes.renderedDiff": true,
		"changes.maxSourceDiffBytes": true, "changes.maxRenderedFileBytes": true,
		"project.locale": true,
	}
	for _, spec := range BuiltinSections {
		allowedScalars["project.sections."+string(spec.Type)] = true
	}
	translationLocales := map[string]string{}
	translationErrors := map[string]string{}
	for path, scalar := range values {
		parts := strings.Split(path, ".")
		if len(parts) < 2 || parts[0] != "translations" {
			continue
		}
		locale, ok := normalizeLocale(parts[1])
		if !ok {
			// Keep translation-specific errors deferred until that root is chosen.
			continue
		}
		if previous, duplicate := translationLocales[locale]; duplicate && previous != parts[1] {
			translationErrors[locale] = "TRANSLATION_LOCALE_INVALID: duplicate normalized locale " + locale
			continue
		}
		translationLocales[locale] = parts[1]
		allowedMaps["translations."+parts[1]] = true
		allowedMaps["translations."+parts[1]+".sections"] = true
		allowedScalars["translations."+parts[1]+".root"] = true
		for _, spec := range BuiltinSections {
			allowedScalars["translations."+parts[1]+".sections."+string(spec.Type)] = true
		}
		_ = scalar
	}
	if _, hasCustomText := values["site.footer.text"]; hasCustomText {
		if _, hasCustomURL := values["site.footer.url"]; !hasCustomURL {
			config.Footer.URL = ""
		}
	}
	for key, scalar := range values {
		if scalar.value == "" && allowedMaps[key] {
			continue
		}
		if !allowedScalars[key] {
			if strings.HasPrefix(key, "translations.") {
				// Translation profiles are selected lazily. This lets a canonical
				// check remain independent from an unfinished locale profile.
				continue
			}
			return config, fmt.Errorf("config.yml:%d: неизвестный ключ %q", scalar.line, key)
		}
		isBoolean := key == "site.hero.enabled" || strings.HasPrefix(key, "changes.include") || key == "changes.semanticDiff" || key == "changes.renderedDiff"
		if !isBoolean && !scalar.quoted && (scalar.value == "true" || scalar.value == "false") {
			return config, fmt.Errorf("config.yml:%d: %s должен быть строкой", scalar.line, key)
		}
		switch key {
		case "project.locale":
			locale, ok := normalizeLocale(scalar.value)
			if !ok {
				return config, fmt.Errorf("config.yml:%d: project.locale должен быть корректным BCP-47-style locale", scalar.line)
			}
			config.Project.Locale = locale
		case "translations":
		case "project.sections.architecture", "project.sections.modules", "project.sections.use-cases", "project.sections.flows", "project.sections.screens", "project.sections.decisions", "project.sections.contracts", "project.sections.quality", "project.sections.runbooks", "project.sections.reference", "project.sections.work", "project.sections.guides":
			if strings.TrimSpace(scalar.value) == "" {
				return config, fmt.Errorf("config.yml:%d: %s не может быть пустым", scalar.line, key)
			}
			if config.Project.Sections == nil {
				config.Project.Sections = map[SectionType]string{}
			}
			config.Project.Sections[SectionType(strings.TrimPrefix(key, "project.sections."))] = scalar.value
		case "site.title":
			config.Title = scalar.value
		case "site.logo":
			config.Logo = scalar.value
		case "site.favicon":
			config.Favicon = scalar.value
		case "site.theme":
			config.Theme = scalar.value
		case "site.colorScheme":
			config.ColorScheme = scalar.value
		case "site.accent":
			config.Accent = scalar.value
		case "site.density":
			config.Density = scalar.value
		case "site.contentWidth":
			config.ContentWidth = scalar.value
		case "site.footer.text":
			config.Footer.Text = scalar.value
		case "site.footer.url":
			config.Footer.URL = scalar.value
		case "site.hero.image":
			config.Hero.Image = scalar.value
		case "site.hero.enabled":
			if scalar.quoted || scalar.value != "true" && scalar.value != "false" {
				return config, fmt.Errorf("config.yml:%d: site.hero.enabled должен быть boolean", scalar.line)
			}
			config.Hero.Enabled = scalar.value == "true"
		case "changes.defaultBaseRef":
			config.Changes.DefaultBaseRef = scalar.value
		case "changes.renameSimilarity":
			value, err := strconv.Atoi(scalar.value)
			if err != nil || value < 1 || value > 100 {
				return config, fmt.Errorf("config.yml:%d: changes.renameSimilarity должен быть от 1 до 100", scalar.line)
			}
			config.Changes.RenameSimilarity = value
		case "changes.maxSourceDiffBytes":
			value, err := strconv.Atoi(scalar.value)
			if err != nil || value < 1 {
				return config, fmt.Errorf("config.yml:%d: changes.maxSourceDiffBytes должен быть положительным", scalar.line)
			}
			config.Changes.MaxSourceDiffBytes = value
		case "changes.maxRenderedFileBytes":
			value, err := strconv.Atoi(scalar.value)
			if err != nil || value < 1 {
				return config, fmt.Errorf("config.yml:%d: changes.maxRenderedFileBytes должен быть положительным", scalar.line)
			}
			config.Changes.MaxRenderedFileBytes = value
		case "changes.includeTaskArtifacts", "changes.includeAssets", "changes.semanticDiff", "changes.renderedDiff":
			if scalar.quoted || scalar.value != "true" && scalar.value != "false" {
				return config, fmt.Errorf("config.yml:%d: %s должен быть boolean", scalar.line, key)
			}
			value := scalar.value == "true"
			switch key {
			case "changes.includeTaskArtifacts":
				config.Changes.IncludeTaskArtifacts = value
			case "changes.includeAssets":
				config.Changes.IncludeAssets = value
			case "changes.semanticDiff":
				config.Changes.SemanticDiff = value
			case "changes.renderedDiff":
				config.Changes.RenderedDiff = value
			}
		}
	}
	if len(translationLocales) > 0 {
		config.Translations = map[string]TranslationProfile{}
		config.translationErrors = translationErrors
		for locale, rawLocale := range translationLocales {
			profile := TranslationProfile{Sections: map[SectionType]string{}}
			if root, ok := values["translations."+rawLocale+".root"]; ok {
				profile.Root = root.value
			}
			for _, spec := range BuiltinSections {
				if title, ok := values["translations."+rawLocale+".sections."+string(spec.Type)]; ok {
					profile.Sections[spec.Type] = title.value
				}
			}
			config.Translations[locale] = profile
		}
	}
	config.Changes.Exclude = changeExcludes
	if _, ok := values["site"]; !ok {
		if _, changesOnly := values["changes"]; changesOnly || values["project"].line > 0 || values["translations"].line > 0 {
			return config, validateSiteConfig(config)
		}
		return config, fmt.Errorf("config.yml: отсутствует корневая карта site")
	}
	return config, validateSiteConfig(config)
}

func enumValue(field, value string, allowed ...string) error {
	for _, candidate := range allowed {
		if value == candidate {
			return nil
		}
	}
	return fmt.Errorf("config.yml: неверное значение site.%s %q (допустимо: %s)", field, value, strings.Join(allowed, ", "))
}

func validateSiteConfig(config SiteConfig) error {
	if err := enumValue("theme", config.Theme, "classic", "paper", "terminal"); err != nil {
		return err
	}
	if err := enumValue("colorScheme", config.ColorScheme, "light", "dark", "system"); err != nil {
		return err
	}
	if err := enumValue("accent", config.Accent, "indigo", "blue", "teal", "green", "amber", "rose", "violet"); err != nil {
		return err
	}
	if err := enumValue("density", config.Density, "compact", "comfortable"); err != nil {
		return err
	}
	if err := enumValue("contentWidth", config.ContentWidth, "narrow", "standard", "wide"); err != nil {
		return err
	}
	if config.Footer.URL != "" {
		parsed, err := url.ParseRequestURI(config.Footer.URL)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || strings.ContainsAny(config.Footer.URL, "\r\n\t <>\"'") {
			return fmt.Errorf("config.yml: site.footer.url должен быть безопасным HTTPS URL")
		}
	}
	return nil
}

func validateBrandAsset(repositoryRoot, configuredPath, kind string) (string, string, error) {
	if configuredPath == "" {
		return "", "", nil
	}
	if filepath.IsAbs(configuredPath) || strings.Contains(configuredPath, "\\") {
		return "", "", fmt.Errorf("config.yml: site.%s должен быть относительным путём внутри assets/", kind)
	}
	clean := filepath.Clean(filepath.FromSlash(configuredPath))
	if clean == "." || clean == "assets" || !strings.HasPrefix(clean, "assets"+string(filepath.Separator)) {
		return "", "", fmt.Errorf("config.yml: site.%s должен находиться внутри .docu-docu/assets/", kind)
	}
	relative := strings.TrimPrefix(clean, "assets"+string(filepath.Separator))
	if relative == "" || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("config.yml: site.%s выходит за пределы .docu-docu/assets/", kind)
	}
	assetsRoot := filepath.Join(repositoryRoot, ".docu-docu", "assets")
	for _, directory := range []string{filepath.Join(repositoryRoot, ".docu-docu"), assetsRoot} {
		info, err := os.Lstat(directory)
		if err != nil {
			if os.IsNotExist(err) {
				return "", "", fmt.Errorf("config.yml: asset site.%s не найден: %s", kind, configuredPath)
			}
			return "", "", err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return "", "", fmt.Errorf("config.yml: symlink запрещён в пути site.%s: %s", kind, configuredPath)
		}
	}
	current := assetsRoot
	for _, part := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			if os.IsNotExist(err) {
				return "", "", fmt.Errorf("config.yml: asset site.%s не найден: %s", kind, configuredPath)
			}
			return "", "", err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", "", fmt.Errorf("config.yml: symlink запрещён для site.%s: %s", kind, configuredPath)
		}
	}
	info, err := os.Stat(current)
	if err != nil || !info.Mode().IsRegular() {
		return "", "", fmt.Errorf("config.yml: site.%s должен указывать на обычный файл", kind)
	}
	extension := strings.ToLower(filepath.Ext(current))
	if extension == "" {
		extension = ".bin"
	}
	return current, "assets/branding/" + kind + extension, nil
}

func loadSiteConfig(repositoryRoot string) (SiteConfig, map[string]string, error) {
	configPath := filepath.Join(repositoryRoot, ".docu-docu", "config.yml")
	data, err := os.ReadFile(configPath)
	if os.IsNotExist(err) {
		return defaultSiteConfig(), map[string]string{}, nil
	}
	if err != nil {
		return SiteConfig{}, nil, fmt.Errorf("не удалось прочитать .docu-docu/config.yml: %w", err)
	}
	config, err := parseSiteConfig(data)
	if err != nil {
		return SiteConfig{}, nil, err
	}
	branding := map[string]string{}
	for kind, configured := range map[string]string{"logo": config.Logo, "favicon": config.Favicon, "hero": config.Hero.Image} {
		source, output, assetErr := validateBrandAsset(repositoryRoot, configured, kind)
		if assetErr != nil {
			return SiteConfig{}, nil, assetErr
		}
		if source != "" {
			branding[output] = source
		}
	}
	return config, branding, nil
}

// selectTranslationProfile applies a profile only when input is exactly its
// root. Configuring translations must never make an ordinary canonical command
// fail because another locale is incomplete.
func selectTranslationProfile(config *SiteConfig, repositoryRoot, inputRoot string) ([]string, error) {
	inputRoot = filepath.Clean(inputRoot)
	validRoots := []string{}
	selected := ""
	for locale, profile := range config.Translations {
		root, err := safeTranslationRoot(repositoryRoot, profile.Root)
		if err != nil {
			continue
		}
		validRoots = append(validRoots, root)
		if filepath.Clean(root) == inputRoot {
			selected = locale
		}
	}
	if selected == "" {
		return validRoots, nil
	}
	profile := config.Translations[selected]
	if config.translationErrors[selected] != "" {
		return nil, fmt.Errorf("%s", config.translationErrors[selected])
	}
	root, err := safeTranslationRoot(repositoryRoot, profile.Root)
	if err != nil {
		return nil, fmt.Errorf("TRANSLATION_PROFILE_INVALID: %w", err)
	}
	// `docs/` is the conventional canonical root. Keeping translations outside
	// it prevents an accidental multilingual tree from becoming one model.
	canonicalRoot := filepath.Join(repositoryRoot, "docs")
	if info, statErr := os.Stat(canonicalRoot); statErr == nil && info.IsDir() && (pathContains(canonicalRoot, root) || pathContains(root, canonicalRoot)) {
		return nil, fmt.Errorf("TRANSLATION_ROOT_COLLISION: translations.%s пересекается с canonical docs root", selected)
	}
	if selected == config.Project.Locale {
		return nil, fmt.Errorf("TRANSLATION_LOCALE_CONFLICT: locale %q совпадает с project.locale", selected)
	}
	if len(profile.Sections) != len(BuiltinSections) {
		return nil, fmt.Errorf("TRANSLATION_PROFILE_INCOMPLETE: translations.%s.sections должен содержать все встроенные разделы", selected)
	}
	for _, spec := range BuiltinSections {
		if strings.TrimSpace(profile.Sections[spec.Type]) == "" {
			return nil, fmt.Errorf("TRANSLATION_PROFILE_INCOMPLETE: translations.%s.sections.%s пуст", selected, spec.Type)
		}
	}
	for otherLocale, other := range config.Translations {
		if otherLocale == selected {
			continue
		}
		otherRoot, otherErr := safeTranslationRoot(repositoryRoot, other.Root)
		if otherErr != nil {
			continue
		}
		if filepath.Clean(otherRoot) == root || pathContains(root, otherRoot) || pathContains(otherRoot, root) {
			return nil, fmt.Errorf("TRANSLATION_ROOT_COLLISION: translations.%s и translations.%s пересекаются", selected, otherLocale)
		}
	}
	config.Project = ProjectConfig{Locale: selected, Sections: profile.Sections}
	return validRoots, nil
}

const translationRootReadOnlyCode = "TRANSLATION_ROOT_READ_ONLY"

func translationLocaleForRoot(config SiteConfig, repositoryRoot, inputRoot string) string {
	inputRoot = filepath.Clean(inputRoot)
	for locale, profile := range config.Translations {
		root, err := safeTranslationRoot(repositoryRoot, profile.Root)
		if err == nil && filepath.Clean(root) == inputRoot {
			return locale
		}
	}
	return ""
}

func translationRootReadOnlyError(locale string) error {
	return fmt.Errorf("%s: translation root %q доступен только для чтения; используйте canonical docs root", translationRootReadOnlyCode, locale)
}

func translationLocaleForOptions(options Options) (string, error) {
	inputRoot, err := filepath.Abs(options.InputDirectory)
	if err != nil {
		return "", err
	}
	repositoryRoot := options.RepositoryRoot
	if repositoryRoot == "" {
		repositoryRoot = filepath.Dir(inputRoot)
	}
	repositoryRoot, err = filepath.Abs(repositoryRoot)
	if err != nil {
		return "", err
	}
	config, _, err := loadSiteConfig(repositoryRoot)
	if err != nil {
		return "", err
	}
	return translationLocaleForRoot(config, repositoryRoot, inputRoot), nil
}

func rejectTranslationRootMutation(options Options) error {
	locale, err := translationLocaleForOptions(options)
	if err != nil {
		return err
	}
	if locale != "" {
		return translationRootReadOnlyError(locale)
	}
	return nil
}

func rejectTranslationTaskModel(model *Model) error {
	if model != nil && model.translationLocale != "" {
		return translationRootReadOnlyError(model.translationLocale)
	}
	return nil
}

func safeTranslationRoot(repositoryRoot, configured string) (string, error) {
	if strings.TrimSpace(configured) == "" || filepath.IsAbs(configured) || strings.Contains(configured, "\\") {
		return "", fmt.Errorf("translation root должен быть непустым относительным путём внутри repository root")
	}
	clean := filepath.Clean(filepath.FromSlash(configured))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("translation root выходит за repository root")
	}
	root := filepath.Join(repositoryRoot, clean)
	if !pathContains(repositoryRoot, root) || filepath.Clean(root) == filepath.Clean(repositoryRoot) {
		return "", fmt.Errorf("translation root должен быть вложен в repository root")
	}
	current := repositoryRoot
	for _, part := range strings.Split(clean, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			break
		}
		if err != nil {
			return "", err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("symlink запрещён в translation root: %s", configured)
		}
	}
	return root, nil
}

func pathContains(parent, child string) bool {
	rel, err := filepath.Rel(filepath.Clean(parent), filepath.Clean(child))
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
