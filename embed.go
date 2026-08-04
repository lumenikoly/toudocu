package docgent

import "embed"

// EmbeddedFiles contains the browser assets and starter documentation templates.
//
//go:embed assets templates/docs
var EmbeddedFiles embed.FS
