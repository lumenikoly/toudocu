# Current state

- Status: Completed
- Stage: Locally prepared stable release 0.0.1
- Version: 0.0.1
- Owner: Docu-docu Team
- Last updated: 2026-08-04

Release `0.0.1` is locally provisioned along with POSIX- and
PowerShell-installers. The Git tag and GitHub Release were not created, so
one-liner will become working only after publication by the owner.

## Brief state

The CLI checks, collects and locally distributes documentation, generates
typed JSON reports, displays the context of the selected task and executes it
checks only by explicit command. The root Go package provides a stable
model, rendering and reporting façade for local embedding; canonical
the remote module path has not yet been published. Built-in Mermaid Tiny displays
related processes without CDN or Node.js. Security of paths, HTML, diagrams,
HTTP distributions and process timeout are checked by negative tests.

The process model creates separate directories `UC-*` and `FLOW-*`, stable
URL by ID and use case workspace with description, map, playback and
connections. The screen model forms the main catalog, a separate general map with
SVG links, sitemap, hotspots and traceability. Everything works through `file://`,
supports keyboard, touch, states, errors and fallback without preview.

Active tasks, blockers and next result are calculated from work items and
roadmap and are displayed in HTML automatically.

## Ready

The source code and built-in assets are delivered in one binary without external ones
runtime dependencies. Pinned Go dependency for OpenAPI YAML links
inside the binary. Formatting, regular and race tests, vet, module check,
strict - checking both documentation roots and five cross-builds go through
single `make check` / `make release` workflow. Release bundle includes two
installer-assets; they select a suitable binary and check it
SHA-256 before replacing the file in the user install dir.

## Next trick

Create local tag `0.0.1`, send verified commit and tag to canonical
GitHub repository and confirm the published checksums. These actions
intentionally left to the release owner.
