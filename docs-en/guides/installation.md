# Installing and updating Docu-docu

This guide helps you install the appropriate one without administrator rights.
binary from GitHub Release. The same command rechecks and updates
installation.

At the time of preparation, `0.0.1` GitHub Release has not yet been published.
The commands below will become available after the first release is published by the owner.

## Install or update latest release

Linux and macOS:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

Rerunning does not replace the binary if its SHA-256 already matches
file from release. With a new version, installer replaces the old file only after
success of all checks.

## Supported platforms

| System | Architecture | Release asset |
|---|---|---|
| Linux | AMD64/x86-64 | `docu-docu-linux-amd64` |
| Linux | ARM64/AArch64 | `docu-docu-linux-arm64` |
| macOS | Intel | `docu-docu-darwin-amd64` |
| macOS | Apple silicon | `docu-docu-darwin-arm64` |
| Windows | AMD64/x86-64 | `docu-docu-windows-amd64.exe` |

Windows ARM64 and other unlisted combinations fail before
downloads. Installer does not rely on x64 emulation of Windows ARM64.

## Select version

POSIX shell gets environment after pipe:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh \
  | DOCU_DOCU_VERSION=0.0.1 sh
```

PowerShell gets the same variable:

```powershell
$env:DOCU_DOCU_VERSION = "0.0.1"
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
Remove-Item Env:DOCU_DOCU_VERSION
```

Only the `X.Y.Z` format is allowed without the `v` prefix. Explicit version
Allows both pinning and intentional downgrade.

## Directory and PATH

By default the binary is installed to:

- `~/.local/bin/docu-docu` on Linux and macOS;
- `%LOCALAPPDATA%\Programs\docu-docu\docu-docu.exe` on Windows.

If this directory is not in `PATH`, installer adds one managed entry to
`.bashrc`, `.zshrc`, fish `conf.d`, `.profile` or user `PATH` Windows. He doesn't
can change the parent shell, so prints the exact command
`source`, requires login/re-login or asks to open a new Windows terminal.

Another directory does not change the shell profile:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh \
  | DOCU_DOCU_INSTALL_DIR="$HOME/bin" sh
```

`DOCU_DOCU_NO_MODIFY_PATH=1` disables profile changes or Windows user
`PATH`. In both cases the installer prints the directory you need
add to `PATH` manually.

## Trust boundary

Bootstrap over HTTPS downloads the binary and `checksums.txt` from one GitHub
Release. It requires exactly one SHA-256 entry for the selected
artifact, compares digest and checks `docu-docu version` before replacement.
Error loading, checksum, version or staging before replacement does not change
old binary. Error subsequent write `PATH` does not rollback already
tested binary: installer prints warning and manual `PATH` hint.

Checksum protects against accidental damage, but is not independent
cryptographic signature: binary and checksum have the same trust root release.
The `curl | sh` and `irm | iex` commands also execute remote
installer. Before launching, you can download it separately and view it.

Network and system download/hash tools are only needed by the installer. After
installation of Docu-docu remains one standalone Go binary without
runtime dependencies and external outbound downloads during normal operation.