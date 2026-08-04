package docgent

import "time"

// Options configures one CLI operation or a direct library call.
type Options struct {
	Command         string
	TaskID          string
	InputDirectory  string
	OutputDirectory string
	Title           string
	Excludes        []string
	StaleDays       int
	RepositoryRoot  string
	RepositoryURL   string
	RepositoryRef   string
	Clean           bool
	Open            bool
	Strict          bool
	Format          string
	ReportPath      string
	Timeout         time.Duration
	Force           bool
	Example         bool
	Now             time.Time
}

type StatusInfo struct {
	Kind       string `json:"kind"`
	Symbol     string `json:"symbol"`
	Label      string `json:"label"`
	Recognized bool   `json:"recognized"`
}

type Metadata map[string]string

type MetadataExtra struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type Heading struct {
	Level int    `json:"level"`
	Title string `json:"title"`
	ID    string `json:"id"`
	Line  int    `json:"line"`
}

type Task struct {
	Line         int    `json:"line"`
	Indent       int    `json:"indent"`
	Completed    bool   `json:"completed"`
	Text         string `json:"text"`
	HeadingID    string `json:"headingId,omitempty"`
	HeadingTitle string `json:"headingTitle,omitempty"`
}

type Link struct {
	Line        int    `json:"line"`
	Image       bool   `json:"image"`
	Label       string `json:"label"`
	Destination string `json:"destination"`
	Title       string `json:"title,omitempty"`
}

type ResolvedLink struct {
	Link
	Href             string
	External         bool
	Broken           bool
	Blocked          bool
	BrokenAnchor     bool
	RepositoryEscape bool
	RepositoryAsset  bool
	ActiveAsset      bool
	UnsafeImage      bool
	RepositoryPath   string
	RepositoryKind   string
	AssetPath        string
	GeneratedTarget  string
	TargetDocument   *Document
}

type Section struct {
	Title          string          `json:"title"`
	ID             string          `json:"id"`
	StartLine      int             `json:"startLine"`
	EndLine        int             `json:"endLine"`
	Metadata       Metadata        `json:"metadata"`
	MetadataExtras []MetadataExtra `json:"metadataExtras,omitempty"`
	Tasks          []Task          `json:"tasks"`
	Text           string          `json:"text"`
	Markdown       string          `json:"markdown"`
}

type TaskStats struct {
	Total     int  `json:"total"`
	Completed int  `json:"completed"`
	Remaining int  `json:"remaining"`
	Percent   *int `json:"percent"`
}

type Issue struct {
	Severity     string `json:"severity"`
	Code         string `json:"code"`
	Message      string `json:"message"`
	DocumentPath string `json:"documentPath,omitempty"`
	Line         int    `json:"line,omitempty"`
}

type Document struct {
	ID                  string
	AbsolutePath        string
	SourcePath          string
	OutputPath          string
	Directory           string
	FileName            string
	Type                string
	TypeLabel           string
	Title               string
	Description         string
	Content             string
	Lines               []string
	Headings            []Heading
	HeadingByLine       map[int]Heading
	Sections            []Section
	Metadata            Metadata
	MetadataExtras      []MetadataExtra
	MetadataLineIndexes map[int]struct{}
	Tasks               []Task
	TaskStats           TaskStats
	Links               []Link
	PlainText           string
	MTime               time.Time
	UpdatedAt           time.Time
	AgeDays             int
	Stale               bool
	Status              StatusInfo
	Warnings            []Issue
	Errors              []Issue
	ResolvedLinks       []ResolvedLink
	Backlinks           []*Document
	RelatedDocuments    []*Document
	LinkedUseCases      []*Document
	LinkedModules       []*Document
}

type Risk struct {
	ID          string
	Title       string
	FullTitle   string
	Status      StatusInfo
	Probability string
	Impact      string
	Owner       string
	TaskStats   TaskStats
	Document    *Document
	Anchor      string
	Text        string
}

type RoadmapStage struct {
	Title       string
	Status      StatusInfo
	PlannedDate string
	Owner       string
	TaskStats   TaskStats
	Items       []RoadmapItem
	Document    *Document
	Anchor      string
	Text        string
}

type RoadmapItem struct {
	ID                 string      `json:"id"`
	Text               string      `json:"text"`
	Kind               string      `json:"kind"`
	DeclaredCompleted  bool        `json:"declaredCompleted"`
	EffectiveCompleted bool        `json:"effectiveCompleted"`
	CompletionSource   string      `json:"completionSource"`
	TargetDocument     string      `json:"targetDocument,omitempty"`
	TargetStatus       *StatusInfo `json:"targetStatus,omitempty"`
	Document           string      `json:"document"`
	Line               int         `json:"line"`
}

type KnowledgeModule struct {
	ID              string     `json:"id"`
	Title           string     `json:"title"`
	Status          StatusInfo `json:"status"`
	Document        string     `json:"document"`
	RepositoryPaths []string   `json:"repositoryPaths"`
	UseCaseIDs      []string   `json:"useCaseIds"`
	BusinessRuleIDs []string   `json:"businessRuleIds"`
}

type KnowledgeUseCase struct {
	ID              string     `json:"id"`
	Title           string     `json:"title"`
	Status          StatusInfo `json:"status"`
	ModuleID        string     `json:"moduleId,omitempty"`
	Document        string     `json:"document"`
	RepositoryPaths []string   `json:"repositoryPaths"`
	BusinessRuleIDs []string   `json:"businessRuleIds"`
}

type BusinessRule struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ModuleID string `json:"moduleId,omitempty"`
	Document string `json:"document"`
	Anchor   string `json:"anchor"`
	Line     int    `json:"line"`
	ownerDoc *Document
}

type WorkItem struct {
	ID              string                  `json:"id"`
	Title           string                  `json:"title"`
	Status          StatusInfo              `json:"status"`
	Type            string                  `json:"type,omitempty"`
	Priority        string                  `json:"priority,omitempty"`
	Owner           string                  `json:"owner,omitempty"`
	ModuleID        string                  `json:"moduleId,omitempty"`
	UseCaseID       string                  `json:"useCaseId,omitempty"`
	DependsOn       []string                `json:"dependsOn"`
	Document        string                  `json:"document"`
	Anchor          string                  `json:"anchor"`
	Criteria        []Task                  `json:"criteria"`
	Verification    []CriterionVerification `json:"verificationMatrix"`
	Checks          []VerificationCheck     `json:"checks"`
	RepositoryPaths []string                `json:"repositoryPaths"`
	Result          string                  `json:"result,omitempty"`
	Blocker         string                  `json:"blocker,omitempty"`
	line            int
	ownerDoc        *Document
	statusName      string
}

type CriterionVerification struct {
	CriterionID string   `json:"criterionId"`
	Criterion   string   `json:"criterion"`
	Completed   bool     `json:"completed"`
	Commands    []string `json:"commands"`
}

type VerificationCheck struct {
	Target   string   `json:"target"`
	Commands []string `json:"commands"`
	Line     int      `json:"line"`
}

type TaskCheckTask struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	Status   StatusInfo `json:"status"`
	Type     string     `json:"type,omitempty"`
	Document string     `json:"document"`
}

type CommandExecutionResult struct {
	Sequence        int       `json:"sequence"`
	Command         string    `json:"command"`
	Targets         []string  `json:"targets"`
	Status          string    `json:"status"`
	ExitCode        *int      `json:"exitCode"`
	StartedAt       time.Time `json:"startedAt"`
	FinishedAt      time.Time `json:"finishedAt"`
	DurationMillis  int64     `json:"durationMillis"`
	Stdout          string    `json:"stdout"`
	Stderr          string    `json:"stderr"`
	StdoutTruncated bool      `json:"stdoutTruncated"`
	StderrTruncated bool      `json:"stderrTruncated"`
}

type CriterionExecutionResult struct {
	ID                string `json:"id"`
	Description       string `json:"description"`
	DocumentCompleted bool   `json:"documentCompleted"`
	Status            string `json:"status"`
}

type TargetExecutionResult struct {
	Target string `json:"target"`
	Status string `json:"status"`
}

type TaskCheckSummary struct {
	TotalCommands    int `json:"totalCommands"`
	PassedCommands   int `json:"passedCommands"`
	FailedCommands   int `json:"failedCommands"`
	TimedOutCommands int `json:"timedOutCommands"`
	CriteriaPassed   int `json:"criteriaPassed"`
	CriteriaFailed   int `json:"criteriaFailed"`
}

type TaskCheckReport struct {
	SchemaVersion    int                        `json:"schemaVersion"`
	Kind             string                     `json:"kind"`
	Generator        map[string]string          `json:"generator"`
	Task             TaskCheckTask              `json:"task"`
	StartedAt        time.Time                  `json:"startedAt"`
	FinishedAt       time.Time                  `json:"finishedAt"`
	DurationMillis   int64                      `json:"durationMillis"`
	Status           string                     `json:"status"`
	FullVerification bool                       `json:"fullVerification"`
	ValidationIssues []Issue                    `json:"validationIssues"`
	Issues           []Issue                    `json:"issues"`
	Commands         []CommandExecutionResult   `json:"commands"`
	Criteria         []CriterionExecutionResult `json:"criteria"`
	Targets          []TargetExecutionResult    `json:"targets"`
	Summary          TaskCheckSummary           `json:"summary"`
}

type KnowledgeModel struct {
	Modules       []KnowledgeModule  `json:"modules"`
	UseCases      []KnowledgeUseCase `json:"useCases"`
	BusinessRules []BusinessRule     `json:"businessRules"`
	WorkItems     []WorkItem         `json:"workItems"`
}

type ProjectInfo struct {
	Title            string
	Description      string
	Status           StatusInfo
	Stage            string
	Version          string
	Owner            string
	Updated          string
	Summary          string
	OverviewDocument *Document
	StatusDocument   *Document
}

type CurrentWorkItem struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	Status   StatusInfo `json:"status"`
	ModuleID string     `json:"moduleId,omitempty"`
	Document string     `json:"document"`
	Anchor   string     `json:"anchor"`
}

type CurrentBlocker struct {
	TaskID   string `json:"taskId"`
	Text     string `json:"text"`
	Document string `json:"document"`
	Anchor   string `json:"anchor"`
}

type CurrentStatus struct {
	ActiveWork []CurrentWorkItem `json:"activeWork"`
	Blockers   []CurrentBlocker  `json:"blockers"`
	NextResult *RoadmapItem      `json:"nextResult,omitempty"`
}

type Stats struct {
	Documents                   int            `json:"documents"`
	TotalTasks                  int            `json:"totalTasks"`
	CompletedTasks              int            `json:"completedTasks"`
	RemainingTasks              int            `json:"remainingTasks"`
	TaskProgress                *int           `json:"taskProgress"`
	DocumentsComplete           int            `json:"documentsComplete"`
	DocumentsInProgress         int            `json:"documentsInProgress"`
	DocumentsNotStarted         int            `json:"documentsNotStarted"`
	DocumentsWithoutTasks       int            `json:"documentsWithoutTasks"`
	StaleDocuments              int            `json:"staleDocuments"`
	DocumentsWithoutDescription int            `json:"documentsWithoutDescription"`
	DocumentsWithoutStatus      int            `json:"documentsWithoutStatus"`
	BrokenLinks                 int            `json:"brokenLinks"`
	Warnings                    int            `json:"warnings"`
	Errors                      int            `json:"errors"`
	Modules                     int            `json:"modules"`
	ModuleStatuses              map[string]int `json:"moduleStatuses"`
	UseCases                    int            `json:"useCases"`
	UseCaseStatuses             map[string]int `json:"useCaseStatuses"`
	Risks                       int            `json:"risks"`
	OpenRisks                   int            `json:"openRisks"`
	Decisions                   int            `json:"decisions"`
}

type SearchItem struct {
	Title       string `json:"title"`
	Path        string `json:"path"`
	URL         string `json:"url"`
	Type        string `json:"type"`
	TypeLabel   string `json:"typeLabel"`
	Status      string `json:"status"`
	Owner       string `json:"owner"`
	Description string `json:"description"`
	Text        string `json:"text"`
}

type Model struct {
	RootDirectory    string
	RepositoryRoot   string
	RepositoryURL    string
	RepositoryRef    string
	GeneratedAt      time.Time
	StaleDays        int
	Documents        []*Document
	DocByPath        map[string]*Document
	Directories      map[string]struct{}
	Assets           map[string]string
	Issues           []Issue
	Collections      map[string][]*Document
	Risks            []Risk
	RoadmapStages    []RoadmapStage
	Knowledge        KnowledgeModel
	Project          ProjectInfo
	CurrentStatus    CurrentStatus
	Stats            Stats
	SearchIndex      []SearchItem
	HealthOutputPath string
	ReportOutputPath string
}

type GenerateResult struct {
	OutputDirectory string
	Pages           int
	Assets          int
}

type LinkResolution struct {
	Href     string
	External bool
	Broken   bool
	Blocked  bool
}

type LinkResolver func(destination string, image bool, title string) LinkResolution
