# Spec: Project Data Tag Inventory Research

**Status:** Approved
**Created:** 2026-07-19

## Problem / Goal

ProjectAMO exchanges external source data, normalized records, calculated products, API payloads, and user-facing alert/display data. These connections currently have to be rediscovered feature by feature. The goal of this research is to identify every meaningful dataset boundary in the running code and produce evidence for a later, minimal common tag and schema specification.

## Requirements

- FR-001: The research MUST inventory externally collected raw datasets, including provider, acquisition path, original format, and retained or recoverable raw source.
- FR-002: The research MUST inventory normalized, stored, and internally derived datasets, including their producer, storage location, time and spatial meaning, and downstream consumers.
- FR-003: The research MUST inventory API payloads and frontend-derived display or alert datasets that form a reusable boundary between modules.
- FR-004: Every inventory entry MUST cite actual code or runtime-data evidence and distinguish confirmed facts from unresolved assumptions.
- FR-005: Every inventory entry MUST propose a stable tag name and record the current schema or schema-defining code location.
- FR-006: The final synthesis MUST identify duplicate shapes, missing provenance, missing raw-data retention, and ambiguous time or location semantics.
- FR-007: The proposed model MUST remain minimal: a common identity and provenance header plus dataset-specific fields, without introducing a broker, registry service, or new runtime framework.

## Non-Goals (out of scope)

- Implementing the common tag protocol.
- Refactoring collectors, storage, APIs, alerts, or frontend features.
- Treating local function variables, UI-only style settings, or static configuration constants as datasets.
- Selecting infrastructure for hypothetical scale that the current project does not require.

## Success Criteria

- SC-001: Parser, processor, store, scheduler, database, API route, frontend API, feature view-model, and alert paths have all been cross-checked for dataset boundaries.
- SC-002: Each confirmed dataset has a proposed tag, meaning, source/origin, current shape reference, time/space semantics, transformation path, and consumers.
- SC-003: The resulting inventory can be used directly to discuss and approve a later common data-tag specification without another broad code audit.
