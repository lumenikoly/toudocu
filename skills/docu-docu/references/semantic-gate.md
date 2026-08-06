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

## Architecture review

Review `architecture/overview.md` separately from every detailed architecture
document. Record each result by code and return `PASS` only when all applicable
checks pass.

### Overview

- `ARCH001`: the file is `architecture/overview.md` and declares document type
  `Architecture Overview`.
- `ARCH002`: the opening gives a concise, evidence-backed system boundary and
  identifies the interacting parties that matter to that boundary.
- `ARCH003`: the question map links directly to every other Markdown document
  under `architecture/`, including nested directories; a transitive link is not
  a listing.
- `ARCH004`: link labels expose the architectural questions clearly enough to
  choose a document without opening every answer.
- `ARCH005`: a context diagram is present only when it improves the boundary
  explanation and agrees with the prose and linked answers.

### Detailed architecture documents

- `ARCH006`: the document declares type `Architecture`.
- `ARCH007`: the document declares exactly one non-empty `Architecture
  question` / `Архитектурный вопрос`.
- `ARCH008`: the declared text is genuinely an architectural question, even
  when it has no question mark or interrogative word.
- `ARCH009`: a short answer appears before supporting detail and lets the
  intended reader grasp the main conclusion quickly.
- `ARCH010`: scope and relevant exclusions keep the answer bounded.
- `ARCH011`: the document does not absorb a detailed interaction (`FLOW-*`),
  API or data format (`CONTRACT`), factual catalog (`REFERENCE`), operational
  procedure (`RUNBOOK`), decision rationale (`ADR`), or local ownership and
  rules (`MODULE`).
- `ARCH012`: important claims and boundaries are supported by repository or
  product evidence and link to the neighboring sources of truth when useful.
- `ARCH013`: the answer is distinct from other architecture documents and is
  directly listed in overview.

The CLI automates only the structurally provable parts of `ARCH001`, `ARCH003`,
`ARCH007`, and `ARCH013`, plus architecture link safety. The detail document
type in `ARCH006` remains a semantic-gate check rather than a separate CLI
diagnostic. The CLI accepts any non-empty question text. Punctuation, question
form, architectural meaning, usefulness, evidence, boundaries, and duplication
remain semantic-review results.

For screen maps, derive the catalog from product information architecture and
user journeys. Use routes only to confirm already identified screens. Exclude
technical redirects, wildcard or layout routes, and internal component states.
Every transition must represent a meaningful user action; detailed behavior of
one scenario belongs in a flow.
