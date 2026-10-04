---
name: toudocu-bb
description: Work with Toudocu tasks and project documentation in the current bb thread workspace.
---

# Toudocu in bb

An explicit `clarify`, `implement`, `review`, or `verify` invocation names the task to work on:

- `clarify`: use the project's `$toudocu clarify` workflow when available. Otherwise read the task
  and relevant implementation, ask only unresolved decisions, and update canonical task documentation
  with confirmed answers. Stop before implementation. For a Draft, search its ID and read its source;
  for Ready+ start with task context.
- `implement`: read task context and readiness, then implement its agreed scope. Update the task
  and relevant documentation as the work progresses.
- `review`: read task context, inspect task changes and implementation against acceptance criteria.
  Report concrete findings; do not change files or execute verification commands.
- `verify`: the user explicitly requests the task's configured verification commands. Get roots
  with `toudocu_project_info`, then run the trusted CLI `task verify TASK-ID DOCS-ROOT --repository-root
  PROJECT-ROOT --run --format json`. Report results; do not start fixing failures automatically.

Use the tools when project context or a task needs them:

- Choose work: `toudocu_task_candidates`.
- Start a task: `toudocu_task_context`, then `toudocu_task_ready`.
- Find a document: `toudocu_search`.
- Review task changes: `toudocu_task_changes`.
- Inspect verification commands: `toudocu_task_verify` (plan only).
- Validate documentation after editing it: `toudocu_check`.

Fetch detail as needed; do not repeat unchanged context or checks on every turn.
Reports describe the current thread's workspace. Readiness and status come from
Toudocu. A bb thread binding does not change task status.

Verification execution requires an explicit user request and the trusted CLI
workflow. The plugin's verify tool never runs commands. Do not initialize a
project or start a server to make a tool work.

Open Toudocu from the right-panel actions on New thread or an existing thread.
Select a project on New thread to browse its tasks and start work in a worktree.
Clarify, review and verification threads reuse the selected workspace, including uncommitted changes.
Open in Toudocu appears only when a matching live server is discovered.
