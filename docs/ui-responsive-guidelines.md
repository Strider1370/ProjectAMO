# UI and Responsive Work Guidelines

> This is a living document. Update it when repeated review findings, operator feedback, or new product decisions change how ProjectAMO UI work should be judged.

## Purpose

This guide exists so future UI, CSS, layout, and responsive work follows a consistent operational standard instead of drifting into one-off fixes.

ProjectAMO is not a marketing site and not a consumer-first browsing experience. It is an operational tool. UI work should help a pilot, controller, dispatcher, or weather-focused operator identify important conditions quickly and act with confidence.

## Core Principle

The goal is not just to make the UI fit.

The goal is to make the most important information readable, scannable, and actionable under time pressure.

If a layout technically fits but slows down recognition, hides important state, or forces the user to scan through too much competing information, it is still a UX problem.

## Product Lens

When reviewing or changing the UI, assume the user is asking questions like:

- What airport, route, or weather situation am I looking at?
- Is the current operational state safe, limited, or changing soon?
- What warning, advisory, or forecast change matters next?
- What is the next control or detail view I should open?

The interface should answer those questions with minimal scanning.

## Default Priorities

When information competes for space, prioritize in this order:

1. Identity and scope:
   airport, route, selected mode, active context
2. Current operational status:
   flight category, warnings, restrictions, safety-impacting conditions
3. Next important change:
   TAF shift, warning onset, advisory change, meaningful trend
4. Decision-support detail:
   map context, supporting cards, secondary diagnostics, configuration

Do not let low-priority controls or decorative structure outrank current state and next-change information.

## What Counts As A Problem

Treat these as real problems even when there is no CSS overflow:

- Important status is visually buried below less important controls.
- The user must scan too many cards before finding key weather or warning state.
- Map and data compete for attention without a clear primary task.
- A mobile layout keeps desktop structure even though it is harder to read that way.
- Tabs, cards, or tables technically fit but are too dense to read quickly.
- The user needs too many interactions to reach the most important information.

Traditional layout failures still count:

- Clipping
- Overlap
- Truncated text
- Hidden controls
- Broken clicks
- Page-level horizontal scroll
- Unreadable controls

## Responsive Philosophy

Do not assume every desktop surface must remain visible at once on tablet or mobile.

On smaller viewports:

- clear task separation is better than crowded coexistence
- mode switches are better than unreadable mixed layouts
- dedicated reading views are better than preserving side-by-side desktop composition

If a narrower layout becomes harder to read, prefer structural simplification over smaller fonts, tighter spacing, or preserving the original composition at all costs.

## Mobile Direction Approved For Review

These are the current preferred review directions for future mobile-focused proposals. They are not implementation instructions by themselves.

### Monitoring mobile

- Use top-level task tabs:
  - `기상정보`
  - `지도`
  - `설정`
- Default to `기상정보`
- Treat the map as a dedicated task view rather than permanent background context
- Do not force map and detailed operational weather content into the same cramped viewport

### Main map mobile behavior

- Separate map mode and detailed information mode when both cannot remain readable together
- Prefer a deliberate mode switch over permanently crowded combined layouts

### Airport panel mobile

- The primary review direction is a full-screen step flow
- Treat airport detail as a focused reading task instead of a desktop side drawer shrunk for mobile
- Review sequence should assume a flow such as:
  - summary
  - METAR
  - TAF
  - warnings
  - supporting information

For now, do not treat bottom tabs or segmented controls as the default target pattern for the mobile airport panel unless product direction changes.

## CSS And Layout Rules

Before adding or changing widths, spacing, or breakpoints:

- check existing shared layout tokens first
- prefer existing shell, overlay, and drawer sizing rules
- avoid adding new fixed pixel widths unless a shared token or explicit exception is justified

Do not use CSS as a way to hide a structural problem.

Bad fix pattern examples:

- shrinking text until dense data technically fits
- reducing gaps so controls stop colliding without improving hierarchy
- forcing a desktop table to remain unchanged on narrow mobile screens
- preserving side-by-side map and panel layouts that are no longer readable

Better fix pattern examples:

- change the information hierarchy
- split modes by task
- move secondary controls later in the flow
- convert a desktop reading surface into a focused mobile reading flow

## Scroll Rules

- Page-level horizontal scroll is a failure.
- Panel-local horizontal scroll is acceptable only as a fallback for inherently two-dimensional content such as dense tables or multi-day forecast grids.
- Panel-local scroll is not automatically the preferred final UX. If a structurally clearer layout exists, prefer proposing that instead.

## Review Workflow

For visible UI work:

1. Capture the relevant states and viewports
2. Record issues before editing
3. Separate mechanical breakage from operational clarity problems
4. Review findings with read-only reviewers when appropriate
5. Apply focused fixes only after issue collection
6. Re-capture and update issue status

## Reviewer Guidance

### UI QA reviewer

Ask:

- Can the user find the most important status within a few seconds?
- Are any values, labels, or warnings hard to read under pressure?
- Are controls visible, reachable, and unambiguous?
- Does the current viewport create click interception, hidden states, or overflow?
- Does the map remain useful without overwhelming primary reading tasks?

Return:

- exact state and viewport reviewed
- reproducible issues
- likely owning file or component
- minimal fix direction
- manual validation still needed

### Design reviewer

Ask:

- Does the density fit an operational tool rather than a decorative app?
- Does typography help scanning instead of fighting it?
- Are colors, emphasis, and grouping functional?
- Should this be solved with spacing polish, or is the real issue information architecture?
- Would a stronger structural change improve speed and comprehension?

Return:

- implementation-ready findings only
- smallest guidance that improves operational clarity
- explicit note when a proposal needs user approval before implementation

### Spec reviewer

Ask:

- Is the work staying within the currently approved implementation scope?
- Did the change introduce unapproved structural behavior?
- Is a proposal being implemented before review approval?

Return:

- scope checked
- compliance verdict
- overreach or missing requirement findings

## Proposal-First Rule For Structural Changes

For the remaining responsive/mobile evolution work after Tasks 1 through 8, do not implement major structural changes by default.

That means:

- do capture
- do analyze
- do identify deficiencies
- do write operator-focused proposals
- do summarize expected benefits

But do not automatically implement:

- new mobile task-tab models
- map/data mode splits
- drawer-to-sheet conversions
- full-screen step flows
- other interaction architecture changes

Those require explicit user review and approval first.

## When To Update This Guide

Update this document when:

- the same class of UI issue appears repeatedly
- operator-style review changes what the team considers acceptable
- a structural mobile/tablet direction becomes approved
- a previously provisional rule becomes standard
- a current rule repeatedly causes bad outcomes in practice

When updating it:

- change the rule, not just the example
- explain the operational reason
- keep the guide short enough to scan quickly before UI work

## Working Summary

If you only remember five things, remember these:

1. Fit is not enough; operational clarity matters more.
2. Core status and next-change information outrank secondary controls.
3. Mobile does not need to preserve desktop composition.
4. Capture and review before fixing.
5. Structural responsive changes are proposal-first until explicitly approved.
