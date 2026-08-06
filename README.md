# Docu-docu

**English** | [Русский](README.ru.md)

**A tool for verifiable Markdown documentation and static HTTP portals.**

**Docu-docu** helps keep documentation aligned with the codebase, find inconsistencies, and build clean static portals for reading.

### Key features

* **Ready-to-use Go CLI** — a fast binary with no Node.js or additional dependencies.
* **Skills for AI agents** — help analyze repositories, create documentation, and update it after changes.
* **Documentation validation** — structure, links, and relationships can be checked locally and in CI.
* **Static HTTP portal** — the generated website needs no backend and can be published on ordinary static hosting.
* **Local mode** — an editor, automatic rebuilds, and Git change browsing.
* **Minimal infrastructure** — no database, npm, CDN, or separate runtime.

All documentation is stored in the repository as regular Markdown files.

---

## Quick start

### 1. Install the CLI

Linux and macOS:

```bash
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

The installer selects the platform, verifies SHA-256, and installs the binary
in the current user's directory. Running the same command again updates
Docu-docu.

Verify the installation:

```bash
docu-docu --help
```

You can also build the binary from source:

```bash
git clone https://github.com/lumenikoly/docu-docu.git
cd docu-docu
make build
```

After the build, the binary will be available in the repository root:

```bash
./docu-docu --help
```

For the platform matrix, version pinning, directories, and verification scope,
see the [installation guide](docs/guides/installation.md).

### 2. Install the skill

The skill is installed separately in a supported AI tool.

After installation, it will be available as:

```text
$docu-docu
```

The skill uses the installed CLI to validate and build documentation, while the skill itself is responsible for analyzing the repository and updating Markdown files.

The CLI can also be used without the skill.

### 3. Create project documentation

Run the skill from the root of your repository:

```text
$docu-docu init
```

The skill will analyze the project and create the initial documentation structure.

### 4. Validate the documentation

```bash
docu-docu check ./docs
```

### 5. Start the local portal

```bash
docu-docu serve ./docs
```

By default, the portal will be available at:

```text
http://127.0.0.1:8080
```

Local mode includes an editor, file watching, and automatic rebuilds.

### 6. Build a backend-independent static portal

```bash
docu-docu build ./docs \
  --output ./site \
  --clean
```

Publish the generated directory with any HTTP(S) static host. For local work,
use the existing `docu-docu serve` command; opening `index.html` through
`file://` is not a supported contract.

```text
https://docs.example.com/project/
```

---

## Skills

Skills let you work with documentation through regular requests to an AI agent.

They analyze the repository, locate related documents, and use Docu-docu to validate the result.

### Create documentation

```text
$docu-docu init
```

The skill analyzes the repository and creates the initial documentation structure.

It works both for new projects and existing repositories without established documentation.

### Review documentation against the project

```text
$docu-docu refresh
```

The skill checks the documentation against the current repository state and updates affected sections.

This is useful after major changes, refactoring, or the introduction of new components.

### Review current changes

```text
$docu-docu refresh diff
```

The skill starts with the current Git changes and reviews the related documentation.

This mode is useful before a commit or pull request.

### Update a translation

```text
$docu-docu translate en --all-stale
```

The skill updates a complete read-only language mirror while keeping the main documentation as the operational source of truth. It requires a locale and exactly one selection mode: `--task`, `--base`, or `--all-stale`.

---

## Documentation validation

```bash
docu-docu check ./docs
```

Docu-docu validates:

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
docu-docu build ./docs \
  --output ./site \
  --clean
```

The generated portal:

* runs on ordinary HTTP(S) static hosting, including a nested URL path;
* does not require Docu-docu or another backend after generation;
* does not use a database;
* does not load resources from a CDN;
* does not require Node.js or npm;
* works well as a CI artifact or on static hosting.

The portal is read-only. For local viewing, use `docu-docu serve`; direct
double-click opening of `index.html` is not a supported contract.

---

## Local portal and editor

```bash
docu-docu serve ./docs
```

Local mode provides:

* documentation navigation;
* a built-in editor;
* search;
* file watching;
* automatic rebuilds;
* validation previews;
* Git change browsing;
* offline OpenAPI documentation at `/_docu-docu/api-docs/` with safe
  `GET`/`HEAD` Try it out.

By default, the server listens on:

```text
127.0.0.1:8080
```

The local server does not provide TLS or built-in authentication. Do not expose it to an external network without additional protection.

The API documentation uses vendored Swagger UI 5.32.12 and same-origin specs;
it never loads a CDN. Static builds copy the OpenAPI files but omit the UI.

---

## Search

```bash
docu-docu search "authentication" ./docs
```

Search works directly with the source Markdown files and helps you quickly find existing documentation before creating a new document.

---

## Change browsing

```bash
docu-docu changes ./docs
```

Docu-docu uses Git to show documentation changes between branches, commits, and the current working state.

For example, compare the documentation with the main branch:

```bash
docu-docu changes ./docs \
  --base main \
  --target working-tree
```

Docu-docu does not run `commit`, `checkout`, `add`, or `fetch`, and it does not modify repository state.

---

## Document scaffolds

Docu-docu can create scaffolds for new documents.

For example:

```bash
docu-docu scaffold module MOD-PAYMENTS ./docs \
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

Docu-docu can be used to document:

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

Docu-docu intentionally supports a safe subset of Markdown:

* headings, paragraphs, emphasis, and blockquotes;
* links and safe local raster images;
* unordered, ordered, and task lists;
* tables, inline code, and fenced code blocks;
* Mermaid `flowchart`, `stateDiagram-v2`, and `sequenceDiagram`.

Arbitrary HTML is escaped. Front matter, Mermaid directives, and syntax that
depends on full CommonMark support are not supported. Detailed limitations are
documented in the [safe Markdown module](docs/modules/markdown.md).

---

## Portal configuration

The optional `.docu-docu/config.yml` file configures the appearance and behavior of the portal.

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

The main project language is configured in `.docu-docu/config.yml`:

```yaml
project:
  locale: en
```

To update a separate language version, use:

```text
$docu-docu translate en --all-stale
```

The main documentation remains the operational source of truth, while translations are stored as complete read-only mirrors. Each translation has a complete `translations.<locale>` profile with an independent root and built-in section names; this repository provides English in `docs-en/` alongside canonical Russian `docs/`. Task commands, scaffolding, and editor writes are rejected on translation roots.

---

## Main commands

| Task                       | CLI                                                                | From the Docu-docu repository |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| Validate documentation     | `docu-docu check ./docs`                                           | `make check`                  |
| Build the portal           | `docu-docu build ./docs --output ./site --clean`                   | `make docs`                   |
| Start the local portal     | `docu-docu serve ./docs`                                           | `make docs-serve`             |
| Build the demo portal      | `docu-docu build ./example/docs --output ./example/site --clean`   | `make demo`                   |
| Start the demo portal      | `docu-docu serve ./example/docs`                                   | `make demo-serve`             |
| Find a document            | `docu-docu search "query" ./docs`                                  | —                             |
| Browse changes             | `docu-docu changes ./docs`                                         | —                             |
| Create a scaffold          | `docu-docu scaffold module MOD-PAYMENTS ./docs --title "Payments"` | —                             |
| Build the binary           | `go build -o docu-docu ./cmd/docu-docu`                            | `make build`                  |
| Run tests                  | `go test ./...`                                                    | `make test`                   |
| Build release binaries     | manually                                                           | `make release`                |
| Remove generated artifacts | manually                                                           | `make clean`                  |

The `make` commands are intended for developing Docu-docu from its source repository.

Users of a released binary should run `docu-docu` commands directly.

---

## Public Go API

The root package provides a typed facade over the model, renderer, reports, and
individual CLI operations. The current module path is the local
`docu-docu`; a canonical remote Go module has not been published yet, so
external consumers should not depend on this import path.

The exported declarations and package documentation in `api.go` define the
current facade. The CLI remains the primary user-facing way to run the released
binary; no external module compatibility promise is made before a canonical
module path is published.

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
docu-docu --help
docu-docu check --help
docu-docu build --help
docu-docu serve --help
docu-docu search --help
docu-docu changes --help
docu-docu scaffold --help
```

Detailed documentation:

* [Docu-docu features](docs/reference/features.md)
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
