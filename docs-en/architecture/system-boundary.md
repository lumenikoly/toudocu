<!-- toudocu
version: 1
architectureQuestion: Где проходит системная граница Toudocu и кто с ней взаимодействует?
-->

# Toudocu System Boundary


Toudocu runs as one local Go process. It reads documentation and allowed
repository data, builds a model, and returns diagnostics, a JSON report, or a
portal. A program using the Go package invokes the same facade without a
separate process.

In `serve`, the process also accepts constrained Editor, Changes, and agent
feedback API requests. It stores discussions, anchors, and queue entries in the
operating system's user state directory, not in the repository. Commands read
the same state even while `serve` is stopped. Canonical `serve` may also fetch stable release
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
- An installed skill retrieves the oldest unfinished delivery through the CLI
  and returns one structured response. Toudocu does not start the agent or call
  an external language model.

## What remains outside

Toudocu does not store server state, access a database, or interpret the
user's request. The boundary between the deterministic CLI and an agent's
semantic work is recorded in [ADR-002](../decisions/ADR-002.md). Downloading
release assets and writing the binary to a user install dir belong to a
separate installer workflow described in the
[installation guide](../guides/installation.md).
Offline placement of the embedded AI skill is a separate explicit runtime
command described in the [skill lifecycle guide](../guides/skill-installation.md).
