import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const dataRoot = new URL('../../../../public/data/navdata/procedures/', import.meta.url)
const readJson = (name) => readFile(new URL(name, dataRoot), 'utf8').then(JSON.parse)
const AIRPORTS = {
  rkth: [10, 6, 2], rktu: [6, 2, 2], rknw: [5, 4, 3],
  rkps: [11, 12, 4], rkjj: [8, 7, 3], rkjk: [0, 0, 2],
}

test('terminal procedure data preserves record counts, provenance, and STAR-to-IAP continuity', async () => {
  const navdata = JSON.parse(await readFile(new URL('../../../../public/data/navdata/enroute.json', import.meta.url), 'utf8'))
  for (const [airport, [sidCount, starCount, iapCount]] of Object.entries(AIRPORTS)) {
    const [sid, star, iap] = await Promise.all([
      readJson(`${airport}-sid-procedures.json`),
      readJson(`${airport}-star-procedures.json`),
      readJson(`${airport}-representative-iap-routes.json`),
    ])
    const sids = Object.values(sid.sidProcedures)
    const stars = Object.values(star.starProcedures)
    assert.equal(sids.length, sidCount)
    assert.equal(stars.length, starCount)
    assert.equal(Object.keys(iap.iapRoutes).length, iapCount)
    assert.ok(sid.metadata.sourceUrl && sid.metadata.sourceEdition, `${airport} SID metadata`)
    assert.ok(star.metadata.sourceUrl && star.metadata.sourceEdition, `${airport} STAR metadata`)
    assert.ok(sid.metadata.sourceLocator || sids.every((procedure) => procedure.source), `${airport} SID locator`)
    assert.ok(star.metadata.sourceLocator || stars.every((procedure) => procedure.source), `${airport} STAR locator`)
    assert.ok(iap.metadata.sourceUrl || iap.metadata.sources?.length, `${airport} IAP metadata`)
    for (const procedure of [...sids, ...stars]) {
      assert.ok(procedure.fixes.length > 1, procedure.id)
    }
    for (const procedure of sids) assert.ok(navdata.points[procedure.endFix], procedure.id)
    for (const procedure of stars) assert.ok(navdata.points[procedure.startFix], procedure.id)
    for (const procedure of stars) {
      const candidate = iap.starToIapCandidates[procedure.id]
      assert.ok(candidate, procedure.id)
      assert.equal(procedure.endFix, iap.iapRoutes[candidate.defaultIapKey].fixes[0].id)
    }
  }
})

test('RKJJ RWY 22L MARYO departures preserve the published southwest sequence', async () => {
  const sid = await readJson('rkjj-sid-procedures.json')
  for (const procedure of Object.values(sid.sidProcedures).filter((procedure) => procedure.runways.includes('22L'))) {
    const coordinates = Object.fromEntries(procedure.fixes
      .filter((fix) => fix.id === 'MARYO' || fix.id === 'JISUN')
      .map((fix) => [fix.id, fix.coordinates]))
    assert.deepEqual(coordinates.MARYO, { lat: 35.035167, lon: 126.746389 })
    if (coordinates.JISUN) assert.deepEqual(coordinates.JISUN, { lat: 35.127556, lon: 127.015389 })
  }
})
