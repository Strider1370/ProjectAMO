# Terminal Slot Queue Packing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every real terminal flight exactly once by packing destination queues into at most three stable slots, then reusing freed slots without repeating flights.

**Architecture:** `terminalFlightSimulation.js` will group flights by destination, order groups by descending flight count with source-order tie breaking, and greedily build compact frames. Each frame gives one slot to each active destination first, then fills spare slots from the destination with the largest remaining queue. `DestinationWeatherPage.jsx` will classify each slot independently so unchanged destinations animate only flight fields, changed destinations animate the full card, and removed slots exit cleanly.

**Tech Stack:** React, plain JavaScript model helpers, CSS keyframe animations, Node test runner, Playwright.

## Global Constraints

- Apply the same packing algorithm to every supported departure airport.
- Preserve source flight order within each destination queue.
- Render each `flightKey` exactly once per full cycle.
- Render at most three cards per frame and use the minimum `ceil(totalFlights / 3)` frames.
- Keep active and pending frames pre-rendered until the longest animation commits.
- Record the authoritative packing and slot-transition rules in `Architecture.md`.

---

### Task 1: Compact destination-queue frame model

**Files:**
- Modify: `frontend/src/features/terminal/terminalFlightSimulation.js`
- Test: `frontend/src/features/terminal/terminalFlightSimulation.test.js`

**Interfaces:**
- Consumes: dated `FLIGHTS` entries with `departureIcao`, destination `code`, and `flightKey`.
- Produces: `buildTerminalSimulation(departureIcao): { frames, frameCount, totalFlights, totalDestinations }` and `terminalFrameAt(simulation, cursor)`.

- [x] **Step 1: Write the failing frame-packing tests**

```js
assert.deepEqual(frames.map(frame => frame.map(({ flight }) => flight)), [
  ['ZE214', '7C506', 'KE1612'],
  ['KE1214', 'LJ562', 'KE1614'],
  ['BX8028', 'BX8182', 'OZ8144'],
  ['LJ508', 'BX8108', 'KE1596'],
  ['TW720', '7C120', 'KE1586'],
  ['ZE274', 'ZE216'],
])
assert.equal(new Set(frames.flat().map(({ flightKey }) => flightKey)).size, 17)
```

- [x] **Step 2: Run the focused model test and confirm the old nine-frame model fails**

Run: `node --test frontend/src/features/terminal/terminalFlightSimulation.test.js`

Expected: FAIL because the old model returns nine frames and repeats shorter destination queues.

- [x] **Step 3: Implement stable greedy queue packing**

```js
function buildCompactFrames(destinations, capacity = 3) {
  // Keep group priority stable; take one per live destination first, then use
  // the largest remaining queue to fill spare slots. Never reuse a flight.
}
```

- [x] **Step 4: Run the model tests**

Run: `node --test frontend/src/features/terminal/terminalFlightSimulation.test.js`

Expected: PASS with 제주 producing six frames and every supported airport exposing each `flightKey` once.

### Task 2: Per-slot active/pending transition classification

**Files:**
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx`
- Modify: `frontend/src/features/terminal/terminal.css`
- Test: `frontend/src/features/terminal/DestinationWeatherPage.board-layout.test.js`
- Test: `frontend/verification/contracts/terminal-signage.spec.mjs`

**Interfaces:**
- Consumes: active and pending flight arrays of zero to three entries.
- Produces: slot transition kinds `flight`, `destination`, `enter`, `exit`, or `stable` for both signage views.

- [x] **Step 1: Write failing slot-transition tests**

```js
assert.deepEqual(classifyTerminalSlots(frame4, frame5), [
  { kind: 'flight' },
  { kind: 'destination' },
  { kind: 'destination' },
])
assert.deepEqual(classifyTerminalSlots(frame5, frame6).map(slot => slot.kind), ['flight', 'flight', 'exit'])
```

- [x] **Step 2: Run focused UI/model tests and confirm the whole-frame boolean cannot represent mixed transitions**

Run: `node --test frontend/src/features/terminal/*.test.js`

Expected: FAIL until slot-level classification replaces `isFlightOnlyTransition`.

- [x] **Step 3: Render three positional slot shells and apply transition classes independently**

```jsx
<div className={`terminal-slot is-${transition.kind}`}>
  {transition.active && <BoardColumn flight={transition.active} />}
  {transition.pending && <BoardColumn flight={transition.pending} />}
</div>
```

- [x] **Step 4: Preserve the active/pending animation contract**

Same-destination slots expose only `.flight-variant-value` from the pending layer. Destination replacements expose the pending card as a full-card animation. Exit slots animate the active card and leave an empty slot after commit.

- [x] **Step 5: Run terminal unit and Playwright contracts**

Run: `node --test frontend/src/features/terminal/*.test.js`

Run: `npm --prefix frontend run dev:contract:fast -- contracts/terminal-signage.spec.mjs`

Expected: all tests pass; 제주 displays six frames and no transition shows overlapping old/new text.

### Task 3: Architecture record and final verification

**Files:**
- Modify: `Architecture.md`

**Interfaces:**
- Produces: an authoritative description of queue ordering, compact frame construction, and slot transition semantics.

- [x] **Step 1: Update the terminal file-role entry and reference rules**

Record that destination queues are ordered by descending size, ties retain schedule order, each flight is consumed once, spare slots are backfilled from remaining queues, and transitions are classified per slot.

- [x] **Step 2: Verify UTF-8, build, and graph freshness**

Run: `node --test frontend/src/features/terminal/*.test.js`

Run: `npm --prefix frontend run build`

Run: `graphify update .`

Run: `git diff --check`

Expected: tests and build pass, graph update completes, and no whitespace or encoding errors are reported.
