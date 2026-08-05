# Go API contract Docu-docu v1

- Identifier: CON-GO-API-V1
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

The contract describes the exported facade of the root Go package. He is needed
developers who embed model, rendering or Docu-docu reports without
launch a separate process.

## Post boundary

The package is declared by the module `docu-docu` and is exported from `api.go`. Canonical
the remote module path and the public version of the Go module have not yet been published;
the current import path is usable within the source module or via an explicitly configured one
local `replace`. This contract does not promise availability at a remote address.

`Version` reports the implementation version. `EmbeddedFiles` provides built-in
assets. The exported types are aliases of the implementation types from
`internal/app` so that the consumer does not depend on the internal layout
packages.

## Operations

| Group | Operations | Side effects |
|---|---|---|
| CLI | `PrintHelp`, `ParseArguments`, `RunCLI`, `Main` | determined by the selected CLI command; `Main` terminates the process via exit code |
| Classification | `ClassifyDocument`, `StatusFor` | missing |
| Model | `BuildDocumentationModel`, `BuildReport` | read documentation and repository root; sources do not change |
| Markdown | `AnalyzeMarkdown`, `RenderMarkdown`, `RenderMarkdownFragment` | missing |
| Portal | `GenerateSite` | writes output; safe cleanup is only performed with `Options.Clean` |
| Search | `SearchDocumentation` | missing |
| Creation | `InitTask`, `Scaffold` | atomically create one new file without overwriting |
| Task life cycle | `MoveTask` | for `archive` or `restore` moves one valid work item without overwriting |
| Task context | `BuildTaskContext`, `BuildTaskReady` | absent; check commands are not executed |
| Changes | `BuildDocumentationChanges` | only reads Git and workspace; does not fetch, checkout, or write to index |

A direct function call receives an explicitly populated `Options`. Default values
CLIs appear with `ParseArguments`; the library user should not count
unspecified fields are equivalent to CLI flags without checking a specific operation.

A model built from a configured translation root is intended only for reading
and portal generation. `InitTask`, `Scaffold`, `MoveTask`, task-scoped
changes, task context, and task readiness reject that root with
`TRANSLATION_ROOT_READ_ONLY`; task verification through `RunCLI` returns a
blocked report without invoking a command runner. Signatures and schema-v1 JSON
remain unchanged.

## Minimal example

The example is for code inside the current source module or project with
explicit local `replace`:

```go
package main

import (
	"fmt"

	docudocu "docu-docu"
)

func main() {
	model, err := docudocu.BuildDocumentationModel(docudocu.Options{
		InputDirectory: "./docs",
		RepositoryRoot: ".",
	})
	if err != nil {
		panic(err)
	}
	report := docudocu.BuildReport(model)
	fmt.Println(report.Stats.Documents)
}
```

## Errors and results

Functions with `error` return argument, file system, or operation errors.
A successfully built model and typed reports may additionally contain
`Issue` with diagnostics documentation. `RunCLI` converts the result to exit codes
from [CLI contract](cli.md); direct library calls do not terminate the process, but
with the exception of `Main`.

`BuildTaskReady` returns `TaskReadyReport` with status and issues instead
separate `error`. Execution of `task verify --run` commands is available via
`RunCLI`; There is no separate exported command runner launch function.

## Compatibility

The public surface is defined by `api.go`, the signatures of the exported functions,
aliases of types and JSON tags of corresponding reports. Modification or deletion
export requires a simultaneous update of this contract and the façade test.
Versioned JSON schemas retain their own compatibility rules from
[CLI contract](cli.md).
