import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { attachActiveAipConstraints } from '../src/briefing/aip-airway-constraints.js'

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aip-constraints-'))
  const current = path.join(root, 'aip', 'current')
  fs.mkdirSync(path.join(current, 'test'), { recursive: true })
  fs.writeFileSync(path.join(current, 'manifest.json'), JSON.stringify({
    status: 'active', publicationId: 'TEST', effectiveAt: '2026-01-01T00:00:00Z',
    snapshot: 'test/segments.json', validation: 'test/validation.json',
  }))
  fs.writeFileSync(path.join(current, 'test', 'segments.json'), JSON.stringify({ segments: [{
    id: 'R1-1', fromFix: 'A', toFix: 'B', review: { status: 'reviewed' },
    minimumFlightAltitude: { value: 8000, unit: 'FT', reference: 'AMSL' },
    upperLimit: { value: null, reference: 'UNL' }, lowerLimit: { value: 4000, unit: 'FT', reference: 'AMSL' },
    cruisingLevelSeries: { forward: 'Odd', reverse: 'Even' },
  }] }))
  fs.writeFileSync(path.join(current, 'test', 'validation.json'), JSON.stringify({ validationErrors: [] }))
  return root
}

test('matches an active reviewed AIP segment and keeps its original constraint fields', () => {
  const root = fixtureRoot()
  try {
    const result = attachActiveAipConstraints({
      dataRoot: root,
      routeModel: { enRouteSegments: [{ id: 'R1-1', fromFix: 'A', toFix: 'B', alignmentStatus: 'aligned' }] },
    })
    assert.equal(result.status, 'matched')
    assert.equal(result.provenance.publicationId, 'TEST')
    assert.equal(result.segments[0].constraints.minimumFlightAltitude.value, 8000)
    assert.equal(result.segments[0].constraints.cruisingLevelSeries.series, 'Odd')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('rejects an ID match whose endpoints contradict the planned direction', () => {
  const root = fixtureRoot()
  try {
    const result = attachActiveAipConstraints({
      dataRoot: root,
      routeModel: { enRouteSegments: [{ id: 'R1-1', fromFix: 'A', toFix: 'C', alignmentStatus: 'aligned' }] },
    })
    assert.equal(result.status, 'conflicting')
    assert.equal(result.segments[0].constraints, null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('ignores manual DCT legs and reports not applicable without an airway', () => {
  const result = attachActiveAipConstraints({
    routeModel: { enRouteSegments: [{ id: 'dct:A:WP1', kind: 'dct', routeId: null, alignmentStatus: 'aligned' }] },
  })
  assert.equal(result.status, 'not_applicable')
  assert.deepEqual(result.segments, [])
})
