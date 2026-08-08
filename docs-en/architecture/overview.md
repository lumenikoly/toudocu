# Architecture

- Document type: Architecture Overview

Docu-docu is a local dependency-free Go runtime between the source
documentation directory and consumers of the validated model: Go code through
the public facade, automation through CLI/JSON, and readers of the static HTTP
portal. Optional `serve` adds a local HTTP/editor runtime and an offline OpenAPI
catalog. Only the canonical portal may make one constrained request to the
GitHub Releases API for latest stable release metadata; a database, CDN, and
external runtime are outside the system boundary.

## System boundary

A developer, library consumer, agent, or CI provides Docu-docu with a
documentation directory and an explicitly selected repository root. Docu-docu
reads Markdown, local assets, and recognized OpenAPI contracts, validates
declared relationships and wire structure, and either returns diagnostics or
builds derived HTML/JSON files. With `build`, the browser only opens the
ready-made read-only portal. With `serve`, it may submit a constrained workspace
write, after which the Go process rebuilds the model. Only a separate, explicit
task verification mode may run repository commands. Release metadata checking
can be disabled with a flag, does not download code, and does not exist in a
static or translation portal.

## Map of architectural questions

- [Where is the Docu-docu system boundary and who interacts with it?](system-boundary.md)
- [How do runtime components divide responsibilities?](runtime-components.md)
- [Where is the boundary between the Go core and the frontend runtime?](frontend-runtime-boundary.md)
- [Where are the trust boundaries?](trust-boundaries.md)
- [How are documentation and verification failures isolated?](failure-isolation.md)
- [How do Git states become a consistent documentation change set?](documentation-changes.md)
