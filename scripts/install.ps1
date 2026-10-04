$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repository = "lumenikoly/toudocu"
$Version = if ($env:TOUDOCU_VERSION) { $env:TOUDOCU_VERSION } else { "latest" }
$InstallDir = if ($env:TOUDOCU_INSTALL_DIR) {
    $env:TOUDOCU_INSTALL_DIR
} else {
    Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Programs\toudocu"
}
$NoModifyPath = if ($env:TOUDOCU_NO_MODIFY_PATH) { $env:TOUDOCU_NO_MODIFY_PATH } else { "0" }
$TempDir = $null
$StageDir = $null
$BackupDir = $null

function Fail([string]$Message) {
    throw "toudocu installer: $Message"
}

try {
    if ($env:OS -ne "Windows_NT") {
        Fail "unsupported operating system; use install.sh on Linux or macOS"
    }
    if ($Version -ne "latest" -and $Version -notmatch '^\d+\.\d+\.\d+(-rc\.[1-9]\d*)?$') {
        Fail "TOUDOCU_VERSION must be latest, X.Y.Z, or X.Y.Z-rc.N"
    }
    if ($NoModifyPath -ne "0" -and $NoModifyPath -ne "1") {
        Fail "TOUDOCU_NO_MODIFY_PATH must be 0 or 1"
    }

    $Node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $Node) {
        Fail "Node.js 24 or newer is required; install it first"
    }
    $NodeVersion = (& node -p "process.versions.node" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [int]($NodeVersion.Split('.')[0]) -lt 24) {
        Fail "Node.js 24 or newer is required; found $NodeVersion"
    }
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        Fail "tar is required"
    }

    $Architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    if ($Architecture -eq "X64" -and $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
        $Architecture = "Arm64"
    }
    $Asset = switch ($Architecture) {
        "X64" { "toudocu-win32-x64.tar.gz"; break }
        "Arm64" { "toudocu-win32-arm64.tar.gz"; break }
        default { Fail "unsupported Windows architecture: $Architecture" }
    }

    $ReleaseUrl = if ($Version -eq "latest") {
        "https://github.com/$Repository/releases/latest/download"
    } else {
        "https://github.com/$Repository/releases/download/$Version"
    }
    $TempDir = Join-Path ([IO.Path]::GetTempPath()) ("toudocu-install-" + [Guid]::NewGuid().ToString("N"))
    [void](New-Item -ItemType Directory -Path $TempDir)
    $Archive = Join-Path $TempDir $Asset
    $Checksums = Join-Path $TempDir "checksums.txt"
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseUrl/checksums.txt" -OutFile $Checksums
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseUrl/$Asset" -OutFile $Archive

    $Pattern = '^(?<hash>[0-9A-Fa-f]{64})\s+\*?' + [Regex]::Escape($Asset) + '$'
    $MatchesFound = @(Get-Content -LiteralPath $Checksums | ForEach-Object {
        if ($_ -match $Pattern) { $Matches['hash'] }
    })
    if ($MatchesFound.Count -ne 1) {
        Fail "invalid checksum entry for $Asset"
    }
    $Expected = $MatchesFound[0].ToLowerInvariant()
    $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash.ToLowerInvariant()
    if ($Actual -ne $Expected) {
        Fail "SHA-256 mismatch for $Asset"
    }

    & tar -xzf $Archive -C $TempDir
    if ($LASTEXITCODE -ne 0) {
        Fail "cannot extract $Asset"
    }
    $Extracted = Join-Path $TempDir "toudocu"
    $EntryPoint = Join-Path $Extracted "dist\main.js"
    if (-not (Test-Path -LiteralPath $EntryPoint -PathType Leaf)) {
        Fail "release archive has no CLI entry point"
    }
    $DownloadedVersion = (& node $EntryPoint version | Out-String).Trim()
    if ($Version -ne "latest" -and $DownloadedVersion -ne $Version) {
        Fail "downloaded CLI reported $DownloadedVersion, expected $Version"
    }

    [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $InstallDir))
    $StageDir = "$InstallDir.new.$([Guid]::NewGuid().ToString('N'))"
    $BackupDir = "$InstallDir.old.$([Guid]::NewGuid().ToString('N'))"
    Move-Item -LiteralPath $Extracted -Destination $StageDir
    if (Test-Path -LiteralPath $InstallDir) {
        Move-Item -LiteralPath $InstallDir -Destination $BackupDir
    }
    try {
        Move-Item -LiteralPath $StageDir -Destination $InstallDir
        $StageDir = $null
    } catch {
        if (Test-Path -LiteralPath $BackupDir) {
            Move-Item -LiteralPath $BackupDir -Destination $InstallDir
        }
        throw
    }
    if (Test-Path -LiteralPath $BackupDir) {
        Remove-Item -LiteralPath $BackupDir -Recurse -Force
    }
    $BackupDir = $null

    $Launcher = Join-Path $InstallDir "toudocu.cmd"
    "@echo off`r`nnode `"%~dp0dist\main.js`" %*`r`n" |
        Set-Content -LiteralPath $Launcher -Encoding Ascii
    if ($NoModifyPath -eq "0") {
        $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $Entries = @($UserPath -split ';' | Where-Object { $_ })
        $Present = $Entries | Where-Object {
            $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\')
        }
        if (-not $Present) {
            [Environment]::SetEnvironmentVariable("Path", (($Entries + $InstallDir) -join ';'), "User")
        }
    }
    Write-Output "Installed toudocu $DownloadedVersion at $Launcher"
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    foreach ($Path in @($StageDir, $BackupDir, $TempDir)) {
        if ($Path -and (Test-Path -LiteralPath $Path)) {
            Remove-Item -LiteralPath $Path -Recurse -Force
        }
    }
}
