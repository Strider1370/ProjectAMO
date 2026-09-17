import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test, { after } from 'node:test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const frontendRoot = fileURLToPath(new URL('../../../..', import.meta.url))
let viteServer

async function loadScreenModule() {
  viteServer ??= await createServer({
    root: frontendRoot,
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
  })
  return viteServer.ssrLoadModule('/src/features/admin/screens/ServerResourceScreen.jsx')
}

after(async () => viteServer?.close())

test('recent collection error timestamps use the selected display timezone', async () => {
  const { formatRecentErrorTime } = await loadScreenModule()
  const time = '2026-01-02T00:00:00.000Z'

  assert.equal(formatRecentErrorTime(time, 'UTC'), new Date(time).toLocaleString('ko-KR', { timeZone: 'UTC' }))
  assert.equal(formatRecentErrorTime(time, 'KST'), new Date(time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))
  assert.notEqual(formatRecentErrorTime(time, 'UTC'), formatRecentErrorTime(time, 'KST'))
})
