# Preflight Weather Briefing Flow Status

Updated: 2026-07-16 17:15 KST
Workflow spec: `docs/superpowers/specs/2026-07-16-preflight-weather-briefing-flow.md`
AIP data spec: `docs/superpowers/specs/2026-07-16-aip-airway-data-pipeline.md`
Last committed baseline: `b47528e Define preflight weather briefing workflow`

## New-Computer Start

1. Read this status first, then the two linked specs and `AGENTS.md`.
2. Treat AIP work as **weather briefing support**, not aircraft-performance, ETE/ETA, fuel, safety, or route/altitude recommendation work.
3. Run `python scripts/test_aip_enr31_poc.py` before changing the POC. It must pass.
4. Do not start bulk transcription until the representative-table pilots below are independently reviewed.

## Resume Point

- Last completed: KOCA ENR 3.1 `2026-06-25` rendered-table review and a B332 manual-transcription pilot (three segments: KANSU->PALDU->SABET->IGRAS).
- Next: select representative ENR 3.1 and ENR 3.3 tables, render each with standalone Playwright, manually transcribe a small route sample, and have a different agent independently compare each record to the capture.
- Only after those pilots fix the shared transcription rules may the remaining routes be divided into route-level parallel transcription and independent-review batches.

## Non-Negotiable AIP Rules

- Capture and visually inspect the real eAIP table with Playwright before interpreting or changing a parser/transcription rule. Raw HTML alone was misleading.
- In current ENR 3.1 tables, a significant-point row is followed by its outgoing constraint row; that constraint applies to the segment from that point to the next point. FIR boundary points are structural rows, not evidence that limits are absent.
- Preserve `UNL`, `FL`, `FT`, `AMSL`, direction-specific tracks and FL series exactly. `UNL` is represented as `value: null` with `reference: "UNL"`; never replace missing limits with minimum flight altitude or invent a ceiling.
- A record needs source URL/publication/effective time, table/capture locator, raw cell text, transcriber, different reviewer, review time, and `reviewed` status before it can be an activation candidate.
- Store source HTML, captures, manual-review JSON, normalized JSON, and manifests under ignored `backend/data/aip/` or `artifacts/`. Do not expose or publish KOCA-derived data until reuse/reproduction permission is confirmed.

## Current Assets and Limits

- Official eAIP entry: `https://aim.koca.go.kr/eaipPub/`.
- Reviewed source used for the pilot: `https://aim.koca.go.kr/eaipPub/Package/2026-06-25/html/eAIP/KR-ENR-3.1-en-GB.html`.
- Local-only, uncommitted pilot assets were intentionally kept out of Git: raw HTML/manifest, B332/G597 captures, and `backend/data/aip/manual-reviewed/2026-06-25/enr-3.1-b332.json`. Recreate them from the source on a new computer; they are not expected to exist after clone.
- `scripts/aip_enr31_poc.py` is a committed inspection aid, not the production source of truth. It can download ENR 3.1, emit candidate JSON, and compare to the old frontend graph, but manual rendered-table review wins whenever they differ.
- The existing frontend route graph is AIRAC `2026-04-15`; POC comparison found graph mismatch/change states. Do not treat a graph match as AIP validation or an unmatched route as a transcription error.

## Useful Commands

```powershell
python scripts/test_aip_enr31_poc.py

python scripts/aip_enr31_poc.py `
  --url "https://aim.koca.go.kr/eaipPub/Package/2026-06-25/html/eAIP/KR-ENR-3.1-en-GB.html" `
  --publication-id "2026-06-25" `
  --effective-at "2026-06-25T16:00:00Z"
```

The second command writes only to ignored `backend/data/aip/`. Use standalone Playwright for the required capture; the in-app browser was unavailable in the prior environment. Keep capture files in ignored artifacts and record their locators in the candidate JSON/manifest.

## Required Pilot Coverage and Handoff Gate

- ENR 3.1: ordinary domestic route, FIR boundary route, two-direction track/FL-series route, and a route with nontrivial upper/lower limits.
- ENR 3.3: at least one RNAV route with its own table structure.
- ENR 6: use as a connection/route-identity cross-check, not as a replacement for ENR 3.1/3.3 constraints.
- ENR 1.7 and needed AD 2 procedure material are later constraint/context sources; do not block ENR 3.1/3.3 pilots on them.
- Record ambiguities as `reviewRequired` with raw source text. Do not infer a value merely to finish a batch.

## Verified / Intentionally Skipped

- `python scripts/test_aip_enr31_poc.py` - PASS before this handoff.
- POC run against ENR 3.1 `2026-06-25`: 114 candidate segments; 63 graph matches, 8 route-changed, 43 absent from the old graph. These are diagnostics only.
- `git diff --check` - PASS before commit `b47528e`.
- Production parser, bulk AIP transcription, AIP `current` activation, scheduler registration, and public data/API exposure are intentionally not implemented.
