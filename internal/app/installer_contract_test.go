package docudocu

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
		"docu-docu-linux-amd64", "docu-docu-linux-arm64",
		"docu-docu-darwin-amd64", "docu-docu-darwin-arm64",
		"docu-docu-windows-amd64.exe",
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

func TestInstallerDocumentationContract(t *testing.T) {
	root := filepath.Join("..", "..")
	canonicalCommands := []string{
		"curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh",
		"irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex",
	}
	readme := readInstallerContractFile(t, filepath.Join(root, "README.md"))
	guide := readInstallerContractFile(t, filepath.Join(root, "docs", "guides", "installation.md"))
	for _, command := range canonicalCommands {
		if !strings.Contains(readme, command) || !strings.Contains(guide, command) {
			t.Errorf("canonical command is not synchronized: %s", command)
		}
	}
	for _, expected := range []string{
		"docu-docu-linux-amd64", "docu-docu-linux-arm64",
		"docu-docu-darwin-amd64", "docu-docu-darwin-arm64",
		"docu-docu-windows-amd64.exe", "Windows ARM64",
		"DOCU_DOCU_VERSION", "DOCU_DOCU_INSTALL_DIR", "DOCU_DOCU_NO_MODIFY_PATH",
		"~/.local/bin/docu-docu", "%LOCALAPPDATA%\\Programs\\docu-docu\\docu-docu.exe",
		"checksum", "один trust root", "curl | sh", "irm | iex",
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
	for _, expected := range []string{"Подготовка стабильного релиза 0.0.1", "готовится к стабильному релизу", "опубликовать стабильный релиз `0.0.1`"} {
		if !strings.Contains(status, expected) {
			t.Errorf("status does not describe release preparation: missing %q", expected)
		}
	}
	for _, obsolete := range []string{"GitHub Release ещё не опубликован", "GitHub Release не создавались"} {
		if strings.Contains(guide, obsolete) || strings.Contains(status, obsolete) {
			t.Errorf("release documentation preserves obsolete unpublished-release warning %q", obsolete)
		}
	}
	if !strings.Contains(systemBoundary, "Release installer") || !strings.Contains(systemBoundary, "остаётся снаружи") {
		t.Error("system boundary does not keep bootstrap outside the Go runtime")
	}
	for _, expected := range []string{"## Граница release bootstrap", "один trust root", "curl | sh", "irm | iex"} {
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
		"DOCU_DOCU_VERSION", "DOCU_DOCU_INSTALL_DIR", "DOCU_DOCU_NO_MODIFY_PATH",
		"releases/latest/download", "checksums.txt", "SHA-256", ".bashrc", ".zshrc", "conf.d",
	} {
		if !strings.Contains(posix, expected) {
			t.Errorf("install.sh missing %q", expected)
		}
	}
	for _, expected := range []string{
		"DOCU_DOCU_VERSION", "DOCU_DOCU_INSTALL_DIR", "DOCU_DOCU_NO_MODIFY_PATH",
		"releases/latest/download", "checksums.txt", "SHA-256", "Get-FileHash",
		"SetEnvironmentVariable(\"Path\"", "docu-docu-windows-amd64.exe",
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
