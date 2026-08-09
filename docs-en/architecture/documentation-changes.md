# Architecture for viewing documentation changes

- Document type: Architecture
- Architecture question: How do Git states turn into a consistent change set of documentation?

Toudocu resolves explicitly chosen local Git states, represents each
side with lazy snapshot and combines Git metadata with normalized ones
document entities into one versioned `ChangeSetReport`.

## Area

The answer describes the boundaries of Git source, snapshots, change-set builder and
consumers of the report. The HTTP and JSON format remains in contracts, custom
the script is in `UC-DOCS-05`, and the entity-specific rules are in `MOD-CHANGES`.

## Components

| Component | Responsibility |
|---|---|
| Git change source | Allow repository, refs, merge-base, status, patches and blobs with read-only commands |
| Documentation snapshot | Give single secure access to commit, index or working-tree content within roots |
| Change-set builder | Combine file states, line statistics, entity-aware rename and diagnostics |
| Diff engines | Build an exact source patch and its hunks, structural rendered sections, semantic, OpenAPI, Mermaid, map and asset views |
| Changes service | Cache Git/workspace fingerprint reports and serve CLI/HTTP consumers |
| Translation workflow | Consume canonical change set one file at a time and write an independent locale root after strict gate |

## Data flow

Git metadata defines the list of files and the exact patches. Snapshot loader reads
blobs without checkout. Semantic normalizers parse only the necessary ones
documents; relation and screen indexes are expanded upon request. UI and report
renderers do not have a separate source of truth.

## Condition and disability

Commit-to-commit change set is immutable. HTTP cache identity includes comparison,
workspace revision, `HEAD`, porcelain-v2 status and resolved user
refs. After the change, the next request builds a new report and digest, and the previous ones
working bytes do not become history or snapshot Toudocu.

## Module boundaries

- remote refs are not loaded;
- Git index, refs and working tree do not change;
- static build does not receive changes endpoints;
- specialized analysis errors are isolated from source diff;
- Git content does not provide additional renderer or editor permissions.
- translation workflow does not add an LLM client or multilingual entity to the Go model;
  its manifest with digest is stored separately from `ChangeSetReport` schema v1.