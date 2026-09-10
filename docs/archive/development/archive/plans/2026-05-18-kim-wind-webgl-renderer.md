# KIM Wind WebGL Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Phase 2 WebGL-first wind renderer while preserving the Phase 1 Canvas renderer as the fallback path.

**Architecture:** Keep Phase 1 API, sampler, `useKimSurfaceWind`, MET panel UI, and `MapView.jsx` wiring unchanged. Add `WebGLWindRenderer` behind the existing `windOverlaySync.js` weather-owned adapter, then let the adapter choose WebGL first and fall back to Canvas on context, shader, or runtime context-loss failure.

**Tech Stack:** Vite, React, Mapbox GL JS, browser WebGL, Node `node:test`.

---

## Scope Boundaries

- Do not change backend API response structure.
- Do not change `frontend/src/features/weather-overlays/lib/windField.js` sampler or color ramp contract unless a test proves a renderer integration issue.
- Do not change `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js`.
- Do not change MET panel UI semantics.
- Do not edit `frontend/src/features/map/MapView.jsx` unless the existing high-level `syncWindOverlay(...)` call cannot pass current state.
- Preserve `CanvasWindRenderer` as fallback.

## File Structure

- Create `frontend/src/features/weather-overlays/lib/webglWindRenderer.js`
  - Owns WebGL canvas, context setup, shader programs, textures/buffers, frame loop, resize, visibility, cleanup, and context-loss fallback signaling.
- Modify `frontend/src/features/weather-overlays/lib/windOverlaySync.js`
  - Chooses renderer: WebGL first, Canvas fallback, cleanup-only if both fail.
  - Handles async `setData()` sequencing so stale uploads cannot overwrite newer wind fields.
- Modify `frontend/src/features/weather-overlays/lib/windOverlaySync.test.js`
  - Tests renderer selection, fallback, async sequencing, cleanup, and current public lifecycle behavior.
- Keep `frontend/src/features/weather-overlays/lib/canvasWindRenderer.js`
  - No deletion. Only modify if fallback compatibility requires a small public-interface fix.

## Task 1: Renderer Selection Contract

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/windOverlaySync.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/windOverlaySync.js`

- [ ] **Step 1: Add failing tests for renderer selection**

Add tests that install a fake DOM where `canvas.getContext('webgl')` succeeds or fails. The assertions must check:

```js
test('syncWindOverlay prefers WebGL renderer when WebGL context is available', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.type, 'webgl')
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 1)
  } finally {
    dom.restore()
  }
})

test('syncWindOverlay falls back to Canvas renderer when WebGL context is unavailable', () => {
  const dom = installDom({ webgl: false })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(state.renderer.type, 'canvas')
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="flow"]').length, 1)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="speed"]').length, 1)
  } finally {
    dom.restore()
  }
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: FAIL because `WebGLWindRenderer` and renderer selection do not exist yet.

- [ ] **Step 3: Add minimal renderer selection**

Update `windOverlaySync.js` so it imports both renderers and uses a small factory:

```js
function createRenderer(map, options) {
  try {
    return new WebGLWindRenderer(map, options)
  } catch {
    return new CanvasWindRenderer(map, options)
  }
}
```

This step may use a temporary minimal `WebGLWindRenderer` that creates a WebGL canvas and exposes the existing lifecycle interface.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS for renderer selection tests and existing lifecycle tests.

## Task 2: WebGL Renderer Lifecycle

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/webglWindRenderer.js`
- Modify: `frontend/src/features/weather-overlays/lib/windOverlaySync.test.js`

- [ ] **Step 1: Add failing lifecycle tests**

Add tests that verify:

```js
test('WebGL renderer stop and destroy cancel animation and remove canvas', () => {
  const dom = installDom({ webgl: true })
  try {
    const map = createMap()
    const state = syncWindOverlay(map, {
      windField: FIELD_A,
      visibility: { wind: true, windFlow: true, windSpeed: false },
    })

    assert.equal(dom.activeFrames.size, 1)
    destroyWindOverlay(map)
    assert.equal(dom.activeFrames.size, 0)
    assert.equal(map.container.querySelectorAll('canvas[data-kim-wind-overlay="webgl"]').length, 0)
    assert.equal(state.renderer.destroyed, true)
  } finally {
    dom.restore()
  }
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: FAIL until `WebGLWindRenderer` owns `start`, `stop`, `destroy`, and DOM cleanup.

- [ ] **Step 3: Implement minimal WebGL lifecycle**

Implement:

```js
export class WebGLWindRenderer {
  type = 'webgl'
  constructor(map, options = {}) {}
  setData(windField) {}
  setVisibility({ flow = false, speed = false } = {}) {}
  resize() {}
  start() {}
  stop() {}
  destroy() {}
}
```

The constructor must create one absolute-positioned canvas with `data-kim-wind-overlay="webgl"`, request a WebGL context, throw if no context exists, append the canvas, and call `resize()`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS lifecycle tests.

## Task 3: WebGL Data Upload And Draw Skeleton

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/webglWindRenderer.js`
- Modify: `frontend/src/features/weather-overlays/lib/windOverlaySync.test.js`

- [ ] **Step 1: Add failing tests for data upload calls**

Use a fake WebGL context that records calls. Add assertions that `setData(FIELD_A)` calls texture creation/upload at least once and that `resize()` updates viewport size.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: FAIL because WebGL texture upload is not implemented.

- [ ] **Step 3: Implement minimal texture/buffer upload**

Implement enough WebGL setup for Phase 2:

- Compile one fullscreen quad program for speed color.
- Compile one point/line-oriented particle program or a minimal point draw skeleton.
- Upload decoded wind vectors to a floating-point or byte-packed texture if supported; otherwise use an RGBA unsigned-byte normalized texture.
- Upload color ramp texture or uniform ramp constants.
- Call `gl.viewport(...)` during resize.
- Call `gl.drawArrays(...)` only when flow or speed visibility is on.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS data upload tests.

## Task 4: Async setData Sequencing And Runtime Fallback

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/windOverlaySync.js`
- Modify: `frontend/src/features/weather-overlays/lib/webglWindRenderer.js`
- Modify: `frontend/src/features/weather-overlays/lib/windOverlaySync.test.js`

- [ ] **Step 1: Add failing tests for async stale data**

Add a test with a fake renderer where first `setData(FIELD_A)` resolves after second `setData(FIELD_B)`. Verify final state tracks `FIELD_B`.

- [ ] **Step 2: Add failing tests for context lost fallback**

Trigger the WebGL canvas `webglcontextlost` handler. Verify the WebGL renderer is destroyed and the next `syncWindOverlay(...)` call returns Canvas fallback.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: FAIL because sequencing and context-loss fallback are not implemented.

- [ ] **Step 4: Implement sequencing and runtime fallback**

In `windOverlaySync.js`, maintain a monotonically increasing `dataVersion` on state. Apply `state.windField = model.windField` only if the version that initiated `setData()` is still current.

In `WebGLWindRenderer`, mark `failed = true` on `webglcontextlost`, stop the animation loop, and expose enough state for `windOverlaySync.js` to destroy/recreate with Canvas fallback.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS sequencing and fallback tests.

## Task 5: Final Verification

**Files:**
- No expected production edits unless verification exposes a scoped bug.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/windField.test.js frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: exit code 0.

- [ ] **Step 3: Optional browser smoke**

If the dev server is available, verify Wind overlay toggles and basemap switch in the browser. If not available, state that browser smoke was not run.

- [ ] **Step 4: Review changed files**

Run:

```powershell
git diff -- frontend/src/features/weather-overlays/lib docs/archive/development/plans docs/archive/development/specs/2026-05-18-surface-wind-animation-speed-layer-design.md
```

Expected: only Phase 2 renderer, sync helper, tests, and plan/spec changes.
