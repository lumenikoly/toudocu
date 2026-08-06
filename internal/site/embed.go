// Package site owns the browser-facing rendering contract and generated assets.
// It deliberately does not import the application/model package.
package site

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"sync"
)

// Files contains only reproducible frontend build output.
//
//go:embed assets/generated/*
var Files embed.FS

type Asset struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
}

type AssetManifest struct {
	SchemaVersion int                 `json:"schemaVersion"`
	Assets        map[string]Asset    `json:"assets"`
	Runtimes      map[string][]string `json:"runtimes"`
}

var (
	manifestOnce sync.Once
	manifestData AssetManifest
	manifestErr  error
)

func Manifest() (AssetManifest, error) {
	manifestOnce.Do(func() {
		content, err := Files.ReadFile("assets/generated/manifest.json")
		if err != nil {
			manifestErr = err
			return
		}
		if err = json.Unmarshal(content, &manifestData); err != nil {
			manifestErr = fmt.Errorf("parse frontend manifest: %w", err)
			return
		}
		if manifestData.SchemaVersion != 1 || len(manifestData.Assets) == 0 {
			manifestErr = fmt.Errorf("unsupported or empty frontend manifest")
		}
	})
	return manifestData, manifestErr
}

func AssetName(logical string) (string, error) {
	manifest, err := Manifest()
	if err != nil {
		return "", err
	}
	asset, ok := manifest.Assets[logical]
	if !ok || asset.File == "" {
		return "", fmt.Errorf("frontend asset %q is not declared", logical)
	}
	return asset.File, nil
}

func RuntimeAssets(runtime string) ([]string, error) {
	manifest, err := Manifest()
	if err != nil {
		return nil, err
	}
	assets, ok := manifest.Runtimes[runtime]
	if !ok {
		return nil, fmt.Errorf("frontend runtime %q is not declared", runtime)
	}
	return append([]string(nil), assets...), nil
}

func GeneratedFS() (fs.FS, error) {
	return fs.Sub(Files, "assets/generated")
}
