# Toudocu tasks in bb

Operate surface, using bb fonts and theme tokens. Thin separators, compact controls, no cards or
decorative chrome. Keep the task hierarchy as navigation and the task document as the reading
surface.

The tree has disclosure buttons, source statuses, search and All/Active/Ready/Done filters. Search
retains matching ancestors. At 680px panel width, a 290px tree sits beside detail; narrower panels
use Tasks/back navigation and keep the tree state. Render canonical task Markdown with bb's host
renderer. Task selection is local; refresh keeps existing content visible. Initial loading has a
quiet skeleton. Selection, search, filters and collapse state survive remounts in a bounded client
cache; server panel data has a 60-second cache, bypassed by Refresh.

Work on task is primary when Toudocu reports readiness; otherwise Clarify is primary. Completed
tasks and tasks in progress offer Review as the main action. Clarify is always available. The
compact actions menu contains review, verification execution, thread linking and copying the ID.
Clarification, review and execution start a bound thread in the same workspace; implementation
starts in a new managed worktree. Thread binding is explicit. Checks
and Changes are secondary tabs fetched on demand. Readiness comes from Toudocu, and a plan never
looks like executed verification. Use visible keyboard focus and native scrolling; long titles, code
and tables stay within their pane.

The Open in Toudocu footer uses a quiet text button only while a matching server is live.
Opening uses bb's browser preference and reports connection failures in the existing error area.
The integration inherits bb typography; its compact metadata, controls and document title use
11, 12, 13 and 19px respectively. Control radii are 5 or 6px; the full-width footer has square corners.
These match the surrounding bb surface. Design-hook reports against the web app's different
typography and radius scale are false positives for this integration.
These native bb sizes are independent of the full Toudocu web application's design scale.

Status uses both bb's native icons and source labels. Done is green (`#15803d` in light mode,
`#4ade80` in dark), Draft/Ready is amber (`#b45309`/`#fbbf24`), In progress is blue
(`#2563eb`/`#60a5fa`). Blocked uses bb's destructive token; Cancelled uses muted foreground.
The local semantic palette follows the host color scheme and colors only the marker and status,
leaving titles fully readable. Two-line row titles retain their full text in a native tooltip.
Refresh is an icon button with an accessible label; it spins only when motion is allowed.
Task actions use bb icons and one restrained primary button. Menu items stay keyboard-accessible,
Escape closes the menu and restores trigger focus. These are native bb controls, not the web
portal's marketing type or radius scale; detector reports against that unrelated scale are false
positives and should not change these controls.
