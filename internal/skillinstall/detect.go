package skillinstall

import (
	"os"
	"path/filepath"
)

// Detect returns supported hosts evidenced by their environment or config roots.
func Detect(repositoryRoot, home string, lookup func(string) (string, bool)) []string {
	if lookup == nil {
		lookup = os.LookupEnv
	}
	type evidence struct {
		name string
		envs []string
		dirs []string
	}
	items := []evidence{
		{name: "codex", envs: []string{"CODEX_HOME"}, dirs: []string{filepath.Join(home, ".codex")}},
		{name: "claude-code", envs: []string{"CLAUDE_CONFIG_DIR", "CLAUDE_CODE_ENTRYPOINT"}, dirs: []string{filepath.Join(home, ".claude")}},
		{name: "copilot", envs: []string{"GITHUB_COPILOT"}, dirs: []string{filepath.Join(repositoryRoot, ".github")}},
	}
	var result []string
	for _, item := range items {
		found := false
		for _, key := range item.envs {
			if value, ok := lookup(key); ok && value != "" {
				found = true
			}
		}
		for _, dir := range item.dirs {
			if info, err := os.Stat(dir); err == nil && info.IsDir() {
				found = true
			}
		}
		if found {
			result = append(result, item.name)
		}
	}
	return result
}

func FindProjectRoot(explicit, cwd string) (string, error) {
	if explicit != "" {
		return filepath.Abs(explicit)
	}
	current, err := filepath.Abs(cwd)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Lstat(filepath.Join(current, ".git")); err == nil {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			return filepath.Abs(cwd)
		}
		current = parent
	}
}
