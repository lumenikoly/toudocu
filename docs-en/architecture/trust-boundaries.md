# Docu-docu trust boundaries

- Document type: Architecture
- Architecture question: Where are the boundaries of trust?

Markdown, links, assets and Mermaid source are considered untrusted data;
repository root and selected output/report paths define the file boundary; teams
work items are considered trusted code only after separate explicit permission
for launch. The CLI release installer separately trusts GitHub Release before running
as a single remote source of binary and checksum.

## Area

The answer lists architectural trust zones. Specific CLI errors and rules
Markdown are in [CLI contract](../contracts/cli.md) and
[MOD-MARKDOWN](../modules/markdown.md).

## Untrusted content

Text and metadata are escaped during HTML rendering. Active local assets,
Dangerous protocols and links going beyond the repository root are blocked. Mermaid
works in a browser with a pinned bundle and a strict configuration, without becoming
source of requirements.

## File boundary

The input directory, repository root, output and report are normalized to operations.
Symbolic links do not allow you to override the erase or write boundary, and
generated output never becomes a source of documentation.

In `serve` editor workspace additionally only accepts canonical relative
POSIX path to normal `.md`, `.yaml`, `.yml` or `.json` inside docs root.
Hidden/excluded/output, traversal, encoded remainders and any detected
symlink/reparse components are blocked. SHA-256 CAS and atomic replace protect against
random loss of parallel change. Intentional privileged local race by
The replacement directory is outside the threat model of the trusted working copy.

## HTTP border serve

Editor write requires JSON content type, exact action header and same-origin
browser context, does not issue CORS and limits body/content. These guards protect
from cross-origin browser pages, but do not authenticate the direct HTTP client.
Therefore, an explicit non-loopback listener includes available LAN clients
in trust boundary; The CLI retains a warning about missing TLS and authorization.
Locale routes are limited to `/_docu-docu/locales/<locale>/` and only send
generated read-only snapshots. They do not redirect to editor, changes,
workspace or canonical API; target URLs calculates the server from allowed ones
profiles and mounts.

## Execution boundary

Documentation Changes runs the set `git` directly argument array with
`--no-ext-diff`, `--no-textconv`, `--no-color` and NUL-separated path output.
Hooks, shell, fetch, checkout and index changes are not performed. Revision
is validated, the blob is read from the object database, the HTTP path must match
change set element inside documentation roots. Old Markdown passes that
same sanitization policy and does not receive editor or network privileges.

Regular `check`, `build`, `serve`, editor API, `search`, readiness and context do not run
commands from Markdown. The execution only appears in `task verify --run` after
task-local validation gate; permission rules are described in
[MOD-CLI](../modules/cli.md).

## Release bootstrap border

POSIX- and PowerShell-installers are executed before the Go CLI with the rights of the current
user. They load the exact selected binary and `checksums.txt` from
one HTTPS GitHub Release, require exactly one matching SHA-256 record and
check the version before replacing. Binary and checksum have the same trust root:
this check detects corruption but does not replace an independent signature.

Installation does not receive `sudo`: by default the entry is limited to user
install dir and one idempotent `PATH` entry. Explicit `DOCU_DOCU_INSTALL_DIR`
can specify any writable directory and does not change profile. Loading,
checking and staging are completed before replacement; the error doesn't hurt anymore
installed binary. Direct `curl | sh` and `irm | iex` deliberately add
remote installer in the user's trust boundary.