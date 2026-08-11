# Risks

This page lists risks that still need attention or permanent safeguards. A
checked mitigation means that the safeguard exists; it does not mean that the
risk can never return.

## RISK-01: Markdown parsing rules change

- Status: Mitigating
- Probability: Low
- Impact: Medium

Goldmark gives every Toudocu command the same CommonMark/GFM parse tree. A
version or extension change can still alter generated HTML, source ranges, and
normalization. That can affect portal output, links, and comment anchors.

### Mitigation

- [x] Supported syntax is documented in the README and feature reference.
- [x] Rendering and safe escaping have behavioral tests.
- [x] Project documents are part of the Goldmark regression corpus.
- [ ] Update Goldmark or its extension set only together with the document
  corpus, security review, and a semantic review of the resulting pages.

## RISK-02: Commands from a work item execute with user privileges

- Status: Accepted
- Probability: Low
- Impact: High

Verification commands run through the system shell with the privileges of the
person who started Toudocu. A task from an untrusted source can therefore
contain a dangerous command.

### Mitigation

- [x] `check`, `build`, and `task context` never run task commands.
- [x] Execution requires an explicit `task verify --run`.
- [x] Command duration and retained output are bounded.

The user must still read the commands and trust their source before running
`task verify --run`.

## RISK-03: Cleaning output deletes unrelated data

- Status: Mitigating
- Probability: Low
- Impact: High

A defect in `build --clean` could otherwise remove data outside the portal
output directory.

### Mitigation

- [x] The filesystem root, documentation root, and its parents cannot be
  cleaned.
- [x] Symlinks are resolved and checked before cleaning.
- [x] Every fixed dangerous case keeps a negative regression test.
