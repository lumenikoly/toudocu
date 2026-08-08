# Docu-docu System Boundary

- Document type: Architecture
- Architecture question: Where is the Docu-docu system boundary and who interacts with it?

Docu-docu is limited to one local process that reads documentation and the
repository, builds a validated model, and emits diagnostics or derived
representations. Embedding Go code invokes the same model and operation facade
without a separate process. In `serve`, the process accepts constrained
editor/changes requests, serves an offline OpenAPI UI, and atomically saves the
selected workspace file. Canonical `serve` may also fetch latest stable release
metadata once from a fixed GitHub API; this is the running portal's only network
egress and can be disabled with a flag. The user, library consumer, agent, CI, and browser
remain interacting parties outside this boundary. The release installer also
remains outside: it is a separate bootstrap that uses the network only before
the Go runtime starts. Inside the runtime, the `skill` command reads the
embedded package and modifies the selected project/user target within strict
limits; it neither downloads nor executes skill content.

## Scope

This answer describes the boundary and external interactions of one Go runtime
available through the CLI or public package. Commands and formats are defined in
the [CLI contract](../contracts/cli.md), the Go facade is summarized in the
[feature reference](../reference/features.md#public-go-api), and the reason
for dependency-free delivery is recorded in
[ADR-001](../decisions/001-dependency-free.md).

## Interacting parties

- A developer or agent selects the input, repository root, and operation.
- A library consumer invokes the exported `api.go` facade and receives a typed
  model or report.
- CI uses the exit code and `ProjectReport` schema v1.
- The filesystem provides Markdown, local assets, and allowed repository
  targets.
- A browser reads the backend-independent portal on HTTP(S) static hosting;
  through canonical `serve`, it also reads the revision, editor/changes API,
  and OpenAPI UI and explicitly saves an allowed source file; it receives
  version status only from the same origin.
- The GitHub Releases API provides untrusted latest stable release metadata
  only to the canonical serve runtime.
- The shell and child processes are available only to an explicit
  `task verify --run`.
- The AI-skill host filesystem is changed only through explicit `skill install`,
  `update`, or `uninstall`; `status` remains read-only.

## What remains outside

Docu-docu does not store server state, access a database, or interpret the
user's request. The boundary between the deterministic CLI and an agent's
semantic work is recorded in [ADR-002](../decisions/ADR-002.md). Downloading
release assets and writing the binary to a user install dir belong to a
separate installer workflow described in the
[installation guide](../guides/installation.md).
Offline placement of the embedded AI skill is a separate explicit runtime
command described in the [skill lifecycle guide](../guides/skill-installation.md).
