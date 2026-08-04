package docgent

// ChangeSetReport is the versioned, machine-readable documentation changes report.
type ChangeSetReport struct {
	SchemaVersion   int                   `json:"schemaVersion"`
	Repository      ChangeRepository      `json:"repository"`
	Comparison      ChangeComparison      `json:"comparison"`
	ChangeSetDigest string                `json:"changeSetDigest"`
	Summary         ChangeSummary         `json:"summary"`
	Changes         []DocumentationChange `json:"changes"`
	TaskImpact      *TaskImpactReport     `json:"taskImpact,omitempty"`
	Diagnostics     []Issue               `json:"diagnostics"`
	taskContext     *changeTaskContext
}

// changeTaskContext keeps target-side task evidence out of the public report.
// Task impact and task filtering must use the same Git snapshot as the report,
// rather than whatever happens to be in the current working tree.
type changeTaskContext struct {
	content    []byte
	pathExists map[string]bool
}

type ChangeRepository struct {
	Root   string `json:"root"`
	Branch string `json:"branch,omitempty"`
	Head   string `json:"head,omitempty"`
	Dirty  bool   `json:"dirty"`
}

type ChangeComparison struct {
	Base   ChangeSide `json:"base"`
	Target ChangeSide `json:"target"`
}

type ChangeSide struct {
	Type       string `json:"type"`
	Revision   string `json:"revision,omitempty"`
	Resolved   string `json:"resolved,omitempty"`
	DisplayRef string `json:"displayRef,omitempty"`
}

type ChangeSummary struct {
	Files           ChangeFileSummary `json:"files"`
	Lines           ChangeLineStats   `json:"lines"`
	Entities        map[string]int    `json:"entities"`
	Classifications map[string]int    `json:"classifications"`
}

type ChangeFileSummary struct {
	Added       int `json:"added"`
	Modified    int `json:"modified"`
	Deleted     int `json:"deleted"`
	Renamed     int `json:"renamed"`
	Copied      int `json:"copied"`
	TypeChanged int `json:"typeChanged"`
	Untracked   int `json:"untracked"`
}

type ChangeLineStats struct {
	Added   int `json:"added"`
	Deleted int `json:"deleted"`
}

type ChangeGitState struct {
	Staged            bool `json:"staged"`
	Unstaged          bool `json:"unstaged"`
	Untracked         bool `json:"untracked"`
	CommittedInBranch bool `json:"committedInBranch,omitempty"`
}

type ChangeEntity struct {
	ID    string `json:"id,omitempty"`
	Type  string `json:"type"`
	Title string `json:"title,omitempty"`
}

type DocumentationChange struct {
	Status                string                  `json:"status"`
	Path                  string                  `json:"path"`
	OldPath               string                  `json:"oldPath,omitempty"`
	GitState              ChangeGitState          `json:"gitState"`
	Lines                 ChangeLineStats         `json:"lines"`
	Binary                bool                    `json:"binary"`
	OldSize               int64                   `json:"oldSize,omitempty"`
	NewSize               int64                   `json:"newSize,omitempty"`
	Classification        string                  `json:"classification"`
	EntitiesBefore        []ChangeEntity          `json:"entitiesBefore"`
	EntitiesAfter         []ChangeEntity          `json:"entitiesAfter"`
	SourceDiffAvailable   bool                    `json:"sourceDiffAvailable"`
	RenderedDiffAvailable bool                    `json:"renderedDiffAvailable"`
	SemanticDiffAvailable bool                    `json:"semanticDiffAvailable"`
	SourceDiff            string                  `json:"sourceDiff,omitempty"`
	SourceDiffHunks       []SourceDiffHunk        `json:"sourceDiffHunks"`
	RenderedSections      []RenderedSectionChange `json:"renderedSections"`
	MermaidBlocks         []MermaidBlockChange    `json:"mermaidBlocks"`
	Asset                 *AssetDiffMetadata      `json:"asset,omitempty"`
	Screen                *ScreenDiffMetadata     `json:"screen,omitempty"`
	SemanticChanges       []SemanticChange        `json:"semanticChanges"`
	RelationChanges       []RelationChange        `json:"relationChanges"`
	Diagnostics           []Issue                 `json:"diagnostics"`
	oldContent            []byte
	newContent            []byte
}

// MermaidBlockChange keeps independently renderable Mermaid source from both
// Git sides. It intentionally does not attempt an image/pixel diff.
type MermaidBlockChange struct {
	ID           string          `json:"id"`
	Status       string          `json:"status"`
	Caption      string          `json:"caption,omitempty"`
	Before       string          `json:"before,omitempty"`
	After        string          `json:"after,omitempty"`
	SourceBefore *ChangeLocation `json:"sourceBefore,omitempty"`
	SourceAfter  *ChangeLocation `json:"sourceAfter,omitempty"`
}

type AssetDiffMetadata struct {
	Before *AssetMetadata `json:"before,omitempty"`
	After  *AssetMetadata `json:"after,omitempty"`
}

type AssetMetadata struct {
	MediaType    string  `json:"mediaType"`
	Width        int     `json:"width,omitempty"`
	Height       int     `json:"height,omitempty"`
	AspectRatio  float64 `json:"aspectRatio,omitempty"`
	Transparency *bool   `json:"transparency,omitempty"`
}

type ScreenDiffMetadata struct {
	Before      *ScreenNodeSnapshot      `json:"before,omitempty"`
	After       *ScreenNodeSnapshot      `json:"after,omitempty"`
	Transitions []ScreenTransitionChange `json:"transitions"`
}

type ScreenNodeSnapshot struct {
	ID     string `json:"id"`
	Title  string `json:"title,omitempty"`
	Route  string `json:"route,omitempty"`
	Module string `json:"module,omitempty"`
	Status string `json:"status,omitempty"`
	Kind   string `json:"type,omitempty"`
}

type ScreenTransitionSnapshot struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	Target    string `json:"target"`
	Action    string `json:"action,omitempty"`
	Condition string `json:"condition,omitempty"`
	State     string `json:"state,omitempty"`
	Error     string `json:"error,omitempty"`
	UseCase   string `json:"useCase,omitempty"`
	Line      int    `json:"line,omitempty"`
}

type ScreenTransitionChange struct {
	ID     string                    `json:"id"`
	Status string                    `json:"status"`
	Before *ScreenTransitionSnapshot `json:"before,omitempty"`
	After  *ScreenTransitionSnapshot `json:"after,omitempty"`
}

// SourceDiffHunk is a navigable projection of one exact Git patch hunk.
// Patch preserves the original hunk header and body byte-for-byte apart from
// JSON string encoding; SourceDiff remains the authoritative full patch.
type SourceDiffHunk struct {
	ID       string `json:"id"`
	Header   string `json:"header"`
	OldStart int    `json:"oldStart"`
	OldLines int    `json:"oldLines"`
	NewStart int    `json:"newStart"`
	NewLines int    `json:"newLines"`
	Patch    string `json:"patch"`
}

// RenderedSectionChange describes structural Markdown section matching used
// to annotate the before/after render without performing a DOM diff.
type RenderedSectionChange struct {
	ID           string          `json:"id"`
	Status       string          `json:"status"`
	TitleBefore  string          `json:"titleBefore,omitempty"`
	TitleAfter   string          `json:"titleAfter,omitempty"`
	AnchorBefore string          `json:"anchorBefore,omitempty"`
	AnchorAfter  string          `json:"anchorAfter,omitempty"`
	SourceBefore *ChangeLocation `json:"sourceBefore,omitempty"`
	SourceAfter  *ChangeLocation `json:"sourceAfter,omitempty"`
}

type SemanticChange struct {
	Kind          string          `json:"kind"`
	Entity        ChangeEntity    `json:"entity"`
	Subject       *ChangeEntity   `json:"subject,omitempty"`
	Field         string          `json:"field,omitempty"`
	Before        any             `json:"before,omitempty"`
	After         any             `json:"after,omitempty"`
	Summary       string          `json:"summary"`
	SourceBefore  *ChangeLocation `json:"sourceBefore,omitempty"`
	SourceAfter   *ChangeLocation `json:"sourceAfter,omitempty"`
	Compatibility string          `json:"compatibility,omitempty"`
}

type ChangeLocation struct {
	Path string `json:"path"`
	Line int    `json:"line,omitempty"`
}

type RelationChange struct {
	Kind   string       `json:"kind"`
	Source ChangeEntity `json:"source"`
	Target ChangeEntity `json:"target"`
}

type TaskImpactReport struct {
	TaskID      string                `json:"taskId"`
	Declared    []TaskImpactEntry     `json:"declared"`
	Actual      []TaskImpactEntry     `json:"actual"`
	TaskChanges []DocumentationChange `json:"taskChanges"`
	Diagnostics []Issue               `json:"diagnostics"`
}

type TaskImpactEntry struct {
	Path     string `json:"path"`
	Declared bool   `json:"declared"`
	Changed  bool   `json:"changed"`
	Created  bool   `json:"created,omitempty"`
}
