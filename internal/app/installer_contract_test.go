package toudocu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallerReleaseBundleContract(t *testing.T) {
	root := filepath.Join("..", "..")
	makefile := readInstallerContractFile(t, filepath.Join(root, "Makefile"))
	for _, expected := range []string{
		"toudocu-linux-amd64", "toudocu-linux-arm64",
		"toudocu-darwin-amd64", "toudocu-darwin-arm64",
		"toudocu-windows-amd64.exe", "toudocu-windows-arm64.exe",
		"cp scripts/install.sh scripts/install.ps1 $(DIST)/",
		"sha256sum * > checksums.txt",
	} {
		if !strings.Contains(makefile, expected) {
			t.Errorf("Makefile release contract missing %q", expected)
		}
	}
	for _, file := range []string{"install.sh", "install.ps1"} {
		info, err := os.Stat(filepath.Join(root, "scripts", file))
		if err != nil || info.Size() == 0 {
			t.Errorf("release installer %s: %v", file, err)
		}
	}
}

func TestReleaseWorkflowRCContract(t *testing.T) {
	workflow := readInstallerContractFile(t, filepath.Join("..", "..", ".github", "workflows", "release.yml"))
	for _, expected := range []string{"channel:", "rc_number:", `release_version="$VERSION-rc.$RC_NUMBER"`, "--prerelease"} {
		if !strings.Contains(workflow, expected) {
			t.Errorf("release workflow RC contract missing %q", expected)
		}
	}
}

func TestInstallerDocumentationContract(t *testing.T) {
	root := filepath.Join("..", "..")
	canonicalCommands := []string{
		"curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh",
		"irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex",
	}
	readme := readInstallerContractFile(t, filepath.Join(root, "README.md"))
	readmeRU := readInstallerContractFile(t, filepath.Join(root, "README.ru.md"))
	guide := readInstallerContractFile(t, filepath.Join(root, "docs", "guides", "installation.md"))
	for _, command := range canonicalCommands {
		if !strings.Contains(readme, command) || !strings.Contains(guide, command) {
			t.Errorf("canonical command is not synchronized: %s", command)
		}
	}
	for _, expected := range []string{
		"toudocu-linux-amd64", "toudocu-linux-arm64",
		"toudocu-darwin-amd64", "toudocu-darwin-arm64",
		"toudocu-windows-amd64.exe", "toudocu-windows-arm64.exe", "Windows ARM64",
		"TOUDOCU_VERSION", "TOUDOCU_INSTALL_DIR", "TOUDOCU_NO_MODIFY_PATH",
		"~/.local/bin/toudocu", "%LOCALAPPDATA%\\Programs\\toudocu\\toudocu.exe",
		"checksums.txt", "независимой криптографической подписью", "curl | sh", "irm | iex",
	} {
		if !strings.Contains(guide, expected) {
			t.Errorf("installation guide missing %q", expected)
		}
	}

	changelog := readInstallerContractFile(t, filepath.Join(root, "CHANGELOG.md"))
	status := readInstallerContractFile(t, filepath.Join(root, "docs", "status.md"))
	systemBoundary := readInstallerContractFile(t, filepath.Join(root, "docs", "architecture", "system-boundary.md"))
	trustBoundary := readInstallerContractFile(t, filepath.Join(root, "docs", "architecture", "trust-boundaries.md"))
	for name, document := range map[string]string{
		"CHANGELOG.md": changelog,
		"status.md":    status,
	} {
		if !strings.Contains(document, "POSIX") || !strings.Contains(document, "PowerShell") {
			t.Errorf("%s does not describe both installers", name)
		}
	}
	for _, expected := range []string{"Сопровождение версии 0.0.1", "Текущая стабильная версия — `0.0.1`", "Установщики GitHub Release"} {
		if !strings.Contains(status, expected) {
			t.Errorf("status does not describe the stable release: missing %q", expected)
		}
	}
	for name, document := range map[string]string{
		"CHANGELOG.md": changelog,
		"README.md":    readme,
		"README.ru.md": readmeRU,
		"installation": guide,
		"status.md":    status,
	} {
		for _, obsolete := range []string{"Подготовка стабильного релиза", "готовится к первому стабильному релизу", "после публикации стабильного релиза", "stable release is published", "Release is not confirmed", "GitHub Release ещё не опубликован", "GitHub Release не создавались"} {
			if strings.Contains(document, obsolete) {
				t.Errorf("%s preserves pre-release wording %q", name, obsolete)
			}
		}
	}
	if !strings.Contains(systemBoundary, "Установщики релиза") || !strings.Contains(systemBoundary, "находятся вне") {
		t.Error("system boundary does not keep bootstrap outside the Go runtime")
	}
	for _, expected := range []string{"## Установщик релиза", "одного HTTPS-релиза", "curl | sh", "irm | iex"} {
		if !strings.Contains(trustBoundary, expected) {
			t.Errorf("trust boundary missing %q", expected)
		}
	}
}

func TestInstallerScriptContract(t *testing.T) {
	root := filepath.Join("..", "..", "scripts")
	posix := readInstallerContractFile(t, filepath.Join(root, "install.sh"))
	powerShell := readInstallerContractFile(t, filepath.Join(root, "install.ps1"))
	for _, expected := range []string{
		"TOUDOCU_VERSION", "TOUDOCU_INSTALL_DIR", "TOUDOCU_NO_MODIFY_PATH",
		"releases/latest/download", "checksums.txt", "SHA-256", ".bashrc", ".zshrc", "conf.d",
	} {
		if !strings.Contains(posix, expected) {
			t.Errorf("install.sh missing %q", expected)
		}
	}
	for _, expected := range []string{
		"TOUDOCU_VERSION", "TOUDOCU_INSTALL_DIR", "TOUDOCU_NO_MODIFY_PATH",
		"releases/latest/download", "checksums.txt", "SHA-256", "Get-FileHash",
		"SetEnvironmentVariable(\"Path\"", "toudocu-windows-amd64.exe", "toudocu-windows-arm64.exe",
	} {
		if !strings.Contains(powerShell, expected) {
			t.Errorf("install.ps1 missing %q", expected)
		}
	}
}

func readInstallerContractFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}
