package docgent

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func serveTestOptions(t *testing.T) (Options, string) {
	t.Helper()
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	writeTestFile(t, docs, "index.md", "# Серверный проект\n\nПервая версия.\n")
	return Options{
		Command:         "serve",
		InputDirectory:  docs,
		OutputDirectory: filepath.Join(root, "site"),
		RepositoryRoot:  root,
		RepositoryRef:   "main",
		StaleDays:       0,
		Clean:           true,
		Host:            "127.0.0.1",
		Port:            8080,
	}, docs
}

func TestServeArguments(t *testing.T) {
	options, _, _, err := ParseArguments([]string{"serve", "./docs", "--host", "0.0.0.0", "--port=9090"})
	if err != nil {
		t.Fatal(err)
	}
	if options.Command != "serve" || options.Host != "0.0.0.0" || options.Port != 9090 {
		t.Fatalf("options: %#v", options)
	}

	defaults, _, _, err := ParseArguments([]string{"serve", "./docs"})
	if err != nil {
		t.Fatal(err)
	}
	if defaults.Host != "127.0.0.1" || defaults.Port != 8080 {
		t.Fatalf("defaults: %#v", defaults)
	}

	for _, args := range [][]string{
		{"serve", "./docs", "--host="},
		{"serve", "./docs", "--port", "0"},
		{"serve", "./docs", "--port", "65536"},
		{"check", "./docs", "--host", "127.0.0.1"},
		{"build", "./docs", "--port", "8080"},
	} {
		if _, _, _, err := ParseArguments(args); err == nil {
			t.Fatalf("expected arguments to fail: %#v", args)
		}
	}
}

func TestDocumentationServerServesAndRebuilds(t *testing.T) {
	options, docs := serveTestOptions(t)
	var stderr strings.Builder
	handler, _, _, err := newDocumentationServer(options, &stderr)
	if err != nil {
		t.Fatal(err)
	}

	assertRequestContains := func(method, target, expected string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(method, target, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("%s %s: status=%d body=%s stderr=%s", method, target, response.Code, response.Body.String(), stderr.String())
		}
		if expected != "" && !strings.Contains(response.Body.String(), expected) {
			t.Fatalf("%s %s does not contain %q", method, target, expected)
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s %s is cacheable", method, target)
		}
		return response
	}

	assertRequestContains(http.MethodGet, "/", "Первая версия.")
	assertRequestContains(http.MethodHead, "/", "")
	assertRequestContains(http.MethodGet, "/assets/style.css", "font-family")
	assertRequestContains(http.MethodGet, "/report.json", `"schemaVersion": 2`)

	writeTestFile(t, docs, "index.md", "# Серверный проект\n\nВторая версия после обновления.\n")
	assertRequestContains(http.MethodGet, "/", "Вторая версия после обновления.")
}

func TestDocumentationServerDoesNotExposeSourceOrPartialBuild(t *testing.T) {
	options, docs := serveTestOptions(t)
	var stderr strings.Builder
	handler, _, _, err := newDocumentationServer(options, &stderr)
	if err != nil {
		t.Fatal(err)
	}

	sourceRequest := httptest.NewRequest(http.MethodGet, "http://example.test/../docs/index.md", nil)
	sourceResponse := httptest.NewRecorder()
	handler.ServeHTTP(sourceResponse, sourceRequest)
	if sourceResponse.Code == http.StatusOK || strings.Contains(sourceResponse.Body.String(), "Первая версия.") {
		t.Fatalf("source file escaped output root: status=%d body=%s", sourceResponse.Code, sourceResponse.Body.String())
	}

	if err := os.RemoveAll(docs); err != nil {
		t.Fatal(err)
	}
	failedRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	failedResponse := httptest.NewRecorder()
	handler.ServeHTTP(failedResponse, failedRequest)
	if failedResponse.Code != http.StatusInternalServerError || !strings.Contains(failedResponse.Body.String(), "Не удалось пересобрать документацию") {
		t.Fatalf("status=%d body=%s", failedResponse.Code, failedResponse.Body.String())
	}
}

func TestDocumentationServerSerializesConcurrentRequests(t *testing.T) {
	options, _ := serveTestOptions(t)
	handler, _, _, err := newDocumentationServer(options, &strings.Builder{})
	if err != nil {
		t.Fatal(err)
	}

	var wait sync.WaitGroup
	for i := 0; i < 12; i++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			target := "/assets/style.css"
			if index%2 == 0 {
				target = "/"
			}
			request := httptest.NewRequest(http.MethodGet, target, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Errorf("%s: status=%d body=%s", target, response.Code, response.Body.String())
			}
		}(i)
	}
	wait.Wait()
}

func TestBrowserURLAndNetworkWarning(t *testing.T) {
	if got := browserURL("0.0.0.0", 8080); got != "http://127.0.0.1:8080/" {
		t.Fatalf("browser URL: %s", got)
	}
	if got := browserURL("::1", 8080); got != "http://[::1]:8080/" {
		t.Fatalf("IPv6 browser URL: %s", got)
	}
	if externallyReachableHost("127.0.0.1") || externallyReachableHost("::1") || externallyReachableHost("localhost") {
		t.Fatal("loopback host marked as externally reachable")
	}
	if !externallyReachableHost("0.0.0.0") || !externallyReachableHost("192.168.1.10") {
		t.Fatal("network host not marked as externally reachable")
	}
}
