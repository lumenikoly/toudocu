# Semantic gate

Before creating/changing source documentation, establish purpose and truth.
Toudocu checks declared structure, not usefulness, necessity, currency or
meaning. Apply [writing-quality](writing-quality.md) to reader-facing language;
reuse the gate already read rather than loading it again.

## Author review

For the changed document/affected sections, establish:

1. Reader, durable question and useful understanding/decision/action.
2. Correct language, document type and source-of-truth location; update an
   existing owner instead of duplicating it.
3. Authoritative evidence for every important claim, boundary, status, example,
   entity and relationship; unknowns remain explicit, never filled to pass checks.
4. Clear separation of current facts, requirements, plans and gaps, with honest
   exclusions/failure conditions and no contradictions or misplaced content.
5. Reader-first quality and easy discovery of the main conclusion without
   reconstructing implementation details.

Return `PASS` only when all apply; otherwise `NEEDS_REWORK`, revise and repeat.
Templates are removable scaffolding except deliberately selected typed fields.
If a required field lacks evidence, reconsider the type or report missing intent.

## Independent review

Require another agent or human reviewer for new typed documents and changes to:
requirements/behavior/boundaries/contracts/architecture/decisions/risks/roadmap
scope/current status; stable IDs/relationships; task scope/acceptance/verification;
flow topology, screen maps or other machine-readable models. Meaning-preserving
spelling, formatting, terminology and link repairs need only author/writing review.

Give the reviewer changed drafts and raw evidence, not a desired verdict or a
passing CLI report as proof. Bound the packet to affected sections and evidence;
full documents are needed only when boundaries/meaning cannot be judged locally.
Ask whether reasonable readers could infer unsupported claims. Resolve concrete
`NEEDS_REWORK` findings. If required independent review is unavailable, report
it pending and do not declare documentation complete.

## Boundaries

Keep ownership/rules in modules, observable behavior in use cases, reusable
processes in flows, product navigation in screen models, actual durable decisions
in ADRs, global outcomes in roadmaps, authorized work in tasks, verified snapshots
in status, facts in references and procedures in runbooks/guides. Do not absorb
neighboring document types or invent a typed document for portal features.
Architecture changes also use [architecture-gate](architecture-gate.md);
flow/screen changes use [screen-model](screen-model.md). Load other models only
when the changed structure needs them.
