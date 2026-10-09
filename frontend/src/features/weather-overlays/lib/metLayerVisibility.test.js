import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialMetVisibility, getNextMetVisibility, clearMetVisibility } from './metLayerVisibility.js'

test('initial MET visibility turns on only the domestic radar', () => {
  assert.deepEqual(
    createInitialMetVisibility(['radarHsr', 'radarHci', 'lightning']),
    {
      radarHsr: true, radarHci: false, lightning: false, windFlow: true, windSpeed: true,
      surfaceChartWind: 'barbs',
    },
  )
})

test('SIGMET and AIRMET start visible while explicit visibility overrides are preserved', () => {
  const ids = ['radarHsr', 'sigmet', 'sigmet_intl', 'airmet']
  const initial = createInitialMetVisibility(ids)
  assert.equal(initial.sigmet, true)
  assert.equal(initial.airmet, true)
  assert.equal(initial.sigmet_intl, false)
  const overridden = createInitialMetVisibility(ids, { sigmet: false, airmet: false })
  assert.equal(overridden.sigmet, false)
  assert.equal(overridden.airmet, false)
})

test('시정·운고는 기본 OFF이고 이전 개별 선택도 통합 보기로 복원한다', () => {
  const ids = ['visibility', 'ceiling']
  const initial = createInitialMetVisibility(ids)
  assert.equal(initial.visibility, false)
  assert.equal(initial.ceiling, false)
  for (const saved of [{ visibility: true }, { ceiling: true }, { visibility: false, ceiling: true }]) {
    const restored = createInitialMetVisibility(ids, saved)
    assert.equal(restored.visibility, true)
    assert.equal(restored.ceiling, true)
  }
})

test('시정·운고 버튼과 이전 운고 액션은 둘을 함께 토글하고 전체 해제도 함께 끈다', () => {
  for (const id of ['visibility', 'ceiling']) {
    const before = { visibility: false, ceiling: false, wind: true, turbulence: false }
    const enabled = getNextMetVisibility(before, id)
    assert.deepEqual(enabled, { ...before, visibility: true, ceiling: true })
    assert.deepEqual(getNextMetVisibility(enabled, id), before)
    const cleared = clearMetVisibility(enabled, ['visibility'])
    assert.equal(cleared.visibility, false)
    assert.equal(cleared.ceiling, false)
    assert.equal(cleared.wind, false)
  }
})

test('surface chart starts with barbs and the title button swaps barbs and animation', () => {
  const initial = createInitialMetVisibility(['surfaceChart', 'wind', 'temp'])
  assert.equal(initial.surfaceChart, false)
  const on = getNextMetVisibility({ ...initial, wind: true }, 'surfaceChart')
  assert.equal(on.surfaceChart, true)
  assert.equal(on.wind, true)
  assert.equal(on.surfaceChartWind, 'barbs')
  const flow = getNextMetVisibility(on, 'surfaceChartWind')
  assert.equal(flow.surfaceChartWind, 'flow')
  assert.equal(getNextMetVisibility(flow, 'surfaceChartWind').surfaceChartWind, 'barbs')
  assert.equal(flow.surfaceChart, true, 'switching the wind display keeps the chart on')
})

// 국내/해외 레이더는 상호배타. toggleMet과 setLayerOn(검색·브리핑 딥링크)이 모두 이 함수를 지나므로
// 여기서만 막으면 우회 경로가 없다.
test('국내 레이더와 해외 레이더는 상호배타', () => {
  assert.deepEqual(
    getNextMetVisibility({ radarHsr: true, radarOverseas: false }, 'radarOverseas'),
    { radarHsr: false, radarOverseas: true },
  )
  assert.deepEqual(
    getNextMetVisibility({ radarHsr: false, radarOverseas: true }, 'radarHsr'),
    { radarHsr: true, radarOverseas: false },
  )
  // 끄는 건 상대를 켜지 않는다(둘 다 꺼진 상태 허용)
  assert.deepEqual(
    getNextMetVisibility({ radarHsr: false, radarOverseas: true }, 'radarOverseas'),
    { radarHsr: false, radarOverseas: false },
  )
})

test('getNextMetVisibility makes wind and temp mutually exclusive', () => {
  assert.deepEqual(
    getNextMetVisibility(
      { wind: false, temp: true, cloud: false, windFlow: true, windSpeed: false },
      'wind',
      { lowPower: false },
    ),
    { wind: true, temp: false, cloud: false, icing: false, turbulence: false, ctps: false, windFlow: true, windSpeed: true },
  )

  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: false, cloud: false, windFlow: true, windSpeed: true },
      'temp',
      { lowPower: false },
    ),
    { wind: false, temp: true, cloud: false, icing: false, turbulence: false, ctps: false, windFlow: false, windSpeed: true },
  )

  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: false, cloud: false, windFlow: true, windSpeed: true },
      'cloud',
      { lowPower: false },
    ),
    { wind: false, temp: false, cloud: true, icing: false, turbulence: false, ctps: false, windFlow: false, windSpeed: true },
  )
})

test('getNextMetVisibility keeps wind flow off in low power mode', () => {
  assert.equal(
    getNextMetVisibility(
      { wind: false, temp: false, windFlow: false, windSpeed: false },
      'wind',
      { lowPower: true },
    ).windFlow,
    false,
  )
})

test('icing coexists with cloud and temperature while disabling wind', () => {
  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: true, cloud: true, icing: false, windFlow: true, windSpeed: true },
      'icing',
      { lowPower: false },
    ),
    { wind: false, temp: true, cloud: true, icing: true, turbulence: false, ctps: false, windFlow: false, windSpeed: true },
  )

  assert.equal(
    getNextMetVisibility(
      { wind: false, temp: false, cloud: false, icing: true, windFlow: false, windSpeed: true },
      'wind',
      { lowPower: false },
    ).icing,
    false,
  )
})

test('combined view restores child settings across wind and parent toggles', () => {
  const initial = createInitialMetVisibility(['wind', 'temp', 'cloud', 'icing', 'cloudIcing'])
  const opened = getNextMetVisibility(initial, 'cloudIcing')
  assert.equal(opened.temp && opened.cloud && opened.icing && opened.cloudIcing, true)
  assert.equal(getNextMetVisibility(opened, 'temp'), opened, 'legacy temperature enable is idempotent')
  const configured = getNextMetVisibility(opened, 'cloud')
  const wind = getNextMetVisibility(configured, 'wind')
  assert.equal(wind.cloudIcing || wind.temp || wind.cloud || wind.icing, false)
  const restored = getNextMetVisibility(wind, 'cloudIcing')
  assert.equal(restored.temp, true)
  assert.equal(restored.cloud, false)
  assert.equal(restored.icing, true)
  const closed = getNextMetVisibility(restored, 'cloudIcing')
  assert.equal(closed.temp || closed.cloud || closed.icing || closed.cloudIcing, false)
  assert.equal(getNextMetVisibility(closed, 'cloudIcing').temp, true)
})

test('legacy child states and parent-only deep links initialize consistently', () => {
  const ids = ['temp', 'cloud', 'icing', 'cloudIcing']
  assert.equal(createInitialMetVisibility(ids, { cloud: true }).cloudIcing, true)
  const parent = createInitialMetVisibility(ids, { cloudIcing: true })
  assert.equal(parent.temp && parent.cloud && parent.icing, true)
  assert.equal(createInitialMetVisibility(ids, null).cloudIcing, false)
})

// 오른쪽 세로 슬라이더 자리는 하나뿐 — 운정고도(ctps)는 KIM·난류와 배타적. 바람과 난류는 같은 KIM 고도라 함께 켤 수 있다.
test('운정고도는 KIM·난류와 배타적이고, 바람과 난류는 함께 켜진다', () => {
  assert.deepEqual(
    getNextMetVisibility(
      { wind: false, temp: false, cloud: false, icing: false, turbulence: false, ctps: false, windFlow: false, windSpeed: false },
      'turbulence',
      { lowPower: false },
    ),
    { wind: false, temp: false, cloud: false, icing: false, turbulence: true, ctps: false, windFlow: false, windSpeed: false },
  )

  // 난류가 켜진 상태에서 바람을 켜면 둘 다 켜지고, 바람은 흐름만(속도 색 없이) 보인다.
  const both = getNextMetVisibility(
    { wind: false, temp: false, cloud: false, icing: false, turbulence: true, ctps: false, windFlow: false, windSpeed: false },
    'wind',
    { lowPower: false },
  )
  assert.deepEqual(both, { wind: true, temp: false, cloud: false, icing: false, turbulence: true, ctps: false, windFlow: true, windSpeed: false })
  // 난류를 끄면 바람 속도 색이 돌아온다. 다시 켜면 속도 색만 꺼진다.
  const windOnly = getNextMetVisibility(both, 'turbulence', { lowPower: false })
  assert.deepEqual(windOnly, { wind: true, temp: false, cloud: false, icing: false, turbulence: false, ctps: false, windFlow: true, windSpeed: true })
  assert.deepEqual(getNextMetVisibility(windOnly, 'turbulence', { lowPower: false }), both)
  // 둘 다 켠 상태에서 바람을 끄면 난류만 남는다.
  assert.equal(getNextMetVisibility(both, 'wind', { lowPower: false }).turbulence, true)
  // 구름·착빙을 켜면 바람과 난류는 꺼진다.
  const cloudIcing = getNextMetVisibility({ ...both, cloudIcing: false }, 'cloudIcing', { lowPower: false })
  assert.equal(cloudIcing.wind || cloudIcing.turbulence, false)

  // 운정고도를 켜면 KIM과 난류가 모두 꺼진다.
  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: false, cloud: false, icing: false, turbulence: false, ctps: false, windFlow: true, windSpeed: true },
      'ctps',
      { lowPower: false },
    ),
    { wind: false, temp: false, cloud: false, icing: false, turbulence: false, ctps: true, windFlow: false, windSpeed: true },
  )

  // 운정고도가 켜진 상태에서 난류를 켜면 운정고도는 꺼진다.
  assert.deepEqual(
    getNextMetVisibility(
      { wind: false, temp: false, cloud: false, icing: false, turbulence: false, ctps: true, windFlow: false, windSpeed: false },
      'turbulence',
      { lowPower: false },
    ),
    { wind: false, temp: false, cloud: false, icing: false, turbulence: true, ctps: false, windFlow: false, windSpeed: false },
  )
})

test('both child faces off keeps contours and survives parent, primary view and all-off', () => {
  const ids = ['cloudIcing', 'temp', 'cloud', 'icing', 'wind', 'ctps', 'turbulence']
  const initial = createInitialMetVisibility(ids, { cloudIcing: true })
  const none = getNextMetVisibility(getNextMetVisibility(initial, 'cloud'), 'icing')
  assert.equal(none.cloud || none.icing, false)
  assert.equal(none.cloudIcing && none.temp, true)
  for (const closed of [getNextMetVisibility(none, 'cloudIcing'), getNextMetVisibility(none, 'wind'), getNextMetVisibility(none, 'ctps'), getNextMetVisibility(none, 'turbulence'), clearMetVisibility(none, ids)]) {
    assert.equal(closed.cloudIcing || closed.temp, false)
    const restored = getNextMetVisibility(closed, 'cloudIcing')
    assert.equal(restored.cloud || restored.icing, false)
    assert.equal(restored.cloudIcing && restored.temp, true)
    assert.equal(restored.wind || restored.ctps || restored.turbulence, false)
  }
})

test('version 2 uses the explicit parent and normalizes legacy temperature/detail flags', () => {
  const ids = ['cloudIcing', 'temp', 'cloud', 'icing']
  const legacy = createInitialMetVisibility(ids, { temp: true, cloudIcingDetail: true })
  assert.equal(legacy.cloudIcing && legacy.temp, true)
  assert.equal(legacy.cloudIcingDetail, false)
  const inactive = createInitialMetVisibility(ids, { cloudIcingPresentationVersion: 2, cloudIcing: false, temp: true, cloud: true })
  assert.equal(inactive.temp || inactive.cloud || inactive.cloudIcing, false)
  const contoursOnly = createInitialMetVisibility(ids, { cloudIcingPresentationVersion: 2, cloudIcing: true, temp: false, cloud: false, icing: false })
  assert.equal(contoursOnly.cloudIcing && contoursOnly.temp, true)
  assert.equal(contoursOnly.cloud || contoursOnly.icing, false)
})
