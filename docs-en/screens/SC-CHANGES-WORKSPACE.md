# SC-CHANGES-WORKSPACE: Changes Viewer

- Identifier: SC-CHANGES-WORKSPACE
- Type: Screen
- Module: MOD-CHANGES
- Status: Implemented
- Route: `/changes/`
- Preview: `../assets/screens/changes-workspace.png`
- Last updated: 2026-08-06

A read-only workspace for comparing selected Git states of the documentation:
summary, source, rendered and semantic diffs, screen overlay map, and task impact.

## Shell and states

The shared workspace header shows project branding, links to the portal, Editor,
and Changes, marks Changes as active through `aria-current`, and provides
appearance and color-scheme controls. The base, optional branch base, target
revision, and compare action are kept in a separate context panel.

Appearance changes apply immediately and persist across the other surfaces. The
read-only CodeMirror merge view updates its theme compartment without resetting
the selected document or tab. An active Mermaid diff is redrawn while preserving
the report, filters, and URL state. On narrow screens, metrics, lists, and diffs
use local scrolling only, without causing horizontal page overflow.
