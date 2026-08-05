# Docu-docu system boundary

- Document type: Architecture
- Architecture question: Where is the Docu-docu system boundary and who interacts with it?

Docu-docu is limited to one local process that reads the documentation and
repository, builds a proven model and issues diagnostics or derivatives
presentations. Embedding Go code calls the same model façade and operations without
a separate process. In `serve`, the process accepts limited editor requests and
atomically saves the selected workspace file. User, library
the consumer, agent, CI and browser remain the communicating parties behind this
border. The Release installer also remains outside: it is separate
bootstrap, which only uses the network before the Go runtime.

## Area

The answer describes the boundary of one Go runtime accessible via the CLI or public
package, and its external interactions. Teams, formats, Go façade and reasons
dependency-free deliveries remain in [CLI contract](../contracts/cli.md),
[Go API contract](../contracts/go-api.md) and
[ADR-001](../decisions/001-dependency-free.md).

## Interacting parties

- the developer or agent selects the login, repository root and operation;
- the library consumer calls the exported facade `api.go` and receives
  a typed model or report;
- CI uses exit code and `ProjectReport` schema v1;
- the file system provides Markdown, local assets and resolved
  repository targets;
- the browser reads the offline portal via `file://`; via `serve` it also
  reads the revision/editor API and explicitly saves the allowed source;
- shell and child processes are accessible only by explicit `task verify --run`.

## What remains outside

Docu-docu does not store server state, does not access the database, or
interprets the user request. The boundary between deterministic CLI and
the semantic work of the performer is recorded in
[ADR-002](../decisions/ADR-002.md).
Downloading release assets and writing the binary to the user install dir belongs to
separate installer workflow described in
[installation guide](../guides/installation.md).