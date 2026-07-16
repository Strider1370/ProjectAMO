import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildBriefingRoute } from './routePlanner.js'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const publicData = path.join(frontendRoot, 'public', 'data', 'navdata')

test('buildBriefingRoute derives the current domestic graph from enroute.json', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json'
      ? path.join(publicData, name)
      : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }

  try {
    const route = await buildBriefingRoute({
      departureAirport: 'RKSI', entryFix: 'SEL', exitFix: 'APELA', arrivalAirport: 'RKPK', routeType: 'ATS',
    })
    assert.equal(route.routeIds[0], 'A582')
    assert.equal(route.segments[0].id, 'A582-001')
    assert.equal(route.segments[0].cycle, '2026-06-25')
  } finally {
    global.fetch = originalFetch
  }
})
