package toudocu

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func readinessDocument(content, status string) *Document {
	parsed := analyzeMarkdown(content)
	return &Document{Content: content, Headings: parsed.Headings, Sections: parsed.Sections, Tasks: parsed.Tasks, Status: StatusFor(status)}
}

func TestUseCaseReadiness(t *testing.T) {
	tests := []struct {
		name      string
		status    string
		markdown  string
		found     bool
		total     int
		completed int
		remaining int
		ready     bool
	}{
		{"done all checked", "done", "<!-- toudocu:section acceptance-criteria -->\n## Критерии приёмки\n\n- [x] Готово.\n", true, 1, 1, 0, true},
		{"done open", "done", "<!-- toudocu:section acceptance-criteria -->\n## Acceptance criteria\n\n- [ ] Open.\n", true, 1, 0, 1, false},
		{"done missing", "done", "## Result\n\nDone.\n", false, 0, 0, 0, false},
		{"done empty", "done", "<!-- toudocu:section acceptance-criteria -->\n## Критерии приемки\n\n## Проверка\n", true, 0, 0, 0, false},
		{"non-done all checked", "in-progress", "<!-- toudocu:section acceptance-criteria -->\n## Acceptance criteria\n\n- [x] Done.\n", true, 1, 1, 0, false},
		{"non-done open", "in-progress", "<!-- toudocu:section acceptance-criteria -->\n## Критерии приёмки\n\n- [ ] Открыто.\n", true, 1, 0, 1, false},
		{"nested included and neighbor excluded", "done", "<!-- toudocu:section acceptance-criteria -->\n## Acceptance criteria\n\n- [x] First.\n\n### Details\n\n- [x] Nested.\n\n## Verification\n\n- [ ] Outside.\n", true, 2, 2, 0, true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			readiness := calculateUseCaseReadiness(readinessDocument("# UC-TEST-01: Test\n\n"+test.markdown, test.status))
			acceptance := readiness.Acceptance
			if acceptance.Found != test.found || acceptance.Total != test.total || acceptance.Completed != test.completed || acceptance.Remaining != test.remaining || readiness.EffectiveCompleted != test.ready {
				t.Fatalf("readiness = %#v, want found=%v total=%d completed=%d remaining=%d ready=%v", readiness, test.found, test.total, test.completed, test.remaining, test.ready)
			}
		})
	}
}

func TestDoneUseCaseAcceptanceDiagnostics(t *testing.T) {
	tests := []struct {
		name, acceptance, code string
		line                   int
	}{
		{"open", "## Acceptance criteria\n\n- [ ] Open.\n", "done-use-case-has-open-acceptance-criteria", 9},
		{"empty", "## Acceptance criteria\n\n", "done-use-case-missing-acceptance-criteria", 7},
		{"missing", "", "done-use-case-missing-acceptance-criteria", 1},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, docs, _ := createFixture(t)
			path := filepath.Join(docs, "use-cases", "login.md")
			writeTestFile(t, docs, "use-cases/login.md", "# UC-AUTH-01: Login\n\n- Identifier: UC-AUTH-01\n- Status: Completed\n- Module: MOD-AUTH\n\n"+test.acceptance)
			expectedLine := fileLineContaining(t, path, "# UC-AUTH-01")
			if test.acceptance != "" {
				expectedLine = fileLineContaining(t, path, "## Acceptance criteria")
			}
			if strings.Contains(test.acceptance, "[ ]") {
				expectedLine = fileLineContaining(t, path, "[ ]")
			}
			model := buildFixture(t, docs)
			for _, issue := range model.Issues {
				if issue.Code == test.code && issue.DocumentPath == "use-cases/login.md" && issue.Line == expectedLine {
					return
				}
			}
			t.Fatalf("missing %s on line %d in %#v", test.code, expectedLine, model.Issues)
		})
	}
}

func TestRoadmapReadinessDiagnostics(t *testing.T) {
	tests := []struct {
		name, status, criterion, roadmapTask, message string
	}{
		{"checked unfinished", "In progress", "- [ ] Ready.", "- [x] `UC-AUTH-01` Пользователь входит.", "Roadmap item UC-AUTH-01 completion does not match the linked use case: the use-case status is not done."},
		{"checked missing criteria", "Completed", "", "- [x] `UC-AUTH-01` Пользователь входит.", "Roadmap item UC-AUTH-01 completion does not match the linked use case: acceptance criteria are missing."},
		{"checked open criteria", "Completed", "- [ ] Ready.", "- [x] `UC-AUTH-01` Пользователь входит.", "Roadmap item UC-AUTH-01 completion does not match the linked use case: open acceptance criteria remain."},
		{"unchecked ready", "Completed", "- [x] Ready.", "- [ ] `UC-AUTH-01` Пользователь входит.", "Roadmap item UC-AUTH-01 completion does not match the linked use case: the use case is ready."},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, docs, _ := createFixture(t)
			writeTestFile(t, docs, "use-cases/login.md", "# UC-AUTH-01: Login\n\n- Identifier: UC-AUTH-01\n- Status: "+test.status+"\n- Module: MOD-AUTH\n\n## Acceptance criteria\n\n"+test.criterion+"\n")
			writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\nPlan.\n\n## MVP\n\n- Status: In progress\n\n"+test.roadmapTask+"\n")
			expectedLine := fileLineContaining(t, filepath.Join(docs, "roadmap.md"), "UC-AUTH-01")
			model := buildFixture(t, docs)
			for _, issue := range model.Issues {
				if issue.Code == "roadmap-item-completion-mismatch" && issue.Line == expectedLine && issue.Message == test.message {
					return
				}
			}
			t.Fatalf("missing exact roadmap mismatch in %#v", model.Issues)
		})
	}
}

func TestUseCaseReadinessErrorsFailOrdinaryAndStrictCheckWithoutWrites(t *testing.T) {
	root, docs, _ := createFixture(t)
	path := filepath.Join(docs, "use-cases", "login.md")
	content := "# UC-AUTH-01: Login\n\n- Identifier: UC-AUTH-01\n- Status: Completed\n- Module: MOD-AUTH\n\n## Acceptance criteria\n\n- [ ] Ready.\n"
	writeTestFile(t, docs, "use-cases/login.md", content)
	content = canonicalizeTestMarkdown("use-cases/login.md", content)
	for _, strict := range []bool{false, true} {
		args := []string{"check", docs, "--repository-root", root, "--stale-days", "0"}
		if strict {
			args = append(args, "--strict")
		}
		var stdout, stderr strings.Builder
		if code := RunCLI(args, &stdout, &stderr); code != 1 || !strings.Contains(stdout.String(), "done-use-case-has-open-acceptance-criteria") {
			t.Fatalf("strict=%v code/output = %d/%s%s", strict, code, stdout.String(), stderr.String())
		}
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != content {
		t.Fatalf("check changed use case:\n%s", after)
	}
}

func TestDoneRoadmapSectionRequiresCompleteItems(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\nPlan.\n\n## MVP\n\n- Status: Done\n\n- [ ] `UC-AUTH-01` User logs in.\n")
	expectedLine := fileLineContaining(t, filepath.Join(docs, "roadmap.md"), "## MVP")
	model := buildFixture(t, docs)
	for _, issue := range model.Issues {
		if issue.Code == "roadmap-section-status-mismatch" && issue.Line == expectedLine && issue.Message == "Done roadmap section MVP contains incomplete items." {
			return
		}
	}
	t.Fatalf("missing roadmap section mismatch in %#v", model.Issues)
}

func TestUseCaseReadinessKeepsReportV1AndZeroProgress(t *testing.T) {
	_, docs, _ := createFixture(t)
	writeTestFile(t, docs, "use-cases/login.md", "# UC-AUTH-01: Login\n\n- Identifier: UC-AUTH-01\n- Status: Completed\n- Module: MOD-AUTH\n\n## Acceptance criteria\n\n- [ ] Ready.\n")
	writeTestFile(t, docs, "roadmap.md", "# Roadmap\n\nPlan.\n\n## MVP\n\n- Status: In progress\n\n- [ ] `UC-AUTH-01` User logs in.\n")
	model := buildFixture(t, docs)
	stage := model.RoadmapStages[0]
	if stage.TaskStats.Total != 1 || stage.TaskStats.Completed != 0 || stage.TaskStats.Remaining != 1 || stage.TaskStats.Percent == nil || *stage.TaskStats.Percent != 0 {
		t.Fatalf("roadmap stats = %#v", stage.TaskStats)
	}
	report, err := json.Marshal(BuildReport(model))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{`"schemaVersion":1`, `"effectiveCompleted":false`, `"completionSource":"use-case-status"`} {
		if !strings.Contains(string(report), expected) {
			t.Fatalf("report missing %s: %s", expected, report)
		}
	}
	if strings.Contains(string(report), "completionBlockers") {
		t.Fatalf("report v1 must not add completionBlockers: %s", report)
	}
}

func TestUseCaseScaffoldAndSkillTemplateAcceptanceSections(t *testing.T) {
	for _, test := range []struct{ language, heading string }{{"ru", "## Критерии приёмки\n\n"}, {"en", "## Acceptance criteria\n\n"}} {
		if scaffold := renderEntityScaffold("use-case", "UC-TEST-01", "Test", test.language, "2026-08-12"); !strings.Contains(scaffold, test.heading) {
			t.Errorf("%s scaffold lacks acceptance section: %s", test.language, scaffold)
		}
		template, err := os.ReadFile(filepath.Join("..", "..", "skills", "toudocu", "assets", "templates", test.language, "use-case.md"))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(template), test.heading+"- [ ] {{ACCEPTANCE_CRITERION}}") {
			t.Errorf("%s skill template lacks acceptance placeholder", test.language)
		}
	}
}
