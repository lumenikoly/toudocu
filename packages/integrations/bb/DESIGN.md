# Toudocu tasks in bb

Operate surface, using bb fonts and theme tokens. Thin separators, compact controls, no cards or
decorative chrome. Keep the task hierarchy as navigation and the task document as the reading
surface.

The tree has disclosure buttons, source statuses, search and All/Active/Ready filters. Search
retains matching ancestors. At 680px panel width, a 290px tree sits beside detail; narrower panels
use Tasks/back navigation and keep the tree state. Render canonical task Markdown with bb's host
renderer. Task selection is local; refresh keeps existing content visible. Initial loading has a
quiet skeleton. Selection, search, filters and collapse state survive remounts in a bounded client
cache; server panel data has a 60-second cache, bypassed by Refresh.

Work on task is primary and enabled only by Toudocu readiness. Thread binding is explicit. Checks
and Changes are secondary tabs fetched on demand. Readiness comes from Toudocu, and a plan never
looks like executed verification. Use visible keyboard focus and native scrolling; long titles, code
and tables stay within their pane.
