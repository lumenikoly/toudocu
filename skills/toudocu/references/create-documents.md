# Create source documents

Use only for document creation. Follow `SKILL.md` conventions and the
[writing-quality](writing-quality.md) and [semantic-gate](semantic-gate.md)
gates. Initialization is separate and requires an explicit request.

Prefer updating an existing source of truth. A new documentation tree needs a
neutral `index.md` and required `architecture/overview.md`; leave the question
map empty until distinct architectural answers are supported. Read only the
selected `assets/templates/<language>/<type>.md`, never all templates.

Choose a typed document only for useful, evidenced semantics:
module for ownership/rules; use case for observable behavior; flow for a reusable
process linked to use cases or architecture; screen model for stable navigation;
roadmap for global outcomes; task for a qualifying work contract. Load only the
corresponding model. Create targets before references: module/rules, use case,
screens/flow, then roadmap or task.

Replace every template placeholder before checking. Templates never determine
entities, transitions or topology. Flow `OPTIONAL_USE_CASES_METADATA` becomes a
complete Scenario line with existing `UC-*` IDs, or empty for an architectural
flow; `RELATED_DOCUMENT_LINKS` links their owners. Diagram/transition content
must come from evidence. Keep Mermaid syntax and stable IDs exact, but write
labels and prose in the selected language. A diagram never replaces requirements.

`drafts/**/*.md` is free-form provisional text: no invented type, ID, lifecycle,
metadata or required sections. Create with the Editor draft template or safe
file tools, not `scaffold`. Optional `drafts/index.md` uses the configured section
H1. A draft document is not a Draft work item; do not create a task to hold text
or move provisional text into permanent sources without explicit permission.

Apply applicable reviews, then run one project check with the required strict
policy; build only when requested or necessary. Never fill unknown semantics
merely to satisfy the chosen typed schema.
