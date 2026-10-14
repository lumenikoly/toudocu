# Build and serve

Use only for requested builds/previews or necessary verification. Follow
`SKILL.md` root/output conventions. Builds write generated output, not source.
Select a dedicated disposable directory if the project defines none. Add
`--clean` only after verifying the resolved output is not the input, its ancestor,
a system root or an unsafe symlink target. Never edit generated portal files.

Screen documents enable catalog, Screen Map, playable flows and traceability.
`--no-screen-map` omits only the interactive map page, not documents or JSON.

Serve on `127.0.0.1` by default: no TLS/authentication. Explicit browser save,
create and roadmap-add actions can modify canonical files. A first canonical
request may query GitHub's stable-release metadata; use `--no-update-check` when
outbound requests are outside the preview. `--host 0.0.0.0` requires an explicitly
requested trusted local-network preview. Serve never runs task checks.

Keep build/server logs outside context, exposing progress and relevant failures.
Do not load generated `report.json` to rediscover source documentation. Report
the output path/URL, validation outcome and remaining limitations.
