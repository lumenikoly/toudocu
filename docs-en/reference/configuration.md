# Configuration reference

The CLI works without a configuration file. Optional
`<repository-root>/.toudocu/config.yml` is parsed and validated in full when
loaded, including configured branding assets. After shared validation, `build`,
`check`, and `serve` use project/site configuration; `changes` and `task
changes` use the `changes` section; and `task init` and `scaffold` use
`project.locale`. Therefore, an error in the shared structure or a site asset
can also stop an operation that does not directly use that setting.

## Default values

| Parameter | Meaning |
|---|---|
| input | `./docs` |
| output | neighboring directory `project-docs` |
| repository root | parent input |
| repository ref | `main` |
| stale days | `90` |
| format | `text` |
| task timeout | `10m` |
| serve host | `127.0.0.1` |
| serve port | `8080` |
| serve update check | enabled; disabled by `--no-update-check` |
| screen map | enabled if `screens/SC-*.md` is present |
| site theme | `classic` |
| color scheme | `system` |
| accent | `indigo` |
| density | `comfortable` |
| content width | `standard` (920 px) |
| hero | included |

## Themes and branding of the portal

```yaml
site:
  title: My Project
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: classic
  colorScheme: system
  accent: indigo
  density: comfortable
  contentWidth: standard
  footer:
    text: My Project documentation
    url: https://example.com
  hero:
    enabled: true
    image: assets/hero.webp
```

Valid topics are `classic`, `paper`, `terminal`; schemas `light`, `dark`, `system`;
accents `indigo`, `blue`, `teal`, `green`, `amber`, `rose`, `violet`; density
`compact` or `comfortable`; width `narrow` (760 px), `standard` (920 px) or
`wide` (1120 px).

`--title` takes precedence over `site.title`, followed by the `index.md` title
and directory name. By default, the Toudocu name in the footer links to the
landing page. `footer.text` and `footer.url` replace it with escaped text and an
optional HTTPS URL.

In the portal header there are drop-down lists of topics (`classic`, `paper`, `terminal`) and
color scheme (`system`, `light`, `dark`). The selection is saved locally in
browser; The configuration values ​​remain initial for the new visitor.

Logo, favicon and hero must be regular files inside `.toudocu/assets/`;
absolute paths, traversals, symlinks and missing files are rejected. SVG
is included as a file and is not embedded in HTML.

The parser implements a fixed YAML subset: maps, strings, boolean and
comments. Lists, anchors, aliases, multiline, unknown and repeated keys
are not supported. There are no Custom CSS, web fonts or theme plugins.

## Repository root

`--repository-root` defines:

- the limit of allowed links from documentation to code;
- command execution root `task verify --run`;
- base for checking work item scope paths.

The path must point to the actual root of the repository. For the current project:

```bash
go run ./cmd/toudocu check ./docs --repository-root . --strict
```

## Repository URL and ref

If `--repository-url` and exact `--repository-ref` are specified, file references are outside
`docs/`, but inside the repository root, are converted to HTTP(S) links like GitHub
`blob` or `tree`.

For a reproducible portal, commit SHA is recommended instead of a floating branch.

## Excludes

`--exclude` accepts a comma separated list and can be iterated. Default
VCS directories, `node_modules`, `vendor`, `dist`, `build` and coverage are excluded.
Hidden files and symbolic links are not scanned.

## Stale threshold

The document date is taken from `Последнее обновление`, then from `Дата`, then from
mtime file. `--stale-days 0` disables deprecation warnings and is convenient for
reproducible local checks.

## Strict mode

Without `--strict`, a non-zero exit code gives errors. In strict mode any warning
also terminates the command with code `1`.

## Screen Map

`--screen-map` explicitly enables the map page, while `--no-screen-map` disables
only her. Catalog of screens, document pages, use case workspaces,
traceability and `report.json` collections continue to be generated.

The parent item “Screens” always leads to the directory. When the card is turned on, it
added as a separate child item; when disabled there is no link to it
is generated. The parameters are valid for `build` and `serve` and do not change the original
Markdown.

## Documentation Changes

```yaml
changes:
  defaultBaseRef: main
  renameSimilarity: 60
  includeTaskArtifacts: true
  includeAssets: true
  semanticDiff: true
  renderedDiff: true
  maxSourceDiffBytes: 2097152
  maxRenderedFileBytes: 1048576
  exclude:
    - docs/generated/**
    - docs/cache/**
```

The section is optional; the standard mode remains `HEAD → working-tree`.
`defaultBaseRef` is only used without an explicit base and is not loaded with
remote. The limit disables the heavy representation of one file, not the entire change set.

## Local server and editor workspace

`serve` defaults to `127.0.0.1:8080`. `--host` and `--port`
are accepted only by this command. The `0.0.0.0` address allows access from the local
network, but the server does not provide TLS or authorization and displays a warning.

When viewed through `serve`, a separate workspace panel shows the editor and
manual rebuilding of the model, HTML, and search. The Editor API always runs on
the same listener and has no separate CLI flag. `--host`, `--port`, and `--open`
retain their existing semantics; `--no-open` and `--edit` do not exist. A
`build` result published by any static HTTP server contains no editor markup,
API URL, CodeMirror, or server-only scripts.

Canonical `serve` publishes discovered OpenAPI contracts at
`/_toudocu/api-docs/` without separate configuration. Static build copies the
specs but not Swagger UI; translation mounts and direct translation serve
publish neither the UI nor its link.

Canonical `serve` also checks the latest stable release on the browser's first
request and may show a non-blocking update suggestion. The result is cached
until the process stops. For a self-contained run, use
`toudocu serve --no-update-check ./docs`; static and translation portals
never enable this check.

Workspace includes the usual `.md`, `.yaml`, `.yml` and `.json` inside docs root and
excludes hidden, configured excludes, output subtree and symlink paths. JSON body
limited to 3 MiB, content - 2 MiB. With `--host 0.0.0.0` same-origin browser
guards do not replace direct LAN client authentication; use only
trusted local network.

## Locale and built-in sections

`.toudocu/config.yml` can only contain `project`; `site` and `changes`
remain independent optional sections. `project.locale` accepts
normalized BCP-47-style tag (for example, `ru`, `en-GB`, `pt-BR`, `sr-Latn`).
`project.sections` specifies the names of all built-in sections and is
source of truth for main navigation: H1 of the input document is checked against
explicit name, but not used as fallback.

```yaml
project:
  locale: ru
  sections:
    architecture: Архитектура
    modules: Модули
    use-cases: Пользовательские сценарии
    flows: Процессы
    screens: Экраны
    decisions: Архитектурные решения
    contracts: Контракты
    quality: Стандарты качества
    runbooks: Runbooks
    reference: Справочник
    work: Рабочие задачи
    guides: Руководства
```

Without locale or full list, build/check retains English fallback names
and issue a warning; in `--strict` this is gate. Missing locale in HTML gives
`lang="en"`. For an unknown but syntactically correct locale, it is acceptable
an explicit, one-time saved list of titles.

`task init` and `scaffold` without explicit `--lang` use the underlying language
`project.locale` when it is `ru` or `en` (including tags like `ru-RU` and
`en-GB`). For a different or missing locale, the scaffold fallback is `en`;
explicit `--lang` always takes precedence.

## Separate roots of translations

`translations` describes independent portals for workflow
`$toudocu translate`; This is not a new Go CLI command. Canonical `docs/`
remains the only source for ordinary documentation, implementation, and task
context. Configured translation roots are excluded from repository search,
inventory, semantic review, and implementation analysis during ordinary work. A
translation tree keeps the same reader-facing Markdown set, including
`work/**`, `notes.md`, and `ideas.md`, without becoming a second backlog.

```yaml
translations:
  en:
    root: docs-en
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use Cases
      flows: Processes
      screens: Screens
      decisions: Architecture Decisions
      contracts: Contracts
      quality: Quality Standards
      runbooks: Runbooks
      reference: Reference
      work: Work Items
      guides: Guides
```

Root is specified relative to the repository root, is located inside it and cannot
be the repository root itself, symlink, traversal or intersection with another
translation root or canonical docs root. When `check`, `build` or `serve`
exactly on the translation root profile temporarily replaces `project.locale` and
`project.sections`. Normal work with canonical root does not read the translation tree
and does not receive diagnostics of an incomplete other profile. A translation
root permits `check`, `build`, `search`, ordinary `changes`, and read-only
`serve`. Task commands, `scaffold`, and editor writes are rejected with
`TRANSLATION_ROOT_READ_ONLY`. An agent reads only the selected translation root
for an explicit `$toudocu translate <locale>` or an explicit request to check,
find, build, run, or inspect that locale. It handles one necessary source/target
pair at a time and starts parity checks with paths, manifest source hashes, and
structural reports. Translation roots are not added to `.gitignore` or global
ignore files.

## Mermaid

Mermaid does not have custom CLI settings. Toudocu secures:

- types `flowchart`, `stateDiagram-v2`, `sequenceDiagram`;
- maximum 50,000 UTF-8 bytes per block;
- `securityLevel: strict`;
- ban on Mermaid front matter and directives;
- calculated surface, text, border and accent colors of the current theme.

These parameters cannot be overridden from the documentation.

## Safe cleaning

`--clean` is only allowed for a single output directory. Cannot clear:

- system root;
- input documentation;
- ancestor directory input;
- direct output symlink.

Expanded paths are compared before deletion.

## Task report and timeout

`--report <file.json>` atomically stores `TaskVerifyReport` outside of the original
documentation directory. `--timeout` sets the limit for each unique command, not
total task verify.
