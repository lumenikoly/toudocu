<!-- toudocu
version: 1
-->

# Architecture


Toudocu is a local Go tool with no third-party Go dependencies. It reads source
Markdown, validates relationships, and builds a static HTML portal. The same
model is available to Go programs and through CLI JSON output.

`serve` adds a local HTTP server, source-file editor, Changes workspace, and
offline API reference. Only the main portal started by `serve` may make one
constrained request to GitHub for metadata about the latest stable release.
Normal operation needs no database, CDN, or external service.

## System boundary

A developer, library consumer, agent, or CI provides Toudocu with a
documentation directory and an explicitly selected repository root. Toudocu
reads Markdown, local assets, and recognized OpenAPI contracts, validates
declared relationships and wire structure, and either returns diagnostics or
builds derived HTML and JSON files. After `build`, the browser reads a finished,
read-only portal. With `serve`, it may submit an allowed file edit, after which
the Go process rebuilds the affected view. Only a
separate, explicitly authorized task verification may run repository commands.
Release metadata checking can be disabled, downloads no executable code, and
is absent from static and translation portals.

## Map of architectural questions

- [Where is the Toudocu system boundary and who interacts with it?](system-boundary.md)
- [How do runtime components divide responsibilities?](runtime-components.md)
- [Where is the boundary between the Go core and the frontend runtime?](frontend-runtime-boundary.md)
- [Where are the trust boundaries?](trust-boundaries.md)
- [How are documentation and verification failures isolated?](failure-isolation.md)
- [How do Git states become a consistent documentation change set?](documentation-changes.md)
- [How does a message from local documentation reach an external development agent without a direct AI integration?](agent-feedback-delivery.md)
