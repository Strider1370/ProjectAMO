import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeRunFlightIndex,
  acceptCandidateResponse,
  appliedBundlesFromRun,
  mapSelectionModels,
  materialReferences,
  presentationMapDataSelection,
  presentationFlight,
  presentationWeatherState,
  runFlights,
  speakerNotes,
} from './presentationModel.js'

test('run snapshot supplies immutable ordered flights', () => {
  const run = { pinnedSnapshot: { flights: [{ id: 2, version: 4 }, { id: 1, version: 7 }] } }
  assert.deepEqual(runFlights(null, run).map((flight) => flight.id), [2, 1])
  assert.equal(activeRunFlightIndex(null, { ...run, activeFlightId: 1 }), 1)
})

test('late candidate for another flight or run is rejected', () => {
  const response = { candidate: { runId: 9, flightId: 3, bundle: { bundleId: 'candidate', flight: { id: 3 } } } }
  assert.equal(acceptCandidateResponse({ expectedRunId: 9, expectedFlightId: 3, response }).bundleId, 'candidate')
  assert.equal(acceptCandidateResponse({ expectedRunId: 10, expectedFlightId: 3, response }), null)
  assert.equal(acceptCandidateResponse({ expectedRunId: 9, expectedFlightId: 4, response }), null)
})

test('restored applied bundles are hydrated from the pinned flight version', () => {
  const run = {
    pinnedSnapshot: { flights: [{ id: 3, version: 2, profileRequest: { routeGeometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } } }] },
    appliedBundles: [{ flightId: 3, bundle: { bundleId: 'applied', flight: { id: 3 } } }],
  }
  assert.equal(appliedBundlesFromRun(run)['3'].flight.version, 2)
})

test('current server appliedSnapshot and outer bundle id restore exact map selection', () => {
  const run = {
    activeFlightId: 8,
    pinnedSnapshot: { flights: [{ id: 8, version: 3 }] },
    appliedSnapshot: { bundleId: 'bundle-8', flight: { id: 8 }, mapDataSelection: { kim: { tmfc: '2026091006' } } },
  }
  const restored = appliedBundlesFromRun(run)['8']
  assert.equal(restored.flight.version, 3)
  assert.equal(presentationMapDataSelection(restored).bundleId, 'bundle-8')
  assert.deepEqual(mapSelectionModels(presentationMapDataSelection(restored)).map(([name]) => name), ['kim'])
})

test('applied history is not discarded when a current appliedSnapshot also exists', () => {
  const run = {
    activeFlightId: 2,
    pinnedSnapshot: { flights: [{ id: 1, version: 1 }, { id: 2, version: 1 }] },
    appliedBundles: [{ flightId: 1, bundle: { bundleId: 'first', flight: { id: 1 } } }],
    appliedSnapshot: { bundleId: 'second', flight: { id: 2 } },
  }
  assert.deepEqual(Object.keys(appliedBundlesFromRun(run)).sort(), ['1', '2'])
})

test('an older displayed bundle supplies the visible flight version after an organization refresh', () => {
  const pinned = { id: 2, version: 8, name: '최신 핀' }
  const displayed = { bundleId: 'shown-v4', flight: { id: 2, version: 4, name: '표시 중' } }
  assert.deepEqual(presentationFlight(pinned, displayed), displayed.flight)
  assert.equal(presentationFlight(pinned, { flight: { id: 3, version: 1 } }), pinned)
})

test('partial or unavailable model status never renders as normal', () => {
  assert.equal(presentationWeatherState({ componentStatus: { models: { kim: { status: 'partial' }, ktg: { status: 'available' } } } }).limited, true)
  assert.equal(presentationWeatherState({ componentStatus: { kim: { status: 'out_of_range' }, ktg: { status: 'available' } } }).limited, true)
  assert.equal(presentationWeatherState({}).limited, true)
  assert.equal(presentationWeatherState({ componentStatus: { nwp: 'available', terrain: 'available' } }).limited, false)
})

test('speaker notes use the pinned briefing order and ignore another flight', () => {
  const notes = speakerNotes(null, { pinnedSnapshot: { briefing: { blocks: [
    { kind: 'speaker-notes', flightId: 2, body: '고도 확인' },
    { kind: 'speaker-notes', flightId: 3, body: '다른 비행' },
  ] } } }, { id: 2 }, null)
  assert.deepEqual(notes.map((note) => note.body), ['고도 확인'])
})

test('bundle-linked notes win over a later run snapshot', () => {
  const notes = speakerNotes(null, { pinnedSnapshot: { briefing: { blocks: [{ flightId: 2, body: '새 run 메모' }] } } }, { id: 2 }, {
    linkedContent: { briefingBlocks: [{ flightId: 2, body: '적용 당시 메모' }], blocks: [] },
  })
  assert.deepEqual(notes.map((note) => note.body), ['적용 당시 메모'])
})

test('candidate organization snapshot keeps its own flight and notes during history restore', () => {
  const bundle = {
    bundleId: 'old', flight: { id: 2 }, organizationSnapshot: {
      flights: [{ id: 2, version: 4, blocks: [{ body: '적용 비행 메모' }] }],
      briefing: { blocks: [{ flightId: 2, body: '적용 회차 메모' }] },
    },
  }
  const run = { pinnedSnapshot: { flights: [{ id: 2, version: 8 }], briefing: { blocks: [{ flightId: 2, body: '현재 메모' }] } } }
  const hydrated = appliedBundlesFromRun({ ...run, appliedBundles: [{ flightId: 2, bundle }] })['2']
  assert.equal(hydrated.flight.version, 4)
  assert.deepEqual(speakerNotes(null, run, run.pinnedSnapshot.flights[0], hydrated).map((note) => note.body), ['적용 회차 메모', '적용 비행 메모'])
})

test('bundle-linked material versions win over later session references', () => {
  const refs = materialReferences({ materialRefs: [{ id: 1, version: 4 }] }, null, { materialRefs: [] }, {
    linkedContent: { briefingMaterialRefs: [{ id: 1, version: 2 }], materialRefs: [{ id: 3, version: 1 }] },
  })
  assert.deepEqual(refs.map((ref) => [ref.materialId, ref.materialVersion]), [[1, 2], [3, 1]])
})
