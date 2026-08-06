# ADR-001: Dependency-free Go CLI

- Identifier: ADR-001
- Status: Accepted
- Date: 2026-07-25
- Author: Docu-docu Team
- Last updated: 2026-08-06

Docu-docu is delivered as a single Go binary and requires no runtime
dependencies. Pure-Go exceptions for external Go modules are recorded in
[ADR-003](ADR-003.md) and [ADR-005](ADR-005.md); they add neither network access
nor adjacent runtime files.

## Context

The tool must work in a local repository, CI, and agent environments without
npm or installation of an additional Markdown runtime. It must also provide
safe HTML, backend-independent static output, and a local HTTP runtime.

## Decision

Use primarily the Go standard library, `go:embed` for assets, and, for Markdown,
a pure-Go engine hidden behind the project's own model as specified in
[ADR-005](ADR-005.md). Browser-only libraries are allowed as pinned vendored
assets when they require no runtime, network, or external files and are covered
by a license and security process.

A new external dependency is allowed only after an ADR demonstrates that its
value outweighs its impact on delivery, attack surface, and maintenance.

## Reasons

- One reproducible artifact for every supported platform.
- No package installation or network access during operation.
- Full control over escaping and local links.
- Simple deployment into an existing repository.

## Consequences

### Positive

- Minimal operational complexity.
- Fast startup and straightforward cross-compilation.
- No runtime package installation or network dependency downloads.
- Assets are available without adjacent files.
- Mermaid diagrams are available without Node.js, a CDN, or an external
  backend; the browser runtime uses static HTTP hosting or built-in `serve`.

### Negative

- Markdown policy, the normalized model, and the safe renderer remain the
  project's responsibility.
- Updating the Markdown dialect or Goldmark requires corpus and security review.
- Some CLI, HTML, and process-management code cannot be delegated to a library.
- Updating vendored Mermaid requires a separate review of the license,
  checksum, static HTTP compatibility, and security advisories.

## Review status

This decision is reviewed if pinned pure-Go dependencies cease to preserve
self-contained delivery or if their maintenance burden and attack surface
become disproportionate to their value.
