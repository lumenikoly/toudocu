# UC-DOCS-01: Create an offline portal

- Identifier: UC-DOCS-01
- Status: Completed
- Actor: Developer
- Module: MOD-SITE
- Priority: High
- Last updated: 2026-07-28

The developer converts the project documentation directory into a static portal,
which can be opened from disk without an HTTP server.

## Inputs

- catalog of design documentation;
- output directory;
- optional settings for repository URL, ref, excludes and stale threshold.

## Preconditions

- Docu-docu is available for launch;
- the developer has rights to read the source directory and write to the output directory.

## Main scenario

1. The developer calls `docu-docu build ./docs --output ./build/project-docs`.
2. Docu-docu reads documents and checks structure, links and related entities.
3. Docu-docu creates HTML pages, search resources and `report.json`.
4. Docu-docu reports the path to the created `index.html` and the resulting statistics.
5. The developer opens `index.html` through `file://`.

## Error scenarios

- in step 2, an inaccessible source directory terminates the command with code `1`, portal
  not created;
- before step 3, the unsafe path `--output` or `--clean` is rejected to
  deleting and writing files;
- if the model contains errors, the portal and `report.json` are created with diagnostics,
  and the command ends with the code `1`;
- with `--strict`, the presence of warnings also leads to the code `1`;
- a write or generation error interrupts the build and is output to stderr.

## Postconditions

If generated successfully, the output directory contains the offline portal and
`ProjectReport` schema v1. The original Markdown is not modified.

## Business rules

The rules are defined in the documents of the corresponding modules:

- [BR-SITE-001](../modules/site.md#br-site-001-cleaning-output-does-not-affect-protected-directories) - clearing output does not affect protected directories.
- [BR-SITE-002](../modules/site.md#br-site-002-the-portal-works-via-file-protocol) - the portal works via file protocol.
- [BR-MD-001](../modules/markdown.md#br-md-001-custom-html-is-always-escaped) - custom HTML is always escaped.
- [BR-MD-002](../modules/markdown.md#br-md-002-dangerous-protocols-and-active-assets-are-blocked) - dangerous protocols and active assets are blocked.
- [BR-MD-003](../modules/markdown.md#br-md-003-mermaid-remains-a-visualization) - Mermaid remains a visualization.
- [BR-SITE-004](../modules/site.md#br-site-004-mermaid-works-autonomously-and-in-strict-mode) - Mermaid works autonomously and in strict mode.

## Implementation

- [FLOW-DOCS-BUILD: Building a standalone portal](../flows/FLOW-DOCS-BUILD.md)
- [Static portal](../modules/site.md)
- [Secure Markdown](../modules/markdown.md)
- [CLI contract](../contracts/cli.md)

## Examination

- integration generation of HTML and JSON;
- negative tests of output, symlinks and active assets;
- building a minimal project with `index.md` and `architecture/overview.md`;
- opening internal links without an HTTP server.
