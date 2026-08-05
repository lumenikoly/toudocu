# ADR-001: Dependency-free Go CLI

- Identifier: ADR-001
- Status: Accepted
- Date: 2026-07-25
- Author: Docu-docu Team
- Last updated: 2026-07-26

Docu-docu comes with a single Go binary and does not require runtime dependencies.
The only exception for external Go module is documented in
[ADR-003](ADR-003.md) and does not add the network or adjacent runtime files.

## Context

The tool must work in the local repository, CI and agent environment
without npm, server and installation of additional Markdown runtime. At the same time
we need secure HTML and predictable operation via `file://`.

## Decision

Use predominantly the Go standard library, `go:embed` for assets,
as well as its own limited subset of Markdown. Browser-only libraries
are allowed as pinned vendored assets if they do not require runtime,
network or external files and are accompanied by a license and security process.

A new external dependency is allowed only after an ADR with proof that it
the value outweighs the impact on supply, attack surface and support.

## Reasons

- one reproducible artifact for all supported platforms;
- lack of package installation and network access during operation;
- full control over escaping and local links;
- simple deployment to an existing repository.

## Consequences

### Positive

- minimal operational complexity;
- quick launch and simple cross-compilation;
- lack of supply-chain application dependencies;
- assets are available without adjacent files.
- Mermaid diagrams are available without Node.js, CDN and a required HTTP server.

### Negative

- Markdown parser and renderer are supported within the project;
- compatibility with the full CommonMark is not guaranteed;
- the security of each new Markdown construct requires its own tests;
- some of the code for CLI, HTML and process management cannot be delegated to the library.
- updating vendored Mermaid requires a separate license check, checksum,
  `file://` compatibility and security advisories.

## Revision status

The decision is revised if the own Markdown subset becomes the main one
source of defects or external dependency significantly reduces the code when
maintaining autonomous delivery.