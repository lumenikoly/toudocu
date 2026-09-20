#!/bin/sh

set -eu

repository="lumenikoly/toudocu"
version="${TOUDOCU_VERSION:-latest}"
install_dir="${TOUDOCU_INSTALL_DIR:-${HOME:?HOME is required}/.local/bin}"
data_dir="${TOUDOCU_DATA_DIR:-${HOME}/.local/share/toudocu}"
no_modify_path="${TOUDOCU_NO_MODIFY_PATH:-0}"
temp_dir=""
stage_dir=""
backup_dir=""

fail() {
    printf 'toudocu installer: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    [ -z "$temp_dir" ] || rm -rf "$temp_dir"
    [ -z "$stage_dir" ] || rm -rf "$stage_dir"
    [ -z "$backup_dir" ] || rm -rf "$backup_dir"
}

trap cleanup EXIT HUP INT TERM

case "$version" in
    latest) ;;
    *)
        printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[1-9][0-9]*)?$' ||
            fail "TOUDOCU_VERSION must be latest, X.Y.Z, or X.Y.Z-rc.N"
        ;;
esac

[ "$no_modify_path" = "0" ] || [ "$no_modify_path" = "1" ] ||
    fail "TOUDOCU_NO_MODIFY_PATH must be 0 or 1"
case "$install_dir:$data_dir" in
    /*:/*) ;;
    *) fail "installation directories must be absolute" ;;
esac
[ "$install_dir" != "/" ] && [ "$data_dir" != "/" ] || fail "refusing to install into /"

command -v node >/dev/null 2>&1 || fail "Node.js 24 or newer is required; install it first"
node_major=$(node -p "Number(process.versions.node.split('.')[0])") || fail "cannot read Node.js version"
[ "$node_major" -ge 24 ] 2>/dev/null || fail "Node.js 24 or newer is required; found $(node --version)"
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

case "$(uname -s 2>/dev/null || true)" in
    Linux) os="linux" ;;
    Darwin) os="darwin" ;;
    *) fail "unsupported operating system" ;;
esac
case "$(uname -m 2>/dev/null || true)" in
    x86_64 | amd64) arch="x64" ;;
    arm64 | aarch64) arch="arm64" ;;
    *) fail "unsupported architecture" ;;
esac

asset="toudocu-$os-$arch.tar.gz"
if [ "$version" = "latest" ]; then
    release_url="https://github.com/$repository/releases/latest/download"
else
    release_url="https://github.com/$repository/releases/download/$version"
fi

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/toudocu-install.XXXXXX") || fail "cannot create temporary directory"
archive="$temp_dir/$asset"
checksums="$temp_dir/checksums.txt"
curl -fsSL --retry 3 --proto '=https' --tlsv1.2 -o "$checksums" "$release_url/checksums.txt" ||
    fail "cannot download checksums.txt"
curl -fsSL --retry 3 --proto '=https' --tlsv1.2 -o "$archive" "$release_url/$asset" ||
    fail "cannot download $asset"

expected=$(awk -v file="$asset" '($2 == file || $2 == "*" file) { count++; digest=$1 } END { if (count == 1) print digest }' "$checksums")
printf '%s\n' "$expected" | grep -Eq '^[0-9A-Fa-f]{64}$' || fail "invalid checksum entry for $asset"
if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$archive" | awk '{print $1}')
else
    command -v openssl >/dev/null 2>&1 || fail "a SHA-256 tool is required"
    actual=$(openssl dgst -sha256 "$archive" | awk '{print $NF}')
fi
[ "$(printf '%s' "$actual" | tr 'A-F' 'a-f')" = "$(printf '%s' "$expected" | tr 'A-F' 'a-f')" ] ||
    fail "SHA-256 mismatch for $asset"

tar -xzf "$archive" -C "$temp_dir" || fail "cannot extract $asset"
extracted="$temp_dir/toudocu"
[ -f "$extracted/dist/main.js" ] || fail "release archive has no CLI entry point"
downloaded_version=$(node "$extracted/dist/main.js" version | tr -d '\r\n') || fail "downloaded CLI failed"
if [ "$version" != "latest" ] && [ "$downloaded_version" != "$version" ]; then
    fail "downloaded CLI reported $downloaded_version, expected $version"
fi

mkdir -p "$(dirname "$data_dir")" "$install_dir" || fail "cannot create installation directories"
stage_dir="$data_dir.new.$$"
backup_dir="$data_dir.old.$$"
mv "$extracted" "$stage_dir" || fail "cannot stage release"
if [ -e "$data_dir" ]; then
    mv "$data_dir" "$backup_dir" || fail "cannot preserve existing installation"
fi
if ! mv "$stage_dir" "$data_dir"; then
    [ ! -e "$backup_dir" ] || mv "$backup_dir" "$data_dir"
    fail "cannot activate release"
fi
stage_dir=""
rm -rf "$backup_dir"
backup_dir=""

launcher="$install_dir/.toudocu.new.$$"
ln -s "$data_dir/dist/main.js" "$launcher" || fail "cannot create launcher"
mv -f "$launcher" "$install_dir/toudocu" || fail "cannot activate launcher"

default_bin="$HOME/.local/bin"
if [ "$install_dir" = "$default_bin" ] && [ "$no_modify_path" = "0" ]; then
    case ":${PATH:-}:" in
        *":$default_bin:"*) ;;
        *)
            profile="$HOME/.profile"
            line='export PATH="$HOME/.local/bin:$PATH"'
            if [ ! -f "$profile" ] || ! grep -Fq '# toudocu installer' "$profile"; then
                printf '\n# toudocu installer\n%s\n' "$line" >> "$profile" ||
                    printf 'Add %s to PATH manually.\n' "$default_bin" >&2
            fi
            ;;
    esac
fi

printf 'Installed toudocu %s at %s\n' "$downloaded_version" "$install_dir/toudocu"
