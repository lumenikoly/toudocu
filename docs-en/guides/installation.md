# Installing and updating Docu-docu

This guide explains how to install the appropriate binary from a GitHub Release
without administrator privileges. The same command checks the installation
again and updates it.

## Install or update the latest release

Linux and macOS:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

Running the installer again does not replace the binary when its SHA-256
already matches the release file. When a new version is available, the
installer replaces the old file only after all checks succeed.

## Supported platforms

| System | Architecture | Release asset |
|---|---|---|
| Linux | AMD64 / x86-64 | `docu-docu-linux-amd64` |
| Linux | ARM64 / AArch64 | `docu-docu-linux-arm64` |
| macOS | Intel | `docu-docu-darwin-amd64` |
| macOS | Apple silicon | `docu-docu-darwin-arm64` |
| Windows | AMD64 / x86-64 | `docu-docu-windows-amd64.exe` |
| Windows | ARM64 | `docu-docu-windows-arm64.exe` |

On Windows ARM64, the installer selects the native ARM64 binary, including
when running from an emulated x64 process. Other unlisted combinations fail
before downloading.

## Select a version

For a POSIX shell, pass the environment variable after the pipe:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh \
  | DOCU_DOCU_VERSION=0.0.1 sh
```

PowerShell uses the same variable:

```powershell
$env:DOCU_DOCU_VERSION = "0.0.1"
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
Remove-Item Env:DOCU_DOCU_VERSION
```

The accepted formats are `X.Y.Z` and `X.Y.Z-rc.N`, without a `v` prefix. An
explicit version allows pinning, an intentional downgrade, and installation of
a release candidate. RC builds are not selected through `latest`, so their tag
is specified explicitly:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/download/0.0.1-rc.1/install.sh \
  | DOCU_DOCU_VERSION=0.0.1-rc.1 sh
```

In GitHub Actions, an RC is published through the `release` workflow: select
branch `main`, channel `rc`, base version `0.0.1`, and a positive `rc_number`.
The workflow creates a prerelease tagged `0.0.1-rc.N`; the stable channel
continues to create an ordinary `X.Y.Z` release.

## Directory and PATH

By default, the binary is installed at:

- `~/.local/bin/docu-docu` on Linux and macOS;
- `%LOCALAPPDATA%\Programs\docu-docu\docu-docu.exe` on Windows.

If that directory is not in `PATH`, the installer adds one managed entry to
`.bashrc`, `.zshrc`, fish `conf.d`, `.profile`, or the Windows user `PATH`. It
cannot change the parent shell, so it prints the exact `source` command, states
that a login or re-login is required, or asks the user to open a new Windows
terminal.

Using another directory does not change the shell profile:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh \
  | DOCU_DOCU_INSTALL_DIR="$HOME/bin" sh
```

`DOCU_DOCU_NO_MODIFY_PATH=1` disables changes to the profile or Windows user
`PATH`. In either case, the installer prints the directory that must be added
to `PATH` manually.

## Trust boundary

The HTTPS bootstrap downloads the binary and `checksums.txt` from the same
GitHub Release. It requires exactly one SHA-256 entry for the selected artifact,
compares the digest, and runs `docu-docu version` before replacement. A download,
checksum, version, or staging error before replacement does not change the old
binary. A later error writing `PATH` does not roll back an already verified
binary: the installer prints a warning and a manual `PATH` hint.

The checksum protects against accidental corruption but is not an independent
cryptographic signature: the binary and checksum share the release trust root.
The `curl | sh` and `irm | iex` commands also execute a remote installer. You
can download and inspect it separately before running it.

Network access and system download/hash tools are needed only by the installer.
After installation, Docu-docu remains one self-contained Go binary with no
runtime dependencies or external outbound downloads during normal operation.
