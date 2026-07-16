# Preflight Weather Briefing Flow Status

Updated: 2026-07-17 00:00 KST
Workflow spec: `docs/superpowers/specs/2026-07-16-preflight-weather-briefing-flow.md`
AIP data spec: `docs/superpowers/specs/2026-07-16-aip-airway-data-pipeline.md`
Execution plan: `docs/superpowers/plans/2026-07-16-aip-airway-validation.md`
Operations plan: `docs/superpowers/plans/2026-07-16-aip-airway-operations.md`
Last committed baseline: `b47528e Define preflight weather briefing workflow`

## New-Computer Start

1. Read this status first, then the two linked specs and `AGENTS.md`.
2. Treat AIP work as **weather briefing support**, not aircraft-performance, ETE/ETA, fuel, safety, or route/altitude recommendation work.
3. Run `python scripts/test_aip_enr31_poc.py` before changing the POC. It must pass.
4. Do not start bulk transcription until the representative-table pilots below are independently reviewed.

## Resume Point

- Last completed: Task 2 pilot-backed ENR 3.1 rule check. The POC's existing outgoing-constraint model was confirmed against B332 and has a regression test for `UNL`/`FL 200`, paired tracks, lateral limit, and odd/even series. `python scripts/test_aip_enr31_poc.py` passed (3 tests); a fresh POC run parsed 114 segments with no warnings, and its A582/B332/W62 output matched all six independently reviewed ENR 3.1 pilot segments. The pilot evidence remains ignored at `artifacts/aip-pilot/2026-06-25/`.
- Decision: ENR 3.3 has a different constraint-row column order from ENR 3.1. Reuse only common value helpers; do not feed ENR 3.3 tables to the ENR 3.1 parser.
- Last completed: minimal L512 ENR 3.3 parser pilot and regression check. The actual 2026-06-25 ENR 3.3 source produced both reviewed L512 segments with no warnings; it preserves `MEA(MOCA)` separately from ENR 3.1 minimum flight altitude.
- Last completed: A582 10-segment independent transcription found that `point_ident` read `BUSAN VORTAC (PSN)` as `BUSAN`. The shared helper now prefers the parenthesized official identifier; the ENR 3.1 and ENR 3.3 POC tests pass, and reparsing the saved 2026-06-25 source yields `KALOD -> PSN -> APELA`.
- Last completed: A582 first route-level batch. All ten independently transcribed values match the repaired POC output; the ignored review record is `artifacts/aip-pilot/2026-06-25/enr-3.1-a582-full-reviewed.json`.
- Last completed: A593 second route-level batch. All four independently transcribed values match the repaired POC output, including two intentionally blank FL-series pairs. The ignored review record is `artifacts/aip-pilot/2026-06-25/enr-3.1-a593-reviewed.json`.
- Last completed: A595, V547, W45, W61, and W526 route batches (12 segments). All independently transcribed values match the repaired POC output; the ignored review manifest is `artifacts/aip-pilot/2026-06-25/enr-3.1-small-routes-reviewed.json`.
- Last completed: B467 larger route batch (6 segments). All independently transcribed values match the repaired POC output; the ignored review record is `artifacts/aip-pilot/2026-06-25/enr-3.1-b467-reviewed.json`.
- Last completed: V11 (6 segments) and V549 (7 segments) independently transcribed and matched to the repaired POC output.
- V543 resolution: the `TEDAN -> ANUBA` cell layout is shifted. Its empty COP cell means `(25/83)` belongs to COP; its actual limits are `UNL` / `8 000 ft AMSL`. The POC now repairs this pattern, preserves COP, and has a regression test. Evidence: `artifacts/aip-pilot/2026-06-25/enr-3.1-v543-reviewed.json`.
- Last completed: all 18 ENR 3.1 routes (114 segments) were rendered and independently transcribed; all match the repaired POC output and have review evidence. Large-route evidence is `artifacts/aip-pilot/2026-06-25/enr-3.1-large-routes-reviewed.json`.
- Last completed: ENR 3.3 Y233 RNAV pilot (3 segments). The rendered table, independent transcription, and dedicated POC output agree on paired tracks, `UNL`/`FL 200`, odd/even series, and `MEA(MOCA)` as a separate value. Evidence: `artifacts/aip-pilot/2026-06-25/enr-3.3-y233-reviewed.json`.
- Last completed: all 36 ENR 3.3 routes (184 segments) were rendered and independently transcribed in three route batches. The dedicated POC excludes hidden `AmdtDeleted` rows and retains visible `AmdtInserted` values; its tests pass. The three Y655 multi-line limit cells each contain two ordered pairs, `UNL / FL 430` and `FL 220 / FL 150`; both are preserved as `limitPairs`, rather than reducing the cell to one pair. Batch evidence: `artifacts/aip-pilot/2026-06-25/enr-3.3-{north,central,south}-batch-reviewed.json`.
- Last completed: a local, versioned combined snapshot was created at `backend/data/aip/normalized/2026-06-25/reviewed-airway-segments.json`. It contains all 298 reviewed ENR 3.1/3.3 segments (114 + 184), with source URL, effective time, rendered-capture locator, and review status on every record. Its status is `reviewed-not-current`; it is ignored by Git and is not served by the product.
- Last completed: Task 4 structural validation and prior-graph diff. `backend/data/aip/validation/2026-06-25/route-graph-diff.json` reports zero structural errors; 253 matching segments, 45 additions, one removal (`W45/RIMPO/PSN`, now split by `RUNIT`), and 107 changed distances against the old AIRAC `2026-04-15` graph. This is a comparison report only, not a decision that the old graph was wrong.
- Last completed: ENR 1.7 rendered review confirms the Incheon FIR transition altitude is `14 000 ft` and the transition level is `FL 140`; this is common interpretation context and does not alter individual route constraints. ENR 4.4 rendered cross-check found no coordinate mismatch for significant points. Its 11 absent route identifiers are VOR/DME navigation facilities (for example `SEL`, `PSN`, `TGU`) and are outside the ENR 4.4 significant-point list; verify them later against ENR 4.1 only if their facility data is needed.
- Last completed: ENR 4.1 en-route radio-navigation-aid cross-check. `backend/data/aip/normalized/2026-06-25/enroute-navaids.json` contains all 11 listed VOR/DME facilities. Every ENR 4.4-absent route identifier was found there, and all 11 coordinates match the reviewed airway snapshot. The updated validation report has zero structural, ENR 4.4-coordinate, and ENR 4.1-coordinate errors.
- Scope decision: this work covers en-route airways only. AD 2 airport procedure material is explicitly out of scope.
- Last completed: `python scripts/run_aip_airway_operations.py` runs the airway-only dry-run: ENR 3.1/3.3 snapshot, ENR 4.1 facility cross-check, and validation/diff report. It was verified with zero validation errors and leaves `current` unchanged. `--activate` without `--confirm-aip-rights` exits before writing `current`.
- Last completed: `python scripts/discover_aip_publication.py` reads KOCA's official publication list and found `2026-07-08-AIRAC` as the currently effective issue.
- Decision: for every newly effective AIRAC issue, first read the official AIRAC amendment PDF's change summary and page-control list. If ENR 3.1, ENR 3.3, ENR 4.1, and ENR 4.4 are not listed, record that no airway re-review is needed. If any is listed, compare and visually review only the changed section's airway records. The amendment is a page-level filter, not a route-segment data source.
- Last completed: `python scripts/inspect_airac_amendment.py 2026-07-08-AIRAC` records the official AIRAC AIP AMDT 6/26 PDF, its page-control titles, SHA-256, and the decision `no-airway-review-required`. It found no affected ENR 3.1, 3.3, 4.1, or 4.4 section. `python scripts/run_aip_airway_operations.py --publication-id 2026-07-08-AIRAC` now makes that same decision and leaves `current` unchanged.
- Last completed: `scripts/build_aip_change_candidates.py` fetches and compares only the amended ENR 3.1/3.3 sections against the matching sections in the latest reviewed combined snapshot. It records added, removed, and changed segments as `reviewRequired`; it cannot activate them. Its identical-2026-06-25 verification found zero candidates. The airway operations plan is complete: a no-change AIRAC stops after page control, and a changed AIRAC produces only a review queue.
- Last completed: the ENR 6.1 chart linked from the 2026-06-25 eAIP was rendered and checked as a route-identity/connectivity cross-check. All 54 reviewed route identifiers occur in the official chart text; it does not replace ENR 3.1/3.3 constraint review.
- Last completed: personal-use reuse was confirmed and the reviewed `2026-06-25` snapshot was activated locally. `backend/data/aip/current/manifest.json` is `active` and points to the reviewed airway snapshot, ENR 4.1 navaids, and zero-error validation report. It is still not a public API or frontend data source.
- Last completed: workflow Task 0 shared status vocabulary. `shared/briefing-status.js` defines the horizontal/altitude exposure, time, confidence, and validation statuses; it also owns the exact display copy and excludes TAS, ground speed, heading, ETA calculation, fuel, and recommendations. `node --test shared/briefing-status.test.js` confirms all three briefing-stage fixtures preserve `unknown`, `unavailable`, or `not_provided` rather than converting them to `clear`.
- Next: begin workflow Task 1: introduce the single common route model (`routeGeometry` and aligned `enRouteSegments`) beside the existing route data, without changing the current briefing behavior yet.
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
