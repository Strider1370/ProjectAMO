import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNavlogRows } from './navlogRows.js'

test('buildNavlogRows places each leg between its waypoint boundaries', () => {
  const rows = buildNavlogRows([
    { from: 'FIXA', to: 'FIXB', distanceNm: 24 },
    { from: 'FIXB', to: 'FIXC', distanceNm: 27 },
  ])

  assert.deepEqual(rows.map((row) => [row.kind, row.waypoint ?? `${row.leg.from}-${row.leg.to}`]), [
    ['waypoint', 'FIXA'],
    ['leg', 'FIXA-FIXB'],
    ['waypoint', 'FIXB'],
    ['leg', 'FIXB-FIXC'],
    ['waypoint', 'FIXC'],
  ])
})

test('buildNavlogRows keeps both waypoint boundaries when adjacent legs are disconnected', () => {
  const rows = buildNavlogRows([
    { from: 'FIXA', to: 'FIXB' },
    { from: 'FIXC', to: 'FIXD' },
  ])

  assert.deepEqual(rows.filter((row) => row.kind === 'waypoint').map((row) => row.waypoint), [
    'FIXA', 'FIXB', 'FIXC', 'FIXD',
  ])
})

test('buildNavlogRows places SID before enroute legs and merges STAR with IAP after them', () => {
  const rows = buildNavlogRows(
    [{ from: 'SIDEND', to: 'STARB', distanceNm: 80 }],
    [
      { type: 'IAP', id: 'ILS18', from: 'IAF', to: 'RKPC', legs: [] },
      { type: 'STAR', id: 'DOTOL2P', from: 'STARB', to: 'IAF', legs: [] },
      { type: 'SID', id: 'BULTI2T', from: 'RKSS', to: 'SIDEND', legs: [] },
    ],
  )

  assert.deepEqual(rows.map((row) => row.kind === 'waypoint'
    ? `waypoint:${row.waypoint}`
    : row.kind === 'procedure'
      ? `procedure:${(row.procedure.procedureIds ?? [row.procedure.id]).join('+')}`
      : `leg:${row.leg.from}-${row.leg.to}`), [
    'waypoint:RKSS',
    'procedure:BULTI2T',
    'waypoint:SIDEND',
    'leg:SIDEND-STARB',
    'waypoint:STARB',
    'procedure:DOTOL2P+ILS18',
    'waypoint:RKPC',
  ])
  const arrival = rows.find((row) => row.procedure?.type === 'ARRIVAL')?.procedure
  assert.deepEqual(arrival?.procedureIds, ['DOTOL2P', 'ILS18'])
})

test('buildNavlogRows keeps a lone STAR or IAP as one static arrival summary', () => {
  for (const type of ['STAR', 'IAP']) {
    const rows = buildNavlogRows([], [{ type, id: `${type}1`, from: 'ENTRY', to: 'RKPC', distanceNm: 8, legs: [] }])

    assert.deepEqual(rows.map((row) => [row.kind, row.waypoint ?? row.procedure?.procedureIds]), [
      ['waypoint', 'ENTRY'],
      ['procedure', [`${type}1`]],
      ['waypoint', 'RKPC'],
    ])
    assert.equal(rows[1].procedure.distanceNm, 8)
  }
})

test('buildNavlogRows reports an unknown arrival distance when any component is missing', () => {
  const rows = buildNavlogRows([], [
    { type: 'STAR', id: 'DOTOL2P', from: 'DOTOL', to: 'YUMIN', distanceNm: null, legs: [] },
    { type: 'IAP', id: 'ILS18', from: 'YUMIN', to: 'RKPC', distanceNm: 8, legs: [] },
  ])

  assert.equal(rows.find((row) => row.kind === 'procedure')?.procedure.distanceNm, null)
})

test('buildNavlogRows sums STAR and IAP distance and combines their legs', () => {
  const rows = buildNavlogRows([], [
    { type: 'STAR', id: 'DOTOL2P', from: 'DOTOL', to: 'YUMIN', distanceNm: 98.25, legs: [{ from: 'DOTOL', to: 'YUMIN' }] },
    { type: 'IAP', id: 'YUMIN-RWY07-REP', from: 'YUMIN', to: 'RKPC', distanceNm: 14.41, legs: [{ from: 'YUMIN', to: 'RKPC' }] },
  ])

  assert.deepEqual(rows.map((row) => [row.kind, row.waypoint ?? row.procedure?.procedureIds]), [
    ['waypoint', 'DOTOL'],
    ['procedure', ['DOTOL2P', 'YUMIN-RWY07-REP']],
    ['waypoint', 'RKPC'],
  ])
  const arrival = rows.find((row) => row.kind === 'procedure')?.procedure
  assert.equal(arrival?.distanceNm, 112.66)
  assert.equal(arrival?.legs.length, 2)
})
