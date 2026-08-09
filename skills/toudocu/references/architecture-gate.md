# Architecture semantic gate

Use this reference only after the general
[reader-first writing gate](writing-quality.md) and
[semantic gate](semantic-gate.md) when creating or changing
`architecture/overview.md` or another architecture document. Review the
overview separately from every detailed document. Record each result by code
and return `PASS` only when all applicable checks pass.

## Overview

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

## Detailed architecture documents

- `ARCH006`: the document declares type `Architecture`.
- `ARCH007`: the document declares exactly one non-empty architectural
  question through the supported metadata key `Architecture question` or
  `Архитектурный вопрос`.
- `ARCH008`: the declared text is genuinely an architectural question, even
  when it has no question mark or interrogative word.
- `ARCH009`: a short answer appears before supporting detail, uses natural
  target-language terms, and lets the intended reader grasp the main conclusion
  without first decoding component names or identifiers.
- `ARCH010`: scope and relevant exclusions keep the answer bounded.
- `ARCH011`: the document does not absorb a detailed interaction (`FLOW-*`),
  API or data format (`CONTRACT`), factual catalog (`REFERENCE`), operational
  procedure (`RUNBOOK`), decision rationale (`ADR`), or local ownership and
  rules (`MODULE`).
- `ARCH012`: important claims and boundaries are supported by repository or
  product evidence and link to neighboring sources of truth when useful.
- `ARCH013`: the answer is distinct from other architecture documents and is
  directly listed in overview.

The CLI automates only the structurally provable parts of `ARCH001`, `ARCH003`,
`ARCH007`, and `ARCH013`, plus architecture link safety. The detail document
type in `ARCH006` remains a semantic-gate check rather than a separate CLI
diagnostic. The CLI accepts any non-empty question text. Punctuation, question
form, architectural meaning, usefulness, evidence, wording, boundaries, and
duplication remain writing or semantic-review results.
