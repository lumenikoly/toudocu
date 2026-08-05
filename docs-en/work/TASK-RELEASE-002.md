# TASK-RELEASE-002: Add installation and update from GitHub Release

- Status: Completed
- Type: Maintenance
- Module: MOD-CLI
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-08-04

## Result

Release bundle and workflow `0.0.1` are ready for POSIX- and
PowerShell-bootstrap: after publishing by owner, user of one
command installs or updates Docu-docu, and bootstrap itself
selects a supported OS/architecture artifact and checks SHA-256
before replacing the file.

## Behavior change

### Before

The user manually selects a binary in GitHub Releases, checks
it is added to `PATH`.

### After

POSIX and PowerShell commands download the appropriate artifact and
`checksums.txt`, check integrity even without `sudo` atomically
set it to `~/.local/bin/docu-docu` or
`%LOCALAPPDATA%\Programs\docu-docu\docu-docu.exe`. Canonical commands:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

Both `install.*` are published as assets of a not yet published
release `0.0.1`.

If the standard user dir is not already in `PATH`, POSIX installer once
adds managed entry to `.zshrc` for zsh, `.bashrc` for bash, fish
`conf.d`, and for other POSIX shells - in `.profile`. PowerShell installer
adds once
standard directory in user `PATH`. The current parent shell is not
changes: installer prints the exact `source`/fish command, for
`.profile` asks for login/re-login, and for Windows, opens a new terminal.

## Scope

- new installer scripts in the scripts directory;
- `Makefile` and `.github/workflows/`;
- installer contract tests in `internal/app/`;
- `README.md`, `CHANGELOG.md` and `docs/`.

## Out of scope

- publication of a Git tag or GitHub Release;
- background self-update or new Go CLI command;
- system-wide installation via `sudo` and package managers;
- Windows ARM64 and other new release targets;
- signature or notarization of release binaries.

## Acceptance criteria

- [x] `AC-01` Installer unambiguously selects five existing ones
  Linux, macOS and Windows artifacts, and unsupported
  platform rejects before loading.
- [x] `AC-02` By default, the latest stable release is selected;
  `DOCU_DOCU_VERSION=X.Y.Z` fixes the version and allows downgrade,
  `DOCU_DOCU_INSTALL_DIR` selects a non-standard directory, and
  `DOCU_DOCU_NO_MODIFY_PATH=1` prevents modification of `PATH`.
- [x] `AC-03` The binary is replaced only after an accurate check
  release checksum and versions; download, checksum and filesystem failure
  do not damage the already installed version, but the matching checksum
  gives idempotent no-op.
- [x] `AC-04` Release bundle contains both installer scripts, and
  `checksums.txt` covers them along with binaries and notices.
- [x] `AC-05` README and canonical documentation describe
  commands, matrix, update/version override, `PATH`, check
  SHA-256, bootstrap-only network boundary and what's up
  publishing `0.0.1` by the owner of one-liner is not yet available.
- [x] `AC-06` Restart, upgrade, downgrade and add
  standard user install dir in shell/user `PATH` are idempotent;
  the non-standard directory does not change the profile and receives a hint.

## Plan

1. Implement the same installer contract for POSIX and PowerShell.
2. Include scripts in the release bundle and checksum generation.
3. Add platform, integrity, replacement and release contract tests.
4. Update source documents and release notes.
5. Go through semantic gate, full check and rebuild the portal.

## Verification

- `AC-01` → `go test ./internal/app -run TestInstallerPlatformContract`
- `AC-02` → `go test ./internal/app -run TestInstallerSelectionAndPathContract`
- `AC-03` → `go test ./internal/app -run TestInstallerIntegrityAndReplacement`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt && test "$(wc -l < checksums.txt)" -eq 10 && for file in docu-docu-linux-amd64 docu-docu-linux-arm64 docu-docu-darwin-amd64 docu-docu-darwin-arm64 docu-docu-windows-amd64.exe install.sh install.ps1 LICENSE THIRD_PARTY_NOTICES.md CODEMIRROR-CHECKSUMS.txt; do awk -v file="$file" '$2 == file { found=1 } END { exit !found }' checksums.txt || exit 1; done`
- `AC-05` → `go test ./internal/app -run TestInstallerDocumentationContract && go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `AC-06` → `go test ./internal/app -run TestInstallerRepeatUpgradeDowngradeAndPath`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

Installation guide is added; README, `CHANGELOG.md`, are updated
current state, system/trust boundary and monitored portal.

## Use-case omission reason

The task changes release engineering and bootstrap delivery without adding
main Go CLI command or script.