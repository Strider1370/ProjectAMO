# KIM Four-run Forecast Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect 0–12h hourly KIM forecasts on all four synoptic cycles, route 18Z KIM/KTG through the aviation credential, and retain the source-supported +6/+9/+12h KTG window.

**Architecture:** A shared run-credential selector owns the UTC analysis-hour routing. KIM and KTG collectors consume that selector, while their stores, APIs, frontend index contract, and API Hub accounting remain unchanged.

**Tech Stack:** Node.js ESM, node:test, node-cron, Express, React admin console.

## Global Constraints

- Store and compare all run times in UTC.
- Never persist credentials or request URLs.
- Preserve locks, retry behavior, and last-good publication.
- Use the KIM credential at 00Z/06Z/12Z and the aviation credential only at 18Z.
- KIM uses forecast hours 0 through 12. KTG uses source-supported forecast hours 6, 9, and 12.

---

### Task 1: Add run-scoped credential selection

**Files:**
- Create: `backend/src/processors/kim-run-credential.js`
- Modify: `backend/src/config.js`
- Modify: `backend/src/index.js`
- Test: `backend/test/kim-run-credential.test.js`
- Test: `backend/test/kim-scheduler.test.js`

**Interfaces:**
- Produces: `selectKimRunCredential({ tmfc, kimCredential, aviationCredential }) -> string`.
- Throws: error code `kim_18z_aviation_credential_unavailable` if the 18Z credential is absent or identical to the KIM credential.

- [ ] Write failing tests proving 00Z/06Z/12Z select `kimCredential`, 18Z selects `aviationCredential`, and an unsafe 18Z fallback throws the named error.
- [ ] Run `cd backend && node --test test/kim-run-credential.test.js`; confirm it fails because the module is absent.
- [ ] Implement the selector by reading the final two UTC hour digits in `tmfc`; return the KIM credential except at `18`, where a non-empty distinct aviation credential is required.
- [ ] Expose the existing aviation credential through `config.api`; do not introduce or duplicate a secret.
- [ ] Remove static `KIM_NWP_KEY` preflight only from KIM and KTG scheduler/startup jobs. The existing global fetch guard must block the run's selected credential before any upstream request.
- [ ] Add a failing scheduler/processor test proving a blocked KIM credential does not suppress a valid 18Z aviation-key run, and a blocked aviation credential makes zero upstream requests for that run.
- [ ] Re-run the focused test and confirm PASS.

### Task 2: Collect KIM hourly through +12 on all four release windows

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/api-client.js`
- Modify: `backend/src/processors/kim-nwp-model.js`
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Modify: `backend/test/kim-surface-wind.test.js`
- Modify: `backend/test/kim-nwp-model.test.js`
- Modify: `backend/test/kim-scheduler.test.js`

**Interfaces:**
- `buildKimGridUrl({ ..., credential })` uses `credential` when supplied and retains the configured KIM credential as its default.
- KIM `process()` selects a credential once per candidate run and passes it to every grid request.

- [ ] Write failing assertions for the exact KIM list `[0,1,2,3,4,5,6,7,8,9,10,11,12]` in both config and model tests, the four-window UTC cron `12 0,1,2,6,7,8,12,13,14,18,19,20 * * *`, and an 18Z URL containing the supplied aviation credential.
- [ ] Run `cd backend && node --test test/kim-surface-wind.test.js test/kim-scheduler.test.js`; confirm the old forecast list and cron fail the new assertions.
- [ ] Change the KIM config and default model list to the hourly 0–12 list.
- [ ] Change the KIM cron to all four release windows while preserving the +1/+2-hour retries.
- [ ] Thread the selected credential from the candidate run through KIM component collection, `fetchKimGrid`, and `buildKimGridUrl`.
- [ ] Add a processor-level 18Z test that records every KIM request and proves the selected aviation credential reaches wind, temperature, height, humidity, specific-humidity, and icing component downloads; prove an unavailable aviation credential makes zero KIM requests and does not continue to an older candidate.
- [ ] Re-run `cd backend && node --test test/kim-surface-wind.test.js test/kim-scheduler.test.js test/kim-nwp-model.test.js test/kim-nwp-store.test.js`; confirm PASS.

### Task 3: Limit KTG to its supported +6/+9/+12 window and route 18Z

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/processors/ktg-model.js`
- Modify: `backend/src/processors/ktg-processor.js`
- Create: `backend/test/ktg-processor.test.js`

**Interfaces:**
- Produces: a pure `buildKtgUrl({ tmfc, ef, credential })` helper.
- KTG `process()` selects the same run-scoped credential as KIM once per candidate run before any source download.

- [ ] Write failing tests that expect both KTG configuration and model defaults to equal `[6,9,12]`, and an 18Z KTG URL to contain a supplied aviation credential.
- [ ] Run `cd backend && node --test test/ktg-processor.test.js`; confirm failure because the helper and configuration do not yet exist.
- [ ] Set the KTG config and model default list to `[6,9,12]`, extract the pure URL helper, and pass the one selector result through every +6/+9/+12 download.
- [ ] Add a processor-level 18Z test proving all three downloads use the aviation credential and an unavailable aviation credential produces zero KTG downloads.
- [ ] Keep KTG’s existing four release windows, existing-file skip, NetCDF parsing, and atomic writes.
- [ ] Re-run `cd backend && node --test test/ktg-processor.test.js test/cross-section-route.test.js`; confirm PASS.

### Task 4: Lock down accounting and admin behavior

**Files:**
- Modify: `backend/test/api-hub-usage.test.js`
- Modify: `backend/test/fetch-api-hub.test.js`
- Modify: `backend/test/admin.test.js`

**Interfaces:**
- Existing API Hub accounting remains credential-fingerprint based.
- Aviation-key KIM calls must display as `KIM 격자` and `KTG 격자` under the aviation category.

- [ ] Add a characterization/regression usage test that records `kim_grid` and `ktg` bytes with the aviation credential and asserts they appear only under the aviation category with their existing labels.
- [ ] Run `cd backend && node --test test/api-hub-usage.test.js`; confirm the existing accounting behavior passes before production changes.
- [ ] Add only necessary regression assertions; do not add a duplicate admin category or expose credentials.
- [ ] Run `cd backend && node --test test/api-hub-usage.test.js test/fetch-api-hub.test.js test/admin.test.js`; confirm PASS.

### Task 5: Full verification and graph refresh

**Files:**
- Modify: `graphify-out/` only through incremental graph update.

- [ ] Run `cd backend && node --test test/kim-run-credential.test.js test/kim-surface-wind.test.js test/kim-scheduler.test.js test/ktg-processor.test.js test/cross-section-route.test.js test/api-hub-usage.test.js test/fetch-api-hub.test.js test/admin.test.js`.
- [ ] Run `cd backend && npm test`.
- [ ] Run `graphify update .`.
- [ ] Record the real command output in the completion handoff.
