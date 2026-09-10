# API Hub Key Usage Guard

## Goal

Prevent any of the three KMA API Hub keys from exceeding its daily 5 GB allowance, and show each key's current usage and circuit-breaker state in the existing `/admin` console.

## Decisions

- The protected key categories are `aviation`, `radar_satellite`, and `kim_nwp`.
- The daily KMA allowance is 5,000,000,000 bytes and the stop threshold is 4,750,000,000 bytes (5% margin).
- A KMA API Hub day is interpreted in `Asia/Seoul`. At the next KST midnight, each key is automatically available again and a new daily ledger begins.
- Use a stable one-way fingerprint of the configured credential as the stored key identity. Never persist or return an API key. If configuration falls back to the same physical key for more than one category, their usage must aggregate under that fingerprint.
- Every KMA API Hub credential actually used by a call, including special-warning and UV overrides, must resolve to one of the three configured primary credentials. A fourth, unassigned credential is a local configuration error and is blocked before network access; it must never be silently attributed to the wrong quota.
- Existing environment flags remain a manual emergency override. In particular, `KMA_RADAR_SATELLITE_ENABLED=0` continues to disable radar/satellite collection independently of the usage guard.

## Collection Guard

- Introduce one shared KMA API Hub fetch wrapper. Every KMA API Hub request passes its actual credential through it; the wrapper resolves the corresponding primary-key category and blocks an unassigned credential locally. Non-KMA providers (NOAA, RainViewer, airport/public-data APIs) remain unchanged.
- Before issuing a request, the wrapper checks the current KST daily ledger. A blocked key fails locally without opening a network connection.
- The wrapper reads the upstream response body once, records its exact received byte length, status, success/failure count, endpoint label, and call timestamp, then returns an equivalent readable `Response` to the existing caller.
- When the recorded total reaches the 4.75 GB threshold, the wrapper atomically marks the physical key blocked until the following KST midnight. A KMA API Hub HTTP 403 also marks that key blocked immediately, with a distinct `upstream_403` reason.
- Scheduled and startup collection jobs declare which key category they consume. The scheduler skips a job whose only required key is blocked, writes a clear skip log, and records a non-failure skip reason in collector statistics instead of producing repeated collection failures. The fetch wrapper remains the authoritative boundary for jobs with mixed key use and for any future caller.
- Do not retry a local budget-blocked request. Preserve existing retry rules for responses before the key becomes blocked.

## Persistence and API Contract

- Persist a compact, atomically-written ledger under `DATA_PATH` after each KMA API Hub response/state transition. It must survive a server restart and remain readable even if an interrupted write leaves a temporary file. For each physical key, aggregate the same response fields by an identifier from a central fixed endpoint allow-list; do not retain or accept individual URLs, query strings, payloads, credentials, or caller-provided labels.
- Retain only the active KST day and one previous day for diagnosis. Do not store request URLs, query strings, response payloads, or credential values.
- Add `GET /api/admin/api-hub-usage`, protected by the existing admin middleware. It returns one item per configured key category with: label, key fingerprint suffix, KST day, received bytes, 5 GB limit, 4.75 GB threshold, request/success/failure counts, last-call timestamp, status (`active` or `blocked`), block reason, next KST reset timestamp, and an `endpoints` array sorted by received bytes descending. Each endpoint row contains only its safe label, bytes, request/success/failure counts, and last-call timestamp.

## Admin Console

- Add an API Hub usage card to the existing `/admin` **Server Resources** tab; do not create a new route or new tab.
- Display all three categories, including an empty/unconfigured state. Each configured row shows usage versus the 5 GB limit, a threshold-colored bar, request/success/failure counts, last call, and either `정상` or the block reason plus automatic reset time.
- A key row is an accessible expand/collapse button with linked `aria-expanded` and `aria-controls` state. When expanded, show its API endpoint rows in descending received-byte order so the largest consumer is first.
- The panel is read-only. No manual reset/release button is included because KMA's daily counter remains authoritative.
- Use existing admin design tokens and stay usable at the existing mobile breakpoint.

## Verification

- Unit tests cover KST day rollover, byte accumulation, same-key fallback aggregation, an unassigned fourth credential, threshold blocking before a subsequent network call, 403 blocking, restart recovery, and no credential persistence.
- Scheduler tests cover a blocked key causing the relevant cron/startup job to skip while unrelated jobs still run.
- Admin route tests prove authorization and the response contract; frontend tests prove active, blocked, and unconfigured rows render correctly.
- Run focused backend/frontend tests, production frontend build, `graphify update .`, and browser verification of `/admin` as an authenticated admin before deployment.
- Deploy with the current radar/satellite emergency flag still enabled until KMA's next KST reset; then remove that emergency flag and verify the new guard records a controlled request.
