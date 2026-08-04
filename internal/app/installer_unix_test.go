//go:build !windows

package docudocu

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func installerReleasePath(requestPath string) (selector, file string, ok bool) {
	parts := strings.Split(strings.Trim(requestPath, "/"), "/")
	if len(parts) == 4 && parts[0] == "releases" && parts[1] == "latest" && parts[2] == "download" {
		return "latest", parts[3], true
	}
	if len(parts) == 4 && parts[0] == "releases" && parts[1] == "download" {
		return parts[2], parts[3], true
	}
	return "", "", false
}

func installerFixtureBinary(version string) []byte {
	return []byte("#!/bin/sh\nif [ \"${1:-}\" = version ]; then printf '%s\\n' " + version + "; else exit 2; fi\n")
}

func TestInstallerPlatformContract(t *testing.T) {
	cases := []struct {
		name, osName, archName, asset string
	}{
		{"linux-amd64", "Linux", "x86_64", "docu-docu-linux-amd64"},
		{"linux-arm64", "Linux", "aarch64", "docu-docu-linux-arm64"},
		{"darwin-amd64", "Darwin", "x86_64", "docu-docu-darwin-amd64"},
		{"darwin-arm64", "Darwin", "arm64", "docu-docu-darwin-arm64"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			fixture := newPlatformInstallerFixture(t, "0.0.1", test.asset)
			installDir := filepath.Join(t.TempDir(), "bin")
			output, err := runPOSIXInstaller(t, fixture.server.URL, test.osName, test.archName, map[string]string{
				"DOCU_DOCU_INSTALL_DIR":    installDir,
				"DOCU_DOCU_NO_MODIFY_PATH": "1",
			})
			if err != nil {
				t.Fatalf("installer failed: %v\n%s", err, output)
			}
			if _, err := os.Stat(filepath.Join(installDir, "docu-docu")); err != nil {
				t.Fatalf("installed binary: %v", err)
			}
			if !containsExactString(fixture.paths(), "/releases/latest/download/"+test.asset) {
				t.Fatalf("requests=%v, missing asset %s", fixture.paths(), test.asset)
			}
		})
	}

	for _, test := range []struct{ osName, archName string }{{"Plan9", "x86_64"}, {"Linux", "386"}} {
		fixture := newPlatformInstallerFixture(t, "0.0.1", "docu-docu-linux-amd64")
		output, err := runPOSIXInstaller(t, fixture.server.URL, test.osName, test.archName, map[string]string{
			"DOCU_DOCU_INSTALL_DIR": filepath.Join(t.TempDir(), "bin"),
		})
		if err == nil || !strings.Contains(output, "unsupported") {
			t.Fatalf("unsupported %s/%s: err=%v output=%q", test.osName, test.archName, err, output)
		}
		if len(fixture.paths()) != 0 {
			t.Fatalf("unsupported platform made requests: %v", fixture.paths())
		}
	}
}

func TestInstallerSelectionAndPathContract(t *testing.T) {
	fixture := newPlatformInstallerFixture(t, "0.0.1", "docu-docu-linux-amd64")
	home := t.TempDir()
	output, err := runPOSIXInstaller(t, fixture.server.URL, "Linux", "x86_64", map[string]string{
		"HOME":  home,
		"SHELL": "/bin/bash",
	})
	if err != nil {
		t.Fatalf("latest install failed: %v\n%s", err, output)
	}
	profile, err := os.ReadFile(filepath.Join(home, ".bashrc"))
	if err != nil || strings.Count(string(profile), "# docu-docu installer") != 1 {
		t.Fatalf("managed bash PATH entry: err=%v profile=%q", err, profile)
	}
	if !containsExactString(fixture.paths(), "/releases/latest/download/checksums.txt") {
		t.Fatalf("latest URL not used: %v", fixture.paths())
	}

	pinned := newPlatformInstallerFixture(t, "0.0.1", "docu-docu-linux-amd64")
	customHome := t.TempDir()
	customInstall := filepath.Join(customHome, "custom-bin")
	output, err = runPOSIXInstaller(t, pinned.server.URL, "Linux", "x86_64", map[string]string{
		"HOME":                     customHome,
		"SHELL":                    "/bin/bash",
		"DOCU_DOCU_VERSION":        "0.0.1",
		"DOCU_DOCU_INSTALL_DIR":    customInstall,
		"DOCU_DOCU_NO_MODIFY_PATH": "0",
	})
	if err != nil {
		t.Fatalf("pinned install failed: %v\n%s", err, output)
	}
	if !containsExactString(pinned.paths(), "/releases/download/0.0.1/checksums.txt") {
		t.Fatalf("pinned URL not used: %v", pinned.paths())
	}
	if _, err := os.Stat(filepath.Join(customHome, ".bashrc")); !os.IsNotExist(err) {
		t.Fatalf("custom install changed profile: %v", err)
	}
	if !strings.Contains(output, "Add "+customInstall+" to PATH") {
		t.Fatalf("custom PATH guidance missing: %q", output)
	}

	invalid := newPlatformInstallerFixture(t, "0.0.1", "docu-docu-linux-amd64")
	output, err = runPOSIXInstaller(t, invalid.server.URL, "Linux", "x86_64", map[string]string{
		"DOCU_DOCU_VERSION":     "v0.0.1",
		"DOCU_DOCU_INSTALL_DIR": filepath.Join(t.TempDir(), "bin"),
	})
	if err == nil || !strings.Contains(output, "latest or X.Y.Z") || len(invalid.paths()) != 0 {
		t.Fatalf("invalid version: err=%v output=%q requests=%v", err, output, invalid.paths())
	}
}

func TestInstallerIntegrityAndReplacement(t *testing.T) {
	installDir := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(installDir, "docu-docu")
	if err := os.WriteFile(target, []byte("previous"), 0o755); err != nil {
		t.Fatal(err)
	}

	bad := newPlatformInstallerFixture(t, "0.0.1", "docu-docu-linux-amd64")
	bad.badChecksum = true
	output, err := runPOSIXInstaller(t, bad.server.URL, "Linux", "x86_64", map[string]string{
		"DOCU_DOCU_INSTALL_DIR": installDir,
		"DOCU_DOCU_VERSION":     "0.0.1",
	})
	if err == nil || !strings.Contains(output, "SHA-256 mismatch") {
		t.Fatalf("checksum mismatch: err=%v output=%q", err, output)
	}
	assertFileContent(t, target, "previous")

	mismatch := newPlatformInstallerFixture(t, "0.0.2", "docu-docu-linux-amd64")
	output, err = runPOSIXInstaller(t, mismatch.server.URL, "Linux", "x86_64", map[string]string{
		"DOCU_DOCU_INSTALL_DIR": installDir,
		"DOCU_DOCU_VERSION":     "0.0.1",
	})
	if err == nil || !strings.Contains(output, "reported 0.0.2, expected 0.0.1") {
		t.Fatalf("version mismatch: err=%v output=%q", err, output)
	}
	assertFileContent(t, target, "previous")

	valid := newPlatformInstallerFixture(t, "0.0.1", "docu-docu-linux-amd64")
	output, err = runPOSIXInstaller(t, valid.server.URL, "Linux", "x86_64", map[string]string{
		"DOCU_DOCU_INSTALL_DIR": installDir,
		"DOCU_DOCU_VERSION":     "0.0.1",
	})
	if err != nil {
		t.Fatalf("valid replacement: %v\n%s", err, output)
	}
	assertFileContent(t, target, string(installerFixtureBinary("0.0.1")))
}

func TestInstallerRepeatUpgradeDowngradeAndPath(t *testing.T) {
	home := t.TempDir()
	fixture := newVersionedPlatformInstallerFixture(t, map[string]string{"1.0.0": "1.0.0", "2.0.0": "2.0.0"}, "docu-docu-linux-amd64")
	run := func(version string) string {
		t.Helper()
		output, err := runPOSIXInstaller(t, fixture.server.URL, "Linux", "x86_64", map[string]string{
			"HOME":              home,
			"SHELL":             "/bin/bash",
			"DOCU_DOCU_VERSION": version,
		})
		if err != nil {
			t.Fatalf("install %s: %v\n%s", version, err, output)
		}
		return output
	}

	run("1.0.0")
	target := filepath.Join(home, ".local", "bin", "docu-docu")
	before, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if output := run("1.0.0"); !strings.Contains(output, "already installed") {
		t.Fatalf("repeat was not a no-op: %q", output)
	}
	after, err := os.Stat(target)
	if err != nil || !os.SameFile(before, after) {
		t.Fatalf("repeat replaced target: err=%v", err)
	}
	run("2.0.0")
	assertFileContent(t, target, string(installerFixtureBinary("2.0.0")))
	run("1.0.0")
	assertFileContent(t, target, string(installerFixtureBinary("1.0.0")))

	profile, err := os.ReadFile(filepath.Join(home, ".bashrc"))
	if err != nil || strings.Count(string(profile), "# docu-docu installer") != 1 {
		t.Fatalf("PATH entry is not idempotent: err=%v profile=%q", err, profile)
	}
}

type platformInstallerFixture struct {
	server      *httptest.Server
	mu          sync.Mutex
	requested   []string
	versions    map[string]string
	asset       string
	badChecksum bool
}

func newPlatformInstallerFixture(t *testing.T, version, asset string) *platformInstallerFixture {
	t.Helper()
	return newVersionedPlatformInstallerFixture(t, map[string]string{"latest": version, "0.0.1": version}, asset)
}

func newVersionedPlatformInstallerFixture(t *testing.T, versions map[string]string, asset string) *platformInstallerFixture {
	t.Helper()
	fixture := &platformInstallerFixture{versions: versions, asset: asset}
	fixture.server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		fixture.mu.Lock()
		fixture.requested = append(fixture.requested, request.URL.Path)
		fixture.mu.Unlock()
		selector, file, ok := installerReleasePath(request.URL.Path)
		version, exists := fixture.versions[selector]
		if !ok || !exists {
			http.NotFound(response, request)
			return
		}
		binary := installerFixtureBinary(version)
		switch file {
		case "checksums.txt":
			digest := fmt.Sprintf("%x", sha256.Sum256(binary))
			if fixture.badChecksum {
				digest = strings.Repeat("0", 64)
			}
			fmt.Fprintf(response, "%s  %s\n", digest, fixture.asset)
		case fixture.asset:
			_, _ = response.Write(binary)
		default:
			http.NotFound(response, request)
		}
	}))
	t.Cleanup(fixture.server.Close)
	return fixture
}

func (f *platformInstallerFixture) paths() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.requested...)
}

func runPOSIXInstaller(t *testing.T, serverURL, osName, archName string, overrides map[string]string) (string, error) {
	t.Helper()
	root := filepath.Join("..", "..")
	content, err := os.ReadFile(filepath.Join(root, "scripts", "install.sh"))
	if err != nil {
		t.Fatal(err)
	}
	script := strings.ReplaceAll(string(content), "https://github.com/$repository", serverURL)
	script = strings.ReplaceAll(script, " --proto '=https' --tlsv1.2", "")
	temp := t.TempDir()
	scriptPath := filepath.Join(temp, "install.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	fakeBin := filepath.Join(temp, "fake-bin")
	if err := os.Mkdir(fakeBin, 0o755); err != nil {
		t.Fatal(err)
	}
	uname := "#!/bin/sh\ncase \"$1\" in -s) printf '%s\\n' \"$FAKE_UNAME_S\";; -m) printf '%s\\n' \"$FAKE_UNAME_M\";; *) exit 2;; esac\n"
	if err := os.WriteFile(filepath.Join(fakeBin, "uname"), []byte(uname), 0o755); err != nil {
		t.Fatal(err)
	}
	environment := environmentWith(map[string]string{
		"FAKE_UNAME_S": osName,
		"FAKE_UNAME_M": archName,
		"PATH":         fakeBin + string(os.PathListSeparator) + os.Getenv("PATH"),
		"TMPDIR":       temp,
		"HOME":         temp,
		"SHELL":        "/bin/sh",
	})
	for key, value := range overrides {
		environment = setEnvironment(environment, key, value)
	}
	command := exec.Command("sh", scriptPath)
	command.Env = environment
	output, err := command.CombinedOutput()
	return string(output), err
}

func environmentWith(values map[string]string) []string {
	environment := os.Environ()
	for key, value := range values {
		environment = setEnvironment(environment, key, value)
	}
	return environment
}

func setEnvironment(environment []string, key, value string) []string {
	prefix := key + "="
	filtered := environment[:0]
	for _, entry := range environment {
		if !strings.HasPrefix(entry, prefix) {
			filtered = append(filtered, entry)
		}
	}
	return append(filtered, prefix+value)
}

func containsExactString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func assertFileContent(t *testing.T, path, expected string) {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != expected {
		t.Fatalf("%s=%q, want %q", path, content, expected)
	}
}

func TestInstallerScriptsArePortableText(t *testing.T) {
	for _, file := range []string{"install.sh", "install.ps1"} {
		content, err := os.ReadFile(filepath.Join("..", "..", "scripts", file))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(content), "\r\n") {
			t.Errorf("%s contains CRLF", file)
		}
	}
	if runtime.GOOS == "windows" {
		t.Fatal("unix installer tests must not run on Windows")
	}
}
