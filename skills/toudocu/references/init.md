# Explicit initialization

Only explicit `$toudocu init` or an unambiguous request for this workflow
permits initialization/managed guidance. No CLI init command exists; missing
files or an ordinary documentation request never imply permission.

## Preflight

1. Resolve repository policy, config, CLI/root conventions and the narrowest
   root containing docs and referenced paths; otherwise use `<root>/docs`.
2. Choose language from valid default locale, repository instructions, existing
   canonical docs, then en. Use en/ru templates for en-*/ru-*; another locale
   needs a complete project-provided 13-section title map and target-language
   prose. English guidance never determines the documentation language.
3. Inspect root AGENTS markers:
   `<!-- toudocu:project-guidance:start -->` and
   `<!-- toudocu:project-guidance:end -->`. Both must be absent or occur once in
   correct order. Missing/duplicate/reversed/nested markers or conflicting
   unmanaged trigger/language/task policy block writes and require user direction.
4. Inspect architecture before validation. Existing Markdown other than a
   structurally valid `architecture/overview.md` is legacy for this workflow:
   show compact structural diagnostics and stop, never migrate/rewrite it.
5. With existing docs, run one read-only text check using effective strict
   policy. Errors block except a sole missing-architecture-overview when there
   is no architecture Markdown. Show warnings; under strict policy only
   missing-index, missing-project-locale and incomplete-project-sections can be
   nonblocking because init repairs them. Inspect every diagnostic/page, not a
   truncated subset; use [report-output](report-output.md) only for needed JSON.

## Apply

Resolve the complete section map before creating entries: preserve configured
nonempty titles, otherwise existing entry H1, otherwise the selected locale
pack. Do not load every pack/template. For an unsupported pack, use the complete
map established in preflight.

- Create a missing neutral index in the selected language from repository facts.
- Only when architecture has no Markdown, create its overview from the selected
  architecture-overview template, with the resolved architecture H1 and overview
  type. State evidenced system boundaries; leave the question map empty and
  omit a context diagram unless useful and supported. Never invent details,
  typed entities, statuses or relationships.
- Complete `.toudocu/config.yml` with documentationVersion 3, default locale and
  the selected locale profile's root/13 section titles. Preserve unrelated site,
  changes and locale settings; do not rewrite existing H1 headings.
- Use only `assets/project-guidance/en.md` for managed guidance in every locale;
  it preserves source-language and translation isolation rules. Create AGENTS
  with the full asset, append after one blank line when markers are absent, or
  replace only the matched marker block. Preserve every byte outside the block.
- No automatic task creation. Preserve unrelated source changes. On write
  failure, report partial changes instead of claiming atomic completion.

## Validate

Check unique/ordered markers, index + architecture overview/type, and config
version 3. Complete writing/semantic reviews for created sources, then run one
project check with required strict policy (not ordinary plus strict). Report
roots, locale/template language, changed paths and remaining diagnostics.
Do not install/update guidance through another workflow.
