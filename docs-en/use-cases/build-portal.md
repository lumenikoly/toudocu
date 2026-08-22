<!-- toudocu
id: UC-DOCS-01
status: done
priority: high
module: MOD-SITE
updated: 2026-08-12
-->

# UC-DOCS-01: Build a Static HTTP Portal


The developer converts a project-documentation directory into a read-only
portal that is published on ordinary HTTP(S) static hosting and requires no
Toudocu backend after the build.

## Inputs

- project-documentation directory;
- output directory;
- optional repository URL, ref, excludes, and stale-threshold settings.

<!-- toudocu:section prerequisites -->
## Preconditions

- Toudocu is available to run;
- the developer can read the source directory and write to the output directory.

<!-- toudocu:section main-scenario -->
## Main scenario

1. The developer runs `toudocu build ./docs --output ./build/project-docs`.
2. Toudocu reads documents and validates structure, links, and related entities.
3. Toudocu creates HTML pages, CSS/JavaScript, static JSON resources, and
   `report.json` from one project model.
4. Toudocu reports the path to the generated `index.html` and final statistics.
5. The developer publishes the output on HTTP(S) static hosting.
6. A browser opens the portal from the host root or a nested URL path.

## Error scenarios

- at step 2, an unavailable source directory ends the command with code `1`,
  and no portal is created;
- before step 3, an unsafe `--output` or `--clean` path is rejected before any
  file is deleted or written;
- when the model contains errors, the portal and `report.json` are created with
  diagnostics and the command exits with code `1`;
- with `--strict`, warnings also produce exit code `1`;
- a write or generation error interrupts the build and is printed to stderr.

<!-- toudocu:section postconditions -->
## Postconditions

After successful generation, the output directory contains a backend-independent
portal, static data, and `ProjectReport` schema v1. Source Markdown is unchanged.
Opening through `file://` is unsupported; use `toudocu serve` for local work.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] The output contains a backend-independent portal, static data, and
  `ProjectReport` schema v1.
- [x] Generation leaves source Markdown unchanged.
- [x] Local viewing uses `toudocu serve`, not `file://`.

<!-- toudocu:section business-rules -->
## Business rules

Rules are defined in the corresponding module documents:

- [BR-SITE-001](../modules/site.md#br-site-001-cleaning-output-does-not-affect-protected-directories) — cleaning output does not affect protected directories.
- [BR-SITE-002](../modules/site.md#br-site-002-the-portal-works-on-static-http-hosting) — the portal works on ordinary static HTTP hosting and under a nested URL path.
- [BR-MD-001](../modules/markdown.md#br-md-001-user-html-is-a-policy-error) — raw HTML blocks validation and remains escaped in safe representations.
- [BR-MD-002](../modules/markdown.md#br-md-002-dangerous-protocols-and-active-assets-are-blocked) — dangerous protocols and active assets are blocked.
- [BR-MD-003](../modules/markdown.md#br-md-003-mermaid-remains-a-visualization) — Mermaid remains a visualization.
- [BR-SITE-004](../modules/site.md#br-site-004-mermaid-works-autonomously-and-in-strict-mode) — Mermaid works autonomously and in strict mode.

<!-- toudocu:section implementation -->
## Implementation

- [FLOW-DOCS-BUILD: Building a static HTTP portal](../flows/FLOW-DOCS-BUILD.md)
- [Static portal](../modules/site.md)
- [Safe Markdown](../modules/markdown.md)
- [CLI contract](../contracts/cli.md)

## Verification

- integration generation of HTML and JSON;
- negative tests for output paths, symlinks, and active assets;
- building a minimal project with `index.md` and `architecture/overview.md`;
- browser smoke on a static HTTP server at the root and under a nested URL path;
- absence of editor/rebuild/API assets and URLs from static output;
- a repeated frontend build with an identical manifest and assets.
