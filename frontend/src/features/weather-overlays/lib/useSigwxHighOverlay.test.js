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
    return createElement('span', null, model.timestamp ? `${model.timestamp.issueLabel}|${model.loading ? 'loading' : 'idle'}` : 'OFF')
  }
  return renderToStaticMarkup(createElement(Probe))
}
after(async () => server?.close())

test('HIGH can render immediately after being enabled, before index or frame has loaded', async () => {
  // 불러오는 중은 범례 글자가 아니라 지도 맨 위 진행 막대로 알린다(loading).
  assert.match(await renderInitialState(true), /-\|loading/)
})
test('HIGH remains empty while disabled', async () => {
  assert.match(await renderInitialState(false), /OFF/)
})
