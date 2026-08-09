# Semantic gate

Use this gate before creating or changing any document. Docu-docu validates the
structure and explicit promises of a document; it does not prove that the
document is useful, necessary, or true.

## Prepare the document

1. State the intended audience, the durable question the document answers, and
   the understanding or decision the reader should gain.
2. Check whether an existing document should be updated instead. Do not create
   a new file when it would duplicate another source of truth.
3. Choose the document type from its purpose. Do not choose a typed path merely
   to obtain IDs, portal features, or a green validation result.
4. Identify authoritative evidence in requirements, code, UI, contracts,
   decisions, or confirmed user input. Mark unknowns instead of completing them
   with plausible content.
5. Draft from the evidence. Treat templates as removable scaffolding: keep only
   sections that communicate supported information, except fields required by
   a deliberately selected typed contract.
6. If a required typed field cannot be supported, stop and reconsider the
   document type or request missing product intent. Do not invent an entity,
   relationship, status, owner, date, transition, or verification command.

## Author review

Return `PASS` only when every answer is supported:

- What useful question does this document answer for its intended reader?
- Why is this the correct document type and source-of-truth location?
- Which evidence supports its important claims?
- Does it duplicate, contradict, or improperly absorb another document type?
- Can every entity, relationship, section, and status be explained without
  referring to a template or Docu-docu diagnostic?
- Are uncertainty, exclusions, and intentionally absent sections honest?
- Can a reader find the main understanding quickly without reconstructing raw
  implementation details?

Otherwise return `NEEDS_REWORK`, revise the draft, and repeat the gate.

## Independent review

Require an independent semantic review for:

- every new typed document;
- changes to requirements, behavior, boundaries, contracts, architecture,
  decisions, risks, roadmap scope, or current status;
- stable IDs or relationships;
- task scope, acceptance criteria, or verification;
- flow topology, screen maps, or another machine-readable model.

A spelling, formatting, link-repair, or other demonstrably meaning-preserving
change needs the author review but not an independent review.

Use another agent or a human reviewer. Give the reviewer the draft and the raw
product or repository evidence, without the author's desired verdict or a
Docu-docu result presented as proof of quality. The reviewer returns `PASS` or
`NEEDS_REWORK` with concrete reasons. If an independent reviewer is required
but unavailable, report the gate as pending and do not declare the document
complete.

## Document boundaries

Keep neighboring document types distinct:

- a module explains a stable ownership or behavior boundary, not every folder;
- a use case describes observable actor behavior, not an implementation call
  graph;
- a flow visualizes one reusable scenario, not every branch in source code;
- a screen map explains product-wide navigation, not the router catalog;
- an ADR records a durable decision that was actually made, not a retrospective
  justification invented for current code;
- a roadmap declares global outcomes, not every local checklist;
- a task defines authorized work and observable completion, not an aspirational
  description padded to satisfy its schema;
- status reports the current verified snapshot, not desired future state;
- reference material catalogs facts, while a guide helps a reader achieve a
  result.

For architecture changes, continue with [architecture-gate.md](architecture-gate.md).
For flows and screen maps, continue with [screen-model.md](screen-model.md).
