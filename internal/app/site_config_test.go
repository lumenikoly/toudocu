package docudocu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func configFixture(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	docs := filepath.Join(root, "docs")
	if err := os.MkdirAll(docs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(docs, "index.md"), []byte("# Index title\n\nProject description.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return root, docs
}

func writeSiteConfig(t *testing.T, root, content string) {
	t.Helper()
	directory := filepath.Join(root, ".docu-docu")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "config.yml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func buildConfigFixture(t *testing.T, root, docs, title string) *Model {
	t.Helper()
	model, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, Title: title, StaleDays: 0})
	if err != nil {
		t.Fatal(err)
	}
	return model
}

func TestSiteConfigDefaultsAndMissingFile(t *testing.T) {
	root, docs := configFixture(t)
	model := buildConfigFixture(t, root, docs, "")
	config := model.SiteConfig
	if config.Theme != "classic" || config.ColorScheme != "system" || config.Accent != "indigo" ||
		config.Density != "comfortable" || config.ContentWidth != "standard" || !config.Hero.Enabled {
		t.Fatalf("defaults: %#v", config)
	}
	if model.Project.Title != "Index title" || config.Footer.Text != "Сгенерировано Docu-docu "+Version {
		t.Fatalf("default title/footer: %#v / %#v", model.Project, config.Footer)
	}
}

func TestChangesConfig(t *testing.T) {
	config, err := parseSiteConfig([]byte("changes:\n  defaultBaseRef: main\n  renameSimilarity: 75\n  includeAssets: false\n  semanticDiff: true\n  maxSourceDiffBytes: 2048\n  exclude:\n    - docs/generated/**\n"))
	if err != nil {
		t.Fatal(err)
	}
	if config.Changes.DefaultBaseRef != "main" || config.Changes.RenameSimilarity != 75 || config.Changes.IncludeAssets || !config.Changes.SemanticDiff || config.Changes.MaxSourceDiffBytes != 2048 || len(config.Changes.Exclude) != 1 {
		t.Fatalf("changes config: %#v", config.Changes)
	}
}

func TestTranslationProfileSelectsIndependentLocaleRoot(t *testing.T) {
	root, docs := configFixture(t)
	target := filepath.Join(root, "docs-en")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "index.md"), []byte("# English docs\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	config, err := parseSiteConfig([]byte(`project:
  locale: ru
translations:
  en:
    root: docs-en
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use Cases
      flows: Processes
      screens: Screens
      decisions: Architecture Decisions
      contracts: Contracts
      quality: Quality Standards
      runbooks: Runbooks
      reference: Reference
      work: Work Items
      guides: Guides
`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := selectTranslationProfile(&config, root, target); err != nil {
		t.Fatal(err)
	}
	if config.Project.Locale != "en" || config.Project.Sections[SectionModules] != "Modules" {
		t.Fatalf("translation project config was not selected: %#v", config.Project)
	}
	// A canonical selection is unaffected by configured translations.
	config, err = parseSiteConfig([]byte(`project:
  locale: ru
translations:
  en:
    root: docs-en
    sections:
      architecture: Architecture
`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := selectTranslationProfile(&config, root, docs); err != nil {
		t.Fatalf("canonical root must not validate incomplete translations: %v", err)
	}
}

func TestTranslationProfileRejectsUnsafeRootWhenSelected(t *testing.T) {
	root, _ := configFixture(t)
	config, err := parseSiteConfig([]byte("translations:\n  en:\n    root: ../outside\n"))
	if err != nil {
		t.Fatal(err)
	}
	// This direct safety check is also used by selection and workflow callers.
	if _, err := safeTranslationRoot(root, config.Translations["en"].Root); err == nil {
		t.Fatal("unsafe translation root accepted")
	}
}

func TestSiteConfigFullAndTitlePriority(t *testing.T) {
	root, docs := configFixture(t)
	assets := filepath.Join(root, ".docu-docu", "assets")
	if err := os.MkdirAll(assets, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"logo.svg", "favicon.svg", "hero.webp"} {
		if err := os.WriteFile(filepath.Join(assets, name), []byte("asset-"+name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	writeSiteConfig(t, root, `# fixed YAML subset
site:
  title: My Project
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: paper
  colorScheme: dark
  accent: teal
  density: compact
  contentWidth: wide
  footer:
    text: "My Project documentation"
    url: https://example.com/docs
  hero:
    enabled: true
    image: assets/hero.webp
`)
	model := buildConfigFixture(t, root, docs, "")
	if model.Project.Title != "My Project" || model.SiteConfig.Theme != "paper" ||
		model.SiteConfig.Footer.URL != "https://example.com/docs" || len(model.BrandingAssets) != 3 {
		t.Fatalf("full config: %#v / %#v", model.SiteConfig, model.BrandingAssets)
	}
	override := buildConfigFixture(t, root, docs, "CLI title")
	if override.Project.Title != "CLI title" {
		t.Fatalf("--title priority lost: %q", override.Project.Title)
	}
}

func TestSiteConfigEnums(t *testing.T) {
	tests := map[string][]string{
		"theme":        {"classic", "paper", "terminal"},
		"colorScheme":  {"light", "dark", "system"},
		"accent":       {"indigo", "blue", "teal", "green", "amber", "rose", "violet"},
		"density":      {"compact", "comfortable"},
		"contentWidth": {"narrow", "standard", "wide"},
	}
	for field, values := range tests {
		for _, value := range values {
			t.Run(field+"-"+value, func(t *testing.T) {
				config, err := parseSiteConfig([]byte("site:\n  " + field + ": " + value + "\n"))
				if err != nil {
					t.Fatal(err)
				}
				switch field {
				case "theme":
					if config.Theme != value {
						t.Fatal(config.Theme)
					}
				case "colorScheme":
					if config.ColorScheme != value {
						t.Fatal(config.ColorScheme)
					}
				case "accent":
					if config.Accent != value {
						t.Fatal(config.Accent)
					}
				case "density":
					if config.Density != value {
						t.Fatal(config.Density)
					}
				case "contentWidth":
					if config.ContentWidth != value {
						t.Fatal(config.ContentWidth)
					}
				}
			})
		}
	}
}

func TestSiteConfigRejectsInvalidYAMLSubset(t *testing.T) {
	tests := map[string]string{
		"unknown":        "site:\n  customCSS: x.css\n",
		"duplicate":      "site:\n  theme: classic\n  theme: paper\n",
		"indent":         "site:\n   theme: classic\n",
		"list":           "site:\n  theme: [classic]\n",
		"anchor":         "site:\n  theme: &base classic\n",
		"multiline":      "site:\n  title: |\n    Project\n",
		"wrong boolean":  "site:\n  hero:\n    enabled: yes\n",
		"quoted boolean": "site:\n  hero:\n    enabled: \"true\"\n",
		"wrong string":   "site:\n  title: true\n",
		"wrong enum":     "site:\n  theme: custom\n",
		"unsafe footer":  "site:\n  footer:\n    url: http://example.com\n",
	}
	for name, content := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := parseSiteConfig([]byte(content)); err == nil {
				t.Fatalf("expected error for %q", content)
			}
		})
	}
}

func TestSiteConfigRejectsUnsafeBrandAssets(t *testing.T) {
	for name, assetPath := range map[string]string{
		"absolute":  "/tmp/logo.svg",
		"traversal": "assets/../../logo.svg",
		"missing":   "assets/missing.svg",
	} {
		t.Run(name, func(t *testing.T) {
			root, docs := configFixture(t)
			writeSiteConfig(t, root, "site:\n  logo: "+assetPath+"\n")
			if _, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0}); err == nil {
				t.Fatal("expected unsafe asset error")
			}
		})
	}
}

func TestSiteConfigRejectsBrandSymlink(t *testing.T) {
	root, docs := configFixture(t)
	assets := filepath.Join(root, ".docu-docu", "assets")
	if err := os.MkdirAll(assets, 0o755); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "outside.svg")
	if err := os.WriteFile(outside, []byte("<svg/>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(assets, "logo.svg")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	writeSiteConfig(t, root, "site:\n  logo: assets/logo.svg\n")
	if _, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0}); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected symlink error, got %v", err)
	}
}

func TestSiteConfigRejectsAssetDirectorySymlinkEscape(t *testing.T) {
	root, docs := configFixture(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "logo.svg"), []byte("<svg/>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".docu-docu"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, ".docu-docu", "assets")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	writeSiteConfig(t, root, "site:\n  logo: assets/logo.svg\n")
	if _, err := BuildDocumentationModel(Options{InputDirectory: docs, RepositoryRoot: root, StaleDays: 0}); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected asset directory symlink error, got %v", err)
	}
}

func TestGenerateSiteBrandingAndThemeContract(t *testing.T) {
	root, docs := configFixture(t)
	output := filepath.Join(root, "site")
	assets := filepath.Join(root, ".docu-docu", "assets")
	if err := os.MkdirAll(assets, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"logo.svg", "favicon.svg", "hero.webp"} {
		if err := os.WriteFile(filepath.Join(assets, name), []byte(name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	writeSiteConfig(t, root, `site:
  title: Branded docs
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: terminal
  colorScheme: system
  accent: rose
  density: compact
  contentWidth: narrow
  footer:
    text: "<strong>Escaped</strong>"
    url: https://example.com
  hero:
    enabled: true
    image: assets/hero.webp
`)
	model := buildConfigFixture(t, root, docs, "")
	if _, err := GenerateSite(model, Options{OutputDirectory: output, Clean: true}); err != nil {
		t.Fatal(err)
	}
	htmlBytes, err := os.ReadFile(filepath.Join(output, "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)
	for _, part := range []string{
		`data-site-theme="terminal"`, `data-color-scheme="system"`, `data-accent="rose"`,
		`data-density="compact"`, `data-content-width="narrow"`,
		`assets/branding/logo.svg`, `assets/branding/favicon.svg`, `assets/branding/hero.webp`,
		`data-color-scheme-select`, `data-site-theme-select`, `docu-docu-site-theme`, `&lt;strong&gt;Escaped&lt;/strong&gt;`,
	} {
		if !strings.Contains(html, part) {
			t.Fatalf("missing %q", part)
		}
	}
	if strings.Contains(html, "<strong>Escaped</strong>") {
		t.Fatal("footer HTML was not escaped")
	}
	for _, name := range []string{"logo.svg", "favicon.svg", "hero.webp"} {
		if _, err := os.Stat(filepath.Join(output, "assets", "branding", name)); err != nil {
			t.Fatalf("branding asset %s not copied: %v", name, err)
		}
	}
	for _, external := range []string{`src="http://`, `src="https://`, `href="http://`} {
		if strings.Contains(html, external) {
			t.Fatalf("external resource found: %s", external)
		}
	}
}

func TestHeroCanBeDisabled(t *testing.T) {
	root, docs := configFixture(t)
	writeSiteConfig(t, root, "site:\n  hero:\n    enabled: false\n")
	model := buildConfigFixture(t, root, docs, "")
	html := renderDashboard(model)
	if strings.Contains(html, `class="hero dashboard-about"`) || strings.Contains(html, `class="hero has-image dashboard-about"`) || !strings.Contains(html, `class="page-header dashboard-about"`) {
		t.Fatalf("disabled hero rendered incorrectly")
	}
}
