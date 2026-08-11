# ADR-001: Dependency-free Go CLI

- Identifier: ADR-001
- Status: Accepted
- Date: 2026-07-25
- Author: Toudocu team
- Last updated: 2026-08-10

Toudocu is delivered as a single Go binary and requires no runtime
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
The narrow optional exception for fetching latest stable release metadata in
canonical `serve` is defined in [ADR-006](ADR-006.md): it downloads neither
code nor runtime dependencies and can be disabled with a flag.

A new external dependency is allowed only after an ADR demonstrates that its
value outweighs its impact on delivery, attack surface, and maintenance.

## Reasons

- One reproducible artifact for every supported platform.
- No package installation or mandatory network access during operation.
- Full control over escaping and local links.
- Simple deployment into an existing repository.

## Consequences

Delivery and operation remain simple, cross-compilation is direct, and embedded
assets cannot be misplaced. Mermaid works without Node.js or a CDN; the portal
runs on ordinary HTTP hosting or through `serve`.

The cost is that the team owns the Markdown policy, safe rendering, and updates
to Goldmark and bundled browser libraries. Such updates require compatibility,
license, and security review.

## Review status

This decision is reviewed if pinned pure-Go dependencies cease to preserve
self-contained delivery or if their maintenance burden and attack surface
become disproportionate to their value.
