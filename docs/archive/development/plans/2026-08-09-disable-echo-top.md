# Temporarily Disable Echo Top Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop Echo Top API collection and hide its frontend toggle while preserving existing generated files.

**Architecture:** Reuse the backend's existing `RADAR_ECHO_TOP_ENABLED` flag for both scheduled and startup collection. Add a frontend build flag to filter only the Echo Top button from `WeatherOverlayPanel`.

**Tech Stack:** Node.js test runner, React/Vite, node-cron, PM2 on Linux EC2.

## Global Constraints

- Do not change ordinary radar, satellite, CI, CTPS, WISSDOM, or QPF collection.
- Do not delete existing Echo Top files.
- Keep unrelated dirty-worktree changes untouched.
- Verify locally before deploying to EC2.

### Task 1: Backend scheduling guard

**Files:**
- Modify: `backend/src/index.js:155-166,214-218`
- Test: `backend/test/kim-scheduler.test.js`

- [ ] Write a failing test that calls `buildInitialCollectionJobs()` with Echo Top disabled and asserts no `echo_top` job is present.
- [ ] Add a scheduler test using a fake scheduler and a disabled config argument proving no Echo Top cron registration or backfill occurs.
- [ ] Run `npm --prefix backend test -- test/kim-scheduler.test.js` and confirm the new assertions fail before implementation.
- [ ] Make `buildInitialCollectionJobs` accept the existing config-derived enable state and conditionally omit Echo Top; conditionally register its cron and startup backfill in `main`.
- [ ] Run the focused backend tests and confirm they pass.

### Task 2: Frontend button flag

**Files:**
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx:1-75`
- Test: `frontend/src/features/weather-overlays/WeatherOverlayPanel.test.js`

- [ ] Add a source-level test proving `VITE_ECHO_TOP_ENABLED === '0'` removes `echoTop` from the observation layer IDs while the default keeps it.
- [ ] Run the focused frontend test and confirm it fails before implementation.
- [ ] Add the minimal Vite flag check and filter `echoTop` from the observation IDs when disabled.
- [ ] Run the focused frontend test and confirm it passes.

### Task 3: Local verification and commit

**Files:**
- Modify: none beyond Tasks 1-2

- [ ] Run focused backend and frontend tests.
- [ ] Run the frontend production build with `VITE_ECHO_TOP_ENABLED=0`.
- [ ] Run `graphify update .` after code changes.
- [ ] Review the diff and commit only the requested code/tests.

### Task 4: EC2 deployment and verification

**Files:**
- Remote `/opt/projectamo/current/.env`: set `RADAR_ECHO_TOP_ENABLED=0` and `VITE_ECHO_TOP_ENABLED=0`

- [ ] Deploy the committed code using the documented Linux fast deploy path.
- [ ] Restart PM2 with updated environment and verify `/api/health`.
- [ ] Verify recent PM2 logs contain no new Echo Top collection activity.
- [ ] Verify existing Echo Top files remain present and no other collector was disabled.
