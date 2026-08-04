package docgent

import "embed"

// EmbeddedFiles contains the browser assets.
//
//go:embed assets
var EmbeddedFiles embed.FS
