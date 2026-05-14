import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWeatherOverlayModel,
  formatAdvisoryPanelLabel,
  formatSigwxStamp,
} from './weatherOverlayModel.js'

const hiddenAdvisoryKeys = { sigwxLow: [], sigmet: [], airmet: [] }
const sigwxFilter = {}

test('formatSigwxStamp formats tmfc values as KST labels', () => {
  assert.equal(formatSigwxStamp('202605140300'), '05/14 03:00 KST')
})

test('formatAdvisoryPanelLabel includes kind, sequence, and phenomenon', () => {
  assert.equal(formatAdvisoryPanelLabel({
    sequence_number: '1',
    phenomenon_code: 'TS',
  }, 'sigmet'), 'SIGMET 1 TS')
})

test('buildWeatherOverlayModel selects latest visible timeline frame by default', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [{ tm: '202605140100', path: '/r1.png' }, { tm: '202605140200', path: '/r2.png' }] },
    satMeta: { frames: [{ tm: '202605140130', path: '/s1.png' }] },
    lightningData: { query: { tm: '202605140210' }, nationwide: { strikes: [] } },
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: { items: [] },
    airmetData: { items: [] },
    visibility: { radar: true, satellite: true, lightning: false, sigwx: false, sigmet: false, airmet: false },
    weatherTimelineIndex: -1,
    sigwxHistoryIndex: 0,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: Date.UTC(2026, 4, 14, 2, 10),
    blinkLightning: false,
    lightningBlinkOff: false,
  })

  assert.equal(model.weatherTimelineTicks.length, 3)
  assert.equal(model.radarFrame.tm, '202605140200')
  assert.equal(model.weatherTimelineVisible, true)
  assert.equal(model.lightningLegendEntries[0].iconId, 'lightning-0-10')
})

test('buildWeatherOverlayModel preserves advisory counts while filtering hidden map keys from map layers', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null,
    satMeta: null,
    lightningData: { nationwide: { strikes: [] } },
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: {
      items: [
        {
          id: 'sigmet-a',
          sequence_number: '1',
          phenomenon_code: 'TS',
          valid_from: '2026-05-14T00:00:00.000Z',
          valid_to: '2026-05-14T01:00:00.000Z',
          geometry: {
            type: 'Polygon',
            coordinates: [[[126, 37], [127, 37], [127, 38], [126, 37]]],
          },
        },
      ],
    },
    airmetData: { items: [] },
    visibility: { radar: false, satellite: false, lightning: false, sigwx: false, sigmet: true, airmet: false },
    weatherTimelineIndex: -1,
    sigwxHistoryIndex: 0,
    sigwxFilter,
    hiddenAdvisoryKeys: { ...hiddenAdvisoryKeys, sigmet: ['sigmet-a'] },
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: Date.UTC(2026, 4, 14, 2, 10),
    blinkLightning: false,
    lightningBlinkOff: false,
  })

  assert.equal(model.sigmetItems.length, 1)
  assert.equal(model.sigmetCount, 0)
  assert.equal(model.advisoryBadgeItems[0].count, 1)
})

test('buildWeatherOverlayModel tolerates omitted hidden advisory keys', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null,
    satMeta: null,
    lightningData: { nationwide: { strikes: [] } },
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: { items: [] },
    airmetData: { items: [] },
    visibility: { radar: false, satellite: false, lightning: false, sigwx: true, sigmet: false, airmet: false },
    weatherTimelineIndex: -1,
    sigwxHistoryIndex: 0,
    sigwxFilter,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: Date.UTC(2026, 4, 14, 2, 10),
  })

  assert.equal(model.sigwxGroups.length, 0)
  assert.equal(model.lightningCount, 0)
})
