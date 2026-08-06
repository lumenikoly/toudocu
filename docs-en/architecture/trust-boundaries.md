# Docu-docu Trust Boundaries

- Document type: Architecture
- Architecture question: Where are the trust boundaries?

Markdown, links, assets, and Mermaid source are treated as untrusted data;
repository root and the selected output/report paths define the filesystem
boundary; work item commands are treated as trusted code only after separate,
explicit authorization to run them. Before the CLI starts, the release
installer separately trusts GitHub Release as the single remote source of the
binary and checksum.

## Scope

This answer lists the architectural trust zones. Concrete CLI errors and
Markdown rules are defined in the [CLI contract](../contracts/cli.md) and
[MOD-MARKDOWN](../modules/markdown.md).

## Untrusted content

Text and metadata are escaped during HTML rendering. Active local assets,
dangerous protocols, and links that escape the repository root are blocked.
Mermaid runs in the browser with a pinned bundle and strict configuration
without becoming a source of requirements.

## Filesystem boundary

The input directory, repository root, output, and report are normalized before
operations. Symbolic links cannot replace the cleanup or write boundary, and
generated output never becomes a documentation source.

In `serve`, the editor workspace additionally accepts only a canonical relative
POSIX path to a regular `.md`, `.yaml`, `.yml`, or `.json` file inside docs
root. Hidden/excluded/output paths, traversal, encoded remnants, and every
detected symlink/reparse component are blocked. SHA-256 CAS and atomic replace
protect against accidentally losing a concurrent change. An intentional,
privileged local race that replaces a directory is outside the threat model of
a trusted working copy.

## Serve HTTP boundary

An editor write requires a JSON content type, an exact action header, and a
same-origin browser context, does not enable CORS, and limits the body/content.
These guards protect against a cross-origin browser page but do not authenticate
a direct HTTP client. An explicitly selected non-loopback listener therefore
places reachable LAN clients inside the trust boundary; the CLI retains a
warning about the absence of TLS and authorization. Locale routes are confined
to `/_docu-docu/locales/<locale>/` and serve only generated read-only snapshots.
They do not redirect to editor, changes, workspace, API docs, or the canonical
API; the server computes target URLs from allowed profiles and mounts.

Canonical API docs load only embedded Swagger UI and same-origin validated
specs. CSP prohibits external script/style/connect targets, and browser Try it
out is limited to `GET`/`HEAD`; the UI does not weaken the guards of the APIs
themselves.

## Execution boundary

Documentation Changes invokes the installed `git` directly as an argument
array with `--no-ext-diff`, `--no-textconv`, `--no-color`, and NUL-separated
path output. It does not run hooks, a shell, fetch, checkout, or index changes.
The revision is validated, the blob is read from the object database, and the
HTTP path must match a change-set entry within documentation roots. Old
Markdown passes through the same sanitization policy and receives no editor or
network privileges.

Ordinary `check`, `build`, `serve`, editor API, `search`, readiness, and context
do not run commands from Markdown. Execution appears only in
`task verify --run` after the task-local validation gate; authorization rules
are described in [MOD-CLI](../modules/cli.md).

## Release bootstrap boundary

POSIX and PowerShell installers run before the Go CLI with the current user's
permissions. They download the exact selected binary and `checksums.txt` from
one HTTPS GitHub Release, require exactly one matching SHA-256 entry, and check
the version before replacement. The binary and checksum share one trust root:
this check detects corruption but does not replace an independent signature.

Installation does not receive `sudo`: writes are limited by default to a user
install dir and one idempotent `PATH` entry. An explicit
`DOCU_DOCU_INSTALL_DIR` may select any writable directory and does not change
the profile. Download, verification, and staging finish before replacement; a
failure does not damage an already installed binary. Direct `curl | sh` and
`irm | iex` deliberately add the remote installer to the user's trust boundary.
