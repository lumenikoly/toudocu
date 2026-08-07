package skillinstall

import (
	"docu-docu/skills"
	"fmt"
	"path/filepath"
	"sort"
)

const ManifestName = ".docu-docu-skill.json"

type AgentTarget struct {
	Name       string
	ProjectDir string
	UserDir    string
}

var registry = []AgentTarget{
	{Name: "codex", ProjectDir: ".agents/skills/docu-docu", UserDir: ".agents/skills/docu-docu"},
	{Name: "claude-code", ProjectDir: ".claude/skills/docu-docu", UserDir: ".claude/skills/docu-docu"},
	{Name: "copilot", ProjectDir: ".github/skills/docu-docu", UserDir: ".copilot/skills/docu-docu"},
}

func Registry() []AgentTarget { return append([]AgentTarget(nil), registry...) }

func Agent(name string) (AgentTarget, bool) {
	for _, target := range registry {
		if target.Name == name {
			return target, true
		}
	}
	return AgentTarget{}, false
}

type Scope string

const (
	Project Scope = "project"
	User    Scope = "user"
)

type Operation string

const (
	Install   Operation = "install"
	Status    Operation = "status"
	Update    Operation = "update"
	Uninstall Operation = "uninstall"
)

type State string

const (
	NotInstalled    State = "not-installed"
	Installed       State = "installed"
	Outdated        State = "outdated"
	Newer           State = "newer-than-bundle"
	Modified        State = "modified"
	Unmanaged       State = "unmanaged"
	InvalidManifest State = "invalid-manifest"
	UnsafePath      State = "unsafe-path"
)

type Target struct {
	Agent    string
	Scope    Scope
	Boundary string
	Path     string
}

func ResolveTargets(agent string, scope Scope, repositoryRoot, home string) ([]Target, error) {
	if scope != Project && scope != User {
		return nil, fmt.Errorf("SKILL_SCOPE_INVALID: unsupported scope %q", scope)
	}
	var agents []AgentTarget
	if agent == "all" {
		agents = Registry()
	} else if selected, ok := Agent(agent); ok {
		agents = []AgentTarget{selected}
	} else {
		return nil, fmt.Errorf("SKILL_AGENT_INVALID: unsupported agent %q", agent)
	}
	boundary := repositoryRoot
	if scope == User {
		boundary = home
	}
	if boundary == "" {
		return nil, fmt.Errorf("SKILL_ROOT_REQUIRED: no boundary for %s scope", scope)
	}
	absBoundary, err := filepath.Abs(boundary)
	if err != nil {
		return nil, err
	}
	result := make([]Target, 0, len(agents))
	for _, candidate := range agents {
		rel := candidate.ProjectDir
		if scope == User {
			rel = candidate.UserDir
		}
		target := filepath.Clean(filepath.Join(absBoundary, filepath.FromSlash(rel)))
		result = append(result, Target{Agent: candidate.Name, Scope: scope, Boundary: absBoundary, Path: target})
	}
	result = deduplicateTargets(result)
	sort.SliceStable(result, func(i, j int) bool { return result[i].Agent < result[j].Agent })
	return result, nil
}

func deduplicateTargets(targets []Target) []Target {
	seen := map[string]bool{}
	result := make([]Target, 0, len(targets))
	for _, target := range targets {
		key := filepath.Clean(target.Path)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, target)
	}
	return result
}

type FileChecksum struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type Manifest struct {
	SchemaVersion  int            `json:"schemaVersion"`
	ManagedBy      string         `json:"managedBy"`
	SkillID        string         `json:"skillId"`
	SkillVersion   string         `json:"skillVersion"`
	CLIVersion     string         `json:"cliVersion"`
	Agent          string         `json:"agent"`
	Scope          Scope          `json:"scope"`
	BundleChecksum string         `json:"bundleChecksum"`
	Files          []FileChecksum `json:"files"`
}

type Snapshot struct {
	State       State
	Fingerprint string
	Manifest    *Manifest
	Detail      string
}

type Plan struct {
	Operation Operation
	Target    Target
	Before    Snapshot
	Action    string
	Conflict  bool
	Code      string
	Message   string
	Bundle    skills.Bundle
}

type Result struct {
	Plan  Plan
	State State
	Code  string
	Error error
}
