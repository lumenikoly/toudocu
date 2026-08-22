<!-- toudocu
version: 1
id: TASK-RELEASE-002
status: done
taskType: maintenance
module: MOD-CLI
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# TASK-RELEASE-002: Add installation and updates from GitHub Release


<!-- toudocu:section result -->
## Result

The `0.0.1` release bundle includes POSIX and PowerShell installer scripts. Each
script selects the file for the operating system and architecture, verifies its
SHA-256 checksum, and only then replaces the program.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The user manually selected a binary in GitHub Releases, verified it, and added
its directory to `PATH`.

<!-- toudocu:section after -->
### After

Either command downloads the matching binary and `checksums.txt`, verifies its
integrity, and atomically installs Toudocu without `sudo` in
`~/.local/bin/toudocu` or
`%LOCALAPPDATA%\Programs\toudocu\toudocu.exe`:

```sh
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

Both `install.*` files are included in the release assets for version `0.0.1`.

If the standard user directory is not yet in `PATH`, the POSIX installer adds
one managed entry to `.zshrc` for zsh, `.bashrc` for bash, fish `conf.d`, or
`.profile` for other POSIX shells. The PowerShell installer adds the standard
directory to the user `PATH` once. The current parent shell is not changed: the
installer prints the exact `source`/fish command, requests a login/re-login for
`.profile`, or asks the user to open a new terminal on Windows.

<!-- toudocu:section scope -->
## Scope

- installer scripts in `scripts/`;
- `Makefile` and `.github/workflows/`;
- installer contract tests in `internal/app/`;
- the README, changelog, and canonical documentation.

<!-- toudocu:section out-of-scope -->
## Out of scope

- publishing a Git tag or GitHub Release;
- background self-update or a new Go CLI command;
- system-wide installation through `sudo` and package managers;
- new release targets other than Windows ARM64;
- signing or notarization of release binaries.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The installer unambiguously selects one of six Linux, macOS, and
  Windows files and rejects an unsupported platform before any download.
- [x] `AC-02` The latest stable release is selected by default.
  `TOUDOCU_VERSION=X.Y.Z` pins the version and permits a downgrade,
  `TOUDOCU_INSTALL_DIR` selects a nonstandard directory, and
  `TOUDOCU_NO_MODIFY_PATH=1` prevents changes to `PATH`.
- [x] `AC-03` The binary is replaced only after exact checksum and version
  verification. Network, checksum, or filesystem failures do not damage the
  installed version; a matching checksum changes nothing.
- [x] `AC-04` The release bundle contains both installers, and `checksums.txt`
  covers them, the binaries, licenses, and notices.
- [x] `AC-05` The README and documentation describe commands, platforms,
  updates, version and directory selection, `PATH`, SHA-256, and the fact that
  only the installer needs network access.
- [x] `AC-06` Repeated runs, updates, downgrades, and adding the standard
  directory to `PATH` are idempotent. A nonstandard directory does not change
  the profile and receives a clear hint.

<!-- toudocu:section plan -->
## Plan

1. Implement the same rules for POSIX and PowerShell.
2. Include the scripts in the release bundle and checksum generation.
3. Add tests for platform selection, integrity, safe replacement, and release
   bundle contents.
4. Update the source documents and release notes.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run TestInstallerPlatformContract`
- `AC-02` → `go test ./internal/app -run TestInstallerSelectionAndPathContract`
- `AC-03` → `go test ./internal/app -run TestInstallerIntegrityAndReplacement`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt && test "$(wc -l < checksums.txt)" -eq 12 && for file in toudocu-linux-amd64 toudocu-linux-arm64 toudocu-darwin-amd64 toudocu-darwin-arm64 toudocu-windows-amd64.exe toudocu-windows-arm64.exe install.sh install.ps1 LICENSE THIRD_PARTY_NOTICES.md CODEMIRROR-CHECKSUMS.txt SWAGGER-UI-CHECKSUMS.txt; do awk -v file="$file" '$2 == file { found=1 } END { exit !found }' checksums.txt || exit 1; done`
- `AC-05` → `go test ./internal/app -run TestInstallerDocumentationContract && go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `AC-06` → `go test ./internal/app -run TestInstallerRepeatUpgradeDowngradeAndPath`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

<!-- toudocu:section documentation-impact -->
## Documentation impact

The work added an installation guide and updated the README, changelog, current
status, system boundary, trust boundary, and tracked portal.

<!-- toudocu:section use-case-omission-reason -->
## Use-case omission reason

The task changes release-file delivery and installers without adding a command
or scenario to the main Go CLI.
