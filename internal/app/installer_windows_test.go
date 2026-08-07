//go:build windows

package docudocu

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type windowsInstallerFixture struct {
	server      *httptest.Server
	mu          sync.Mutex
	requested   []string
	binaries    map[string][]byte
	badChecksum bool
}

func newWindowsInstallerFixture(t *testing.T, binaries map[string][]byte) *windowsInstallerFixture {
	t.Helper()
	fixture := &windowsInstallerFixture{binaries: binaries}
	fixture.server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		fixture.mu.Lock()
		fixture.requested = append(fixture.requested, request.URL.Path)
		fixture.mu.Unlock()
		selector, file, ok := windowsInstallerReleasePath(request.URL.Path)
		binary, exists := fixture.binaries[selector]
		if !ok || !exists {
			http.NotFound(response, request)
			return
		}
		if file == "checksums.txt" {
			digest := fmt.Sprintf("%x", sha256.Sum256(binary))
			if fixture.badChecksum {
				digest = strings.Repeat("0", 64)
			}
			fmt.Fprintf(response, "%s  docu-docu-windows-amd64.exe\n%s  docu-docu-windows-arm64.exe\n", digest, digest)
			return
		}
		if file != "docu-docu-windows-amd64.exe" && file != "docu-docu-windows-arm64.exe" {
			http.NotFound(response, request)
			return
		}
		_, _ = response.Write(binary)
	}))
	t.Cleanup(fixture.server.Close)
	return fixture
}

func windowsInstallerReleasePath(requestPath string) (selector, file string, ok bool) {
	parts := strings.Split(strings.Trim(requestPath, "/"), "/")
	if len(parts) == 4 && parts[0] == "releases" && parts[1] == "latest" && parts[2] == "download" {
		return "latest", parts[3], true
	}
	if len(parts) == 4 && parts[0] == "releases" && parts[1] == "download" {
		return parts[2], parts[3], true
	}
	return "", "", false
}

func (f *windowsInstallerFixture) paths() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.requested...)
}

func TestInstallerPlatformContract(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "scripts", "install.ps1"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"docu-docu-windows-amd64.exe", "docu-docu-windows-arm64.exe", "PROCESSOR_ARCHITEW6432", "only AMD64 and ARM64 are published"} {
		if !strings.Contains(string(content), expected) {
			t.Errorf("PowerShell installer missing %q", expected)
		}
	}
	output, err := runPowerShellInstaller(t, "http://127.0.0.1:1", map[string]string{
		"PROCESSOR_ARCHITECTURE": "x86",
		"DOCU_DOCU_INSTALL_DIR":  filepath.Join(t.TempDir(), "bin"),
	})
	if err == nil || !strings.Contains(output, "unsupported Windows architecture: x86; only AMD64 and ARM64 are published") {
		t.Fatalf("x86 rejection: err=%v output=%q", err, output)
	}
}

func TestInstallerSelectionAndPathContract(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "scripts", "install.ps1"))
	if err != nil {
		t.Fatal(err)
	}
	binary := buildWindowsInstallerFixtureBinary(t, "0.0.1")
	fixture := newWindowsInstallerFixture(t, map[string][]byte{"latest": binary, "0.0.1": binary})
	installDir := filepath.Join(t.TempDir(), "bin")
	output, err := runPowerShellInstaller(t, fixture.server.URL, map[string]string{
		"DOCU_DOCU_INSTALL_DIR":    installDir,
		"DOCU_DOCU_NO_MODIFY_PATH": "1",
	})
	if err != nil {
		t.Fatalf("latest install: %v\n%s", err, output)
	}
	if !windowsContainsString(fixture.paths(), "/releases/latest/download/checksums.txt") {
		t.Fatalf("latest URL not used: %v", fixture.paths())
	}

	pinnedDir := filepath.Join(t.TempDir(), "bin")
	output, err = runPowerShellInstaller(t, fixture.server.URL, map[string]string{
		"DOCU_DOCU_INSTALL_DIR":    pinnedDir,
		"DOCU_DOCU_NO_MODIFY_PATH": "1",
		"DOCU_DOCU_VERSION":        "0.0.1",
	})
	if err != nil {
		t.Fatalf("pinned install: %v\n%s", err, output)
	}
	if !windowsContainsString(fixture.paths(), "/releases/download/0.0.1/checksums.txt") {
		t.Fatalf("pinned URL not used: %v", fixture.paths())
	}

	arm64Dir := filepath.Join(t.TempDir(), "bin")
	output, err = runPowerShellInstaller(t, fixture.server.URL, map[string]string{
		"DOCU_DOCU_INSTALL_DIR":    arm64Dir,
		"DOCU_DOCU_NO_MODIFY_PATH": "1",
		"DOCU_DOCU_VERSION":        "0.0.1",
		"PROCESSOR_ARCHITECTURE":   "AMD64",
		"PROCESSOR_ARCHITEW6432":   "ARM64",
	})
	if err != nil {
		t.Fatalf("ARM64 install: %v\n%s", err, output)
	}
	if !windowsContainsString(fixture.paths(), "/releases/download/0.0.1/docu-docu-windows-arm64.exe") {
		t.Fatalf("ARM64 asset not used: %v", fixture.paths())
	}

	script := string(content)
	for _, expected := range []string{"LocalApplicationData", "Programs\\docu-docu", "SetEnvironmentVariable(\"Path\"", "DOCU_DOCU_NO_MODIFY_PATH"} {
		if !strings.Contains(script, expected) {
			t.Errorf("PowerShell PATH contract missing %q", expected)
		}
	}
}

func TestInstallerIntegrityAndReplacement(t *testing.T) {
	binary := buildWindowsInstallerFixtureBinary(t, "0.0.1")
	fixture := newWindowsInstallerFixture(t, map[string][]byte{"0.0.1": binary})
	fixture.badChecksum = true
	installDir := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(installDir, "docu-docu.exe")
	if err := os.WriteFile(target, []byte("previous"), 0o755); err != nil {
		t.Fatal(err)
	}
	output, err := runPowerShellInstaller(t, fixture.server.URL, map[string]string{
		"DOCU_DOCU_INSTALL_DIR":    installDir,
		"DOCU_DOCU_NO_MODIFY_PATH": "1",
		"DOCU_DOCU_VERSION":        "0.0.1",
	})
	if err == nil || !strings.Contains(output, "SHA-256 mismatch") {
		t.Fatalf("checksum mismatch: err=%v output=%q", err, output)
	}
	content, readErr := os.ReadFile(target)
	if readErr != nil || string(content) != "previous" {
		t.Fatalf("old binary changed: err=%v content=%q", readErr, content)
	}
}

func TestInstallerRepeatUpgradeDowngradeAndPath(t *testing.T) {
	first := buildWindowsInstallerFixtureBinary(t, "1.0.0")
	second := buildWindowsInstallerFixtureBinary(t, "2.0.0")
	fixture := newWindowsInstallerFixture(t, map[string][]byte{"1.0.0": first, "2.0.0": second})
	installDir := filepath.Join(t.TempDir(), "bin")
	run := func(version string) string {
		t.Helper()
		output, err := runPowerShellInstaller(t, fixture.server.URL, map[string]string{
			"DOCU_DOCU_INSTALL_DIR":    installDir,
			"DOCU_DOCU_NO_MODIFY_PATH": "1",
			"DOCU_DOCU_VERSION":        version,
		})
		if err != nil {
			t.Fatalf("install %s: %v\n%s", version, err, output)
		}
		return output
	}
	run("1.0.0")
	if output := run("1.0.0"); !strings.Contains(output, "already installed") {
		t.Fatalf("repeat was not a no-op: %q", output)
	}
	run("2.0.0")
	run("1.0.0")
	target := filepath.Join(installDir, "docu-docu.exe")
	output, err := exec.Command(target, "version").CombinedOutput()
	if err != nil || strings.TrimSpace(string(output)) != "1.0.0" {
		t.Fatalf("downgraded version: err=%v output=%q", err, output)
	}
}

func buildWindowsInstallerFixtureBinary(t *testing.T, version string) []byte {
	t.Helper()
	temp := t.TempDir()
	source := []byte("package main\nimport (\"fmt\"; \"os\")\nfunc main(){if len(os.Args)==2 && os.Args[1]==\"version\"{fmt.Println(\"" + version + "\"); return}; os.Exit(2)}\n")
	if err := os.WriteFile(filepath.Join(temp, "main.go"), source, 0o600); err != nil {
		t.Fatal(err)
	}
	binaryPath := filepath.Join(temp, "fixture.exe")
	command := exec.Command("go", "build", "-o", binaryPath, "main.go")
	command.Dir = temp
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("build fixture: %v\n%s", err, output)
	}
	binary, err := os.ReadFile(binaryPath)
	if err != nil {
		t.Fatal(err)
	}
	return binary
}

func runPowerShellInstaller(t *testing.T, serverURL string, overrides map[string]string) (string, error) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join("..", "..", "scripts", "install.ps1"))
	if err != nil {
		t.Fatal(err)
	}
	script := strings.ReplaceAll(string(content), "https://github.com/$Repository", serverURL)
	scriptPath := filepath.Join(t.TempDir(), "install.ps1")
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}
	shell := "pwsh"
	if _, err := exec.LookPath(shell); err != nil {
		shell = "powershell"
	}
	values := map[string]string{
		"OS":                       "Windows_NT",
		"PROCESSOR_ARCHITECTURE":   "AMD64",
		"PROCESSOR_ARCHITEW6432":   "",
		"DOCU_DOCU_VERSION":        "",
		"DOCU_DOCU_NO_MODIFY_PATH": "1",
	}
	for key, value := range overrides {
		values[key] = value
	}
	for key, value := range values {
		t.Setenv(key, value)
	}
	command := exec.Command(shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath)
	output, err := command.CombinedOutput()
	return string(output), err
}

func windowsContainsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
