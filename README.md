# Toudocu

**English** | [Русский](README.ru.md)

[![CI](https://github.com/lumenikoly/toudocu/actions/workflows/test.yml/badge.svg)](https://github.com/lumenikoly/toudocu/actions/workflows/test.yml)
[![Docs contract](https://github.com/lumenikoly/toudocu/actions/workflows/docs.yml/badge.svg)](https://github.com/lumenikoly/toudocu/actions/workflows/docs.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/lumenikoly/toudocu)](https://go.dev/)
[![License](https://img.shields.io/github/license/lumenikoly/toudocu)](LICENSE)

**A tool for verifiable Markdown documentation and static HTTP portals.**

**Toudocu** helps keep documentation aligned with the codebase, find inconsistencies, and build clean static portals for reading.

### Key features

* **Ready-to-use Go CLI** — a fast binary with no Node.js or additional dependencies.
* **Skills for AI agents** — help analyze repositories, create documentation, and update it after changes.
* **Documentation validation** — structure, links, and relationships can be checked locally and in CI.
* **Static HTTP portal** — the generated website needs no backend and can be published on ordinary static hosting.
* **Local mode** — an editor, automatic rebuilds, and Git change browsing.
* **Local review** — anchored discussions and an explicit FIFO handoff to an installed AI skill, without a hosted review service.
* **Minimal infrastructure** — no database, npm, CDN, or separate runtime.

All documentation is stored in the repository as regular Markdown files.

---

## Quick start

### 1. Install the CLI

Linux and macOS:

```bash
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

The installer selects the platform, verifies SHA-256, and installs the binary
in the current user's directory. Running the same command again updates
Toudocu.

Verify the installation:

```bash
toudocu --help
```

You can also build the binary from source:

```bash
git clone https://github.com/lumenikoly/toudocu.git
cd toudocu
make build
```

After the build, the binary will be available in the repository root:

```bash
./toudocu --help
```

For the platform matrix, version pinning, directories, and verification scope,
see the [installation guide](docs/guides/installation.md).

### 2. Install the skill

Install the offline skill package embedded in the CLI for the detected AI host:

```bash
toudocu skill install
```

For non-interactive environments, or when several hosts are detected, select
one explicitly:

```bash
toudocu skill install --agent codex
toudocu skill install --agent claude-code --scope user
toudocu skill status --agent all
```

Supported hosts are Codex, Claude Code, and Copilot. Project scope is the
default; user scope is selected with `--scope user`. Managed copies can be
checked, updated, and removed with `skill status`, `skill update`, and
`skill uninstall`. Local changes and unmanaged directories are never
overwritten; there is intentionally no `--force` option. See the
[skill installation guide](docs/guides/skill-installation.md) for targets and
conflict handling.

After installation, it will be available as:

```text
$toudocu
```

The skill uses the installed CLI to validate and build documentation, while the skill itself is responsible for analyzing the repository and updating Markdown files.

The CLI can also be used without the skill.

### 3. Create project documentation

Run the skill from the root of your repository:

```text
$toudocu init
```

The skill will analyze the project and create the initial documentation structure.

### 4. Validate the documentation

```bash
toudocu check ./docs
```

### 5. Start the local portal

```bash
toudocu serve ./docs
```

By default, the portal will be available at:

```text
http://127.0.0.1:8080
```

Local mode includes an editor, file watching, and automatic rebuilds.

### 6. Build a backend-independent static portal

```bash
toudocu build ./docs \
  --output ./site \
  --clean
```

Publish the generated directory with any HTTP(S) static host. For local work,
use the existing `toudocu serve` command; opening `index.html` through
`file://` is not a supported contract.

```text
https://docs.example.com/project/
```

---

## Skills

Skills let you work with documentation through regular requests to an AI agent.

They analyze the repository, locate related documents, and use Toudocu to validate the result.

### Create documentation

```text
$toudocu init
```

The skill analyzes the repository and creates the initial documentation structure.

It works both for new projects and existing repositories without established documentation.

### Review documentation against the project

```text
$toudocu refresh
```

The skill checks the documentation against the current repository state and updates affected sections.

This is useful after major changes, refactoring, or the introduction of new components.

### Review current changes

```text
$toudocu refresh diff
```

The skill starts with the current Git changes and reviews the related documentation.

This mode is useful before a commit or pull request.

### Process local Changes feedback

Create comments in the canonical `toudocu serve` Changes workspace, choose
“Send to agent”, then ask the installed skill:

```text
$toudocu feedback
```

The skill receives pending snapshots through the local CLI, applies only
justified repository changes, runs relevant checks, and returns one structured
result per comment. Neither the UI nor the CLI starts an agent or writes Git.

### Update a translation

```text
$toudocu translate en --all-stale
```

The skill updates a complete read-only language mirror while keeping the main documentation as the operational source of truth. It requires a locale and exactly one selection mode: `--task`, `--base`, or `--all-stale`.

To translate the current staged, unstaged, and untracked diff relative to `HEAD` into every configured language, use:

```text
$toudocu translate diff
```

---

## Documentation validation

```bash
toudocu check ./docs
```

Toudocu validates:

* directory and document structure;
* internal and external links;
* required sections;
* relationships between documents;
* diagrams;
* standards and operational instructions;
* integrity of the overall project model.

Validation can be run locally or added to CI.

---

## Static HTTP portal

```bash
toudocu build ./docs \
  --output ./site \
  --clean
```

The generated portal:

* runs on ordinary HTTP(S) static hosting, including a nested URL path;
* does not require Toudocu or another backend after generation;
* does not use a database;
* does not load resources from a CDN;
* does not require Node.js or npm;
* works well as a CI artifact or on static hosting.

The portal is read-only. For local viewing, use `toudocu serve`; direct
double-click opening of `index.html` is not a supported contract.

---

## Local portal and editor

```bash
toudocu serve ./docs
```

Local mode provides:

* documentation navigation;
* a built-in editor;
* search;
* file watching;
* automatic rebuilds;
* validation previews;
* Git change browsing;
* a non-blocking notice when a newer stable Toudocu release is available;
* offline OpenAPI documentation at `/_toudocu/api-docs/` with safe
  `GET`/`HEAD` Try it out.

By default, the server listens on:

```text
127.0.0.1:8080
```

The local server does not provide TLS or built-in authentication. Do not expose it to an external network without additional protection.

The release check is performed at most once per server process and never
updates the binary. Use `toudocu serve --no-update-check ./docs` to disable
the network request and UI notice.

The API documentation uses vendored Swagger UI 5.32.12 and same-origin specs;
it never loads a CDN. Static builds copy the OpenAPI files but omit the UI.

---

## Search

```bash
toudocu search "authentication" ./docs
```

Search works directly with the source Markdown files and helps you quickly find existing documentation before creating a new document.

---

## Change browsing

```bash
toudocu changes ./docs
```

Toudocu uses Git to show documentation changes between branches, commits, and the current working state.

For example, compare the documentation with the main branch:

```bash
toudocu changes ./docs \
  --base main \
  --target working-tree
```

Toudocu does not run `commit`, `checkout`, `add`, or `fetch`, and it does not modify repository state.

---

## Document scaffolds

Toudocu can create scaffolds for new documents.

For example:

```bash
toudocu scaffold module MOD-PAYMENTS ./docs \
  --title "Payments"
```

A scaffold provides the document structure without inventing information about the project.

---

## Documentation structure

A minimal project contains two files:

```text
docs/
├── index.md
└── architecture/
    └── overview.md
```

`index.md` introduces the project.

`architecture/overview.md` briefly describes the system and links to more detailed documents.

Additional sections can be introduced as the project grows.

Toudocu can be used to document:

* architecture;
* components;
* user scenarios;
* processes;
* interfaces;
* requirements;
* development standards;
* operational instructions;
* project plans and changes.

Mermaid can be used for diagrams.

---

## Supported Markdown

Toudocu uses Goldmark `v1.8.5` as one CommonMark AST engine and enables only:

* headings, paragraphs, emphasis, and blockquotes;
* links and safe local raster images;
* unordered, ordered, and task lists;
* tables, inline code, and fenced code blocks;
* strikethrough and literal HTTP(S), `www`, and email autolinks;
* Mermaid `flowchart`, `stateDiagram-v2`, and `sequenceDiagram`.

Raw HTML and leading closed front matter are validation errors; preview and
rendered diffs still show their source as escaped text. Attributes, footnotes,
definition lists, and typographer extensions are not enabled. Detailed limitations are
documented in the [safe Markdown module](docs/modules/markdown.md).

---

## Portal configuration

The optional `.toudocu/config.yml` file configures the appearance and behavior of the portal.

Example:

```yaml
project:
  locale: en

site:
  title: My Project
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: classic
  colorScheme: system
  accent: indigo
```

You can configure:

* the project title;
* logo and favicon;
* the homepage hero image;
* light or dark color scheme;
* accent color;
* content width;
* interface density;
* footer text.

Available themes:

```text
classic
paper
terminal
```

---

## Translations

The main project language is configured in `.toudocu/config.yml`:

```yaml
project:
  locale: en
```

To update a separate language version, use:

```text
$toudocu translate en --all-stale
```

To update every configured translation with the current diff relative to `HEAD`, use:

```text
$toudocu translate diff
```

The main documentation remains the operational source of truth, while translations are stored as complete read-only mirrors. Each translation has a complete `translations.<locale>` profile with an independent root and built-in section names; this repository provides English in `docs-en/` alongside canonical Russian `docs/`. Task commands, scaffolding, and editor writes are rejected on translation roots.

---

## Main commands

| Task                       | CLI                                                                | From the Toudocu repository |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| Validate documentation     | `toudocu check ./docs`                                           | `make check`                  |
| Build the portal           | `toudocu build ./docs --output ./site --clean`                   | `make docs`                   |
| Start the local portal     | `toudocu serve ./docs`                                           | `make docs-serve`             |
| Find a document            | `toudocu search "query" ./docs`                                  | —                             |
| Browse changes             | `toudocu changes ./docs`                                         | —                             |
| Create a scaffold          | `toudocu scaffold module MOD-PAYMENTS ./docs --title "Payments"` | —                             |
| Build the binary           | `go build -o toudocu ./cmd/toudocu`                            | `make build`                  |
| Run tests                  | `go test ./...`                                                    | `make test`                   |
| Build release binaries     | manually                                                           | `make release`                |
| Remove generated artifacts | manually                                                           | `make clean`                  |

The `make` commands are intended for developing Toudocu from its source repository.

Users of a released binary should run `toudocu` commands directly.

---

## Public Go API

The root package provides a typed facade over the model, generator, reports, and
individual CLI operations. The current module path is the local
`toudocu`; a canonical remote Go module has not been published yet, so
external consumers should not depend on this import path.

The exported declarations and package documentation in `api.go` define the
current facade. The CLI remains the primary user-facing way to run the released
binary; no external module compatibility promise is made before a canonical
module path is published.

The Markdown AST and low-level parser/renderer are intentionally internal;
Goldmark types are not exposed by the facade or JSON schema v1.

---

## Development

Format the Go code:

```bash
make fmt
```

Check formatting:

```bash
make fmt-check
```

Run static analysis:

```bash
make vet
```

Run tests:

```bash
make test
```

Run the complete validation cycle:

```bash
make check
```

Build the project portal:

```bash
make docs
```

Start the project portal:

```bash
make docs-serve
```

Build release binaries:

```bash
make release
```

Remove generated artifacts:

```bash
make clean
```

---

## Help

```bash
toudocu --help
toudocu check --help
toudocu build --help
toudocu serve --help
toudocu search --help
toudocu changes --help
toudocu scaffold --help
```

Detailed documentation:

* [Toudocu features](docs/reference/features.md)
* [Configuration](docs/reference/configuration.md)
* [CLI commands](docs/contracts/cli.md)
* [Agent workflows](docs/guides/agent-workflows.md)
* [Work items](docs/guides/work-items.md)
* [Project source documentation](docs/index.md)
* [Testing](docs/guides/testing.md)
* [Contributing](CONTRIBUTING.md)

---

## License

Distribution terms are available in [LICENSE](LICENSE).

Licenses for embedded third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
