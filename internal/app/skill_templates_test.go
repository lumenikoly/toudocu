package docudocu

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUseDocuDocuFlowAndScreenTemplates(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		t.Run(language, func(t *testing.T) {
			root := t.TempDir()
			docs := filepath.Join(root, "docs")
			writeTestFile(t, docs, "index.md", "# Template fixture\n\nDocu-docu skill template fixture.\n")
			writeArchitectureOverview(t, docs, "")
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
				"{{OPTIONAL_USE_CASES_METADATA}}":   "- Сценарий: UC-CORE-01, UC-CORE-02",
				"{{RELATED_DOCUMENT_LINKS}}":        "- [UC-CORE-01](../use-cases/core.md)\n- [UC-CORE-02](../use-cases/secondary.md)",
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
				"{{BEFORE}}":                        "The continue path is unavailable.",
				"{{AFTER}}":                         "The continue path opens the workspace.",
				"{{SCOPE_PATH}}":                    "docs",
				"{{OUT_OF_SCOPE}}":                  "Other scenarios.",
				"{{ACCEPTANCE_CRITERION}}":          "Open workspace navigates to SC-CORE-WORKSPACE.",
				"{{PLAN_STEP}}":                     "Implement the documented transition.",
				"{{ACCEPTANCE_COMMAND}}":            "go test ./...",
				"{{ALL_COMMAND}}":                   "go test ./...",
				"{{DOCS_COMMAND}}":                  "go run ./cmd/docu-docu check ./docs",
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
				replacements["{{OPTIONAL_USE_CASES_METADATA}}"] = "- Use case: UC-CORE-01, UC-CORE-02"
			}

			writeSkillTemplate(t, docs, language, "use-case.md", "use-cases/core.md", replacements)
			writeTestFile(t, docs, "use-cases/secondary.md", `# UC-CORE-02: Review

- Identifier: UC-CORE-02
- Status: Planned
- Module: MOD-CORE

The user reviews the workspace.
`)
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
			if len(model.Knowledge.Flows) != 1 || strings.Join(model.Knowledge.Flows[0].UseCaseIDs, ",") != "UC-CORE-01,UC-CORE-02" {
				t.Fatalf("flow does not contain both use cases: %#v", model.Knowledge.Flows)
			}
			for _, useCase := range model.Knowledge.UseCases {
				if strings.Join(useCase.FlowIDs, ",") != "FLOW-CORE-01" {
					t.Fatalf("%s does not contain the reverse flow relationship: %#v", useCase.ID, useCase.FlowIDs)
				}
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

func TestUseDocuDocuTemplatesDoNotInventSemanticStructure(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		screen := readSkillTemplate(t, language, "screen.md")
		for _, placeholder := range []string{"{{STATE_ROWS}}", "{{TRANSITION_ROWS}}"} {
			if !strings.Contains(screen, placeholder) {
				t.Errorf("%s/screen.md does not contain %s", language, placeholder)
			}
		}

		flow := readSkillTemplate(t, language, "flow.md")
		for _, placeholder := range []string{"{{FLOW_DIAGRAM}}", "{{OPTIONAL_USE_CASES_METADATA}}", "{{RELATED_DOCUMENT_LINKS}}"} {
			if !strings.Contains(flow, placeholder) {
				t.Errorf("%s/flow.md does not contain %s", language, placeholder)
			}
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

func TestUseDocuDocuWorkItemReferenceAllowsCriteriaAndPlanChecklists(t *testing.T) {
	content, err := os.ReadFile(repositoryPath("skills", "use-docu-docu", "references", "document-model.md"))
	if err != nil {
		t.Fatal(err)
	}
	reference := string(content)
	if !strings.Contains(reference, "Checkboxes are allowed in both acceptance criteria and plan.") {
		t.Fatal("document-model reference does not allow checkboxes in both acceptance criteria and plan")
	}
	if strings.Contains(reference, "Put checkboxes only in acceptance criteria.") {
		t.Fatal("document-model reference still restricts checkboxes to acceptance criteria")
	}
}

func TestUseDocuDocuOptionalRelationshipPlaceholders(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		for _, templateName := range []string{"work-ready-feature.md", "work-ready-technical.md", "work-draft.md"} {
			content := readSkillTemplate(t, language, templateName)
			for _, placeholder := range []string{"{{OPTIONAL_FLOW_METADATA}}", "{{OPTIONAL_SCREENS_METADATA}}"} {
				if !strings.Contains(content, placeholder) {
					t.Errorf("%s/%s does not contain %s", language, templateName, placeholder)
				}
			}
		}
		bug := readSkillTemplate(t, language, "work-ready-bug.md")
		for _, placeholder := range []string{"{{BUG_ID}}", "{{REPRODUCIBILITY}}", "{{REGRESSION_CRITERION}}", "{{OPTIONAL_SCREENS_METADATA}}"} {
			if !strings.Contains(bug, placeholder) {
				t.Errorf("%s/work-ready-bug.md does not contain %s", language, placeholder)
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

func TestUseDocuDocuInitContract(t *testing.T) {
	skill := readUseDocuDocuFile(t, "SKILL.md")
	for _, expected := range []string{
		"explicitly invokes `$use-docu-docu init`",
		"[references/init.md](references/init.md)",
		"Never infer initialization",
		"Docu-docu Go CLI command",
	} {
		if !strings.Contains(skill, expected) {
			t.Errorf("SKILL.md does not define explicit init contract %q", expected)
		}
	}

	initReference := readUseDocuDocuFile(t, filepath.Join("references", "init.md"))
	for _, expected := range []string{
		"Do not infer initialization",
		"Preflight before changing files",
		"<!-- docu-docu:project-guidance:start -->",
		"<!-- docu-docu:project-guidance:end -->",
		"duplicated",
		"reversed",
		"conflicting",
		"no `index.md`",
		"`missing-architecture-overview` may be the only error",
		"`docs/architecture/overview.md`",
		"as legacy\n   architecture",
		"stop without migrating or rewriting",
		"ordinary project-wide Docu-docu check",
		"Do not create a `TASK-*` merely because init is running",
	} {
		if !strings.Contains(initReference, expected) {
			t.Errorf("init reference does not contain %q", expected)
		}
	}
}

func TestUseDocuDocuRefreshContract(t *testing.T) {
	skill := readUseDocuDocuFile(t, "SKILL.md")
	for _, expected := range []string{
		"explicitly invokes `$use-docu-docu refresh`",
		"`$use-docu-docu refresh diff`",
		"[references/refresh.md](references/refresh.md)",
		"Neither refresh form is a Docu-docu\nGo CLI command or an initialization request",
	} {
		if !strings.Contains(skill, expected) {
			t.Errorf("SKILL.md does not define refresh contract %q", expected)
		}
	}

	refresh := readUseDocuDocuFile(t, filepath.Join("references", "refresh.md"))
	for _, expected := range []string{
		"`$use-docu-docu refresh`",
		"`$use-docu-docu refresh diff`",
		"inventory every source Markdown document",
		"`git diff --name-only HEAD --`",
		"`git ls-files --others --exclude-standard`",
		"staged and unstaged tracked changes",
		"Do not compare with a merge-base or\n   default branch",
		"If Git or `HEAD` is unavailable",
		"links, backlinks, stable IDs",
		"Exclude generated portals",
		"does not\n   change code to make a document true",
		"unresolved\n   findings",
		"Creating, deleting, renaming, or merging a document",
		"Update every\n   affected link, ID reference",
		"only when content or declared\n   relationships actually change",
		"Never advance `Last verified`",
		"Never edit generated portal output as documentation",
		"Obtain independent semantic review",
		"Rebuild a portal only when it is tracked",
		"Refresh never performs initialization",
	} {
		if !strings.Contains(refresh, expected) {
			t.Errorf("refresh reference does not contain %q", expected)
		}
	}

	initReference := readUseDocuDocuFile(t, filepath.Join("references", "init.md"))
	if strings.Contains(initReference, "$use-docu-docu refresh") {
		t.Fatal("init reference must not route refresh")
	}

	for _, language := range []string{"ru", "en"} {
		guidance := readUseDocuDocuFile(t, filepath.Join("assets", "project-guidance", language+".md"))
		for _, expected := range []string{"$use-docu-docu refresh", "$use-docu-docu refresh diff", "HEAD"} {
			if !strings.Contains(guidance, expected) {
				t.Errorf("%s guidance does not contain %q", language, expected)
			}
		}
	}
}

func TestUseDocuDocuCompactOperationRouter(t *testing.T) {
	skill := readUseDocuDocuFile(t, "SKILL.md")
	for _, expected := range []string{
		"| Operation | Reference | Changes files? | Confirmation / authority |",
		"[references/init.md](references/init.md)",
		"[references/refresh.md](references/refresh.md)",
		"[references/translate.md](references/translate.md)",
		"[references/workflows.md](references/workflows.md)",
		"[references/semantic-gate.md](references/semantic-gate.md)",
		"both `index.md` and\n  `architecture/overview.md`",
	} {
		if !strings.Contains(skill, expected) {
			t.Errorf("compact router missing %q", expected)
		}
	}
	if strings.Count(skill, "architecture/overview.md") < 1 {
		t.Fatal("skill must expose the single architecture overview invariant")
	}
}

func TestUseDocuDocuArchitectureTemplates(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		t.Run(language, func(t *testing.T) {
			overview := readSkillTemplate(t, language, "architecture-overview.md")
			detail := readSkillTemplate(t, language, "architecture-detail.md")
			for _, expected := range []string{"Architecture Overview", "{{SYSTEM_BOUNDARY}}", "{{ARCHITECTURE_QUESTION_LINKS}}", "{{OPTIONAL_CONTEXT_DIAGRAM}}"} {
				if !strings.Contains(overview, expected) {
					t.Errorf("%s architecture overview does not contain %q", language, expected)
				}
			}
			for _, expected := range []string{"Architecture", "{{ARCHITECTURE_QUESTION}}", "{{SHORT_ANSWER}}", "{{SCOPE}}", "{{ADAPTABLE_SECTIONS}}"} {
				if !strings.Contains(detail, expected) {
					t.Errorf("%s architecture detail does not contain %q", language, expected)
				}
			}
			if _, err := os.Stat(repositoryPath("skills", "use-docu-docu", "assets", "templates", language, "architecture.md")); !os.IsNotExist(err) {
				t.Errorf("%s monolithic architecture template still exists: %v", language, err)
			}

			root := t.TempDir()
			docs := filepath.Join(root, "docs")
			writeTestFile(t, docs, "index.md", "# Project\n\nProject documentation.\n")
			replacements := map[string]string{
				"{{PROJECT_TITLE}}":               "Project",
				"{{SYSTEM_BOUNDARY_SUMMARY}}":     "The system serves one documented client.",
				"{{SYSTEM_BOUNDARY}}":             "The system accepts requests from the client and returns results.",
				"{{ARCHITECTURE_QUESTION_LINKS}}": "- [How is runtime responsibility split](runtime.md)",
				"{{OPTIONAL_CONTEXT_DIAGRAM}}":    "",
			}
			writeSkillTemplate(t, docs, language, "architecture-overview.md", "architecture/overview.md", replacements)
			replacements = map[string]string{
				"{{ARCHITECTURE_TITLE}}":    "Runtime responsibility",
				"{{ARCHITECTURE_QUESTION}}": "How is runtime responsibility split",
				"{{SHORT_ANSWER}}":          "One process owns parsing and validation.",
				"{{SCOPE}}":                 "Runtime components inside the process.",
				"{{ADAPTABLE_SECTIONS}}":    "## Components\n\nThe parser produces the validated model.",
			}
			writeSkillTemplate(t, docs, language, "architecture-detail.md", "architecture/runtime.md", replacements)
			model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0})
			if err != nil {
				t.Fatal(err)
			}
			for _, issue := range model.Issues {
				if issue.Severity == "error" {
					t.Fatalf("instantiated %s architecture templates produced an error: %#v", language, issue)
				}
			}
		})
	}
}

func TestUseDocuDocuArchitectureGuidanceAndSemanticGate(t *testing.T) {
	for _, language := range []string{"ru", "en"} {
		guidance := readUseDocuDocuFile(t, filepath.Join("assets", "project-guidance", language+".md"))
		for _, expected := range []string{"architecture/overview.md", "FLOW-*", "CONTRACT", "REFERENCE", "RUNBOOK", "ADR", "MODULE"} {
			if !strings.Contains(guidance, expected) {
				t.Errorf("%s architecture guidance does not contain %q", language, expected)
			}
		}
	}

	gate := readUseDocuDocuFile(t, filepath.Join("references", "semantic-gate.md"))
	for i := 1; i <= 13; i++ {
		code := fmt.Sprintf("ARCH%03d", i)
		if strings.Count(gate, code) == 0 {
			t.Errorf("semantic gate must define %s", code)
		}
	}
	for _, expected := range []string{
		"Review `architecture/overview.md` separately",
		"a transitive link is not",
		"any non-empty question text",
		"Punctuation, question",
	} {
		if !strings.Contains(gate, expected) {
			t.Errorf("semantic gate does not contain %q", expected)
		}
	}
}

func TestUseDocuDocuProjectGuidanceTemplates(t *testing.T) {
	const startMarker = "<!-- docu-docu:project-guidance:start -->"
	const endMarker = "<!-- docu-docu:project-guidance:end -->"

	for _, language := range []string{"ru", "en"} {
		content := readUseDocuDocuFile(t, filepath.Join("assets", "project-guidance", language+".md"))
		if strings.Count(content, startMarker) != 1 || strings.Count(content, endMarker) != 1 {
			t.Errorf("%s guidance must contain each managed marker exactly once", language)
		}
		if strings.Index(content, startMarker) >= strings.Index(content, endMarker) {
			t.Errorf("%s guidance markers are not ordered", language)
		}
		trimmed := strings.TrimSpace(content)
		if !strings.HasPrefix(trimmed, startMarker) || !strings.HasSuffix(trimmed, endMarker) {
			t.Errorf("%s guidance contains content outside the managed block", language)
		}
		for _, expected := range []string{"$use-docu-docu", "TASK-*", "$use-docu-docu init"} {
			if !strings.Contains(content, expected) {
				t.Errorf("%s guidance does not contain %q", language, expected)
			}
		}
	}

	ru := readUseDocuDocuFile(t, filepath.Join("assets", "project-guidance", "ru.md"))
	en := readUseDocuDocuFile(t, filepath.Join("assets", "project-guidance", "en.md"))
	if !strings.Contains(ru, "Не создавайте задачу для каждого prompt") {
		t.Error("Russian guidance does not prevent per-prompt task creation")
	}
	if !strings.Contains(en, "Do not create a task for every prompt") {
		t.Error("English guidance does not prevent per-prompt task creation")
	}
}

func TestUseDocuDocuTaskCreationThreshold(t *testing.T) {
	skill := readUseDocuDocuFile(t, "SKILL.md")
	workflows := readUseDocuDocuFile(t, filepath.Join("references", "workflows.md"))
	for name, content := range map[string]string{"SKILL.md": skill, "workflows.md": workflows} {
		for _, expected := range []string{"explicitly requires", "substantial", "Do not create"} {
			if !strings.Contains(content, expected) {
				t.Errorf("%s does not contain task threshold %q", name, expected)
			}
		}
	}
	for _, forbidden := range []string{
		"For a new request, search and create a neutral Draft",
		"For a new request, start with `search`, `task init`",
	} {
		if strings.Contains(skill, forbidden) || strings.Contains(workflows, forbidden) {
			t.Errorf("unconditional task workflow remains: %q", forbidden)
		}
	}
}

func TestUseDocuDocuMetadata(t *testing.T) {
	metadata := readUseDocuDocuFile(t, filepath.Join("agents", "openai.yaml"))
	for _, expected := range []string{
		`display_name: "Use Docu-docu"`,
		`short_description: "Set up, update, and validate Docu-docu documentation"`,
		`default_prompt: "Use $use-docu-docu init to explicitly set up Docu-docu for this project."`,
	} {
		if !strings.Contains(metadata, expected) {
			t.Errorf("openai.yaml does not contain %q", expected)
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

func readUseDocuDocuFile(t *testing.T, relativePath string) string {
	t.Helper()
	content, err := os.ReadFile(repositoryPath("skills", "use-docu-docu", relativePath))
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}

func readSkillTemplate(t *testing.T, language, templateName string) string {
	t.Helper()
	templatePath := repositoryPath("skills", "use-docu-docu", "assets", "templates", language, templateName)
	content, err := os.ReadFile(templatePath)
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}

func repositoryPath(parts ...string) string {
	return filepath.Join(append([]string{"..", ".."}, parts...)...)
}
