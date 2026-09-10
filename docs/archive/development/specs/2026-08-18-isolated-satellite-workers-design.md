# Isolated Satellite Workers Design

## Goal

Keep the long-lived ProjectAMO backend free of `h5wasm`, HDF5, and `sharp`
working memory by running every satellite collection in a one-shot child
process that exits after publishing its result.

## Scope

The isolated execution path covers all three satellite products:

- IR105/FOG satellite collection (`satellite`);
- its CI/CTPS convective collection; and
- VI006 visible-satellite collection (`satellite_visible`).

Radar graphics, Echo Top, and unrelated weather collectors are out of scope.
Their current schedules and process lifetime remain unchanged.

## Existing condition

All three products parse KMA NetCDF/HDF5 payloads with `h5wasm`. The normal
and visible satellite processors also use `sharp` to render WebP files. They
currently run inside the long-lived backend scheduler process. `h5wasm` is
built with growing WebAssembly memory, so closing a file does not guarantee
that its high-water memory is returned while the Node process remains alive.

## Architecture

`backend/src/index.js` remains the owner of scheduling, API-Hub key gating,
collection statistics, cancellation, and the public collection lifecycle. It
must no longer import a satellite processor that loads `sharp` or `h5wasm`.

A new satellite-worker runner module is the seam used by the scheduler:

```text
cron/startup/retry
  -> satellite runner in backend process
    -> fork one worker Node process
      -> import exactly one satellite processor
      -> download, parse, render, atomically publish files and metadata
      -> send a structured result through IPC and exit
  -> existing runWithLock logging/statistics
```

The child inherits the backend environment so it receives the same `DATA_PATH`
and KMA credentials without serialising secrets through IPC. IPC carries only
the job kind, invocation time, and explicit run mode.

The runner accepts the compact interface:

```js
runSatelliteWorker({ kind, now, mode, signal })
// kind: 'satellite' | 'satellite_visible'
// mode: 'current' | 'backfill' | 'fog_retry'
// resolves to the processor result, rejects for child crash, protocol error,
// timeout, or cancellation
```

Every invocation forks a fresh process. The process sends one terminal IPC
message: success is `{ ok: true, result: { result, followUps } }`, and failure
is `{ ok: false, error }`. The runner enforces the configured finite
`config.satellite.worker_timeout_ms` timeout (180,000 ms by default),
terminates a cancelled child, and waits for its exit before settling. A child
non-zero exit without a terminal message is a failure.

## Scheduling and concurrency

Satellite work must be serialized across both kinds. The backend owns one
satellite-work queue in addition to the existing per-collection locks. This
prevents IR/FOG/CI/CTPS and VI006 HDF5 workers from using peak memory at the
same time on the 2GiB EC2 instance.

The existing `satellite` and `satellite_visible` cron schedules and initial
collection entries remain named and observable as they are today. They enqueue
their corresponding one-shot job and await its terminal result through
`runWithLock`.

The normal satellite processor's deferred historical fill and delayed FOG
retry cannot remain `setTimeout` callbacks inside the worker: the worker exits
after a single job. They become explicit parent-owned follow-up jobs. Each
follow-up receives the exact target timestamp and run mode, then runs in a
fresh worker after the configured delay. The parent keeps only timer metadata;
it never imports image/HDF5 modules. Per-frame retry limits and retained
metadata remain the existing processor contract. On cancellation, the queue
rejects every pending caller with the cancellation reason, clears all delayed
follow-ups, aborts and awaits the active child, then accepts later fresh
enqueues normally.

## Data and failure contract

Workers continue using the existing file paths, retention limits, metadata
schemas, and previous-data behaviour. The refactor introduces temp-file and
rename publication for normal satellite WebP and `sat_meta.json` writes (the
existing normal path does not yet provide that guarantee); it publishes
metadata only after all referenced frame files are safely in place.
The frontend and HTTP routes have no contract changes.

If download, parsing, rendering, worker startup, IPC, timeout, or cancellation
fails, the worker must not publish partial metadata. Existing successfully
published frames and metadata stay readable. The backend records the
collection failure through the existing statistics/logging path, releases all
locks, and lets the next scheduled run retry. A cancelled data-view transition
must terminate its child and allow `quiesceCollections()` to wait until it is
gone.

## Test and acceptance criteria

- Scheduler tests prove startup and cron satellite entries call the runner,
  never the in-process satellite processors.
- Runner tests prove message success, child non-zero exit, malformed/missing
  IPC, timeout, abort signal, and cleanup of child/listeners.
- Queue tests prove no more than one satellite child runs at a time, including
  a normal and visible invocation arriving together.
- Worker entry tests prove each job kind dispatches to the correct processor
  and returns only JSON-serializable terminal results.
- Satellite processor tests prove `current`, `backfill`, and `fog_retry`
  modes preserve retention, night-frame recording, bounded FOG retry, and
  atomic publication semantics.
- On the EC2 VM, a normal and visible run complete successfully while the
  parent backend RSS remains stable after workers exit; the browser-visible
  satellite layers still load their newly published frames.

## Non-goals

- Rebuilding or patching `h5wasm`.
- Changing KMA endpoints, credentials, product channels, retention counts, or
  frontend payload schemas.
- Adding Redis, a daemon worker, a general job queue service, or a PM2 restart
  as the primary solution.
