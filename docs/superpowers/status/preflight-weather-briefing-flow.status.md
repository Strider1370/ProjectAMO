# Preflight Weather Briefing Flow Status

Updated: 2026-07-16 16:00 KST
Workflow spec: docs/superpowers/specs/2026-07-16-preflight-weather-briefing-flow.md
AIP data spec: docs/superpowers/specs/2026-07-16-aip-airway-data-pipeline.md

## Resume Point

- Last completed: ENR 3.1 real-publication rendered-table review and B332 manual transcription pilot. The pilot confirmed that a point row is structurally paired with its following constraint row.
- Next: select representative ENR 3.1/3.3 table types, capture them with Playwright, and complete independent manual-transcription quality pilots before any bulk route transcription.

## Verified

- `python scripts/test_aip_enr31_poc.py` — PASS.
- Real KOCA ENR 3.1 publication `2026-06-25` B332 table was captured and manually transcribed as three reviewed candidate segments under ignored local AIP data storage.
- `git diff --check` — PASS.

## Open Decisions Resolved Mid-Implementation

- Generated KOCA AIP raw/normalized data remains under ignored `backend/data/aip/`; do not expose or publish it until KOCA AIP reuse/reproduction permission is confirmed.
- Missing published upper/lower values remain `null`; never substitute minimum flight altitude or infer a ceiling. The source table's constraint row must be reviewed before treating a value as missing.
