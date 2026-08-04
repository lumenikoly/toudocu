package docgent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUseDocgentFlowAndScreenTemplates(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		t.Run(language, func(t *testing.T) {
			root := t.TempDir()
			docs := filepath.Join(root, "docs")
			writeTestFile(t, docs, "index.md", "# Template fixture\n\nDocgent skill template fixture.\n")
			writeTestFile(t, docs, "modules/core.md", `# Core

- Идентификатор: MOD-CORE
- Статус: Запланировано

Core module.

## Бизнес-правила

### BR-CORE-001: Continue

The user can continue from the start screen.
`)

			replacements := map[string]string{
				"{{SCREEN_MAP_SUMMARY}}":          "Product navigation.",
				"{{AREA}}":                        "CORE",
				"{{START_SCREEN_TITLE}}":          "Start",
				"{{RESULT_SCREEN_TITLE}}":         "Result",
				"{{MODULE_ID}}":                   "MOD-CORE",
				"{{START_ROUTE}}":                 "/start",
				"{{RESULT_ROUTE}}":                "/result",
				"{{ACTION}}":                      "Continue",
				"{{USE_CASE_ID}}":                 "UC-CORE-01",
				"{{USE_CASE_TITLE}}":              "Continue",
				"{{STATUS}}":                      "Запланировано",
				"{{ACTOR}}":                       "User",
				"{{OPTIONAL_SCREENS_METADATA}}":   "- Экраны: SC-CORE-START, SC-CORE-RESULT",
				"{{PRIORITY}}":                    "Средний",
				"{{DATE}}":                        "2026-07-28",
				"{{USE_CASE_SUMMARY}}":            "The user moves to the result screen.",
				"{{INPUT}}":                       "A valid request.",
				"{{PRECONDITION}}":                "The start screen is open.",
				"{{MAIN_STEP}}":                   "The user continues.",
				"{{ERROR_SCENARIOS}}":             "No error scenario is defined.",
				"{{POSTCONDITIONS}}":              "The result screen is open.",
				"{{BUSINESS_RULE_ID}}":            "BR-CORE-001",
				"{{BUSINESS_RULE_REFERENCE}}":     "Continue is allowed.",
				"{{MODULE_TITLE}}":                "Core",
				"{{MODULE_FILE}}":                 "core.md",
				"{{FLOW_ID}}":                     "FLOW-CORE-01",
				"{{FLOW_TITLE}}":                  "Continue",
				"{{FLOW_SUMMARY}}":                "Detailed continue flow.",
				"{{START}}":                       "Start",
				"{{FINISH}}":                      "Result",
				"{{USE_CASE_LINK}}":               "../use-cases/core.md",
				"{{SCREEN_ID}}":                   "SC-CORE-START",
				"{{SCREEN_TITLE}}":                "Start",
				"{{SCREEN_STATUS}}":               "Запланировано",
				"{{OPTIONAL_ROUTE_METADATA}}":     "- Маршрут: `/start`",
				"{{OPTIONAL_COMPONENT_METADATA}}": "- Компонент: `web/start/`",
				"{{YYYY-MM-DD}}":                  "2026-07-28",
				"{{SCREEN_PURPOSE}}":              "Starts the scenario.",
				"{{STATES_AND_ERRORS}}":           "The screen has its default state.",
				"{{TASK_ID}}":                     "TASK-CORE-001",
				"{{TASK_TITLE}}":                  "Implement continue",
				"{{OPTIONAL_FLOW_METADATA}}":      "- Процесс: FLOW-CORE-01",
				"{{OWNER}}":                       "Team",
				"{{RESULT}}":                      "The continue path works.",
				"{{SCOPE_PATH}}":                  "docs",
				"{{OUT_OF_SCOPE}}":                "Other scenarios.",
				"{{ACCEPTANCE_CRITERION}}":        "Continue opens SC-CORE-RESULT.",
				"{{PLAN_STEP}}":                   "Implement the documented transition.",
				"{{ACCEPTANCE_COMMAND}}":          "go test ./...",
				"{{DOCUMENTATION_IMPACT}}":        "Update the screen map.",
			}
			if language == "en" {
				replacements["{{STATUS}}"] = "Planned"
				replacements["{{SCREEN_STATUS}}"] = "Planned"
				replacements["{{PRIORITY}}"] = "Medium"
				replacements["{{OPTIONAL_SCREENS_METADATA}}"] = "- Screens: SC-CORE-START, SC-CORE-RESULT"
				replacements["{{OPTIONAL_ROUTE_METADATA}}"] = "- Route: `/start`"
				replacements["{{OPTIONAL_COMPONENT_METADATA}}"] = "- Component: `web/start/`"
				replacements["{{OPTIONAL_FLOW_METADATA}}"] = "- Flow: FLOW-CORE-01"
			}

			writeSkillTemplate(t, docs, language, "screen-map.md", "screens/map.md", replacements)
			writeSkillTemplate(t, docs, language, "use-case.md", "use-cases/core.md", replacements)
			writeSkillTemplate(t, docs, language, "flow.md", "flows/core.md", replacements)
			writeSkillTemplate(t, docs, language, "screen.md", "screens/SC-CORE-START.md", replacements)
			writeSkillTemplate(t, docs, language, "work-ready-feature.md", "work/TASK-CORE-001.md", replacements)

			model, err := BuildDocumentationModel(Options{
				InputDirectory: docs,
				RepositoryRoot: root,
				StaleDays:      0,
			})
			if err != nil {
				t.Fatal(err)
			}
			for _, issue := range model.Issues {
				if issue.Severity == "error" {
					t.Fatalf("instantiated %s skill templates produced an error: %#v", language, issue)
				}
			}
			if len(model.Knowledge.Screens) != 2 || len(model.Knowledge.Transitions) != 1 {
				t.Fatalf("unexpected screen graph: %#v", model.Knowledge)
			}
			context, err := BuildTaskContext(model, "TASK-CORE-001")
			if err != nil {
				t.Fatal(err)
			}
			if context.Task.FlowID != "FLOW-CORE-01" || len(context.Screens) != 2 || len(context.ScreenTransitions) != 1 {
				t.Fatalf("flow or screens missing from task context: %#v", context)
			}
		})
	}
}

func TestUseDocgentOptionalRelationshipPlaceholders(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		for _, templateName := range []string{"work-ready-feature.md", "work-ready-technical.md", "work-draft.md"} {
			content := readSkillTemplate(t, language, templateName)
			for _, placeholder := range []string{"{{OPTIONAL_FLOW_METADATA}}", "{{OPTIONAL_SCREENS_METADATA}}"} {
				if !strings.Contains(content, placeholder) {
					t.Errorf("%s/%s does not contain %s", language, templateName, placeholder)
				}
			}
		}
		if content := readSkillTemplate(t, language, "use-case.md"); !strings.Contains(content, "{{OPTIONAL_SCREENS_METADATA}}") {
			t.Errorf("%s/use-case.md does not support screen relationships", language)
		}
		screen := readSkillTemplate(t, language, "screen.md")
		for _, placeholder := range []string{"{{OPTIONAL_ROUTE_METADATA}}", "{{OPTIONAL_COMPONENT_METADATA}}"} {
			if !strings.Contains(screen, placeholder) {
				t.Errorf("%s/screen.md does not contain %s", language, placeholder)
			}
		}
	}
}

func writeSkillTemplate(t *testing.T, docs, language, templateName, destination string, replacements map[string]string) {
	t.Helper()
	rendered := readSkillTemplate(t, language, templateName)
	for placeholder, value := range replacements {
		rendered = strings.ReplaceAll(rendered, placeholder, value)
	}
	if strings.Contains(rendered, "{{") {
		t.Fatalf("unresolved placeholder in %s/%s:\n%s", language, templateName, rendered)
	}
	writeTestFile(t, docs, destination, rendered)
}

func readSkillTemplate(t *testing.T, language, templateName string) string {
	t.Helper()
	templatePath := filepath.Join("skills", "use-docgent", "assets", "templates", language, templateName)
	content, err := os.ReadFile(templatePath)
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}
