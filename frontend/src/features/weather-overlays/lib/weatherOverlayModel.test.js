import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWeatherOverlayModel,
  formatAdvisoryPanelLabel,
  formatSigwxStamp,
  formatUtcTmfcStamp,
} from './weatherOverlayModel.js'

const hiddenAdvisoryKeys = { sigwxLow: [], sigmet: [], airmet: [] }
const sigwxFilter = {}

test('formatSigwxStamp formats tmfc values as KST labels', () => {
  assert.equal(formatSigwxStamp('202605140300'), '05/14 03:00 KST')
})

test('formatUtcTmfcStamp converts KIM/KTG UTC tmfc values to the display timezone', () => {
  assert.equal(formatUtcTmfcStamp('202605140300', 'UTC'), '05/14 03:00 UTC')
  assert.equal(formatUtcTmfcStamp('202605140300', 'KST'), '05/14 12:00 KST')
})

test('buildWeatherOverlayModel formats KIM/KTG tmfc values as UTC source times', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null,
    satMeta: null,
    lightningData: null,
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: { items: [] },
    airmetData: { items: [] },
    visibility: {},
    nwpSelection: { tmfc: '202605140300', hf: 3 },
    ktgGrid: {
      run: { tmfc: '202605140300', validTime: '2026-05-14T06:00:00.000Z' },
    },
    tz: 'KST',
  })

  assert.equal(model.nwpIssueLabel, '05/14 12:00 KST')
  assert.equal(model.nwpValidLabel, '05/14 15:00 KST')
  assert.equal(model.ktgIssueLabel, '05/14 12:00 KST')
  assert.equal(model.ktgValidLabel, '05/14 15:00 KST')
})

test('formatAdvisoryPanelLabel includes kind, sequence, and 한글 phenomenon (+code)', () => {
  assert.equal(formatAdvisoryPanelLabel({
    sequence_number: '1',
    phenomenon_code: 'TS',
  }, 'sigmet'), 'SIGMET 1 뇌우 (TS)')
})

test('formatAdvisoryPanelLabel falls back to label/code when no 한글 mapping', () => {
  assert.equal(formatAdvisoryPanelLabel({
    phenomenon_code: 'UNKNOWN_X',
    phenomenon_label: 'Unknown X',
  }, 'airmet'), 'AIRMET Unknown X')
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

test('temporarily suppresses motion metadata for the actually rendered radar frame', () => {
  const selectedMs = Date.UTC(2026, 4, 14, 3, 7)
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [
      { tm: '202605141200', path: '/r1.png', motion: { observedAtMs: Date.UTC(2026, 4, 14, 3, 0), path: '/stale.geojson' } },
      { tm: '202605141205', path: '/r2.png', motion: { observedAtMs: Date.UTC(2026, 4, 14, 3, 5), comparedFromMs: Date.UTC(2026, 4, 14, 3, 0), path: '/exact.geojson' } },
    ] },
    satMeta: null,
    lightningData: { nationwide: { strikes: [] } },
    sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: { items: [] }, airmetData: { items: [] },
    visibility: { radar: true, lightning: true }, selectedWeatherTimeMs: selectedMs,
    sigwxHistoryIndex: 0, sigwxFilter, hiddenAdvisoryKeys, selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: Date.UTC(2026, 4, 14, 4, 0), blinkLightning: false, lightningBlinkOff: false,
  })

  assert.equal(model.radarFrame.tm, '202605141205')
  assert.equal(model.radarMotion.dataUrl, null)
  assert.equal(model.radarMotion.observedAtMs, null)
  assert.equal(model.lightningReferenceTimeMs, model.radarFrame.timeMs)
})

test('hides stale radar motion and preserves the live lightning reference when radar is off', () => {
  const nowMs = Date.UTC(2026, 4, 14, 4, 0)
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [
      { tm: '202605141200', path: '/r1.png', motion: { observedAtMs: Date.UTC(2026, 4, 14, 3, 0), path: '/old.geojson' } },
      { tm: '202605141230', path: '/r2.png' },
    ] },
    satMeta: null, lightningData: { nationwide: { strikes: [] } }, sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: { items: [] }, airmetData: { items: [] },
    visibility: { radar: false, lightning: true }, selectedWeatherTimeMs: Date.UTC(2026, 4, 14, 3, 0),
    sigwxHistoryIndex: 0, sigwxFilter, hiddenAdvisoryKeys, selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: nowMs, blinkLightning: false, lightningBlinkOff: false,
  })

  assert.equal(model.radarMotion.visible, false)
  assert.equal(model.lightningReferenceTimeMs, nowMs)
})

// 해외 레이더(RainViewer)는 최근 2시간치뿐. 위성(6시간) 등이 타임라인을 더 과거로 늘리면,
// pickNearestPreviousFrame의 `|| frames[0]` 폴백 때문에 "3시간 전을 보는데 2시간 전 강수를 그리는"
// 시간 어긋남이 생긴다. 커버 밖에서는 프레임을 주지 말고(null) 안내를 띄워야 한다.
test('해외 레이더: 커버(2시간) 밖 시각을 고르면 프레임 없음 + out-of-range 신호', () => {
  const base = Date.UTC(2026, 4, 14, 2, 0)
  const rainviewerMeta = {
    host: 'https://h',
    frames: [
      { timeMs: base - 60 * 60 * 1000, path: '/v2/radar/old' }, // 1시간 전
      { timeMs: base, path: '/v2/radar/new' },
    ],
  }
  const common = {
    echoMeta: null,
    rainviewerMeta,
    // 위성이 타임라인을 3시간 전까지 늘린다 → RainViewer 커버 밖 구간이 생김
    satMeta: { frames: [{ tm: '202605140800' }, { tm: '202605141100' }] },
    lightningData: null,
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: { items: [] },
    airmetData: { items: [] },
    visibility: { radarOverseas: true, satellite: true },
    sigwxHistoryIndex: 0,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: base,
    blinkLightning: false,
    lightningBlinkOff: false,
  }

  const inRange = buildWeatherOverlayModel({ ...common, selectedWeatherTimeMs: base })
  assert.equal(inRange.rainviewerFrame.path, '/v2/radar/new')
  assert.equal(inRange.rainviewerOutOfRange, false)

  const tooOld = buildWeatherOverlayModel({ ...common, selectedWeatherTimeMs: base - 3 * 60 * 60 * 1000 })
  assert.equal(tooOld.rainviewerFrame, null, 'must not fall back to the oldest frame')
  assert.equal(tooOld.rainviewerOutOfRange, true)
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

test('SIGMET/AIRMET 뱃지는 레이어가 꺼져 있어도 활성 건수가 있으면 상시 표시', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: null,
    lightningData: { nationwide: { strikes: [] } },
    sigwxLowData: null, sigwxLowHistoryData: [],
    sigmetData: { items: [{ id: 's1', sequence_number: '1', phenomenon_code: 'TS', valid_from: '2026-05-14T00:00:00.000Z', valid_to: '2026-05-14T03:00:00.000Z' }] },
    airmetData: { items: [] },
    visibility: { radar: false, satellite: false, lightning: false, sigwx: false, sigmet: false, airmet: false },
    weatherTimelineIndex: -1, sigwxHistoryIndex: 0, sigwxFilter, hiddenAdvisoryKeys,
    selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: Date.UTC(2026, 4, 14, 2, 10),
    blinkLightning: false, lightningBlinkOff: false,
  })

  const sigmet = model.advisoryBadgeItems.find((b) => b.key === 'sigmet')
  assert.ok(sigmet, 'SIGMET 뱃지가 레이어 off에서도 떠야 함')
  assert.equal(sigmet.count, 1)
  assert.equal(model.advisoryBadgeItems.find((b) => b.key === 'airmet'), undefined, 'AIRMET은 0건이면 안 뜸')
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

test('formatAdvisoryPanelLabel adds FIR only for overseas SIGMETs', () => {
  assert.equal(formatAdvisoryPanelLabel({
    source: 'NOAA', fir: 'VHHK', sequence_number: '1', phenomenon_code: 'TS',
  }, 'sigmet'), 'SIGMET 1 · VHHK (홍콩 FIR) 뇌우 (TS)')
})

test('convective layers use an exact satellite frame without satellite visibility', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: { frames: [{ tm: '202607231200' }] },
    convectiveMeta: { frames: [{ tm: '202607231200', ci: { path: '/ci.geojson' }, ctps: { images: { all: '/ctps.webp' } } }] },
    lightningData: null, sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: { items: [] }, airmetData: { items: [] },
    visibility: { ci: true, satellite: false }, sigwxHistoryIndex: 0, sigwxFilter: {}, hiddenAdvisoryKeys: {}, lightningReferenceTimeMs: 0,
  })
  assert.equal(model.weatherTimelineVisible, true)
  assert.equal(model.ciFrame.path, '/ci.geojson')
  assert.equal(model.ctpsFrame.images.all, '/ctps.webp')
})

test('convective layers hide for raw future selection and never use an older frame', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: { frames: [{ tm: '202607231200' }] },
    convectiveMeta: { frames: [{ tm: '202607231150', ci: { path: '/old.geojson' } }] },
    lightningData: null, sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: { items: [] }, airmetData: { items: [] },
    visibility: { ci: true }, selectedWeatherTimeMs: Date.UTC(2026, 6, 23, 4, 0), sigwxHistoryIndex: 0, sigwxFilter: {}, hiddenAdvisoryKeys: {}, lightningReferenceTimeMs: 0,
  })
  assert.equal(model.ciFrame, null)
  assert.equal(model.ctpsFrame, null)
})
