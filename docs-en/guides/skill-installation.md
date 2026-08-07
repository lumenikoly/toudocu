# Installing the Docu-docu AI skill

This guide explains how to install the `docu-docu` skill embedded in the
binary, inspect its state, and safely update or remove a managed copy. These
operations use no network, marketplace, shell, or external package manager.

## Quick start

From the project root, run:

```bash
docu-docu skill install
```

`--agent auto` is the default. If exactly one host is detected, the CLI selects
it. With no signals or several signals, an interactive terminal prompts for a
choice; a non-TTY requires an explicit `--agent`.

```bash
docu-docu skill install --agent codex
docu-docu skill status --agent all
docu-docu skill update --agent claude-code --scope user
docu-docu skill uninstall --agent copilot
```

## Targets

| Host | Project scope | User scope |
|---|---|---|
| Codex | `.agents/skills/docu-docu` | `~/.agents/skills/docu-docu` |
| Claude Code | `.claude/skills/docu-docu` | `~/.claude/skills/docu-docu` |
| Copilot | `.github/skills/docu-docu` | `~/.copilot/skills/docu-docu` |

The project root is selected in this order: explicit `--repository-root`, the
nearest parent containing `.git`, then the current directory. User scope uses
the current user's home; `--repository-root` is rejected there.

## Operations

- `install` creates a missing copy or updates an unchanged, outdated managed copy;
- `status` only shows the target and state;
- `update` requires an existing unchanged managed copy;
- `uninstall` removes only an unchanged managed copy.

`--agent all` plans Codex, Claude Code, and Copilot in advance, deduplicates
identical absolute targets, and then processes them independently. A failure for
one target does not stop the others. Success and an allowed no-op return `0`; a
conflict or partial failure returns `1`.

## States and manual conflict resolution

`status` distinguishes `not-installed`, `installed`, `outdated`,
`newer-than-bundle`, `modified`, `unmanaged`, `invalid-manifest`, and
`unsafe-path`. Mutating commands never replace an unmanaged, modified, damaged,
newer, or unsafe copy.

The CLI intentionally provides no `--force`. First preserve the local changes
you need or manually move the conflicting directory, then retry the operation.
The repository-local `.agents/skills/docu-docu` symlink used while developing
this project is classified as `unsafe-path` and remains untouched.

## Managed manifest and atomicity

An installed copy contains `.docu-docu-skill.json` schema v1 with skill and CLI
versions, agent/scope, the bundle checksum, and the SHA-256 of every bundled
file. Any extra, removed, or changed bundled file, changed expected permissions
(exact POSIX bits; writable/read-only semantics on Windows), or symlink/reparse
point inside the package counts as a local modification. The manifest itself is
validated as metadata schema v1; reordering JSON fields or whitespace does not
change managed state.

A new package is first written completely to a sibling stage; the manifest is
created last. Update and uninstall atomically move the old target to a unique
backup and recheck the snapshot. If publication fails, the previous copy is
restored; if rollback is impossible, the CLI preserves the backup and prints
its path with code `SKILL_RESTORE_FAILED`.
