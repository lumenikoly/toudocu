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
				"{{TRANSITION_ROWS}}":               "| TR-CORE-001 | UC-CORE-01 | Open workspace | Always | SC-CORE-WORKSPACE | DEFAULT | — | — | — | navigation |",
				"{{MODULE_ID}}":                     "MOD-CORE",
				"{{USE_CASE_ID}}":                   "UC-CORE-01",
				"{{USE_CASE_TITLE}}":                "Continue",
				"{{STATUS}}":                        "Запланировано",
				"{{ACTOR}}":                         "User",
				"{{OPTIONAL_SCREENS_METADATA}}":     "- Экраны: SC-CORE-HOME, SC-CORE-WORKSPACE",
				"{{START_SCREEN_ID}}":               "SC-CORE-HOME",
				"{{TERMINAL_SCREEN_IDS}}":           "SC-CORE-WORKSPACE",
				"{{OPTIONAL_ALLOW_CYCLE_METADATA}}": "",
				"{{PRIORITY}}":                      "Средний",
				"{{DATE}}":                          "2026-07-28",
				"{{USE_CASE_SUMMARY}}":              "The user opens the workspace from the home page.",
				"{{INPUT}}":                         "A valid request.",
				"{{PRECONDITION}}":                  "The home page is open.",
				"{{MAIN_STEP}}":                     "The user opens the workspace.",
				"{{ERROR_SCENARIOS}}":               "No error scenario is defined.",
				"{{POSTCONDITIONS}}":                "The workspace is open.",
				"{{BUSINESS_RULE_ID}}":              "BR-CORE-001",
				"{{BUSINESS_RULE_REFERENCE}}":       "Continue is allowed.",
				"{{MODULE_TITLE}}":                  "Core",
				"{{MODULE_FILE}}":                   "core.md",
				"{{FLOW_ID}}":                       "FLOW-CORE-01",
				"{{FLOW_TITLE}}":                    "Continue",
				"{{FLOW_SUMMARY}}":                  "Detailed workspace navigation.",
				"{{FLOW_DIAGRAM}}":                  "flowchart TD\n    Home[\"Home\"] -->|Open workspace| Workspace[\"Workspace\"]",
				"{{USE_CASE_LINK}}":                 "../use-cases/core.md",
				"{{SCREEN_ID}}":                     "SC-CORE-HOME",
				"{{SCREEN_TITLE}}":                  "Home",
				"{{SCREEN_STATUS}}":                 "Запланировано",
				"{{SCREEN_TYPE}}":                   "Страница",
				"{{OPTIONAL_ROUTE_METADATA}}":       "- Маршрут: `/`",
				"{{OPTIONAL_PREVIEW_METADATA}}":     "",
				"{{OPTIONAL_PARENT_METADATA}}":      "",
				"{{OPTIONAL_COMPONENT_METADATA}}":   "- Компонент: `web/home/`",
				"{{YYYY-MM-DD}}":                    "2026-07-28",
				"{{SCREEN_PURPOSE}}":                "Provides the product entry point.",
				"{{STATE_ROWS}}":                    "| DEFAULT | Default | — |",
				"{{TASK_ID}}":                       "TASK-CORE-001",
				"{{TASK_TITLE}}":                    "Implement continue",
				"{{OPTIONAL_FLOW_METADATA}}":        "- Процесс: FLOW-CORE-01",
				"{{OPTIONAL_TRANSITIONS_METADATA}}": "- Переходы: TR-CORE-001",
				"{{TRANSITION_ID}}":                 "TR-CORE-001",
				"{{VERIFICATION_REFERENCE}}":        "TestOpenWorkspace",
				"{{OWNER}}":                         "Team",
				"{{RESULT}}":                        "The continue path works.",
				"{{SCOPE_PATH}}":                    "docs",
				"{{OUT_OF_SCOPE}}":                  "Other scenarios.",
				"{{ACCEPTANCE_CRITERION}}":          "Open workspace navigates to SC-CORE-WORKSPACE.",
				"{{PLAN_STEP}}":                     "Implement the documented transition.",
				"{{ACCEPTANCE_COMMAND}}":            "go test ./...",
				"{{DOCUMENTATION_IMPACT}}":          "Update the screen map.",
			}
			if language == "en" {
				replacements["{{STATUS}}"] = "Planned"
				replacements["{{SCREEN_STATUS}}"] = "Planned"
				replacements["{{PRIORITY}}"] = "Medium"
				replacements["{{OPTIONAL_SCREENS_METADATA}}"] = "- Screens: SC-CORE-HOME, SC-CORE-WORKSPACE"
				replacements["{{SCREEN_TYPE}}"] = "Page"
				replacements["{{OPTIONAL_ROUTE_METADATA}}"] = "- Route: `/`"
				replacements["{{OPTIONAL_COMPONENT_METADATA}}"] = "- Component: `web/home/`"
				replacements["{{OPTIONAL_FLOW_METADATA}}"] = "- Flow: FLOW-CORE-01"
				replacements["{{OPTIONAL_TRANSITIONS_METADATA}}"] = "- Transitions: TR-CORE-001"
			}

			writeSkillTemplate(t, docs, language, "use-case.md", "use-cases/core.md", replacements)
			writeSkillTemplate(t, docs, language, "flow.md", "flows/core.md", replacements)
			writeSkillTemplate(t, docs, language, "screen.md", "screens/SC-CORE-HOME.md", replacements)
			writeSkillTemplate(t, docs, language, "work-ready-feature.md", "work/TASK-CORE-001.md", replacements)
			writeTestFile(t, docs, "screens/SC-CORE-WORKSPACE.md", `# SC-CORE-WORKSPACE: Workspace

- Идентификатор: SC-CORE-WORKSPACE
- Тип: Страница
- Модуль: MOD-CORE
- Статус: Запланировано
- Маршрут: /workspace

Terminal screen.
`)

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

func TestUseDocgentTemplatesDoNotInventSemanticStructure(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		screen := readSkillTemplate(t, language, "screen.md")
		for _, placeholder := range []string{"{{STATE_ROWS}}", "{{TRANSITION_ROWS}}"} {
			if !strings.Contains(screen, placeholder) {
				t.Errorf("%s/screen.md does not contain %s", language, placeholder)
			}
		}

		flow := readSkillTemplate(t, language, "flow.md")
		if !strings.Contains(flow, "{{FLOW_DIAGRAM}}") {
			t.Errorf("%s/flow.md does not contain FLOW_DIAGRAM", language)
		}
		for _, forbidden := range []string{"{{START}}", "{{FINISH}}", "Start --> Finish"} {
			if strings.Contains(flow, forbidden) {
				t.Errorf("%s/flow.md contains default topology %s", language, forbidden)
			}
		}

		decision := readSkillTemplate(t, language, "decision.md")
		if !strings.Contains(decision, "{{CONSEQUENCES}}") {
			t.Errorf("%s/decision.md does not contain CONSEQUENCES", language)
		}
		for _, forbidden := range []string{"{{POSITIVE_CONSEQUENCE}}", "{{NEGATIVE_CONSEQUENCE}}"} {
			if strings.Contains(decision, forbidden) {
				t.Errorf("%s/decision.md requires invented polarity %s", language, forbidden)
			}
		}
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
