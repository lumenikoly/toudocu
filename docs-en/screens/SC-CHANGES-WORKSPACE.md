# SC-CHANGES-WORKSPACE: Changes

- Identifier: SC-CHANGES-WORKSPACE
- Type: Screen
- Module: MOD-CHANGES
- Status: Implemented
- Route: `/changes/`
- Last updated: 2026-08-10

This screen lets a developer review the current Git diff and discuss it with an
agent without leaving the local portal. It includes documentation and other
changed or manually related repository files. The public `ChangeSetReport`
still remains limited to documentation.

No current screenshot is available yet.
`assets/screens/changes-workspace.png` shows an older layout and is therefore
not declared as this document's Preview.

## What the user sees

The top bar links to Portal, Editor, and Changes and contains theme and color
scheme controls. Below it, the page shows the Git range, changed file and line
counts, and a Discussions button.

Range settings are inside a disclosure panel. The user can choose start and end
states and an optional base branch, then see the resolved Git refs, current
branch, and dirty state. The panel closes after apply, on `Esc`, or after an
outside click, and restores focus to the range control.

## File list

Files are sorted by path and split into two groups:

- Changed — files in the current Git diff;
- Related — files the user added for discussion context.

The panel provides search, status and scope filters, plus a Kind filter for all
files, documentation together with repository-root `CHANGELOG.md`, or other
repository files. A related file enters local discussion state only after its
first saved comment.

The first matching file opens automatically. After a refresh, Toudocu tries to
preserve the selected file, tab, and filters. When nothing matches, the screen
states that the list is empty.

## File views

Diff is the main tab and shows the exact Git patch. It supports unified and
side-by-side layouts and patch copying. There is no Summary tab; old links with
`tab=summary` or `tab=source` open Diff.

Full file loads the current UTF-8 file only when opened. For a deleted file, it
shows the last version before deletion. Markdown, JSON, YAML, Go, Java,
JavaScript, and TypeScript receive syntax highlighting; other text files appear
as plain text.

Documentation gets only applicable extra tabs: Before and after, Semantics,
Relationships, OpenAPI, Mermaid, assets, or screen map. Diagnostics remain
collapsed until needed; an error opens them automatically.

## Comments and agent responses

A comment can target the whole change set, an entire file, a patch line, or a
selection in Full file. The form has one field: message text.
`Ctrl`+`Enter` or `Cmd`+`Enter` saves it; `Esc` cancels. A selection crossing
both old and new patch sides is rejected.

The discussion panel stays hidden until a message exists. It then shows open
and resolved discussions. An unsent message can be edited or deleted. Once its
agent batch is created, it becomes immutable; later conversation is a new
reply.

“Send to agent” does not start an agent. It creates a pending batch and displays
an instruction for the user to send separately. Agent results appear as Fixed,
Not fixed, or Needs clarification and never resolve a discussion automatically.

## Live updates and responsive layout

Toudocu watches repository and discussion changes separately. When the open
file changes, the screen offers to refresh it. Draft comment text is preserved,
but the anchor must be selected again.

On a wide screen, the file list, diff, and open discussions sit side by side.
On tablets, discussions open on the right. On phones, files and discussions use
separate drawers. `Esc` closes them, and state is always expressed with text as
well as color.

## Availability

The screen and comment writes exist only in the main portal started through
`serve`. Comparisons ending at a commit or the index are readable, but comments
are writable only when the end state is `working-tree`. Static builds,
translation portals, and direct serving of a translation root do not include
this screen.

## Related documents

- [UC-DOCS-05](../use-cases/UC-DOCS-05.md)
- [UC-REVIEW-01](../use-cases/UC-REVIEW-01.md)
- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md)
- [Changes HTTP API](../contracts/changes-http.md)
- [TASK-CHANGES-002](../work/TASK-CHANGES-002.md)
