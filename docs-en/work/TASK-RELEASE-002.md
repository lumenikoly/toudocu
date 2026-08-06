# TASK-RELEASE-002: Add installation and updates from GitHub Release

- Status: Completed
- Type: Maintenance
- Module: MOD-CLI
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-08-05

## Result

The `0.0.1` release bundle and workflow are ready to publish the POSIX and
PowerShell bootstraps: a user installs or updates Docu-docu with one command,
while the bootstrap selects the supported OS/architecture artifact and verifies
its SHA-256 before replacing the file.

## Behavior change

### Before

The user manually selects a binary in GitHub Releases, verifies it, and adds it
to `PATH`.

### After

The POSIX and PowerShell commands download the appropriate artifact and
`checksums.txt`, verify integrity, and atomically install it without `sudo` at
`~/.local/bin/docu-docu` or
`%LOCALAPPDATA%\Programs\docu-docu\docu-docu.exe`. The canonical commands are:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

Both `install.*` files are included in the release assets for version `0.0.1`.

If the standard user directory is not yet in `PATH`, the POSIX installer adds
one managed entry to `.zshrc` for zsh, `.bashrc` for bash, fish `conf.d`, or
`.profile` for other POSIX shells. The PowerShell installer adds the standard
directory to the user `PATH` once. The current parent shell is not changed: the
installer prints the exact `source`/fish command, requests a login/re-login for
`.profile`, or asks the user to open a new terminal on Windows.

## Scope

- new installer scripts in the scripts directory;
- `Makefile` and `.github/workflows/`;
- installer contract tests in `internal/app/`;
- `README.md`, `CHANGELOG.md`, and `docs/`.

## Out of scope

- publishing a Git tag or GitHub Release;
- background self-update or a new Go CLI command;
- system-wide installation through `sudo` and package managers;
- Windows ARM64 and other new release targets;
- signing or notarization of release binaries.

## Acceptance criteria

- [x] `AC-01` The installer unambiguously selects the five existing Linux,
  macOS, and Windows artifacts and rejects an unsupported platform before any
  download.
- [x] `AC-02` The latest stable release is selected by default;
  `DOCU_DOCU_VERSION=X.Y.Z` pins the version and permits a downgrade,
  `DOCU_DOCU_INSTALL_DIR` selects a nonstandard directory, and
  `DOCU_DOCU_NO_MODIFY_PATH=1` prevents changes to `PATH`.
- [x] `AC-03` The binary is replaced only after exact verification of the
  release checksum and version; download, checksum, and filesystem failures do
  not damage the installed version, while a matching checksum produces an
  idempotent no-op.
- [x] `AC-04` The release bundle contains both installer scripts, and
  `checksums.txt` covers them together with the binaries and notices.
- [x] `AC-05` The README and canonical documentation describe the commands,
  matrix, update/version override, `PATH`, SHA-256 verification, the
  bootstrap-only network boundary, and standard installation commands from a
  stable GitHub Release.
- [x] `AC-06` Repeated runs, upgrades, downgrades, and adding the standard user
  install directory to the shell/user `PATH` are idempotent; a nonstandard
  directory does not change the profile and receives a hint.

## Plan

1. Implement the same installer contract for POSIX and PowerShell.
2. Include the scripts in the release bundle and checksum generation.
3. Add platform, integrity, replacement, and release contract tests.
4. Update the source documents and release notes.
5. Pass the semantic gate and full check, then rebuild the portal.

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

An installation guide is added; the README, `CHANGELOG.md`, current status,
system/trust boundary, and tracked portal are updated.

## Use-case omission reason

The task changes release engineering and bootstrap delivery without adding a
command or scenario to the main Go CLI.
