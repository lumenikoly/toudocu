# Architecture of documentation changes

- Document type: Architecture
- Architectural question: How do Git states become one consistent report about documentation changes?

Toudocu compares two explicitly selected local Git states. It loads each side
only when needed and combines the result in one versioned `ChangeSetReport`.
The report adds Toudocu's knowledge of documents, screens, relationships, and
other known entities to ordinary Git data.

## Scope

This document explains where Git states come from, how files are read, and who
consumes the completed report. HTTP and JSON formats belong in the contracts,
the user journey is in `UC-DOCS-05`, and analysis rules are in `MOD-CHANGES`.

## Components

| Component | Responsibility |
|---|---|
| Git change source | Finds the repository, refs, merge base, status, patches, and file contents using read-only commands |
| Documentation snapshot | Safely reads required files from a commit, the index, or the working tree within allowed roots |
| Report builder | Combines file states, line statistics, known-entity renames, and diagnostics |
| Difference analyzers | Produce the source patch, section changes, semantic report, and specialized OpenAPI, Mermaid, screen-map, and asset views |
| Changes service | Reuses a report until Git or working files change and serves CLI and local HTTP consumers |
| Translation workflow | Reads canonical documentation changes one file at a time and writes a separate locale root only after its strict gate passes |

## Data flow

Git determines the file list and exact patch. The snapshot loader reads content
without checking out another branch or changing the working tree. Analyzers
parse only the documents needed for the requested view. The UI and JSON report
consume the same result and do not calculate changes independently.

## State and invalidation

A comparison between two commits is immutable and can be cached safely. For a
working-tree comparison, the cache key includes the selected range, workspace
revision, `HEAD`, `git status --porcelain=v2`, and resolved Git refs. After any
change, the next request builds a new report and digest. Toudocu does not keep
older working-tree contents as its own history.

## Boundaries

- Toudocu does not fetch remote Git refs.
- It does not change the Git index, refs, or working tree.
- A static portal has no Changes HTTP API.
- Failure in a specialized analyzer does not hide the source patch.
- Content read from Git does not receive editor permissions or extra rendering
  privileges.
- The translation workflow does not add an AI-model client or a multilingual
  entity to the Go model. Its manifest and digest remain separate from
  `ChangeSetReport` schema v1.
