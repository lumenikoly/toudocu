# Toudocu

**English** | [Русский](README.ru.md)

[![CI](https://github.com/lumenikoly/toudocu/actions/workflows/test.yml/badge.svg)](https://github.com/lumenikoly/toudocu/actions/workflows/test.yml)
[![Docs contract](https://github.com/lumenikoly/toudocu/actions/workflows/docs.yml/badge.svg)](https://github.com/lumenikoly/toudocu/actions/workflows/docs.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/lumenikoly/toudocu)](https://go.dev/)
[![License](https://img.shields.io/github/license/lumenikoly/toudocu)](LICENSE)

**A local Go CLI for verifiable Markdown documentation and static HTTP
portals.**

Toudocu keeps documentation beside the code, validates its structure and
relationships, builds a portal for publication, and provides a local workspace
with an editor, Git change review, and discussions. Users run one executable;
Node.js is needed only by developers working on Toudocu's browser frontend.

The [project documentation](https://lumenikoly.github.io/toudocu/project-docs/en/)
is generated with Toudocu.

## What works today

- `check` validates documents, links, IDs, relationships, diagrams,
  standards, and work items;
- `build` creates a read-only static portal;
- `serve` starts a local portal with an editor, rebuilds, Changes, and an
  offline Swagger UI;
- `search` searches the source Markdown;
- `changes` reports local Git changes without modifying the repository;
- `task` creates, validates, moves, and—only with explicit
  authorization—runs a work item's verification commands;
- the embedded skill helps an agent initialize, refresh, and translate
  documentation and process comments from Changes.

## Quick start

### 1. Build Toudocu

You need Go 1.22 or newer.

Linux and macOS:

```bash
git clone https://github.com/lumenikoly/toudocu.git
cd toudocu
go build -o toudocu ./cmd/toudocu
./toudocu version
```

Windows PowerShell:

```powershell
git clone https://github.com/lumenikoly/toudocu.git
Set-Location toudocu
go build -o toudocu.exe ./cmd/toudocu
./toudocu.exe version
```

A source build does not add the executable to `PATH`. Move it to your
preferred executable directory or invoke it by its full path.

### 2. Create source documentation

Move to the root of the repository you want to document. If you use a
supported AI agent, install the embedded skill in that project:

```bash
toudocu skill install --agent codex
```

`claude-code` and `copilot` are also supported. Add `--scope user` to install
the skill once in the user directory. Then ask the agent from the same
repository root:

```text
$toudocu init
```

This is an AI-skill call, not a Go CLI command. The skill studies the project
and creates a minimal structure without inventing modules, statuses, or
procedures.

Without the skill, create the minimum structure manually:

```text
docs/
├── index.md
└── architecture/
    └── overview.md
```

`index.md` introduces the project.
`architecture/overview.md` defines the system boundary and links directly
to every other architecture document.

### 3. Validate the structure

```bash
toudocu check ./docs
```

A successful `check` confirms structure and declared relationships. It
does not prove that the prose is useful or matches the implementation; authors
and semantic review remain responsible for that.

### 4. Work locally

```bash
toudocu serve ./docs
```

By default, the server listens at `http://127.0.0.1:8080`. In the local
portal you can:

- read documentation and search it;
- open and create source files in the Editor;
- see previews and diagnostics;
- review the current Git diff in Changes;
- comment on a change set, file, line, or selection;
- add a deliverable to an existing `roadmap.md` stage.

Toudocu does not start an agent. Saving a message immediately queues it; the
message remains editable or deletable until an agent claims it. “Copy prompt”
only copies the processing request. The installed skill retrieves one request
at a time with `toudocu agent next --json` and returns its answer to the
original discussion with `toudocu agent respond`.

`serve` has no TLS or built-in authentication. Its loopback default keeps
it local; do not expose it to an external network without separate protection.
Disable the optional stable-version check with:

```bash
toudocu serve --no-update-check ./docs
```

### 5. Build a portal for publication

```bash
toudocu build ./docs --output ./site --clean
```

Publish `site/` through ordinary HTTP(S) static hosting. Toudocu does not
need to run as a server after the build. Static output contains no editor,
Changes workspace, or local APIs.

Opening `index.html` directly through `file://` is unsupported. Use
`toudocu serve` for local reading.

## Install Toudocu

Install the latest stable release:

Linux and macOS:

```sh
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

The installer selects the operating system and architecture, downloads
`checksums.txt`, verifies SHA-256 and the version, and only then replaces
the executable. Supported platforms, version pinning, and `PATH` behavior
are documented in the
[installation guide](docs-en/guides/installation.md).

## Main CLI commands

| Result | Command |
|---|---|
| Show the version or help | `toudocu version`, `toudocu --help` |
| Validate documentation | `toudocu check ./docs` |
| Build a static portal | `toudocu build ./docs --output ./site --clean` |
| Start the local portal | `toudocu serve ./docs` |
| Find text or an ID | `toudocu search "query" ./docs` |
| Review Git changes | `toudocu changes ./docs` |
| Review one file | `toudocu changes file PATH ./docs` |
| Compare a diff with a task | `toudocu task changes TASK-ID ./docs` |
| Create a neutral scaffold | `toudocu scaffold module MOD-PAYMENTS ./docs --title "Payments"` |
| Create a work item | `toudocu task init ./docs --area AREA --title "Title" --type TYPE` |
| Check task readiness | `toudocu task ready TASK-ID ./docs` |
| Collect task context | `toudocu task context TASK-ID ./docs` |
| Build a command plan without running it | `toudocu task verify TASK-ID ./docs --dry-run` |
| Explicitly run task commands | `toudocu task verify TASK-ID ./docs --run` |
| Move a task to the archive | `toudocu task archive TASK-ID ./docs` |
| Restore an archived task | `toudocu task restore TASK-ID ./docs` |
| Manage the embedded skill | `toudocu skill install|status|update|uninstall` |

`$toudocu init`, `$toudocu refresh`,
`$toudocu translate`, and `$toudocu feedback` are AI-skill
workflows. The Go CLI has no top-level commands with those names.

## Refresh and translation workflows

Review every canonical source document against the repository:

```text
$toudocu refresh
```

Start with staged, unstaged, and untracked changes relative to `HEAD`,
then include affected documents:

```text
$toudocu refresh diff
```

Update one configured translation:

```text
$toudocu translate en --all-stale
```

Process the current diff for every configured translation:

```text
$toudocu translate diff
```

The canonical root is the only source of ordinary documentation and work-item
context. Translation roots are complete read-only mirrors: task commands,
scaffolding, and Editor writes are rejected there.

In this repository, canonical Russian documentation lives in `docs/` and
the English translation in `docs-en/`.

## Supported Markdown

Toudocu uses Goldmark 1.8.5 and one CommonMark/GFM parse tree for every command.
It supports headings, paragraphs, emphasis, blockquotes, links, safe raster
images, ordinary and task lists, tables, strikethrough, literal autolinks,
inline code, and fenced code.

Mermaid supports `flowchart`, `stateDiagram-v2`, and
`sequenceDiagram`.

Unsupported input includes raw HTML, front matter at the start of a file
between matching `---` or `+++` lines, Markdown attributes,
footnotes, definition lists, active SVG/XML/HTML assets, and JavaScript URLs.
See the [Markdown module](docs-en/modules/markdown.md) for details.

## Configuration

The optional `.toudocu/config.yml` configures locale, portal appearance,
translation roots, and Changes. A minimal example:

```yaml
project:
  locale: en

site:
  title: My project
  theme: classic
  colorScheme: system
  accent: indigo
```

Every field and accepted value is listed in the
[configuration reference](docs-en/reference/configuration.md).

## Public Go API

The root package provides typed model, generation, and report operations. Its
module path is `toudocu`, so it is intended for programs built in this source
tree or with an explicit local `replace`. The CLI is the supported distribution
interface.

## Developing Toudocu

```bash
make fmt
make fmt-check
make vet
make test
make web
make web-check
make browser-test
make check
make build
make docs
make docs-serve
make release
```

These `make` targets are for developing this repository. Users of a built
binary run `toudocu` commands directly.

## Documentation

- [Features](docs-en/reference/features.md)
- [CLI contract](docs-en/contracts/cli.md)
- [Configuration](docs-en/reference/configuration.md)
- [Local workflow](docs-en/guides/local-workflow.md)
- [Viewing changes](docs-en/guides/documentation-changes.md)
- [AI-skill workflows](docs-en/guides/agent-workflows.md)
- [Work items](docs-en/guides/work-items.md)
- [Installing the skill](docs-en/guides/skill-installation.md)
- [Document types](docs-en/reference/document-types.md)
- [Toudocu source documentation](docs-en/index.md)
- [Contributing](CONTRIBUTING.md)

## License

Distribution terms are in [LICENSE](LICENSE). Licenses for embedded third-party
components are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
