package docgent

import "time"

type GeneratorInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
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
	Generator        GeneratorInfo              `json:"generator"`
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

type ReportLink struct {
	Destination string `json:"destination"`
	Broken      bool   `json:"broken"`
	Blocked     bool   `json:"blocked"`
	TargetKind  string `json:"targetKind"`
	Target      string `json:"target"`
	Href        string `json:"href"`
}

type ReportDocument struct {
	ID               string       `json:"id"`
	SourcePath       string       `json:"sourcePath"`
	OutputPath       string       `json:"outputPath"`
	Type             string       `json:"type"`
	Title            string       `json:"title"`
	Description      string       `json:"description"`
	Metadata         Metadata     `json:"metadata"`
	Status           StatusInfo   `json:"status"`
	TaskStats        TaskStats    `json:"taskStats"`
	UpdatedAt        time.Time    `json:"updatedAt"`
	Stale            bool         `json:"stale"`
	Warnings         int          `json:"warnings"`
	Errors           int          `json:"errors"`
	Links            []ReportLink `json:"links"`
	Backlinks        []string     `json:"backlinks"`
	RelatedDocuments []string     `json:"relatedDocuments"`
}

type ReportRoadmapStage struct {
	Title       string        `json:"title"`
	Status      StatusInfo    `json:"status"`
	PlannedDate string        `json:"plannedDate"`
	TaskStats   TaskStats     `json:"taskStats"`
	Items       []RoadmapItem `json:"items"`
	Document    string        `json:"document"`
	Anchor      string        `json:"anchor"`
}

type ReportRisk struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Status      StatusInfo `json:"status"`
	Probability string     `json:"probability"`
	Impact      string     `json:"impact"`
	Owner       string     `json:"owner"`
	TaskStats   TaskStats  `json:"taskStats"`
	Document    string     `json:"document"`
	Anchor      string     `json:"anchor"`
}

type ReportProject struct {
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      StatusInfo `json:"status"`
	Stage       string     `json:"stage"`
	Version     string     `json:"version"`
	Owner       string     `json:"owner"`
	Updated     string     `json:"updated"`
	Summary     string     `json:"summary"`
}

type ReportKnowledge struct {
	Modules       []KnowledgeModule  `json:"modules"`
	UseCases      []KnowledgeUseCase `json:"useCases"`
	Flows         []KnowledgeFlow    `json:"flows"`
	BusinessRules []BusinessRule     `json:"businessRules"`
	WorkItems     []WorkItem         `json:"workItems"`
}

type ReportScreen struct {
	ID                  string        `json:"id"`
	Title               string        `json:"title"`
	Description         string        `json:"description,omitempty"`
	Module              string        `json:"module"`
	Type                string        `json:"type"`
	Status              string        `json:"status"`
	Route               string        `json:"route,omitempty"`
	Preview             string        `json:"preview,omitempty"`
	Component           string        `json:"component,omitempty"`
	Owner               string        `json:"owner,omitempty"`
	Updated             string        `json:"updated,omitempty"`
	Parent              string        `json:"parent,omitempty"`
	States              []ScreenState `json:"states"`
	IncomingTransitions []string      `json:"incomingTransitions"`
	OutgoingTransitions []string      `json:"outgoingTransitions"`
	UseCases            []string      `json:"useCases"`
	WorkItems           []string      `json:"workItems"`
	Contracts           []string      `json:"contracts"`
	Document            string        `json:"document"`
}

type ProjectReport struct {
	SchemaVersion    int                  `json:"schemaVersion"`
	Generator        GeneratorInfo        `json:"generator"`
	GeneratedAt      time.Time            `json:"generatedAt"`
	SourceDirectory  string               `json:"sourceDirectory"`
	StaleDays        int                  `json:"staleDays"`
	Project          ReportProject        `json:"project"`
	CurrentStatus    CurrentStatus        `json:"currentStatus"`
	Stats            Stats                `json:"stats"`
	Documents        []ReportDocument     `json:"documents"`
	Roadmap          []ReportRoadmapStage `json:"roadmap"`
	Risks            []ReportRisk         `json:"risks"`
	Knowledge        ReportKnowledge      `json:"knowledge"`
	Screens          []ReportScreen       `json:"screens"`
	Transitions      []ScreenTransition   `json:"transitions"`
	PlayableFlows    []PlayableFlow       `json:"playableFlows"`
	Hotspots         []Hotspot            `json:"hotspots"`
	ErrorDefinitions []ErrorDefinition    `json:"errorDefinitions"`
	Traceability     []TraceabilityRow    `json:"traceability"`
	Issues           []Issue              `json:"issues"`
}

type TaskContextDocument struct {
	ID          string     `json:"id,omitempty"`
	Path        string     `json:"path"`
	Type        string     `json:"type"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      StatusInfo `json:"status"`
}

type TaskContextReport struct {
	SchemaVersion     int                   `json:"schemaVersion"`
	Kind              string                `json:"kind"`
	Generator         GeneratorInfo         `json:"generator"`
	Task              WorkItem              `json:"task"`
	FullVerification  bool                  `json:"fullVerification"`
	Module            *KnowledgeModule      `json:"module,omitempty"`
	UseCase           *KnowledgeUseCase     `json:"useCase,omitempty"`
	Screens           []KnowledgeScreen     `json:"screens"`
	ScreenTransitions []ScreenTransition    `json:"screenTransitions"`
	BusinessRules     []BusinessRule        `json:"businessRules"`
	Dependencies      []WorkItem            `json:"dependencies"`
	Dependents        []WorkItem            `json:"dependents"`
	Documents         []TaskContextDocument `json:"documents"`
	Issues            []Issue               `json:"issues"`
}
