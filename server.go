package docgent

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

const rebuildEndpoint = "/__docgent/rebuild"

type documentationServer struct {
	options     Options
	fileHandler http.Handler
	stderr      io.Writer
	mu          sync.Mutex
}

func newDocumentationServer(options Options, stderr io.Writer) (*documentationServer, *Model, GenerateResult, error) {
	server := &documentationServer{
		options:     options,
		fileHandler: http.FileServer(http.Dir(options.OutputDirectory)),
		stderr:      stderr,
	}
	model, result, err := server.rebuild()
	if err != nil {
		return nil, nil, GenerateResult{}, err
	}
	return server, model, result, nil
}

func (s *documentationServer) rebuild() (*Model, GenerateResult, error) {
	model, err := BuildDocumentationModel(s.options)
	if err != nil {
		return nil, GenerateResult{}, err
	}
	result, err := GenerateSite(model, s.options)
	if err != nil {
		return nil, GenerateResult{}, err
	}
	return model, result, nil
}

func requestNeedsRebuild(requestPath string) bool {
	return requestPath == "/" || strings.HasSuffix(requestPath, "/") || strings.EqualFold(path.Ext(requestPath), ".html")
}

func (s *documentationServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	s.mu.Lock()
	defer s.mu.Unlock()

	if r.URL.Path == rebuildEndpoint {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get("X-Docgent-Action") != "rebuild" {
			http.Error(w, "Запрос на пересборку отклонён", http.StatusForbidden)
			return
		}
		model, result, err := s.rebuild()
		if err != nil {
			fmt.Fprintln(s.stderr, "Не удалось пересобрать документацию:", err)
			http.Error(w, "Не удалось пересобрать документацию: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if err := json.NewEncoder(w).Encode(map[string]int{
			"documents": model.Stats.Documents,
			"errors":    model.Stats.Errors,
			"pages":     result.Pages,
			"warnings":  model.Stats.Warnings,
		}); err != nil {
			fmt.Fprintln(s.stderr, "Не удалось отправить результат пересборки:", err)
		}
		return
	}

	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && requestNeedsRebuild(r.URL.Path) {
		if _, _, err := s.rebuild(); err != nil {
			fmt.Fprintln(s.stderr, "Не удалось пересобрать документацию:", err)
			http.Error(w, "Не удалось пересобрать документацию: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	s.fileHandler.ServeHTTP(w, r)
}

func browserURL(host string, port int) string {
	if host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return "http://" + net.JoinHostPort(host, strconv.Itoa(port)) + "/"
}

func externallyReachableHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return false
	}
	ip := net.ParseIP(host)
	return ip == nil || !ip.IsLoopback()
}

func serveDocumentation(options Options, stdout, stderr io.Writer) error {
	handler, model, result, err := newDocumentationServer(options, stderr)
	if err != nil {
		return err
	}
	address := net.JoinHostPort(options.Host, strconv.Itoa(options.Port))
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	defer listener.Close()

	localURL := browserURL(options.Host, options.Port)
	fmt.Fprintf(stdout, "\nСервер документации запущен.\nАдрес:          %s\nКаталог:        %s\nСтраниц:        %d\nДокументов:     %d\nПредупреждений: %d\nОшибок:         %d\n", localURL, result.OutputDirectory, result.Pages, model.Stats.Documents, model.Stats.Warnings, model.Stats.Errors)
	if externallyReachableHost(options.Host) {
		fmt.Fprintf(stdout, "Локальная сеть: http://<IP-адрес-компьютера>:%d/\nВнимание: сервер доступен из сети без авторизации и TLS.\n", options.Port)
	}
	if options.Open {
		if err := openGeneratedSite(localURL); err != nil {
			fmt.Fprintln(stderr, "Не удалось открыть браузер автоматически:", err)
		}
	}

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	err = server.Serve(listener)
	if err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}
