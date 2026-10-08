import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid, buildKimNwpIndex, buildKimNwpIndexEntry, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { buildKimNwpRunId, resolveKimNwpGridPath, writeKimNwpGrid, writeKimNwpIndex, writeKimNwpLatest } from '../src/processors/kim-nwp-store.js'
import { clearRouteCrossSectionCache, loadRouteCrossSection, selectRouteKimDomain } from '../src/briefing/enroute-cross-section.js'

const TMFC = '2099010100'
const temporary = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-route-domain-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }
// 서울 근처만 지나는 국내 항로와 방콕까지 가는 해외 항로.
const DOMESTIC = { type: 'LineString', coordinates: [[126.5, 37.5], [129.0, 35.2]] }
const BANGKOK = { type: 'LineString', coordinates: [[126.5, 37.5], [100.7, 13.7]] }

// 단면에 쓰는 850 hPa 한 층(1° 간격 성긴 격자). 영역마다 기온을 달리 두어 어느 영역을 읽었는지 구분한다.
function seed(root, domain, bounds, temperature) {
  const level = KIM_NWP_LEVELS.find(entry => entry.id === '850hPa')
  const nx = bounds.lonMax - bounds.lonMin + 1
  const ny = bounds.latMax - bounds.latMin + 1
  const grid = buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc: TMFC, hf: 0, level, fetchedAt: '2099-01-01T00:00:00.000Z', components: [
    { variable: 'u', unit: 'm/s', level: 850, nx, ny, bounds: { ...bounds, dx: 1, dy: 1 }, values: Array(nx * ny).fill(10) },
    { variable: 'v', unit: 'm/s', level: 850, nx, ny, bounds: { ...bounds, dx: 1, dy: 1 }, values: Array(nx * ny).fill(0) },
    { variable: 'T', unit: 'K', level: 850, nx, ny, bounds: { ...bounds, dx: 1, dy: 1 }, values: Array(nx * ny).fill(temperature) },
  ] })
  writeKimNwpGrid({ root, grid, domain })
  const entry = buildKimNwpIndexEntry(grid, path.relative(root, resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc: TMFC, hf: 0, levelId: '850hPa', domain })))
  writeKimNwpIndex(root, buildKimNwpIndex({ model: KIM_NWP_MODEL, tmfc: TMFC, entries: [entry] }), domain)
  writeKimNwpLatest(root, { model: KIM_NWP_MODEL, latestRun: TMFC, latestRunId: buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: TMFC }), updated_at: domain }, domain)
}

// 단면은 기온을 °C(t)로 준다: 280 K → 6.85, 270 K → -3.15.
const temperaturesOf = result => result.crossSection.levels.find(level => level.pressure === 850).values.map(value => value.t)

test('a route inside the Korean grid uses the Korean run; one that leaves it uses the expanded run', t => {
  const root = temporary(t)
  seed(root, 'kr', { lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 }, 280)
  seed(root, 'ea', { lonMin: 90, lonMax: 160, latMin: 6, latMax: 50 }, 270)
  clearRouteCrossSectionCache()
  const domestic = loadRouteCrossSection({ root, routeGeometry: DOMESTIC, body: { etd: addForecastHours(TMFC, 0) } })
  assert.equal(domestic.domain, 'kr')
  assert.equal(domestic.crossSection.run.domain, 'kr')
  assert.ok(temperaturesOf(domestic).every(value => value === 6.85))

  const bangkok = loadRouteCrossSection({ root, routeGeometry: BANGKOK, body: { etd: addForecastHours(TMFC, 0) } })
  assert.equal(bangkok.domain, 'ea')
  // 한 단면 안에서 영역을 섞지 않는다: 서울 쪽 구간도 확대 영역 값이다.
  const values = temperaturesOf(bangkok)
  assert.ok(values.length > 10 && values.every(value => value === -3.15))
  // 요청이 영역을 정하면 그대로 쓴다.
  assert.equal(loadRouteCrossSection({ root, routeGeometry: DOMESTIC, body: { etd: addForecastHours(TMFC, 0), domain: 'ea' } }).domain, 'ea')
  assert.throws(() => loadRouteCrossSection({ root, routeGeometry: DOMESTIC, body: { domain: 'xx' } }), /Invalid KIM domain/)
})

test('without an expanded run an overseas route falls back to the Korean run and leaves the outside part empty', t => {
  const root = temporary(t)
  seed(root, 'kr', { lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 }, 280)
  clearRouteCrossSectionCache()
  const result = loadRouteCrossSection({ root, routeGeometry: BANGKOK, body: { etd: addForecastHours(TMFC, 0) } })
  assert.equal(result.domain, 'kr')
  const values = temperaturesOf(result)
  assert.equal(values[0], 6.85)
  assert.equal(values.at(-1), null)
})

test('a route near the Korean grid edge, where GKTG is blank, uses the expanded run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-route-domain-'))
  try {
    fs.mkdirSync(path.join(root, 'kim_nwp_ea'), { recursive: true })
    fs.writeFileSync(path.join(root, 'kim_nwp_ea', 'latest.json'), JSON.stringify({ latestRun: TMFC }))
    const edge = [{ lon: 135.5, lat: 37 }]
    assert.equal(selectRouteKimDomain({ root, samples: [{ lon: 127, lat: 37 }] }), 'kr')
    assert.equal(selectRouteKimDomain({ root, samples: edge }), 'ea')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
