# Third-party notices

## CodeMirror 6

The serve-only editor bundles `codemirror@6.0.2`,
`@codemirror/lang-markdown@6.5.1`, `@codemirror/lang-json@6.0.2`,
`@codemirror/lang-yaml@6.1.3`, `@codemirror/lint@6.9.7`,
`@codemirror/merge@6.12.2` and their CodeMirror /
Lezer transitive packages under the MIT License. The complete license notice is
embedded as `assets/codemirror.LICENSE.txt`; release checksums are embedded as
`assets/codemirror.checksums.txt`. Node.js is used only to rebuild the vendored
IIFE bundle and is not a Go or end-user runtime dependency.

## go.yaml.in/yaml/v3

- Package: `go.yaml.in/yaml/v3`
- Version: `v3.0.5`
- Source: <https://go.yaml.in/yaml/v3>
- License: Apache-2.0 and MIT

The package parses OpenAPI YAML for deterministic semantic comparison. It is
linked into the Docgent binary and does not execute input or require a runtime
service.

## Mermaid Tiny

- Package: `@mermaid-js/tiny`
- Version: `11.16.0`
- Source: <https://www.npmjs.com/package/@mermaid-js/tiny/v/11.16.0>
- License: MIT
- Embedded file: `assets/mermaid.tiny.js`
- SHA-256: `a1bc2282b3d935693780f77931382c517e72eb72ff3427752cbb29941de11bee`

The complete license text is stored in `assets/mermaid.LICENSE.txt` and copied
into every generated portal next to the embedded library. Release packaging
also includes this notice and `MERMAID-LICENSE.txt`.
