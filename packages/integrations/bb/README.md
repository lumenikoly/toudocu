# Toudocu for bb

Task context, readiness and documentation changes beside the current bb thread. The plugin uses the
public Toudocu CLI on the selected workspace host. Install Toudocu separately; CLI contract v1 and
the requested capability are required.

On **New thread**, choose a project and open **Toudocu** in the right-panel Actions list. The panel
reads the project's default local checkout and shows its existing tasks, including tasks in progress
and completed tasks, as a collapsible hierarchy. Search by ID or title, read a task, then **Work on
task** when Toudocu reports it ready. The action creates a new thread in a managed worktree. With an
existing thread, the same panel reads that thread's workspace. **Use in this thread** explicitly
binds the selected task; browsing does not change the binding. A new worktree starts from the
current branch for an existing thread, or the project default branch from New thread. Uncommitted
files are not copied. The new agent receives a short bootstrap and fetches its own task context.
Multiple threads can reference the same task; bindings never alter Markdown.

Task selection reads a cached `task list` snapshot without CLI calls. Task Markdown uses bb's native
renderer. The panel retains the selected task, filters and expanded branches when reopened.
Snapshots and concurrent reads are shared per host/workspace for 60 seconds; **Refresh** reads a new
snapshot while keeping the current content visible. The first load still compiles the documentation
through the CLI. Readiness is checked live before starting work. **Checks** and **Changes** load
only when opened.

Status markers and labels distinguish completed tasks in green, pending tasks in amber, work in
progress in blue and blocked tasks with bb's error color. **Done** filters completed tasks without
flattening the hierarchy. Task titles stay readable in both themes.

**Clarify task** starts a clarification thread in the current workspace and invokes the supplied
`toudocu-bb` workflow. It uses the project's `$toudocu clarify` skill when available, otherwise its
compact clarification instructions; the flow stops before implementation. **Review task** is the
main action for tasks already in progress or completed. The **More task actions** menu includes
**Run task checks**, **Use in this thread** and **Copy task ID**. Review and verification threads
reuse the selected workspace, so they see its uncommitted changes. Starting implementation still
requires live readiness and creates a separate managed worktree. Pending workflow actions reuse
the panel snapshot instead of compiling task data again.

**Checks** reads the verification plan without running commands. All nine agent tools are read-only,
including `toudocu_task_verify`. **Run task checks** explicitly asks a verification thread to execute
the configured commands through the trusted CLI; it does not change the plan tool into an executor.
`@toudocu`
lists existing tasks; typing a task ID or document title searches source documentation. Suggestions
use a bounded, 30-second title index per workspace; while it loads, a search mention fetches results
when sent. Selected references are re-read through the CLI. Mentions on New thread use the selected
project's default local checkout; after thread creation they use its workspace. Choose a project
first if the New thread composer has none selected.

**Open in Toudocu** appears only when `project info` finds a live `toudocu serve` for this exact
workspace and documentation root. There is no URL setting. Task browsing works without a server;
the plugin never starts one. Start `toudocu serve` in the checkout or worktree you want to open.
Workspace discovery refreshes separately from the task snapshot, on opening the panel, returning
to the window and every 30 seconds while the panel is open. The action checks again before opening.

A direct address is opened only after the client verifies the server's instance identity. For a
remote machine, bb Connect forwards the discovered loopback port through its owner-authenticated
HTTPS gate. Connect enrollment is required when the address is unreachable from the client; errors
are shown only on opening and do not block tasks. Shared ports are reconciled while in use and
released on server shutdown detection or plugin unload. A worktree never falls back to the main
checkout's server, even if their project IDs match.

## Install from this checkout

The root `pnpm build` and `make update-local` build Toudocu without requiring bb.
Build this integration explicitly with the bb CLI available on PATH:

```sh
pnpm install
pnpm --filter @toudocu/contracts build
pnpm --filter @toudocu/bb-plugin build
bb plugin install path:. --plugin toudocu
```

The package is `@toudocu/bb-plugin`; bb derives its local plugin ID as `bb-plugin`. The
`.bb/plugins.json` collection names it `toudocu`.

## Distribution

For Git installations, select `--plugin toudocu` from the repository collection. The plugin uses a
local file dependency and `install-links=true` so bb's npm installation can build contracts from
source without running the Toudocu CLI.

Prepare a self-contained npm package after the build:

```sh
pnpm --filter @toudocu/bb-plugin run package
npm pack ./packages/integrations/bb/build/package
```

Publish that prepared directory as `@toudocu/bb-plugin`, then install it with
`bb plugin install npm:@toudocu/bb-plugin`. Marketplace entries can reference that npm package or
the Git collection. Publishing and marketplace submission are separate release operations. Plugin
and CLI versions are independent.

## Boundaries

Only the SDK and public contracts are imported. The host entry spawns `toudocu` with argument
arrays, `shell: false`, cancellation, a 30-second timeout and a 4 MiB output ceiling. Tools limit
returned JSON to 1 MB. JSON reports are validated; there is no human-output parser or persistent
CLI daemon. Task data comes only from CLI JSON. The public instance-identity endpoint is used solely
to verify that the browser can reach the discovered server before opening it.

`project info` chooses the configured default documentation locale. Unavailable capabilities and
incompatible contracts fail explicitly. Refresh reloads panel state; task status and readiness are
never inferred by the plugin.

Run the focused tests with:

```sh
pnpm exec vitest run packages/integrations/bb/tests apps/cli/src/integration.test.ts
node --test scripts/architecture-boundaries.test.mjs
```
