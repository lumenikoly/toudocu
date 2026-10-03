---
name: toudocu-bb
description: Work with Toudocu tasks and project documentation in the current bb thread workspace.
---

# Toudocu in bb

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
Select a project on New thread to browse its tasks and start work in a worktree. Set the existing portal URL in plugin settings for Open in Toudocu.
