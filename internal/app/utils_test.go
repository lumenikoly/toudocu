package docudocu

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureInsideResolvesSymlinkAliases(t *testing.T) {
	physicalRoot := t.TempDir()
	alias := filepath.Join(t.TempDir(), "repository")
	if err := os.Symlink(physicalRoot, alias); err != nil {
		t.Skipf("symlink is unavailable: %v", err)
	}

	if !ensureInside(alias, filepath.Join(physicalRoot, "docs", "missing.md")) {
		t.Fatal("different aliases of the same root must be treated as the same path")
	}
}

func TestEnsureInsideRejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	escape := filepath.Join(root, "escape")
	if err := os.Symlink(outside, escape); err != nil {
		t.Skipf("symlink is unavailable: %v", err)
	}

	if ensureInside(root, filepath.Join(escape, "missing.md")) {
		t.Fatal("path through a symlink outside the root must be rejected")
	}
}
