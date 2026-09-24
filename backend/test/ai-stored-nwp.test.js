import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLocalRuntime } from '../src/ai/local-runtime.js'
import { loadRouteCrossSection } from '../src/briefing/enroute-cross-section.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid, buildKimNwpIndex, buildKimNwpIndexEntry } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid, writeKimNwpIndex, writeKimNwpLatest } from '../src/processors/kim-nwp-store.js'

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ai/gimpo-jeju.json', import.meta.url)))
const navdata = JSON.parse(fs.readFileSync(new URL('../../frontend/public/data/navdata/enroute.json', import.meta.url)))

test('stored briefing and chained altitude result retain exact sampled frames and time-rule metadata after publication disappears', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-ai-nwp-'))
  try {
    const tmfc = '2026091006'
    const entries = [6, 9].map(hf => {
      const grid = buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc, hf,
        level: KIM_NWP_LEVELS.find(level => level.id === '850hPa'), fetchedAt: '2026-09-10T12:00:00Z',
        components: [['u', hf, 'm/s'], ['v', 0, 'm/s'], ['T', 270 + hf, 'K'], ['hgt', 1500, 'm']]
          .map(([variable, value, unit]) => ({ variable, unit, level: 850, nx: 3, ny: 3,
            bounds: { lonMin: 125, lonMax: 130, latMin: 33, latMax: 38, dx: 2.5, dy: 2.5 }, values: Array(9).fill(value) })) })
      return buildKimNwpIndexEntry(grid, writeKimNwpGrid({ root, grid }))
    })
    writeKimNwpIndex(root, buildKimNwpIndex({ model: KIM_NWP_MODEL, tmfc, entries }))
    writeKimNwpLatest(root, { latestRun: tmfc, content_hash: 'stored-nwp-regression' })
    let snapshotReads = 0
    const runtime = createLocalRuntime({ dataRoot: root, navdata, readSnapshot: () => { snapshotReads++; return { snapshot: null } } })
    const request = structuredClone(fixture.request)
    request.etd = '2026-09-10T12:00:00Z'
    request.eta = '2026-09-10T13:00:00Z'
    request.nwpTimeSelection = { baseTime: request.etd, waypointOverrides: [{ waypointId: request.routeMarkers[5].id, offsetHours: 3 }] }
    const context = runtime.registerContext({ schemaVersion: 1, revision: 'nwp-rules', scope: 'personal', request }, 'alice')
    assert.equal(context.status, 'ok')
    const digest = await runtime.call('get_route_briefing', { context_ref: context.contextRef }, 'alice')
    assert.equal(digest.status, 'partial')
    const bundle = runtime.getResult(digest.reference.briefingRef, 'alice')
    assert.equal(bundle.status, 'ok')
    const model = loadRouteCrossSection({ root, routeGeometry: bundle.request.routeGeometry, body: bundle.request })
    // Compare the complete ordinary cross-section response, not only its run ID.
    const expected = JSON.parse(JSON.stringify({ ...model.crossSection, turbulence: model.turbulence,
      availableTimes: model.availableTimes, timeRules: model.timeRules, nwpTimeAvailability: model.nwpTimeAvailability }))
    assert.deepEqual(bundle.crossSection, expected)
    const values = bundle.crossSection.levels.find(level => level.pressure === 850).values
    assert.deepEqual([...new Set(values.map(value => value.sourceHf))].sort(), [6, 9])
    assert.deepEqual([...new Set(values.map(value => value.u))].sort(), [6, 9])
    assert.deepEqual(bundle.request.nwpTimeSelection, { ...request.nwpTimeSelection, baseTime: '2026-09-10T12:00:00.000Z' })
    const beforeReads = snapshotReads
    // Remove only this test's publication pointer. Stored results must not reread it.
    fs.unlinkSync(path.join(root, 'kim_nwp/latest.json'))
    let ref = digest.reference.briefingRef
    for (let i = 0; i < 2; i++) {
      const compared = await runtime.call('compare_route_altitudes', { briefing_ref: ref, altitudes_ft: [31000, 33000] }, 'alice')
      assert.equal(compared.status, 'partial')
      const { hazards, notams, ...row } = compared.data.rows[0]
      assert.deepEqual(digest.data.enroute.plannedAltitudeWeather, { ...row, hazardCount: hazards.total, notamCount: notams.total })
      assert.ok(!JSON.stringify(digest.data.enroute).includes('coordinates'))
      assert.ok(!JSON.stringify(digest.data.enroute).includes('levels'))
      ref = compared.reference.briefingRef
      const restored = runtime.getResult(ref, 'alice')
      assert.deepEqual(restored.crossSection, expected)
      assert.deepEqual(restored.request, bundle.request)
      assert.deepEqual(restored.briefing, bundle.briefing)
      assert.equal(restored.resultHash, compared.reference.resultHash)
    }
    assert.equal(snapshotReads, beforeReads)
    assert.equal(runtime.getResult(ref, 'bob').error.code, 'REFERENCE_NOT_FOUND')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
