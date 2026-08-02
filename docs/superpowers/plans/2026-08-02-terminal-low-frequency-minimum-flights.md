# Terminal Low-Frequency Minimum Flights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing 30-minute high-volume airport snapshot while extending low-frequency airport selection beyond two hours until up to three real same-day departures are available.

**Architecture:** `terminalFlightSimulation.js` will hold the verified 2026-08-02 schedules after 13:00 and select flights before destination grouping. Low-frequency airports first keep every departure in `[13:00, 15:00]`, then append later same-day departures in chronological order until three flights are selected or the verified schedule is exhausted; the existing compact destination-queue frame builder remains unchanged.

**Tech Stack:** Plain JavaScript model helpers, React terminal signage, Node test runner, Playwright.

## Global Constraints

- Keep `RKSS`, `RKPC`, and `RKPK` on their existing 30-minute snapshot.
- Apply minimum-three selection only to `RKPU`, `RKNY`, `RKJY`, and `RKJB`.
- Never cross into the next day and never fabricate a flight when fewer than three verified departures remain.
- Preserve chronological source order before destination grouping.
- Keep every selected `flightKey` visible exactly once through the compact frame cycle.
- Re-anchor the five-hour destination forecast timeline to each selected flight's arrival hour.
- Record both the authoritative rule in `Architecture.md` and the KAC evidence in `docs/research/2026-08-02-terminal-low-frequency-schedule-evidence.md`.

---

### Task 1: Verified low-frequency schedule selection

**Files:**
- Modify: `frontend/src/features/terminal/terminalFlightSimulation.js`
- Test: `frontend/src/features/terminal/terminalFlightSimulation.test.js`

**Interfaces:**
- Consumes: verified same-day `FLIGHTS` rows and `TERMINAL_SIMULATION_REFERENCE.windowMinutes` / `minimumFlights`.
- Produces: `selectTerminalSourceFlights(departureIcao)` used by `buildTerminalSimulation(departureIcao)`.

- [x] **Step 1: Add failing selection tests**

```js
assert.deepEqual(flightsFor('RKPU'), ['KE1595', 'LJ656', 'BX8305'])
assert.deepEqual(flightsFor('RKNY'), ['WE6703'])
assert.deepEqual(flightsFor('RKJY'), ['KE1635', 'OZ8199', 'LJ672'])
assert.deepEqual(flightsFor('RKJB'), [])
```

- [x] **Step 2: Run the model test and confirm the old snapshot fails**

Run: `node --test frontend/src/features/terminal/terminalFlightSimulation.test.js`

Expected: FAIL because 울산 and 여수 contain only one selected flight and 양양 has none.

- [x] **Step 3: Add the verified KAC rows and implement selection**

```js
function selectTerminalSourceFlights(departureIcao) {
  const candidates = FLIGHTS.filter((flight) => flight.departureIcao === departureIcao)
  const minimum = TERMINAL_SIMULATION_REFERENCE.minimumFlights[departureIcao]
  if (!minimum) return candidates
  const inWindow = candidates.filter((flight) => minutesAfterReference(flight.departure) <= 120)
  return [...inWindow, ...candidates.slice(inWindow.length, minimum)]
}
```

- [x] **Step 4: Run model tests**

Run: `node --test frontend/src/features/terminal/terminalFlightSimulation.test.js`

Expected: PASS with 울산/여수 showing three verified flights, 양양 one, and 무안 zero.

### Task 2: Arrival-aligned forecast hours and signage contract

**Files:**
- Modify: `frontend/src/features/terminal/terminalFlightSimulation.js`
- Modify: `frontend/verification/contracts/terminal-signage.spec.mjs`
- Test: `frontend/src/features/terminal/terminalFlightSimulation.test.js`

**Interfaces:**
- Consumes: each selected flight's `arrivalKst` and destination weather fixture.
- Produces: five forecast labels beginning at the arrival hour for both signage views.

- [x] **Step 1: Add failing arrival-hour tests**

```js
assert.deepEqual(ulsanFlights.find(({ flight }) => flight === 'BX8305').forecast.map(([time]) => time), ['19시', '20시', '21시', '22시', '23시'])
assert.deepEqual(yeosuFlights.find(({ flight }) => flight === 'LJ672').forecast.map(([time]) => time), ['18시', '19시', '20시', '21시', '22시'])
```

- [x] **Step 2: Re-anchor forecasts without changing weather values**

Create a display-time forecast copy from `arrivalKst`; do not mutate the shared destination fixture.

- [x] **Step 3: Extend the browser contract**

Open `/terminal/rkpu?autoplay=0` and `/terminal/rkny?autoplay=0`; assert the selected real flight numbers, honest counts, and arrival-aligned forecast labels.

- [x] **Step 4: Run the terminal Playwright contract**

Run: `npm --prefix frontend run dev:contract:fast -- contracts/terminal-signage.spec.mjs`

Expected: all terminal signage contracts pass.

### Task 3: Provenance, architecture record, and final verification

**Files:**
- Create: `docs/research/2026-08-02-terminal-low-frequency-schedule-evidence.md`
- Modify: `Architecture.md`
- Modify: `docs/policies/verification/contracts.md`

**Interfaces:**
- Produces: durable KAC query evidence and the authoritative minimum-flight selection rule.

- [x] **Step 1: Record KAC evidence**

Record the four official KAC schedule pages, Sunday/date filters, all verified departures after 13:00, and the selected subset.

- [x] **Step 2: Update architecture and contract registry**

Document the two-hour-first/minimum-three/same-day exhaustion rule and add low-frequency coverage to `terminal-signage`.

- [x] **Step 3: Run final verification**

Run: `npm --prefix frontend test`

Run: `npm --prefix frontend run build`

Run: `graphify update .`

Run: `git diff --check`

Expected: tests and build pass, the graph is fresh, and UTF-8/whitespace checks report no errors.
