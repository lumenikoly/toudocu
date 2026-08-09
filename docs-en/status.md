# Current status

- Status: In progress
- Stage: Preparing stable release 0.0.1
- Version: 0.0.1
- Owner: Toudocu Team
- Last updated: 2026-08-07

Version `0.0.1` is being prepared for stable release together with verifiable
POSIX and PowerShell installers, a release workflow, checksums, and installation
documentation.

## Summary

The CLI checks, builds, and locally serves documentation, produces typed JSON
reports, supplies context for a selected task, and runs its checks only on an
explicit command. The root Go package provides a stable façade for the model,
generation, and reports for local embedding; a canonical remote module path has
not yet been published. Embedded Mermaid Tiny renders linked processes without
a CDN or Node.js. Negative tests cover path, HTML, diagram, HTTP-serving, and
process-timeout safety.

The process model produces separate `UC-*` and `FLOW-*` catalogs, stable
ID-based URLs, and a use-case workspace with description, map, playback, and
relationships. The screen model produces the main catalog, a separate overall
map with SVG links, sitemap, hotspots, and traceability. The static portal works
over HTTP(S) and supports keyboard, touch, states, errors, and fallback; local
browsing uses `serve`.

Active tasks, blockers, and the next outcome are derived from work items and the
roadmap and displayed automatically in HTML.

## Readiness

Source code and embedded assets ship as one binary without external runtime
dependencies. Pinned pure-Go Goldmark and OpenAPI YAML dependencies are linked
into the binary. Formatting, ordinary and race tests, vet, module checks, strict
checks of both documentation roots, and six cross-builds run through one
`make check` / `make release` workflow. The release bundle includes two
installer assets; they select the appropriate binary and verify its SHA-256
before replacing the file in the user's installation directory.

## Next focus

Complete the release gate, publish stable release `0.0.1` through the prepared
GitHub Actions workflow, and verify installation against published checksums on
supported platforms.
