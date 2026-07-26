# AIP Airway Validation Plan

## Goal

Create a verified, reviewable foundation for Korean en-route airway constraints before any altitude comparison or route briefing consumes them.

## Scope and guardrails

- Use the rendered KOCA eAIP as the authority for interpretation.
- Keep source captures and pilot records in ignored `artifacts/` or `backend/data/aip/` paths.
- Do not publish a `current` AIP dataset, automate bulk transcription, or expose AIP data in the product until every pilot gate below passes.
- Preserve ambiguity as `reviewRequired`; never infer missing limits.

## Task 1 — Establish the pilot evidence set

1. Capture rendered KOCA tables for four representative samples: ordinary ENR 3.1, FIR-boundary ENR 3.1, direction-specific constraint ENR 3.1, and ENR 3.3 RNAV.
2. Manually transcribe a small set of segments per sample with source and capture locators.
3. Have a separate reviewer compare each record to the rendered capture.

Done when every pilot record is independently reviewed or explicitly marked `reviewRequired`, with no unresolved value treated as usable data.

## Task 2 — Freeze shared transcription rules

1. Record how point rows pair with outgoing constraints, including boundary rows, repeated headers, tracks, FL series, `UNL`, `FL`, and `FT AMSL`.
2. Add the smallest regression check to the POC for every rule that is safe to encode.
3. Re-run the POC test and compare its output with the reviewed pilot records.

Done when the POC agrees with reviewed records where it is intended to, and every disagreement is explained rather than silently normalized.

## Task 3 — Produce reviewed ENR data in batches

1. Process ENR 3.1 by route-level batches; separate transcriber and reviewer.
2. Repeat for ENR 3.3.
3. Store evidence, reviewed records, normalized records, and validation/diff reports separately.

Done when each usable record has source, effective time, capture locator, separate reviewer, and `reviewed` status.

## Task 4 — Activate only a validated snapshot

1. Validate route/fix linkage, units, directionality, source locator presence, and contradictions.
2. Compare against the prior graph and report additions, removals, and changed constraints.
3. Publish `current` only after all activation conditions pass; otherwise retain the last valid snapshot and report the failure.

Done when a versioned snapshot can be traced from every active segment back to its official rendered source and independent review.

## Verification

- `python scripts/test_aip_enr31_poc.py`
- Rendered-table captures and independent review records for every pilot sample.
- Validation/diff report before any activation.
