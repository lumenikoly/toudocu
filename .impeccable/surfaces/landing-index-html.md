---
version: 1
slug: "landing-index-html"
primary_target: "landing/index.html"
related_targets: ["landing/styles.css", "landing/script.js", "web/tests/browser/landing.spec.ts", ".github/workflows/pages.yml"]
---

## Scope and mode

English GitHub Pages landing for the Docu-docu repository. Visitor mode: **Persuade**.

## Audience, job, and action

Documentation authors, developers, testers, and coding agents need to understand that Docu-docu turns repository Markdown into a model they can check and a portal they can inspect. The primary action is installing the CLI; viewing the GitHub source is secondary.

## Proof and content

The surface uses the real Screen Map, generated project home, and Git-backed Changes workspace. It states only repository-confirmed capabilities and exact commands: `check`, `build`, `serve`, plus the README's POSIX and PowerShell installers. Public anchors are `#proof`, `#workflow`, and `#install`.

## Chosen direction

A literal implementation of the approved Variant reference: open parchment first viewport, oversized three-line cobalt proposition, outlined and cobalt capsule actions, a soft command panel, then a 12-column board of pale green, blue, gray, and violet rounded blocks. Real Screen Map, portal home, and Changes screenshots replace the reference's placeholder mockups. The memorable moment is the transition from the sparse parchment hero into the dense evidence board.

## Constraints

Static HTML/CSS/small JavaScript only; no builder, CDN, webfonts, analytics, cookies, forms, or external runtime requests. Relative assets must work at `/` and `/docu-docu/`. Shipping UI imagery is capped at three files and total landing size stays below 900KB. Mobile is a single column without horizontal overflow. Content remains visible without JavaScript, and `prefers-reduced-motion` disables authored entrances.

## Unresolved decisions

None for the shipped surface. GitHub repository settings must select **Settings → Pages → Source: GitHub Actions** before the workflow can publish.
