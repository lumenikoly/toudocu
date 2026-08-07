---
name: Docu-docu
description: A high-contrast engineering board for verifiable documentation tooling.
colors:
  canvas: "#f5e6ca"
  white: "#ffffff"
  ink: "#0047ab"
  muted: "#315a92"
  hover-ink: "#003a8c"
  quiet-label: "#315a92"
  line: "#d9c8a9"
  internal-rule: "#d7d7d7"
  soft-gray: "#f5f5f5"
  verified-green: "#e1fdc7"
  verified-ink: "#174b18"
  portal-blue: "#e1f5fe"
  context-violet: "#e8eaf6"
  focus-indigo: "#002d72"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "clamp(5.4rem, 7.25vw, 6.5rem)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "clamp(2.25rem, 3.2vw, 3rem)"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "-0.035em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.06em"
  wordmark:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "1.22rem"
    fontWeight: 900
    lineHeight: 1.4
  action:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 800
    lineHeight: 1.4
  hero-body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.25rem, 1.7vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.4
  supporting:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.4
  compact:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.4
  terminal:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
    fontSize: "0.82rem"
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
    fontSize: "0.76rem"
    fontWeight: 400
    lineHeight: 1.65
  footer:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
  footer-link:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 800
    lineHeight: 1.4
  mobile-label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
    fontSize: "0.62rem"
    fontWeight: 700
    lineHeight: 1.4
  mobile-display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "clamp(2.7rem, 11vw, 3.35rem)"
    fontWeight: 900
    lineHeight: 0.9
  mobile-body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 400
    lineHeight: 1.4
  mobile-headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "2.15rem"
    fontWeight: 900
    lineHeight: 0.96
rounded:
  sm: "8px"
  md: "12px"
  lg: "24px"
  mobile-card: "20px"
  pill: "999px"
spacing:
  grid-gap: "24px"
  mobile-gutter: "20px"
  desktop-gutter: "40px"
components:
  pill-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "42px"
  feature-card:
    backgroundColor: "{colors.soft-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "42px"
  verified-chip:
    backgroundColor: "{colors.verified-green}"
    textColor: "{colors.verified-ink}"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
---

# Design System: Docu-docu

## Overview

**Creative North Star: "The Variant Engineering Board"**

Docu-docu uses the direct, high-energy composition of the approved Variant reference: a parchment canvas, enormous cobalt statements, precise mono captions, capsule actions, and large softly colored blocks. The page feels like an engineering presentation board rather than a dark developer console or a generic SaaS dashboard.

Real product UI sits inside soft white insets and replaces invented diagrams. Public claims stay factual and repository-backed; the expressive scale comes from typography, spacing, and block color rather than hype.

**Key Characteristics:**

- Open parchment first view with a large left-anchored proposition.
- Cobalt capsule CTAs and thin outlined secondary actions.
- A 12-column board of 24px-radius feature blocks.
- Pale green, blue, violet, and neutral gray as full card fields.
- Real UI screenshots inside white 12px-radius insets.

## Colors

Parchment and cobalt dominate. Soft color identifies the kind of evidence carried by a whole region.

- **Parchment** (`#f5e6ca`): page canvas.
- **White** (`#ffffff`): UI insets.
- **Ink** (`#0047ab`): statements, controls, and primary copy.
- **Muted** (`#315a92`): secondary text.
- **Rule Beige** (`#d9c8a9`): structural dividers.
- **Soft Gray** (`#f5f5f5`): workflow and installation fields.
- **Verified Green** (`#e1fdc7`) with **Verified Ink** (`#174b18`): validation evidence and explicit success.
- **Portal Blue** (`#e1f5fe`): static portal evidence.
- **Context Violet** (`#e8eaf6`): Git-backed context and change inspection.
- **Focus Indigo** (`#002d72`): keyboard focus only.

**The Field Color Rule.** Color owns a complete evidence block; do not scatter small decorative accents across the parchment canvas.

## Typography

Display, headings, and body all use the local system sans stack. Commands and compact labels use the local mono stack. No webfont request is allowed.

- **Display** (900, up to 6.5rem, 0.9): three-line hero statement.
- **Headline** (900, up to 3rem, 0.96): compact uppercase card propositions.
- **Body** (400, 1rem, 1.4): factual descriptions with short measures.
- **Label** (700, 0.72rem, `0.06em`): uppercase audience, feature, status, and command labels.

**The Scale Does the Selling Rule.** Keep language factual; create energy through size and line breaks.

## Layout

The header and hero use 40px desktop gutters. The hero fills the first viewport below an 86px header and keeps all content left aligned within a 900px text field. Below it, a 12-column grid uses 24px gaps: proof cards span six columns, workflow spans twelve, and the final evidence/install pair returns to six columns.

At 980px, six-column cards stack. At 700px, gutters reduce to 20px, the secondary header action hides, audience columns become divided rows, and all blocks form one continuous column without horizontal overflow.

## Elevation & Depth

Colored cards remain flat. Only the terminal, screenshot insets, and install command surfaces receive soft downward shadows, making real evidence feel placed on the board rather than turning every section into a floating card.

## Shapes

Feature blocks use 24px radii, reduced to 20px on mobile. UI insets and command surfaces use 12px; small structural details use 8px. Actions and compact state chips are fully pill-shaped. Image edges receive a low-opacity pure-black optical outline.

## Components

### Pill actions

Primary actions are cobalt/white capsules at least 42px high. Secondary actions use a 1.5px cobalt inset outline on parchment. Press feedback scales to `0.96`; focus uses a 3px indigo outline with 4px offset.

### Feature cards

Cards are large content regions, not repeated icon tiles. Each carries one label, one proposition, one short factual paragraph, and optionally one real UI inset.

### UI insets

White 12px-radius frames have a compact header, one textual status chip, and a fixed crop of a real product screenshot. The inset may lift; the colored parent card does not.

### Terminal and install commands

Commands use monospace, white surfaces, 12px radii, and restrained shadows. Verified rows use green plus explicit explanatory text. Copy controls always report their result through an accessible live region.

## Do's and Don'ts

### Do:

- **Do** match the approved Variant composition before inventing a new layout.
- **Do** use three-line oversized cobalt statements on open parchment space.
- **Do** let one soft color own each large evidence block.
- **Do** replace placeholder mockups with real Docu-docu screenshots and commands.

### Don't:

- **Don't** turn the hero into a dark split-screen poster.
- **Don't** replace the rounded board with sharp editorial rows.
- **Don't** invent validation output or product capabilities.
- **Don't** add CDN, webfont, analytics, or runtime dependencies.
