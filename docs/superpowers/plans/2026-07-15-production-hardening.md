# Production Hardening Deferred Implementation Plan

> Status: planned only. This document changes no application or VM behaviour.
>
> Goal: turn the nine security and reliability findings from the 2026-07-15
> review into small, independently verifiable follow-up changes.

## Ground rules

- Start every task by checking the current branch, dirty files, and the exact
  files named by that task. Do not stage unrelated work.
- The public nginx configuration, PM2 configuration, and backup service live
  on the VM. Repository documentation is evidence of the intended setup, not
  proof of the live setup; verify it before changing an assumption.
- Keep the existing architecture: nginx is the public entry point and the
  backend listens only on the loopback interface. Do not expose the backend
  port publicly to compensate for an nginx change.
- Do not add an abstraction or dependency unless the task's verification shows
  it is necessary. In particular, do not run an unreviewed `npm audit fix`.
- Do not change `MapView.jsx` as part of this work.

## Phase 0 — establish the production baseline

This is a read-only VM task and must happen before the nginx, backup, or PM2
changes below.

1. Record the active nginx configuration (`sudo nginx -T`), PM2 ecosystem or
   process configuration, backend bind address, Node version, and the database
   path/owner. Store only safe, redacted findings; never copy secrets into the
   repository.
2. Confirm the proxy path has exactly one trusted hop: public client -> nginx
   -> backend on `127.0.0.1`. If there is another proxy, document its address
   and adjust the later trust setting to that topology rather than guessing.
3. Check whether the VM or hosting provider already has snapshots, scheduled
   SQLite backups, and off-host retention. Perform no backup deletion during
   this audit.
4. Run `npm audit --omit=dev` from `backend/` and save the package names,
   installed versions, and available non-breaking fixes. The earlier count of
   five moderate findings is a lead, not a permanent fact.

Completion evidence: redacted VM notes, exact Node/npm versions, nginx header
behaviour, backup location/retention, and current audit output.

## Phase 1 — close the two direct production safety gaps

### 1. Trust the known proxy, not client-supplied address chains

**Owned files:** `backend/server.js`, focused backend rate-limit tests, and
`docs/operations.md` if the operational instruction changes.

`backend/server.js` currently uses `app.set('trust proxy', true)`, while the
documented nginx block appends `X-Forwarded-For`. With the Phase 0 one-hop
topology confirmed, change Express to trust one proxy hop (`1`). Do not make
this change until the backend is confirmed unreachable except through nginx.

Keep nginx's normal forwarding behaviour unless the VM audit identifies a
different ingress design. The point is that Express must use the address added
by nginx and must not treat every address supplied by a client as trusted.

Verification:

- Add or update a focused test proving that repeated requests with forged
  `X-Forwarded-For` values do not produce unlimited independent rate-limit
  identities behind the known one-hop proxy.
- Run the backend test suite.
- On the VM, make a harmless authenticated rate-limit test through nginx and
  confirm the request identity is the real client address, not an arbitrary
  address in the header.

### 2. Keep development scenario controls out of production

**Owned files:** `backend/server.js`, `backend/src/dev/scenario.js`, and
focused route tests.

The comment in `backend/src/dev/scenario.js` says the router is non-production
only, but `backend/server.js` currently mounts `/api/dev` when
`DISABLE_COLLECTION` is set. Make both conditions explicit:

- never mount `/api/dev` when `NODE_ENV === 'production'`; and
- require the existing admin-role middleware for every development scenario
  route, in addition to authentication.

The router can remain usable by an administrator in a non-production test or
development instance. Do not create a new authorization framework.

Verification:

- Production-mode route test: `/api/dev/*` is unavailable even when
  `DISABLE_COLLECTION` is set.
- Non-production route tests: anonymous and ordinary authenticated users are
  rejected; an administrator can use the intended scenario route.
- Run the backend test suite.

## Phase 2 — make failures diagnosable and shutdowns safe

### 3. Add a consistent backend error boundary

**Owned files:** `backend/server.js`, only the route modules required by the
chosen Express-4 error-forwarding approach, and focused tests.

Add one final Express error middleware that logs a safe server-side error and
returns a consistent JSON error response. Invalid JSON and unexpected route
errors should not return a default HTML page or silently terminate a request.

Express 4 does not automatically forward every rejected async handler. First
audit the existing async routes and choose the smallest explicit forwarding
pattern that covers them; do not assume that adding only the final middleware
captures all promise rejections.

Add process-level `unhandledRejection` and `uncaughtException` handling only
to record the fatal error and initiate controlled termination. They must not
log and continue in a potentially corrupted process; PM2 should restart a
process that cannot safely continue.

Verification:

- Focused tests for malformed JSON and a deliberately rejected async route.
- Confirm responses contain no stack trace or secret.
- Confirm the fatal path writes a useful error before process exit in a
  disposable local/VM test.

### 4. Drain requests during PM2 restarts

**Owned files:** `backend/server.js`, database shutdown code only if it has an
explicit close operation, focused tests, and `docs/operations.md`.

Retain the return value of `app.listen()`. On `SIGTERM` and `SIGINT`, stop
accepting new connections, allow in-flight requests a bounded time to finish,
close the database if its API supports it, then exit. Protect against handling
the same signal twice and retain a short forced-exit timeout for a stuck
process.

This is graceful, not magically zero-downtime: nginx/PM2 reload sequencing and
more than one process would be a separate deployment design decision.

Verification:

- Automated or disposable-process test sends a request, then a termination
  signal, and verifies the request completes within the configured grace
  period.
- Run the backend test suite.
- On the VM, perform a controlled PM2 restart and inspect logs for clean drain
  and restart messages.

### 5. Add minimal useful request and failure logs

**Owned files:** backend logging setup, `backend/server.js`, relevant tests,
and `docs/operations.md`.

Decide from Phase 0 whether the existing PM2/nginx logs already provide enough
request context. If not, add the smallest structured backend request logger
that records method, path, status, duration, request ID, and safe error
metadata. Exclude passwords, authorization headers, cookies, raw request
bodies, and query values that can contain personal data.

Do not add a browser error-report endpoint in this first pass. It creates a new
privacy and abuse surface and is not required to make backend incidents
investigable.

Verification:

- A normal request and a failed request create searchable, redacted records.
- Log volume is reviewed during a short VM observation period.
- Existing tests and production startup still pass.

## Phase 3 — restore browser and transport safety nets

### 6. Add a small React error boundary

**Owned files:** the application root entry, one new error-boundary component
if needed, focused frontend tests, and only component boundaries justified by
observed independent panels.

Start with one root boundary and a clear Korean fallback that lets the user
reload. Add a panel-level boundary only if the root test shows that losing one
panel unnecessarily removes a usable briefing screen. Avoid scattering three
or four boundaries by default.

Verification:

- A test child that throws during render shows the fallback instead of a blank
  page.
- Normal application rendering and the frontend test suite pass.
- Use Playwright to capture the fallback and the normal page, following
  `docs/dev-server-and-capture.md`.

### 7. Reconcile the security-header contract at nginx

**Owned files:** live nginx configuration and `docs/operations.md`; backend
header settings only if the source inventory proves nginx cannot own a header.

The backend intentionally disables Helmet CSP, but the repository does not
prove that the live nginx layer supplies CSP or HSTS. In Phase 0, inspect the
actual HTTPS listener and response headers first.

- Add HSTS only after confirming every relevant hostname is HTTPS-only and
  operationally ready for it.
- Build a source inventory for scripts, styles, images, maps, fonts, API calls,
  and websocket connections. Introduce CSP in report-only mode first, observe
  violations, then enforce the narrow allowlist.

Do not paste a generic CSP into nginx; it can break map tiles, external weather
data, or authentication without improving the real policy.

Verification:

- `curl -I` against each HTTPS hostname shows the intended headers.
- Browser/Playwright smoke tests cover login, map loading, and briefing data.
- CSP reports or browser console show no unexplained blocked production asset.

## Phase 4 — protect recoverability and dependency hygiene

### 8. Repair only verified dependency advisories

**Owned files:** `backend/package.json`, `backend/package-lock.json`, and
backend test evidence. Root `package-lock.json` is out of scope unless its
owner separately authorizes it.

Use the Phase 0 audit result to select the smallest direct dependency upgrade
or reviewed lockfile update. Review the resulting dependency diff and release
notes before accepting a semver-major change. Do not use a blanket automatic
fix command.

Verification:

- Re-run `npm audit --omit=dev` and record the remaining advisories and why
  any cannot yet be removed.
- Run backend tests and production-mode startup checks.

### 9. Make SQLite recovery real, not merely local copies

**Owned files:** a narrowly scoped backup script/service definition, VM
schedule configuration, and `docs/operations.md`.

Back up the live SQLite database with SQLite's safe backup mechanism while the
service is running. Keep dated, rotating copies and ensure at least one copy
is stored off the VM (for example provider backup storage or an approved
encrypted remote destination). A cron job that writes only to the same disk is
not sufficient for disk or VM loss.

Define retention, permissions, encryption responsibility, failure alerting,
and a restore procedure. Test restore into a separate temporary database; do
not test by replacing the live database.

Verification:

- A scheduled backup succeeds and is readable with SQLite integrity checks.
- A timed restore drill recovers a known test record into a separate database.
- The off-host copy and retention rotation are confirmed.

## Operational runbook update

Extend the existing `docs/operations.md` rather than creating a competing
manual. Add short, copyable sections for:

1. first response: status check, PM2 logs, nginx errors, and safe rollback;
2. degraded API/5xx investigation using the new request/error logs;
3. planned restart and what clean shutdown looks like;
4. backup failure response and the separate-database restore drill; and
5. who may enable non-production scenario controls.

Do not put passwords, tokens, personal data, or raw production database paths
in the runbook.

## Suggested execution order

1. Phase 0 baseline (VM read-only evidence).
2. Trust-proxy and development-router protections.
3. Backend error boundary and graceful shutdown.
4. Backup plus runbook and a restore drill.
5. Dependency remediation from the current audit result.
6. Minimal request logging, React error boundary, and header rollout.

Each item is intentionally an independent commit with its own tests. After
each commit, update the appropriate status record with the exact command
output and the next safe step.
