package toudocu

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func isolatedSkillCLI(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", "")
	t.Setenv("CLAUDE_CONFIG_DIR", "")
	t.Setenv("CLAUDE_CODE_ENTRYPOINT", "")
	t.Setenv("GITHUB_COPILOT", "")
	return home
}

func TestSkillCLINonTTYRequiresAgent(t *testing.T) {
	isolatedSkillCLI(t)
	root := t.TempDir()
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"skill", "status", "--repository-root", root}, &stdout, &stderr)
	if code != 1 || !strings.Contains(stderr.String(), "SKILL_AGENT_REQUIRED") {
		t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestSkillCLINonTTYRejectsMultipleDetectedHosts(t *testing.T) {
	home := isolatedSkillCLI(t)
	if err := os.Mkdir(filepath.Join(home, ".codex"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(home, ".claude"), 0o755); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"skill", "status", "--repository-root", root}, &stdout, &stderr)
	if code != 1 || !strings.Contains(stderr.String(), "SKILL_AGENT_REQUIRED") {
		t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestSkillCLIInstallStatusConflictAndUninstall(t *testing.T) {
	isolatedSkillCLI(t)
	root := t.TempDir()
	run := func(args ...string) (int, string, string) {
		var stdout, stderr bytes.Buffer
		code := RunCLI(append([]string{"skill"}, args...), &stdout, &stderr)
		return code, stdout.String(), stderr.String()
	}
	if code, out, errOut := run("install", "--agent", "codex", "--repository-root", root); code != 0 || !strings.Contains(out, "not-installed -> installed") || errOut != "" {
		t.Fatalf("install: %d %q %q", code, out, errOut)
	}
	if code, out, _ := run("status", "--agent", "codex", "--repository-root", root); code != 0 || !strings.Contains(out, "codex: installed") {
		t.Fatalf("status: %d %q", code, out)
	}
	target := filepath.Join(root, ".agents", "skills", "toudocu")
	if err := os.WriteFile(filepath.Join(target, "local.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if code, _, errOut := run("update", "--agent", "codex", "--repository-root", root); code != 1 || !strings.Contains(errOut, "SKILL_LOCAL_CHANGES") {
		t.Fatalf("conflict: %d %q", code, errOut)
	}
	if _, err := os.Stat(filepath.Join(target, "local.txt")); err != nil {
		t.Fatal("local file was changed")
	}
}

func TestSkillCLINoopUpdateAndUninstall(t *testing.T) {
	isolatedSkillCLI(t)
	root := t.TempDir()
	run := func(operation string) (int, string, string) {
		var stdout, stderr bytes.Buffer
		code := RunCLI([]string{"skill", operation, "--agent", "codex", "--repository-root", root}, &stdout, &stderr)
		return code, stdout.String(), stderr.String()
	}
	if code, _, errOut := run("install"); code != 0 || errOut != "" {
		t.Fatalf("install: %d %q", code, errOut)
	}
	if code, out, errOut := run("install"); code != 0 || !strings.Contains(out, "installed -> installed") || errOut != "" {
		t.Fatalf("no-op: %d %q %q", code, out, errOut)
	}
	manifestPath := filepath.Join(root, ".agents", "skills", "toudocu", ".toudocu-skill.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	manifest["skillVersion"] = "0.0.0"
	data, _ = json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
	if code, out, errOut := run("update"); code != 0 || !strings.Contains(out, "outdated -> installed") || errOut != "" {
		t.Fatalf("update: %d %q %q", code, out, errOut)
	}
	if code, out, errOut := run("uninstall"); code != 0 || !strings.Contains(out, "installed -> not-installed") || errOut != "" {
		t.Fatalf("uninstall: %d %q %q", code, out, errOut)
	}
	if code, out, errOut := run("status"); code != 0 || !strings.Contains(out, "not-installed") || errOut != "" {
		t.Fatalf("status after uninstall: %d %q %q", code, out, errOut)
	}
}

func TestSkillCLIAllAndInteractiveSelection(t *testing.T) {
	isolatedSkillCLI(t)
	root := t.TempDir()
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"skill", "install", "--agent", "all", "--repository-root", root}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 || strings.Count(stdout.String(), "target:") != 3 {
		t.Fatalf("all: %d %q %q", code, stdout.String(), stderr.String())
	}
	for _, path := range []string{".agents/skills/toudocu", ".claude/skills/toudocu", ".github/skills/toudocu"} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(path), ".toudocu-skill.json")); err != nil {
			t.Fatal(err)
		}
	}

	root = t.TempDir()
	stdout.Reset()
	stderr.Reset()
	code = runSkillCLI([]string{"skill", "status", "--repository-root", root}, strings.NewReader("2\n"), &stdout, &stderr, true)
	if code != 0 || !strings.Contains(stdout.String(), "claude-code: not-installed") {
		t.Fatalf("interactive: %d %q %q", code, stdout.String(), stderr.String())
	}
}

func TestSkillCLIAllContinuesAfterConflict(t *testing.T) {
	isolatedSkillCLI(t)
	root := t.TempDir()
	unmanaged := filepath.Join(root, ".agents", "skills", "toudocu")
	if err := os.MkdirAll(unmanaged, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(unmanaged, "local.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"skill", "install", "--agent", "all", "--repository-root", root}, &stdout, &stderr)
	if code != 1 || !strings.Contains(stderr.String(), "SKILL_UNMANAGED") {
		t.Fatalf("partial result: %d %q %q", code, stdout.String(), stderr.String())
	}
	for _, path := range []string{".claude/skills/toudocu", ".github/skills/toudocu"} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(path), ".toudocu-skill.json")); err != nil {
			t.Fatalf("remaining target was not installed: %v", err)
		}
	}
	if data, err := os.ReadFile(filepath.Join(unmanaged, "local.txt")); err != nil || string(data) != "keep" {
		t.Fatal("unmanaged target changed")
	}
}

func TestSkillCLIUserScopeAndArguments(t *testing.T) {
	home := isolatedSkillCLI(t)
	var stdout, stderr bytes.Buffer
	code := RunCLI([]string{"skill", "install", "--agent", "copilot", "--scope", "user"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("user install: %d %q", code, stderr.String())
	}
	if _, err := os.Stat(filepath.Join(home, ".copilot", "skills", "toudocu", ".toudocu-skill.json")); err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	stderr.Reset()
	if code = RunCLI([]string{"skill", "status", "--agent", "codex", "--scope", "user", "--repository-root", t.TempDir()}, &stdout, &stderr); code != 1 || !strings.Contains(stderr.String(), "SKILL_ARGUMENT_INVALID") {
		t.Fatalf("invalid args: %d %q", code, stderr.String())
	}
}

func TestSkillCLIStatusDoesNotCreateTargetParents(t *testing.T) {
	isolatedSkillCLI(t)
	root := t.TempDir()
	var stdout, stderr bytes.Buffer
	if code := RunCLI([]string{"skill", "status", "--agent", "codex", "--repository-root", root}, &stdout, &stderr); code != 0 {
		t.Fatalf("status: %d %q", code, stderr.String())
	}
	if _, err := os.Stat(filepath.Join(root, ".agents")); !os.IsNotExist(err) {
		t.Fatal("status created target parents")
	}
}

func TestSkillCLIHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := RunCLI([]string{"skill", "--help"}, &stdout, &stderr); code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "skill install|status|update|uninstall") {
		t.Fatalf("help: code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}
