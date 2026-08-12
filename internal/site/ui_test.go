package site

import (
	"regexp"
	"slices"
	"testing"
)

func TestUICatalogsHaveMatchingKeysAndPlaceholders(t *testing.T) {
	keys := func(messages map[string]string) []string {
		result := make([]string, 0, len(messages))
		for key := range messages {
			result = append(result, key)
		}
		slices.Sort(result)
		return result
	}
	if en, ru := keys(uiEnglish), keys(uiRussian); !slices.Equal(en, ru) {
		t.Fatalf("catalog keys differ\nen=%v\nru=%v", en, ru)
	}
	placeholder := regexp.MustCompile(`\{\d+\}`)
	htmlTag := regexp.MustCompile(`</?[a-zA-Z][^>]*>`)
	for key, english := range uiEnglish {
		en, ru := placeholder.FindAllString(english, -1), placeholder.FindAllString(uiRussian[key], -1)
		slices.Sort(en)
		slices.Sort(ru)
		if !slices.Equal(en, ru) {
			t.Errorf("%s placeholders differ: en=%v ru=%v", key, en, ru)
		}
		if htmlTag.MatchString(english) || htmlTag.MatchString(uiRussian[key]) {
			t.Errorf("%s contains HTML", key)
		}
	}
}

func TestUIUsesRussianOnlyForRussianLocales(t *testing.T) {
	if got := NewUI("ru-RU").Text("skip.content"); got != "Перейти к содержимому" {
		t.Fatalf("ru-RU = %q", got)
	}
	for _, locale := range []string{"", "en", "de-DE", "russian"} {
		if got := NewUI(locale).Text("skip.content"); got != "Skip to content" {
			t.Errorf("%q = %q", locale, got)
		}
	}
	if got := NewUI("en").Text("label.countOf", 2, 5); got != "2 of 5" {
		t.Errorf("formatted text = %q", got)
	}
}
