package site

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed i18n/en.json i18n/ru.json
var localeFiles embed.FS

var (
	uiEnglish = mustCatalog("i18n/en.json")
	uiRussian = mustCatalog("i18n/ru.json")
)

// UI is the built-in portal catalog selected by project.locale/ui.locale.
// Only Russian has a dedicated non-English catalog; every other locale uses English.
type UI struct {
	messages map[string]string
}

func mustCatalog(name string) map[string]string {
	var messages map[string]string
	data, err := localeFiles.ReadFile(name)
	if err != nil {
		panic(err)
	}
	if err := json.Unmarshal(data, &messages); err != nil {
		panic(err)
	}
	return messages
}

func NewUI(locale string) UI {
	language := strings.ToLower(strings.SplitN(strings.ReplaceAll(strings.TrimSpace(locale), "_", "-"), "-", 2)[0])
	if language == "ru" {
		return UI{messages: uiRussian}
	}
	return UI{messages: uiEnglish}
}

func (ui UI) Text(key string, args ...any) string {
	value := ui.messages[key]
	if value == "" {
		value = uiEnglish[key]
	}
	if value == "" {
		return key
	}
	for index, arg := range args {
		value = strings.ReplaceAll(value, fmt.Sprintf("{%d}", index), fmt.Sprint(arg))
	}
	return value
}
