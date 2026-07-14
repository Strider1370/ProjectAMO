import assert from 'node:assert/strict'
import test from 'node:test'

import { getNextMetVisibility } from './metLayerVisibility.js'

// 국내/해외 레이더는 상호배타. toggleMet과 setLayerOn(검색·브리핑 딥링크)이 모두 이 함수를 지나므로
// 여기서만 막으면 우회 경로가 없다.
test('국내 레이더와 해외 레이더는 상호배타', () => {
  assert.deepEqual(
    getNextMetVisibility({ radar: true, radarOverseas: false }, 'radarOverseas'),
    { radar: false, radarOverseas: true },
  )
  assert.deepEqual(
    getNextMetVisibility({ radar: false, radarOverseas: true }, 'radar'),
    { radar: true, radarOverseas: false },
  )
  // 끄는 건 상대를 켜지 않는다(둘 다 꺼진 상태 허용)
  assert.deepEqual(
    getNextMetVisibility({ radar: false, radarOverseas: true }, 'radarOverseas'),
    { radar: false, radarOverseas: false },
  )
})

test('getNextMetVisibility makes wind and temp mutually exclusive', () => {
  assert.deepEqual(
    getNextMetVisibility(
      { wind: false, temp: true, cloud: false, windFlow: true, windSpeed: false },
      'wind',
      { lowPower: false },
    ),
    { wind: true, temp: false, cloud: false, icing: false, windFlow: true, windSpeed: true },
  )

  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: false, cloud: false, windFlow: true, windSpeed: true },
      'temp',
      { lowPower: false },
    ),
    { wind: false, temp: true, cloud: false, icing: false, windFlow: false, windSpeed: true },
  )

  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: false, cloud: false, windFlow: true, windSpeed: true },
      'cloud',
      { lowPower: false },
    ),
    { wind: false, temp: false, cloud: true, icing: false, windFlow: false, windSpeed: true },
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

test('getNextMetVisibility adds icing to NWP mutual exclusion', () => {
  assert.deepEqual(
    getNextMetVisibility(
      { wind: true, temp: true, cloud: true, icing: false, windFlow: true, windSpeed: true },
      'icing',
      { lowPower: false },
    ),
    { wind: false, temp: false, cloud: false, icing: true, windFlow: false, windSpeed: true },
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
