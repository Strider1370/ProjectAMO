import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const frontendRoot = fileURLToPath(new URL('../../..', import.meta.url))
let viteServer

async function renderCard(props) {
  viteServer ??= await createServer({
    root: frontendRoot,
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  })
  const { default: QpfStatusCard } = await viteServer.ssrLoadModule('/src/features/weather-overlays/QpfStatusCard.jsx')
  return renderToStaticMarkup(QpfStatusCard(props))
}

after(async () => viteServer?.close())

test('QPF status card stays absent without an exact forecast status', async () => {
  assert.equal(await renderCard({ status: null, tz: 'KST' }), '')
})

test('QPF status card discloses the MAPLE forecast in the selected timezone', async () => {
  const status = {
    source: 'MAPLE',
    analysisTimeMs: Date.UTC(2026, 7, 4, 1, 25),
    validTimeMs: Date.UTC(2026, 7, 4, 1, 55),
    leadMinutes: 30,
    unit: 'mm/h',
  }

  const kst = await renderCard({ status, tz: 'KST' })
  const utc = await renderCard({ status, tz: 'UTC' })

  for (const markup of [kst, utc]) {
    assert.match(markup, /초단기 강수예측/)
    assert.match(markup, /MAPLE/)
    assert.match(markup, /\+30분/)
    assert.match(markup, /mm\/h/)
    assert.doesNotMatch(markup, /QPF.{0,12}관측|관측.{0,12}QPF|레이더 관측/)
  }
  assert.match(kst, /기준 10:25 KST/)
  assert.match(kst, /선택 10:55 KST/)
  assert.match(utc, /기준 01:25 UTC/)
  assert.match(utc, /선택 01:55 UTC/)
})
