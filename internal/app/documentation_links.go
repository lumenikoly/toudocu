package docudocu

import (
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

var activeAssetExtensions = map[string]struct{}{".html": {}, ".htm": {}, ".xhtml": {}, ".js": {}, ".mjs": {}, ".cjs": {}, ".svg": {}, ".svgz": {}, ".xml": {}}
var safeImageExtensions = map[string]struct{}{".png": {}, ".jpg": {}, ".jpeg": {}, ".gif": {}, ".webp": {}, ".avif": {}, ".bmp": {}}
var reservedOutputAssets = map[string]struct{}{
	"assets/manifest.json": {}, "assets/portal.css": {}, "assets/portal.js": {},
	"assets/screen-map.css": {}, "assets/screen-map.js": {},
	"assets/playable-flow.css": {}, "assets/playable-flow.js": {},
	"assets/mermaid.tiny.js": {}, "assets/mermaid.LICENSE.txt": {}, "assets/favicon.svg": {},
	"assets/serve.css": {}, "assets/serve.js": {}, "assets/editor.css": {}, "assets/editor.js": {},
	"assets/changes.css": {}, "assets/changes.js": {}, "assets/api-docs.js": {},
	"assets/swagger-ui.css": {}, "assets/swagger-ui-bundle.js": {}, "assets/swagger-ui-standalone-preset.js": {},
	"assets/codemirror.js": {}, "assets/codemirror.LICENSE.txt": {}, "assets/codemirror.checksums.txt": {},
	"data/search-index.json": {}, "data/navigation.json": {}, "data/relations.json": {},
	"data/screens.json": {}, "data/use-cases/index.json": {}, "report.json": {},
}

func splitLinkDestination(destination string) (pathPart, query, hash string) {
	text := strings.TrimSpace(destination)
	hashIndex := strings.Index(text, "#")
	if hashIndex >= 0 {
		hash = text[hashIndex:]
		text = text[:hashIndex]
	}
	queryIndex := strings.Index(text, "?")
	if queryIndex >= 0 {
		query = text[queryIndex:]
		text = text[:queryIndex]
	}
	return text, query, hash
}

func decodePathSafely(value string) string {
	decoded, err := url.PathUnescape(value)
	if err != nil {
		return value
	}
	return decoded
}

func isExternalDestination(destination string) bool {
	if strings.HasPrefix(destination, "//") {
		return true
	}
	return destinationHasScheme(destination)
}

func destinationHasScheme(destination string) bool {
	for index, character := range destination {
		if index == 0 && !((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z')) {
			return false
		}
		if character == ':' {
			return true
		}
		if !((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character == '+' || character == '.' || character == '-') {
			return false
		}
	}
	return false
}

func allowedExternalProtocol(destination string) bool {
	lower := strings.ToLower(destination)
	return strings.HasPrefix(lower, "http:") || strings.HasPrefix(lower, "https:") || strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "tel:") || strings.HasPrefix(destination, "//")
}

func findDirectoryIndexTarget(model *Model, normalizedTarget string) (*Document, string) {
	withIndex := path.Join(normalizedTarget, "index.md")
	if document := model.DocByPath[withIndex]; document != nil {
		return document, ""
	}
	if _, exists := model.Directories[normalizedTarget]; exists {
		return nil, path.Join(normalizedTarget, "index.html")
	}
	return nil, ""
}

func anchorExists(document *Document, hash string) bool {
	if hash == "" || hash == "#" {
		return true
	}
	decoded := decodePathSafely(strings.TrimPrefix(hash, "#"))
	candidate := slugify(decoded)
	for _, heading := range document.Headings {
		if heading.ID == decoded || heading.ID == candidate {
			return true
		}
	}
	return false
}

func resolveLocalLink(model *Model, sourceDocument *Document, link Link) ResolvedLink {
	result := ResolvedLink{Link: link, Href: link.Destination}
	destination := strings.TrimSpace(link.Destination)
	if destination == "" {
		result.Href = "#"
		return result
	}
	if isExternalDestination(destination) {
		result.External = true
		if !allowedExternalProtocol(destination) {
			result.Blocked = true
			result.Href = "#"
		}
		return result
	}
	pathPart, query, hash := splitLinkDestination(destination)
	if pathPart == "" && hash != "" {
		result.Href = hash
		result.Broken = !anchorExists(sourceDocument, hash)
		result.BrokenAnchor = result.Broken
		result.TargetDocument = sourceDocument
		return result
	}
	if strings.HasPrefix(pathPart, "/") || strings.HasPrefix(pathPart, `\`) {
		result.Blocked = true
		result.Href = "#"
		return result
	}
	decodedPath := normalizeSlashes(decodePathSafely(pathPart))
	absoluteTarget := filepath.Clean(filepath.Join(filepath.Dir(sourceDocument.AbsolutePath), filepath.FromSlash(decodedPath)))
	if !ensureInside(model.RepositoryRoot, absoluteTarget) {
		result.Blocked = true
		result.RepositoryEscape = true
		result.Href = "#"
		return result
	}
	if !ensureInside(model.RootDirectory, absoluteTarget) {
		result.RepositoryPath = toPosixRelative(model.RepositoryRoot, absoluteTarget)
		info, err := os.Stat(absoluteTarget)
		if err != nil {
			result.Broken = true
			return result
		}
		if link.Image || model.RepositoryURL == "" {
			result.Blocked = true
			result.RepositoryAsset = true
			result.Href = "#"
			return result
		}
		kind := "blob"
		if info.IsDir() {
			kind = "tree"
		}
		result.RepositoryKind = kind
		result.External = true
		result.Href = fmt.Sprintf("%s/%s/%s/%s%s%s", model.RepositoryURL, kind, url.PathEscape(model.RepositoryRef), encodePathSegments(result.RepositoryPath), query, hash)
		return result
	}
	targetPath := toPosixRelative(model.RootDirectory, absoluteTarget)
	extension := strings.ToLower(path.Ext(targetPath))
	var targetDocument *Document
	generatedTarget := ""
	if strings.HasSuffix(decodedPath, "/") {
		targetDocument, generatedTarget = findDirectoryIndexTarget(model, strings.TrimSuffix(targetPath, "/"))
	} else if extension == ".md" {
		targetDocument = model.DocByPath[targetPath]
	} else if extension == "" {
		if exact := model.DocByPath[targetPath]; exact != nil {
			targetDocument = exact
		} else if md := model.DocByPath[targetPath+".md"]; md != nil {
			targetDocument = md
		} else {
			targetDocument, generatedTarget = findDirectoryIndexTarget(model, targetPath)
		}
	}
	if targetDocument != nil {
		result.TargetDocument = targetDocument
		result.BrokenAnchor = hash != "" && !anchorExists(targetDocument, hash)
		result.Broken = result.BrokenAnchor
		result.Href = relativeURL(sourceDocument.OutputPath, targetDocument.OutputPath) + query + hash
		return result
	}
	if generatedTarget != "" {
		result.GeneratedTarget = generatedTarget
		result.Href = relativeURL(sourceDocument.OutputPath, generatedTarget) + query + hash
		return result
	}
	info, err := os.Stat(absoluteTarget)
	if err != nil || !info.Mode().IsRegular() {
		result.Broken = true
		return result
	}
	if _, active := activeAssetExtensions[extension]; active {
		result.Blocked = true
		result.ActiveAsset = true
		result.Href = "#"
		return result
	}
	if link.Image {
		if _, safe := safeImageExtensions[extension]; !safe {
			result.Blocked = true
			result.UnsafeImage = true
			result.Href = "#"
			return result
		}
	}
	outputAssetPath := targetPath
	if _, reserved := reservedOutputAssets[targetPath]; reserved {
		outputAssetPath = path.Join("_files", targetPath)
	}
	model.Assets[outputAssetPath] = absoluteTarget
	result.AssetPath = outputAssetPath
	result.Href = relativeURL(sourceDocument.OutputPath, outputAssetPath) + query + hash
	return result
}

func resolveLinks(model *Model) {
	pairs := map[string]struct{}{}
	for _, document := range model.Documents {
		for _, link := range document.Links {
			resolved := resolveLocalLink(model, document, link)
			document.ResolvedLinks = append(document.ResolvedLinks, resolved)
			if resolved.Blocked {
				reason := "Небезопасная ссылка заблокирована."
				switch {
				case resolved.ActiveAsset:
					reason = "Ссылка на активный HTML/JavaScript-файл заблокирована."
				case resolved.UnsafeImage:
					reason = "Формат изображения не разрешён для безопасного встраивания."
				case resolved.RepositoryAsset:
					reason = "Ресурс за пределами документации нельзя встраивать или открыть без repository URL."
				}
				severity := "warning"
				if document.Type == "architecture" {
					severity = "error"
				}
				addDocumentIssue(model, document, newIssue(severity, "blocked-link", reason, document.SourcePath, link.Line+1))
			} else if resolved.Broken {
				suffix := ""
				if resolved.BrokenAnchor {
					suffix = " (не найден якорь)"
				}
				severity := "warning"
				if document.Type == "architecture" {
					severity = "error"
				}
				addDocumentIssue(model, document, newIssue(severity, "broken-link", "Неработающая ссылка: "+link.Destination+suffix, document.SourcePath, link.Line+1))
			}
			if resolved.TargetDocument != nil && resolved.TargetDocument != document && !link.Image {
				key := document.SourcePath + "->" + resolved.TargetDocument.SourcePath
				if _, exists := pairs[key]; !exists {
					pairs[key] = struct{}{}
					resolved.TargetDocument.Backlinks = append(resolved.TargetDocument.Backlinks, document)
					document.RelatedDocuments = append(document.RelatedDocuments, resolved.TargetDocument)
				}
			}
		}
	}
}

func linkResolverFor(model *Model, document *Document) LinkResolver {
	return func(destination string, image bool, title string) LinkResolution {
		for _, resolved := range document.ResolvedLinks {
			if resolved.Destination == destination && resolved.Image == image {
				return LinkResolution{Href: resolved.Href, External: resolved.External, Broken: resolved.Broken, Blocked: resolved.Blocked}
			}
		}
		resolved := resolveLocalLink(model, document, Link{Destination: destination, Image: image, Title: title})
		return LinkResolution{Href: resolved.Href, External: resolved.External, Broken: resolved.Broken, Blocked: resolved.Blocked}
	}
}

func connectUseCasesAndModules(model *Model) {
	modules := model.Collections["module"]
	useCases := model.Collections["use-case"]
	moduleByName := map[string]*Document{}
	for _, module := range modules {
		moduleByName[canonicalText(module.Title)] = module
		if module.Metadata["id"] != "" {
			moduleByName[canonicalText(module.Metadata["id"])] = module
		}
	}
	for _, useCase := range useCases {
		related := map[*Document]struct{}{}
		for _, document := range useCase.RelatedDocuments {
			if document.Type == "module" {
				related[document] = struct{}{}
			}
		}
		for _, module := range modules {
			for _, linked := range module.RelatedDocuments {
				if linked == useCase {
					related[module] = struct{}{}
				}
			}
		}
		if value := useCase.Metadata["module"]; value != "" {
			if module := moduleByName[canonicalText(value)]; module != nil {
				related[module] = struct{}{}
			}
		}
		for module := range related {
			useCase.LinkedModules = append(useCase.LinkedModules, module)
		}
		sort.SliceStable(useCase.LinkedModules, func(i, j int) bool { return documentLess(useCase.LinkedModules[i], useCase.LinkedModules[j]) })
		for _, module := range useCase.LinkedModules {
			found := false
			for _, linked := range module.LinkedUseCases {
				if linked == useCase {
					found = true
				}
			}
			if !found {
				module.LinkedUseCases = append(module.LinkedUseCases, useCase)
			}
		}
	}
	for _, module := range modules {
		sort.SliceStable(module.LinkedUseCases, func(i, j int) bool { return documentLess(module.LinkedUseCases[i], module.LinkedUseCases[j]) })
		if len(module.LinkedUseCases) == 0 {
			addDocumentIssue(model, module, newIssue("warning", "module-without-use-case", "Модуль не связан ни с одним пользовательским сценарием.", module.SourcePath, 0))
		}
	}
}
