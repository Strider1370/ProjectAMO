import assert from 'node:assert/strict'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../../../../..')
let viteServer

async function renderGroundCurrentWeatherCard(props) {
  viteServer ??= await createServer({
    root: frontendRoot,
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
  })
  const { default: GroundCurrentWeatherCard } = await viteServer.ssrLoadModule('/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx')
  return renderToStaticMarkup(createElement(GroundCurrentWeatherCard, props))
}

after(async () => viteServer?.close())

test('GroundCurrentWeatherCard keeps METAR SHRA ahead of BKN cloud coverage', async () => {
  const html = await renderGroundCurrentWeatherCard({
    icao: 'RKSS',
    metarData: {
      airports: {
        RKSS: {
          header: { issue_time: '2026-08-20T03:00:00.000Z' },
          observation: {
            display: { weather: 'SHRA', weather_icon: 'SHRA' },
            visibility: { cavok: false },
            weather: [{ raw: 'SHRA', icon_key: 'SHRA' }],
            clouds: [{ amount: 'BKN' }],
            temperature: { air: 22, dewpoint: 19 },
            wind: { speed: 8, direction: 180 },
          },
        },
      },
    },
  })

  assert.match(html, /소나기/)
  assert.match(html, /title="rain"/)
  assert.doesNotMatch(html, /구름많음/)
})
