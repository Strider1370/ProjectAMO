# Plan: NOTAM Time, Confidence, and Context

**Spec:** docs/superpowers/specs/2026-07-21-notam-time-confidence-context.md
**Goal:** Safely expose NOTAM time conditions and relevance.

## Task 1: Normalize time and confidence

**Files:** `backend/src/parsers/notam-parser.js`, `backend/src/processors/notam-processor.js`, `backend/test/notam-parser.test.js`, `backend/test/notam-processor.test.js`

- [ ] Parse supported daily D) time windows as UTC intervals and retain unsupported source text.
- [ ] Add confidence to operational hints.
- [ ] Verify focused backend tests.

## Task 2: Separate airport and FIR notices

**Files:** `frontend/src/features/notam/lib/notamViewModel.js`, `frontend/src/features/notam/lib/notamViewModel.test.js`, `frontend/src/features/airport-panel/tabs/NotamTab.jsx`, `frontend/src/features/notam/NotamCell.jsx`, `frontend/src/features/notam/NotamCell.css`

- [ ] Derive display time state from parsed intervals and disclose unsupported schedules.
- [ ] Sort airport-direct notices by priority then time; render FIR notices separately.
- [ ] Verify focused tests, build, and airport-panel browser contract.
