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
  assert.equal(model.lightningLegendEntries[0].iconId, 'lightning-0-5')
})

test('selects WISSDOM from the requested height alone and prefers an exactly matching analysis', () => {
  const base = {
    echoMeta: { frames: [
      { tm: '202608041920', path: '/radar-1020.webp' },
      { tm: '202608041925', path: '/radar-1025.webp' },
    ] },
    wissdomMeta: { framesByHeight: {
      1524: [
        { tm: '202608041920', heightM: 1524, path: '/wissdom-1020.webp' },
        { tm: '202608041930', heightM: 1524, path: '/wissdom-1030.webp' },
      ],
    } },
    visibility: { radar: true },
    selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 25),
    radarWindHeightM: 1524,
    radarWindRequested: true,
  }

  // 10:30 is ahead of the rendered 10:25 radar frame, so the 10:20 analysis is the one to use.
  const backed = buildWeatherOverlayModel(base)
  assert.equal(backed.radarFrame.tm, '202608041925')
  assert.equal(backed.wissdomFrame.path, '/wissdom-1020.webp')
  assert.equal(backed.wissdomAvailable, true)

  const exact = buildWeatherOverlayModel({
    ...base,
    wissdomMeta: { framesByHeight: {
      1524: [...base.wissdomMeta.framesByHeight[1524], { tm: '202608041925', heightM: 1524, path: '/wissdom-1025.webp' }],
    } },
  })
  assert.equal(exact.wissdomFrame.path, '/wissdom-1025.webp', 'an exact analysis still wins')

  // A height with no published analysis stays hidden rather than borrowing another height's wind.
  const otherHeight = buildWeatherOverlayModel({ ...base, radarWindHeightM: 3048 })
  assert.equal(otherHeight.wissdomFrame, null)
  assert.equal(otherHeight.wissdomAvailable, false)
})

test('backs WISSDOM onto the preceding analysis and reports that analysis time', () => {
  // WISSDOM is a ten-minute product and radar is five-minute, so an exact-tm rule leaves the
  // wind field hidden on every odd radar frame. Fall back to the preceding WISSDOM analysis
  // and expose its own time so the legend can state how old it is.
  const base = {
    echoMeta: { frames: [
      { tm: '202608051900', path: '/radar-1900.webp' },
      { tm: '202608051905', path: '/radar-1905.webp' },
    ] },
    wissdomMeta: { framesByHeight: { 1524: [{ tm: '202608051900', heightM: 1524, path: '/wissdom-1900.webp' }] } },
    visibility: { radar: true },
    radarWindHeightM: 1524,
    radarWindRequested: true,
    nowMs: Date.UTC(2026, 7, 5, 10, 10),
  }

  const offset = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: Date.UTC(2026, 7, 5, 10, 5) })
  assert.equal(offset.radarFrame.tm, '202608051905')
  assert.equal(offset.wissdomFrame.path, '/wissdom-1900.webp', 'the previous analysis must still render')
  assert.equal(offset.wissdomAvailable, true)
  assert.equal(offset.wissdomFrame.timeMs, Date.UTC(2026, 7, 5, 10, 0), 'the legend needs WISSDOM own time')

  // Beyond one publication interval the wind is too old to sit under this radar image.
  const stale = buildWeatherOverlayModel({
    ...base,
    echoMeta: { frames: [{ tm: '202608051920', path: '/radar-1920.webp' }] },
    selectedWeatherTimeMs: Date.UTC(2026, 7, 5, 10, 20),
    nowMs: Date.UTC(2026, 7, 5, 10, 25),
  })
  assert.equal(stale.wissdomFrame, null)
  assert.equal(stale.wissdomAvailable, false)

  // A WISSDOM analysis newer than the rendered radar frame must never be pulled backwards.
  const ahead = buildWeatherOverlayModel({
    ...base,
    wissdomMeta: { framesByHeight: { 1524: [{ tm: '202608051910', heightM: 1524, path: '/wissdom-1910.webp' }] } },
    selectedWeatherTimeMs: Date.UTC(2026, 7, 5, 10, 5),
  })
  assert.equal(ahead.wissdomFrame, null)
})

test('uses the requested WISSDOM height independently of the KIM selection', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [{ tm: '202608041925', path: '/radar-1025.webp' }] },
    wissdomMeta: { framesByHeight: {
      914: [{ tm: '202608041925', heightM: 914, path: '/wissdom-914.webp' }],
      1524: [{ tm: '202608041925', heightM: 1524, path: '/wissdom-1524.webp' }],
    } },
    visibility: { radar: true },
    selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 25),
    radarWindHeightM: 914,
    radarWindRequested: true,
    nwpSelection: { tmfc: '202608040000', hf: 6 },
  })

  assert.equal(model.wissdomFrame.path, '/wissdom-914.webp')
  assert.deepEqual(model.nwpSelection, { tmfc: '202608040000', hf: 6 })
})

test('selects only an exact future QPF frame and hides observed radar and motion', () => {
  const analysisTimeMs = Date.UTC(2026, 7, 4, 10, 25)
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [{
      tm: '202608041925', path: '/radar-1025.webp',
      motion: { observedAtMs: analysisTimeMs, path: '/motion-1025.geojson' },
    }] },
    qpfMeta: { frames: [
      { tm: '202608041925', analysisTimeMs, validTimeMs: Date.UTC(2026, 7, 4, 10, 35), leadMinutes: 10, path: '/qpf-10.webp' },
      { tm: '202608041925', analysisTimeMs, validTimeMs: Date.UTC(2026, 7, 4, 10, 45), leadMinutes: 20, path: '/qpf-20.webp' },
      { tm: '202608041925', analysisTimeMs, validTimeMs: Date.UTC(2026, 7, 4, 10, 55), leadMinutes: 30, path: '/qpf-30.webp' },
    ] },
    visibility: { radar: true },
    nowMs: Date.UTC(2026, 7, 4, 10, 30),
    selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 45),
  })

  assert.equal(model.qpfFrame.path, '/qpf-20.webp')
  assert.deepEqual(model.qpfStatus, { source: 'MAPLE', analysisTimeMs, validTimeMs: Date.UTC(2026, 7, 4, 10, 45), leadMinutes: 20, unit: 'mm/h' })
  assert.equal(model.radarDisplayVisible, false)
  assert.equal(model.radarFrame, null)
  assert.equal(model.radarMotion.dataUrl, null)
  assert.deepEqual(model.forecastTimelineTicks, [Date.UTC(2026, 7, 4, 10, 35), Date.UTC(2026, 7, 4, 10, 45), Date.UTC(2026, 7, 4, 10, 55)])
})

test('never offers a QPF frame whose valid time has already passed', () => {
  // MAPLE takes about 15 minutes to publish, so the shortest leads of a fresh analysis are
  // already history when they arrive. The past belongs to the radar observation, not a forecast.
  const analysisTimeMs = Date.UTC(2026, 7, 4, 10, 25)
  const nowMs = Date.UTC(2026, 7, 4, 10, 42)
  const args = {
    echoMeta: { frames: [{ tm: '202608041935', path: '/radar-1035.webp' }] },
    qpfMeta: { frames: [
      { tm: '202608041925', analysisTimeMs, validTimeMs: Date.UTC(2026, 7, 4, 10, 35), leadMinutes: 10, path: '/qpf-10.webp' },
      { tm: '202608041925', analysisTimeMs, validTimeMs: Date.UTC(2026, 7, 4, 10, 45), leadMinutes: 20, path: '/qpf-20.webp' },
    ] },
    visibility: { radar: true },
    nowMs,
  }

  const past = buildWeatherOverlayModel({ ...args, selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 35) })
  assert.equal(past.qpfFrame, null, 'a lapsed forecast must not render')
  assert.equal(past.qpfStatus, null)
  assert.equal(past.radarDisplayVisible, true, 'the past stays with the observation')
  assert.deepEqual(past.forecastTimelineTicks, [Date.UTC(2026, 7, 4, 10, 45)], 'no forecast tick in the past')

  const future = buildWeatherOverlayModel({ ...args, selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 45) })
  assert.equal(future.qpfFrame.path, '/qpf-20.webp')
  assert.equal(future.radarDisplayVisible, false)
})

test('keeps live selection on the latest observed tick when future QPF ticks exist', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [{ tm: '202608041925', path: '/radar-1025.webp' }] },
    qpfMeta: { frames: [{ tm: '202608041925', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 25), validTimeMs: Date.UTC(2026, 7, 4, 10, 35), leadMinutes: 10, path: '/qpf-10.webp' }] },
    visibility: { radar: true },
    selectedWeatherTimeMs: null,
  })

  assert.equal(model.selectedWeatherTimeMs, Date.UTC(2026, 7, 4, 10, 25))
  assert.equal(model.radarFrame.path, '/radar-1025.webp')
  assert.equal(model.qpfFrame, null)
})

test('keeps live selection null when only future QPF ticks exist', () => {
  const model = buildWeatherOverlayModel({
    qpfMeta: { frames: [{ tm: '202608041925', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 25), validTimeMs: Date.UTC(2026, 7, 4, 10, 35), leadMinutes: 10, path: '/qpf-10.webp' }] },
    visibility: { radar: true },
    selectedWeatherTimeMs: null,
  })

  assert.equal(model.selectedWeatherTimeMs, null)
  assert.equal(model.qpfFrame, null)
})

test('deduplicates overlapping QPF valid times in favour of the newest analysis', () => {
  const model = buildWeatherOverlayModel({
    qpfMeta: { frames: [
      { tm: '202608041925', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 25), validTimeMs: Date.UTC(2026, 7, 4, 10, 45), leadMinutes: 20, path: '/qpf-1025-p20.webp' },
      { tm: '202608041930', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 30), validTimeMs: Date.UTC(2026, 7, 4, 10, 45), leadMinutes: 15, path: '/qpf-1030-p15.webp' },
    ] },
    visibility: { radar: true },
    nowMs: Date.UTC(2026, 7, 4, 10, 32),
    selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 45),
  })

  assert.equal(model.qpfFrames.length, 1)
  assert.equal(model.qpfFrame.path, '/qpf-1030-p15.webp')
  assert.equal(model.qpfStatus.analysisTimeMs, Date.UTC(2026, 7, 4, 10, 30))
  assert.equal(model.qpfStatus.leadMinutes, 15)
})

test('never selects a nearest QPF frame outside its exact future tick', () => {
  const qpfMeta = { frames: [
    { tm: '202608041925', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 25), validTimeMs: Date.UTC(2026, 7, 4, 10, 35), leadMinutes: 10, path: '/qpf-10.webp' },
    { tm: '202608041925', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 25), validTimeMs: Date.UTC(2026, 7, 4, 10, 45), leadMinutes: 20, path: '/qpf-20.webp' },
  ] }
  for (const selectedWeatherTimeMs of [Date.UTC(2026, 7, 4, 10, 40), Date.UTC(2026, 7, 4, 10, 25), Date.UTC(2026, 7, 4, 10, 55)]) {
    const model = buildWeatherOverlayModel({ qpfMeta, visibility: { radar: true }, selectedWeatherTimeMs })
    assert.equal(model.qpfFrame, null)
    assert.equal(model.qpfStatus, null)
  }
})

test('crossing the final observation and first QPF tick clears each stale raster', () => {
  const base = {
    echoMeta: { frames: [{ tm: '202608041925', path: '/radar-1025.webp' }] },
    qpfMeta: { frames: [{ tm: '202608041925', analysisTimeMs: Date.UTC(2026, 7, 4, 10, 25), validTimeMs: Date.UTC(2026, 7, 4, 10, 35), leadMinutes: 10, path: '/qpf-10.webp' }] },
    visibility: { radar: true },
    nowMs: Date.UTC(2026, 7, 4, 10, 30),
  }
  const observation = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 25) })
  const forecast = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 35) })
  const returned = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: Date.UTC(2026, 7, 4, 10, 25) })

  assert.equal(observation.radarFrame.path, '/radar-1025.webp')
  assert.equal(observation.qpfFrame, null)
  assert.equal(forecast.radarFrame, null)
  assert.equal(forecast.qpfFrame.path, '/qpf-10.webp')
  assert.equal(returned.radarFrame.path, '/radar-1025.webp')
  assert.equal(returned.qpfFrame, null)
})

test('uses the actually rendered radar frame\'s own motion, not an earlier stale one', () => {
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
  assert.equal(model.radarMotion.dataUrl, '/exact.geojson')
  assert.equal(model.radarMotion.observedAtMs, Date.UTC(2026, 4, 14, 3, 5))
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

// 낙뢰만 켜면 벽시계를 기준으로 나이를 재던 탓에, 낙뢰 수집이 벽시계보다 뒤처지면
// 실제로는 방금 친 번개가 50~60분 밴드로 밀리다가 60분 창을 넘겨 통째로 사라졌다.
// 레이더를 켜면 기준이 레이더 관측시각으로 바뀌어 멀쩡히 보이던 것이 그 증거다.
test('레이더가 꺼져 있어도 낙뢰 나이는 낙뢰 자료 자신의 수집시각을 기준으로 잰다', () => {
  const collectedAtMs = Date.UTC(2026, 4, 14, 3, 0)
  const nowMs = collectedAtMs + 50 * 60 * 1000
  const model = buildWeatherOverlayModel({
    echoMeta: null,
    satMeta: null,
    lightningData: {
      fetched_at: new Date(collectedAtMs).toISOString(),
      query: { tm: '202605141200' },
      nationwide: { strikes: [{ lon: 127, lat: 37, type: 'G', type_name: 'ground', time: new Date(collectedAtMs - 2 * 60 * 1000).toISOString() }] },
    },
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: { items: [] },
    airmetData: { items: [] },
    visibility: { radar: false, lightning: true },
    selectedWeatherTimeMs: null,
    sigwxHistoryIndex: 0,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: nowMs,
    blinkLightning: false,
    lightningBlinkOff: false,
  })

  assert.equal(model.lightningReferenceTimeMs, collectedAtMs)
  assert.equal(model.lightningCount, 1)
  assert.equal(model.lightningGeoJSON.features[0].properties.iconId, 'lightning-0-5')
})

test('시각이 정확히 맞으면 이동 화살표 자료를 노출한다', () => {
  const observedAtMs = Date.UTC(2026, 4, 14, 3, 5)
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [
      { tm: '202605141205', path: '/r.png', motion: { observedAtMs, comparedFromMs: observedAtMs - 300000, path: '/data/radar/motion_korea_202605141205.geojson' } },
    ] },
    satMeta: null, lightningData: { nationwide: { strikes: [] } }, sigwxLowData: null, sigwxLowHistoryData: [],
    sigmetData: { items: [] }, airmetData: { items: [] },
    visibility: { radar: true }, selectedWeatherTimeMs: observedAtMs,
    sigwxHistoryIndex: 0, sigwxFilter, hiddenAdvisoryKeys, selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: observedAtMs, blinkLightning: false, lightningBlinkOff: false,
  })

  assert.equal(model.radarMotion.dataUrl, '/data/radar/motion_korea_202605141205.geojson')
  assert.equal(model.radarMotion.observedAtMs, observedAtMs)
  assert.equal(model.radarMotion.visible, true)
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

const echoTopMeta = {
  tm: '202607252035',
  frames: [
    { tm: '202607252030', path: '/data/radar/echotop/echotop_202607252030.webp', observedAt: '2026-07-25T11:30:00.000Z', bounds: [[30, 120], [44, 136]], siteCount: { ok: 12, total: 13 } },
    { tm: '202607252035', path: '/data/radar/echotop/echotop_202607252035.webp', observedAt: '2026-07-25T11:35:00.000Z', bounds: [[30, 120], [44, 136]], siteCount: { ok: 13, total: 13 } },
  ],
}
const radarMeta = { tm: '202607252035', frames: [{ tm: '202607252030', path: '/a.png' }, { tm: '202607252035', path: '/b.png' }] }

test('an exactly matching echo top frame is used and is not marked stale', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta, echoTopMeta,
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame.tm, '202607252035')
  assert.equal(model.echoTopFrame.observedAt, '2026-07-25T11:35:00.000Z')
  assert.equal(model.echoTopFrame.stale, false)
})

// 레이더와 같은 선택 규칙 — 같이 켜면 같이 보인다. 대신 대체된 프레임은 stale로 드러난다.
test('a missed cycle falls back to the previous frame, flagged stale, like radar does', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta,
    echoTopMeta: { tm: '202607252030', frames: [echoTopMeta.frames[0]] },
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame.tm, '202607252030')
  assert.equal(model.echoTopFrame.stale, true)
  // 표시되는 시각은 어디까지나 그 프레임의 실제 관측시각이다.
  assert.equal(model.echoTopFrame.observedAt, '2026-07-25T11:30:00.000Z')
  assert.equal(model.radarFrame.tm, '202607252035', 'radar still shows its own newest frame')
})

test('with no echo top frames at all the layer stays hidden', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta,
    echoTopMeta: { tm: null, frames: [] },
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame, null)
})

test('the echo top frame is hidden while the layer is off', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta, echoTopMeta,
    visibility: { radar: true, echoTop: false },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame, null)
})

test('partial site coverage is carried on the frame so the UI can flag it', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta, echoTopMeta,
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 30),
  })
  assert.equal(model.echoTopFrame.partial, true)
  assert.deepEqual(model.echoTopFrame.siteCount, { ok: 12, total: 13 })
})

test('a time earlier than every echo top frame shows nothing, not the newest frame', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta,
    echoTopMeta: { tm: '202607252035', frames: [echoTopMeta.frames[1]] },
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 30),
  })
  assert.equal(model.echoTopFrame, null, 'a frame observed later must not stand in for an earlier time')
})
