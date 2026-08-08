package docudocu

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"docu-docu/internal/skillinstall"
)

const (
	versionEndpoint        = "/_docu-docu/api/version"
	latestReleaseAPI       = "https://api.github.com/repos/lumenikoly/docu-docu/releases/latest"
	releasePageBase        = "https://github.com/lumenikoly/docu-docu/releases/tag/"
	maxReleaseResponseSize = 64 << 10
)

type updateHTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

type versionCheckResponse struct {
	SchemaVersion  int    `json:"schemaVersion"`
	CurrentVersion string `json:"currentVersion"`
	Status         string `json:"status"`
	LatestVersion  string `json:"latestVersion,omitempty"`
	ReleaseURL     string `json:"releaseURL,omitempty"`
}

type githubRelease struct {
	TagName    string `json:"tag_name"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
}

type updateChecker struct {
	once     sync.Once
	client   updateHTTPClient
	endpoint string
	current  string
	result   versionCheckResponse
}

func newUpdateChecker() *updateChecker {
	return &updateChecker{
		client: &http.Client{
			Timeout: 3 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		endpoint: latestReleaseAPI,
		current:  Version,
	}
}

func unavailableVersion(current string) versionCheckResponse {
	return versionCheckResponse{SchemaVersion: 1, CurrentVersion: current, Status: "unavailable"}
}

func checkLatestVersion(client updateHTTPClient, endpoint, current string) versionCheckResponse {
	result := unavailableVersion(current)
	request, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return result
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "docu-docu/"+current)
	response, err := client.Do(request)
	if err != nil {
		return result
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return result
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxReleaseResponseSize+1))
	if err != nil || len(data) > maxReleaseResponseSize {
		return result
	}
	var release githubRelease
	if err := json.Unmarshal(data, &release); err != nil || release.Draft || release.Prerelease {
		return result
	}
	latest := strings.TrimSpace(release.TagName)
	comparison, err := skillinstall.CompareVersions(current, latest)
	if err != nil {
		return result
	}
	result.Status = "up-to-date"
	result.LatestVersion = latest
	if comparison < 0 {
		result.Status = "update-available"
		result.ReleaseURL = releasePageBase + url.PathEscape(latest)
	}
	return result
}

func (checker *updateChecker) check() versionCheckResponse {
	checker.once.Do(func() {
		checker.result = checkLatestVersion(checker.client, checker.endpoint, checker.current)
	})
	return checker.result
}

func (s *documentationServer) serveVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	result := s.updateChecker.check()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method == http.MethodHead {
		return
	}
	_ = json.NewEncoder(w).Encode(result)
}
