#!/bin/sh

set -eu

repository="lumenikoly/docu-docu"
version="${DOCU_DOCU_VERSION:-latest}"
default_install_dir="${HOME:?HOME is required}/.local/bin"
install_dir="${DOCU_DOCU_INSTALL_DIR:-$default_install_dir}"
no_modify_path="${DOCU_DOCU_NO_MODIFY_PATH:-0}"
stage_file=""
temp_dir=""

fail() {
    printf 'docu-docu installer: %s\n' "$*" >&2
    exit 1
}

warn() {
    printf 'docu-docu installer warning: %s\n' "$*" >&2
}

cleanup() {
    if [ -n "$stage_file" ] && [ -f "$stage_file" ]; then
        rm -f "$stage_file"
    fi
    if [ -n "$temp_dir" ] && [ -d "$temp_dir" ]; then
        rm -rf "$temp_dir"
    fi
}

trap cleanup EXIT HUP INT TERM

case "$version" in
    latest) ;;
    *)
        printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' ||
            fail "DOCU_DOCU_VERSION must be latest or X.Y.Z"
        ;;
esac

[ "$no_modify_path" = "0" ] || [ "$no_modify_path" = "1" ] ||
    fail "DOCU_DOCU_NO_MODIFY_PATH must be 0 or 1"

command -v curl >/dev/null 2>&1 || fail "curl is required"

os_name=$(uname -s 2>/dev/null || true)
arch_name=$(uname -m 2>/dev/null || true)

case "$os_name" in
    Linux) os="linux" ;;
    Darwin) os="darwin" ;;
    *) fail "unsupported operating system: ${os_name:-unknown}" ;;
esac

case "$arch_name" in
    x86_64 | amd64) arch="amd64" ;;
    arm64 | aarch64) arch="arm64" ;;
    *) fail "unsupported architecture: ${arch_name:-unknown}" ;;
esac

asset="docu-docu-$os-$arch"
if [ "$version" = "latest" ]; then
    release_url="https://github.com/$repository/releases/latest/download"
else
    release_url="https://github.com/$repository/releases/download/$version"
fi

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/docu-docu-install.XXXXXX") ||
    fail "cannot create a temporary directory"
downloaded="$temp_dir/$asset"
checksums="$temp_dir/checksums.txt"

curl -fsSL --retry 3 --proto '=https' --tlsv1.2 -o "$checksums" "$release_url/checksums.txt" ||
    fail "cannot download checksums.txt from $release_url"
curl -fsSL --retry 3 --proto '=https' --tlsv1.2 -o "$downloaded" "$release_url/$asset" ||
    fail "cannot download $asset from $release_url"

expected=$(awk -v file="$asset" '
    ($2 == file || $2 == "*" file) { count++; digest=$1 }
    END { if (count == 1) print digest }
' "$checksums")
printf '%s\n' "$expected" | grep -Eq '^[0-9A-Fa-f]{64}$' ||
    fail "checksums.txt has no unique SHA-256 entry for $asset"

if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$downloaded" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$downloaded" | awk '{print $1}')
elif command -v openssl >/dev/null 2>&1; then
    actual=$(openssl dgst -sha256 "$downloaded" | awk '{print $NF}')
else
    fail "sha256sum, shasum, or openssl is required to verify the download"
fi

[ "$(printf '%s' "$actual" | tr 'A-F' 'a-f')" = "$(printf '%s' "$expected" | tr 'A-F' 'a-f')" ] ||
    fail "SHA-256 mismatch for $asset"

chmod 0755 "$downloaded" || fail "cannot make the downloaded binary executable"
downloaded_version=$("$downloaded" version 2>/dev/null | tr -d '\r\n') ||
    fail "the downloaded binary cannot report its version"
printf '%s\n' "$downloaded_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' ||
    fail "the downloaded binary reported an invalid version: $downloaded_version"
if [ "$version" != "latest" ] && [ "$downloaded_version" != "$version" ]; then
    fail "the downloaded binary reported $downloaded_version, expected $version"
fi

mkdir -p "$install_dir" || fail "cannot create install directory: $install_dir"
target="$install_dir/docu-docu"

already_installed=0
if [ -f "$target" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
        installed=$(sha256sum "$target" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
        installed=$(shasum -a 256 "$target" | awk '{print $1}')
    else
        installed=$(openssl dgst -sha256 "$target" | awk '{print $NF}')
    fi
    if [ "$(printf '%s' "$installed" | tr 'A-F' 'a-f')" = "$(printf '%s' "$expected" | tr 'A-F' 'a-f')" ]; then
        chmod 0755 "$target" || fail "cannot make $target executable"
        already_installed=1
    fi
fi

if [ "$already_installed" = "0" ]; then
    stage_file="$install_dir/.docu-docu.new.$$"
    cp "$downloaded" "$stage_file" || fail "cannot stage the downloaded binary in $install_dir"
    chmod 0755 "$stage_file" || fail "cannot make the staged binary executable"
    mv -f "$stage_file" "$target" || fail "cannot replace $target"
    stage_file=""
fi

path_changed=0
path_activation_needed=0
profile_file=""
if [ "$install_dir" = "$default_install_dir" ]; then
    case ":${PATH:-}:" in
        *":$default_install_dir:"*) ;;
        *)
            path_activation_needed=1
            if [ "$no_modify_path" = "0" ]; then
                shell_name=$(basename "${SHELL:-sh}")
                case "$shell_name" in
                    zsh)
                        profile_file="${ZDOTDIR:-$HOME}/.zshrc"
                        path_line='export PATH="$HOME/.local/bin:$PATH"'
                        ;;
                    bash)
                        profile_file="$HOME/.bashrc"
                        path_line='export PATH="$HOME/.local/bin:$PATH"'
                        ;;
                    fish)
                        profile_file="${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/docu-docu.fish"
                        path_line='fish_add_path "$HOME/.local/bin"'
                        ;;
                    *)
                        profile_file="$HOME/.profile"
                        path_line='export PATH="$HOME/.local/bin:$PATH"'
                        ;;
                esac
                if ! mkdir -p "$(dirname "$profile_file")"; then
                    warn "cannot create the profile directory; add $default_install_dir to PATH manually"
                    profile_file=""
                elif [ ! -f "$profile_file" ] || ! grep -Fq '# docu-docu installer' "$profile_file"; then
                    if {
                        printf '\n# docu-docu installer\n'
                        printf '%s\n' "$path_line"
                    } >> "$profile_file"; then
                        path_changed=1
                    else
                        warn "cannot update $profile_file; add $default_install_dir to PATH manually"
                        profile_file=""
                    fi
                fi
            fi
            ;;
    esac
fi

if [ "$already_installed" = "1" ]; then
    printf 'docu-docu %s is already installed at %s\n' "$downloaded_version" "$target"
else
    printf 'Installed docu-docu %s at %s\n' "$downloaded_version" "$target"
fi
if [ "$install_dir" != "$default_install_dir" ]; then
    case ":${PATH:-}:" in
        *":$install_dir:"*) ;;
        *) printf 'Add %s to PATH to run docu-docu by name.\n' "$install_dir" ;;
    esac
elif [ "$no_modify_path" = "1" ] && [ "$path_activation_needed" = "1" ]; then
    printf 'Add %s to PATH to run docu-docu by name.\n' "$default_install_dir"
elif [ "$path_activation_needed" = "1" ] && [ -n "$profile_file" ]; then
    case "$(basename "${SHELL:-sh}")" in
        bash) printf 'Run: . "%s"\n' "$profile_file" ;;
        zsh) printf 'Run: source "%s"\n' "$profile_file" ;;
        fish) printf 'Run: source "%s"\n' "$profile_file" ;;
        *) printf 'Start a new login shell, or run: . "%s"\n' "$profile_file" ;;
    esac
elif [ "$path_activation_needed" = "1" ]; then
    printf 'Add %s to PATH to run docu-docu by name.\n' "$default_install_dir"
fi
