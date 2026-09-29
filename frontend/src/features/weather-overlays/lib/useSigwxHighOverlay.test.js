import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

let server
async function renderInitialState(enabled) {
  server ??= await createServer({
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
  })
  const { useSigwxHighOverlay } = await server.ssrLoadModule('/src/features/weather-overlays/lib/useSigwxHighOverlay.js')
  function Probe() {
    const model = useSigwxHighOverlay({ mapRef: { current: null }, isStyleReady: false,
      styleRevision: 0, enabled, selectedMs: null, basemapId: 'standard', tz: 'UTC' })
    assert.equal(model.frame, null)
    assert.equal(model.count, 0)
    assert.deepEqual(model.entries, [])
    return createElement('span', null, model.timestamp?.issueLabel ?? 'OFF')
  }
  return renderToStaticMarkup(createElement(Probe))
}
after(async () => server?.close())

test('HIGH can render immediately after being enabled, before index or frame has loaded', async () => {
  assert.match(await renderInitialState(true), /불러오는 중/)
})
test('HIGH remains empty while disabled', async () => {
  assert.match(await renderInitialState(false), /OFF/)
})
