package toudocu

import "time"

const (
	reviewSchemaVersion   = 1
	reviewSnapshotLimit   = 2 << 20
	reviewMessageLimit    = 64 << 10
	reviewResponseLimit   = 1 << 20
	reviewContextByteSize = 2 << 10
)

// RepositoryReviewReport is an internal repository-wide projection. It is not
// part of the public Go facade and intentionally does not change ChangeSetReport.
type RepositoryReviewReport struct {
	SchemaVersion      int                    `json:"schemaVersion"`
	Repository         ChangeRepository       `json:"repository"`
	Comparison         ChangeComparison       `json:"comparison"`
	RepositoryRevision string                 `json:"repositoryRevision"`
	Summary            ChangeSummary          `json:"summary"`
	Files              []RepositoryReviewFile `json:"files"`
	FeedbackWritable   bool                   `json:"feedbackWritable"`
	Diagnostics        []Issue                `json:"diagnostics"`
}

type RepositoryReviewFile struct {
	Status        string               `json:"status"`
	Path          string               `json:"path"`
	OldPath       string               `json:"oldPath,omitempty"`
	GitState      ChangeGitState       `json:"gitState"`
	Lines         ChangeLineStats      `json:"lines"`
	Binary        bool                 `json:"binary"`
	Size          int64                `json:"size,omitempty"`
	Digest        string               `json:"digest,omitempty"`
	Language      string               `json:"language"`
	Documentation *DocumentationChange `json:"documentation,omitempty"`
}

type RepositoryReviewFileDetail struct {
	SchemaVersion      int                  `json:"schemaVersion"`
	RepositoryRevision string               `json:"repositoryRevision"`
	File               RepositoryReviewFile `json:"file"`
	Before             *string              `json:"before,omitempty"`
	Current            *string              `json:"current,omitempty"`
	Patch              string               `json:"patch,omitempty"`
	Hunks              []SourceDiffHunk     `json:"hunks"`
	Documentation      *DocumentationChange `json:"documentation,omitempty"`
}

type ReviewState struct {
	SchemaVersion      int             `json:"schemaVersion"`
	Revision           uint64          `json:"revision"`
	StateDigest        string          `json:"stateDigest"`
	RepositoryRevision string          `json:"-"`
	Session            *ReviewSession  `json:"session,omitempty"`
	Feedback           []FeedbackBatch `json:"feedback"`
}

type ReviewSession struct {
	ID          string       `json:"id"`
	CreatedAt   time.Time    `json:"createdAt"`
	Discussions []Discussion `json:"discussions"`
}

type Discussion struct {
	ID        string          `json:"id"`
	State     string          `json:"state"`
	Target    ReviewTarget    `json:"target"`
	Anchor    *AnchorSnapshot `json:"anchor,omitempty"`
	Placement AnchorPlacement `json:"placement"`
	Messages  []ReviewMessage `json:"messages"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type ReviewPosition struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

type ReviewTarget struct {
	Type  string          `json:"type"`
	Path  string          `json:"path,omitempty"`
	Side  string          `json:"side,omitempty"`
	Start *ReviewPosition `json:"start,omitempty"`
	End   *ReviewPosition `json:"end,omitempty"`
}

type AnchorSnapshot struct {
	OriginalTarget             ReviewTarget `json:"originalTarget"`
	OriginalPath               string       `json:"originalPath,omitempty"`
	OriginalRepositoryRevision string       `json:"originalRepositoryRevision"`
	ContentDigest              string       `json:"contentDigest,omitempty"`
	SelectedText               string       `json:"selectedText,omitempty"`
	ContextBefore              string       `json:"contextBefore,omitempty"`
	ContextAfter               string       `json:"contextAfter,omitempty"`
	SnapshotRef                string       `json:"snapshotRef,omitempty"`
}

type AnchorPlacement struct {
	Status string          `json:"status"`
	Path   string          `json:"path,omitempty"`
	Side   string          `json:"side,omitempty"`
	Start  *ReviewPosition `json:"start,omitempty"`
	End    *ReviewPosition `json:"end,omitempty"`
	Reason string          `json:"reason,omitempty"`
}

type ReviewMessage struct {
	ID           string    `json:"id"`
	Author       string    `json:"author"`
	LegacyType   string    `json:"type,omitempty"`
	Body         string    `json:"body"`
	Outcome      string    `json:"outcome,omitempty"`
	ChangedPaths []string  `json:"changedPaths,omitempty"`
	FeedbackID   string    `json:"feedbackId,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	EditedAt     time.Time `json:"editedAt,omitempty"`
}

type FeedbackBatch struct {
	SchemaVersion int            `json:"schemaVersion"`
	ID            string         `json:"id"`
	ReviewID      string         `json:"reviewId"`
	Digest        string         `json:"feedbackDigest"`
	CreatedAt     time.Time      `json:"createdAt"`
	RespondedAt   time.Time      `json:"respondedAt,omitempty"`
	Items         []FeedbackItem `json:"items"`
}

type FeedbackItem struct {
	ID           string         `json:"id"`
	DiscussionID string         `json:"discussionId"`
	MessageID    string         `json:"messageId"`
	LegacyType   string         `json:"type,omitempty"`
	Body         string         `json:"body"`
	Target       ReviewTarget   `json:"target"`
	Anchor       AnchorSnapshot `json:"anchor"`
}

type AgentFeedbackResponse struct {
	SchemaVersion       int                   `json:"schemaVersion"`
	ReviewID            string                `json:"reviewId"`
	FeedbackID          string                `json:"feedbackId"`
	FeedbackDigest      string                `json:"feedbackDigest"`
	ExpectedRevision    uint64                `json:"expectedRevision"`
	ExpectedStateDigest string                `json:"expectedStateDigest"`
	Results             []AgentFeedbackResult `json:"results"`
}

type AgentFeedbackResult struct {
	ItemID       string   `json:"itemId"`
	Outcome      string   `json:"outcome"`
	Message      string   `json:"message"`
	ChangedPaths []string `json:"changedPaths"`
}

type PendingFeedbackEnvelope struct {
	SchemaVersion int            `json:"schemaVersion"`
	Revision      uint64         `json:"revision"`
	StateDigest   string         `json:"stateDigest"`
	Feedback      *FeedbackBatch `json:"feedback"`
}

type ReviewMutationGuard struct {
	ExpectedRevision    uint64 `json:"expectedRevision"`
	ExpectedStateDigest string `json:"expectedStateDigest"`
}

type CreateDiscussionRequest struct {
	ReviewMutationGuard
	RepositoryRevision string       `json:"repositoryRevision"`
	Target             ReviewTarget `json:"target"`
	Message            string       `json:"message"`
}

type UpdateDiscussionRequest struct {
	ReviewMutationGuard
	Operation string `json:"operation"`
	MessageID string `json:"messageId,omitempty"`
	Message   string `json:"message,omitempty"`
}

type CleanupReviewRequest struct {
	ReviewMutationGuard
	Mode    string `json:"mode"`
	Confirm bool   `json:"confirm,omitempty"`
}

type reviewFailure struct {
	Code    string
	Status  int
	Message string
}

func (failure *reviewFailure) Error() string { return failure.Message }
