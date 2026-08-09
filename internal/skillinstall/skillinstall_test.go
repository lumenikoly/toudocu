package skillinstall

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"toudocu/skills"
)

func testTarget(t *testing.T) (Target, skills.Bundle) {
	t.Helper()
	root := t.TempDir()
	targets, err := ResolveTargets("codex", Project, root, "")
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := skills.Load()
	if err != nil {
		t.Fatal(err)
	}
	return targets[0], bundle
}

func installForTest(t *testing.T, target Target, bundle skills.Bundle) {
	t.Helper()
	result := Execute(BuildPlan(Install, target, bundle), "0.0.1")
	if result.Error != nil || result.State != Installed {
		t.Fatalf("install: %#v", result)
	}
}

func rewriteManifest(t *testing.T, target Target, mutate func(*Manifest)) {
	t.Helper()
	name := filepath.Join(target.Path, ManifestName)
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	mutate(&manifest)
	data, _ = json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(name, append(data, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLifecycleAndPlannerStates(t *testing.T) {
	target, bundle := testTarget(t)
	if state := Inspect(target, bundle).State; state != NotInstalled {
		t.Fatal(state)
	}
	installForTest(t, target, bundle)
	if plan := BuildPlan(Install, target, bundle); plan.Action != "none" || plan.Conflict {
		t.Fatalf("install no-op: %#v", plan)
	}
	rewriteManifest(t, target, func(manifest *Manifest) { manifest.SkillVersion = "0.0.0" })
	if state := Inspect(target, bundle).State; state != Outdated {
		t.Fatal(state)
	}
	if result := Execute(BuildPlan(Update, target, bundle), "0.0.1"); result.Error != nil || result.State != Installed {
		t.Fatalf("update: %#v", result)
	}
	if result := Execute(BuildPlan(Uninstall, target, bundle), "0.0.1"); result.Error != nil || result.State != NotInstalled {
		t.Fatalf("uninstall: %#v", result)
	}
	if plan := BuildPlan(Uninstall, target, bundle); plan.Action != "none" || plan.Conflict {
		t.Fatalf("uninstall no-op: %#v", plan)
	}
}

func TestModifiedUnmanagedNewerAndInvalidManifestAreProtected(t *testing.T) {
	for _, test := range []struct {
		name  string
		setup func(*testing.T, Target, skills.Bundle)
		state State
		code  string
	}{
		{name: "unmanaged", setup: func(t *testing.T, target Target, _ skills.Bundle) {
			if err := os.MkdirAll(target.Path, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(target.Path, "local.txt"), []byte("keep"), 0o644); err != nil {
				t.Fatal(err)
			}
		}, state: Unmanaged, code: "SKILL_UNMANAGED"},
		{name: "modified", setup: func(t *testing.T, target Target, bundle skills.Bundle) {
			installForTest(t, target, bundle)
			if err := os.WriteFile(filepath.Join(target.Path, "local.txt"), []byte("keep"), 0o644); err != nil {
				t.Fatal(err)
			}
		}, state: Modified, code: "SKILL_LOCAL_CHANGES"},
		{name: "newer", setup: func(t *testing.T, target Target, bundle skills.Bundle) {
			installForTest(t, target, bundle)
			rewriteManifest(t, target, func(manifest *Manifest) { manifest.SkillVersion = "9.0.0" })
		}, state: Newer, code: "SKILL_DOWNGRADE_BLOCKED"},
		{name: "invalid", setup: func(t *testing.T, target Target, bundle skills.Bundle) {
			installForTest(t, target, bundle)
			if err := os.WriteFile(filepath.Join(target.Path, ManifestName), []byte(`{"schemaVersion":1,"files":[{"path":"../escape","sha256":"00"}]}`), 0o644); err != nil {
				t.Fatal(err)
			}
		}, state: InvalidManifest, code: "SKILL_MANIFEST_INVALID"},
	} {
		t.Run(test.name, func(t *testing.T) {
			target, bundle := testTarget(t)
			test.setup(t, target, bundle)
			if snapshot := Inspect(target, bundle); snapshot.State != test.state {
				t.Fatalf("state=%s detail=%s", snapshot.State, snapshot.Detail)
			}
			plan := BuildPlan(Install, target, bundle)
			if !plan.Conflict || plan.Code != test.code {
				t.Fatalf("plan=%#v", plan)
			}
		})
	}
}

func TestUnsafePathsAndTargetSwap(t *testing.T) {
	target, bundle := testTarget(t)
	outside := t.TempDir()
	if err := os.MkdirAll(filepath.Dir(target.Path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, target.Path); err != nil {
		t.Fatal(err)
	}
	if state := Inspect(target, bundle).State; state != UnsafePath {
		t.Fatal(state)
	}

	target, bundle = testTarget(t)
	plan := BuildPlan(Install, target, bundle)
	if err := os.MkdirAll(target.Path, 0o755); err != nil {
		t.Fatal(err)
	}
	result := Execute(plan, "0.0.1")
	if result.Code != "SKILL_TARGET_CHANGED" || result.Error == nil {
		t.Fatalf("swap was not rejected: %#v", result)
	}
}

func TestSymlinkInsideManagedCopyIsModified(t *testing.T) {
	target, bundle := testTarget(t)
	installForTest(t, target, bundle)
	if err := os.Symlink("SKILL.md", filepath.Join(target.Path, "local-link")); err != nil {
		t.Fatal(err)
	}
	if state := Inspect(target, bundle).State; state != Modified {
		t.Fatalf("internal symlink state=%s", state)
	}
}

func TestModeChangeIsModified(t *testing.T) {
	target, bundle := testTarget(t)
	installForTest(t, target, bundle)
	skillPath := filepath.Join(target.Path, "SKILL.md")
	if err := os.Chmod(skillPath, 0o444); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(skillPath, 0o644) })
	if state := Inspect(target, bundle).State; state != Modified {
		t.Fatalf("mode change state=%s", state)
	}
}

func TestPublishFailureRestoresSnapshotAndRestoreFailureKeepsBackup(t *testing.T) {
	target, bundle := testTarget(t)
	installForTest(t, target, bundle)
	rewriteManifest(t, target, func(manifest *Manifest) { manifest.SkillVersion = "0.0.0" })
	plan := BuildPlan(Update, target, bundle)
	originalPublish := publishStage
	publishStage = func(_, _ string) error { return errors.New("injected publish failure") }
	t.Cleanup(func() { publishStage = originalPublish })
	result := Execute(plan, "0.0.1")
	if result.Code != "SKILL_PUBLISH_FAILED" || result.Error == nil || Inspect(target, bundle).State != Outdated {
		t.Fatalf("publish rollback failed: %#v", result)
	}

	plan = BuildPlan(Update, target, bundle)
	originalRename := renamePath
	calls := 0
	renamePath = func(oldPath, newPath string) error {
		calls++
		if calls == 2 {
			return errors.New("injected restore failure")
		}
		return os.Rename(oldPath, newPath)
	}
	t.Cleanup(func() { renamePath = originalRename })
	result = Execute(plan, "0.0.1")
	if result.Code != "SKILL_RESTORE_FAILED" || result.Error == nil || !strings.Contains(result.Error.Error(), "backup retained") {
		t.Fatalf("restore failure was not reported safely: %#v", result)
	}
}

func TestAtomicPublishDoesNotReplaceExistingTarget(t *testing.T) {
	root := t.TempDir()
	stage := filepath.Join(root, "stage")
	target := filepath.Join(root, "target")
	if err := os.Mkdir(stage, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "sentinel"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := atomicPublish(stage, target); err == nil {
		t.Fatal("existing target was replaced")
	}
	if data, err := os.ReadFile(filepath.Join(target, "sentinel")); err != nil || string(data) != "keep" {
		t.Fatal("existing target changed")
	}
	stage = filepath.Join(root, "stage-new")
	newTarget := filepath.Join(root, "new-target")
	if err := os.Mkdir(stage, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := atomicPublish(stage, newTarget); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(newTarget); err != nil || !info.IsDir() {
		t.Fatal("stage was not published")
	}
}

func TestBoundaryEscapeAndParentSymlink(t *testing.T) {
	root := t.TempDir()
	bundle, _ := skills.Load()
	escape := Target{Agent: "codex", Scope: Project, Boundary: root, Path: filepath.Join(root, "..", "escape")}
	if Inspect(escape, bundle).State != UnsafePath {
		t.Fatal("boundary escape accepted")
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, ".agents")); err != nil {
		t.Fatal(err)
	}
	target := Target{Agent: "codex", Scope: Project, Boundary: root, Path: filepath.Join(root, ".agents", "skills", "toudocu")}
	if Inspect(target, bundle).State != UnsafePath {
		t.Fatal("symlink parent accepted")
	}
}

func TestRegistryDetectionResolutionAndVersions(t *testing.T) {
	root, home := t.TempDir(), t.TempDir()
	if err := os.Mkdir(filepath.Join(home, ".claude"), 0o755); err != nil {
		t.Fatal(err)
	}
	detected := Detect(root, home, func(key string) (string, bool) {
		if key == "CODEX_HOME" {
			return "/configured", true
		}
		return "", false
	})
	if strings.Join(detected, ",") != "codex,claude-code" {
		t.Fatalf("detected %v", detected)
	}
	targets, err := ResolveTargets("all", User, root, home)
	if err != nil || len(targets) != 3 {
		t.Fatalf("targets=%v err=%v", targets, err)
	}
	for _, target := range targets {
		if !strings.HasPrefix(target.Path, home+string(filepath.Separator)) {
			t.Fatalf("user target escaped home: %s", target.Path)
		}
	}
	for _, test := range []struct {
		left, right string
		want        int
	}{{"0.0.1", "0.0.1", 0}, {"0.0.0", "0.0.1", -1}, {"1.0.0", "0.9.9", 1}} {
		got, err := CompareVersions(test.left, test.right)
		if err != nil || got != test.want {
			t.Fatalf("compare %v: %d %v", test, got, err)
		}
	}
	if _, err := CompareVersions("v1", "0.0.1"); err == nil {
		t.Fatal("invalid version accepted")
	}
}

func TestTargetDeduplication(t *testing.T) {
	targets := deduplicateTargets([]Target{{Agent: "codex", Path: "/same"}, {Agent: "claude-code", Path: "/same"}, {Agent: "copilot", Path: "/other"}})
	if len(targets) != 2 || targets[0].Agent != "codex" || targets[1].Agent != "copilot" {
		t.Fatalf("deduplicated targets=%v", targets)
	}
}

func TestInstallDoesNotExecuteBundledContent(t *testing.T) {
	target, _ := testTarget(t)
	sentinel := filepath.Join(t.TempDir(), "executed")
	script := []byte("#!/bin/sh\ntouch " + sentinel + "\n")
	bundle := skills.Bundle{ID: skills.SkillID, Version: skills.SkillVersion, Checksum: "test", Files: []skills.File{{Path: "SKILL.md", Data: []byte("---\nname: toudocu\n---\n"), Mode: 0o644}, {Path: "scripts/run.sh", Data: script, Mode: 0o755}}}
	result := Execute(BuildPlan(Install, target, bundle), "0.0.1")
	if result.Error != nil {
		t.Fatal(result.Error)
	}
	if _, err := os.Stat(sentinel); !os.IsNotExist(err) {
		t.Fatal("bundled script was executed")
	}
	if info, err := os.Stat(filepath.Join(target.Path, "scripts", "run.sh")); err != nil || !modeMatches(info.Mode(), 0o755) {
		t.Fatal("bundled script was not installed as inert executable content")
	}
}

func TestStageRejectsTraversal(t *testing.T) {
	target, _ := testTarget(t)
	bundle := skills.Bundle{ID: skills.SkillID, Version: skills.SkillVersion, Checksum: "test", Files: []skills.File{{Path: "../escape", Data: []byte("no"), Mode: 0o644}}}
	result := Execute(BuildPlan(Install, target, bundle), "0.0.1")
	if result.Error == nil {
		t.Fatal("traversal bundle was installed")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(target.Path), "escape")); !os.IsNotExist(err) {
		t.Fatal("traversal wrote outside target")
	}
}
