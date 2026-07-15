import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAmosConsoleModel,
  calculateRunwayWindComponent,
  formatInHgFromHpa,
  runwayHeadingFromLabel,
} from './amosViewModel.js'

const baseAmos = {
  daily_rainfall: { mm: 4.6 },
  observation: { observed_tm_kst: '202605181230' },
  runways: [
    {
      wind_speed: 1.6,
      wind_direction: 340,
      wind_speed_min: 1.5,
      wind_direction_min: 330,
      wind_speed_max: 1.8,
      wind_direction_max: 350,
      visibility_m: 10000,
      rvr_m: 2000,
    },
    {
      wind_speed: 1.7,
      wind_direction: 330,
      wind_speed_min: 1.2,
      wind_direction_min: 320,
      wind_speed_max: 2.1,
      wind_direction_max: 340,
      visibility_m: 10000,
      rvr_m: 2000,
    },
  ],
  weather: {
    cloud_min_m: null,
    temperature_c: 18.2,
    dewpoint_c: 12.8,
  },
  pressure: {
    qnh_hpa: 1017,
  },
}

describe('amosViewModel console model', () => {
  it('maps current normalized wind slots as 2-minute and 10-minute AMOS wind groups', () => {
    const model = buildAmosConsoleModel(baseAmos, null, { icao: 'RKJB' })

    assert.equal(model.windGroups[0].key, 'twoMinute')
    assert.equal(model.windGroups[0].label, '2분')
    assert.equal(model.windGroups[0].rows[0].speedValue, '3.1')
    assert.equal(model.windGroups[0].rows[0].directionValue, '340')
    assert.equal(model.windGroups[0].rows[1].speedValue, '2.9')
    assert.equal(model.windGroups[0].rows[1].directionValue, '330')
    assert.equal(model.windGroups[0].rows[2].speedValue, '3.5')
    assert.equal(model.windGroups[0].rows[2].directionValue, '350')

    assert.equal(model.windGroups[1].key, 'tenMinute')
    assert.equal(model.windGroups[1].label, '10분')
    assert.equal(model.windGroups[1].rows[0].speedValue, '3.3')
    assert.equal(model.windGroups[1].rows[0].directionValue, '330')
    assert.equal(model.windGroups[1].rows[1].speedValue, '2.3')
    assert.equal(model.windGroups[1].rows[1].directionValue, '320')
    assert.equal(model.windGroups[1].rows[2].speedValue, '4.1')
    assert.equal(model.windGroups[1].rows[2].directionValue, '340')
  })

  it('builds active runway, dial rotation, RVR/MOR, and common weather cells', () => {
    const model = buildAmosConsoleModel(baseAmos, null, { icao: 'RKJB' })

    assert.deepEqual(model.runwayLabels, ['01', '19'])
    assert.equal(model.activeRunwayLabel, '01')
    assert.equal(model.activeHeadingDeg, 10)
    assert.equal(model.dial.runwayRotationDeg, -80)
    assert.equal(model.dial.windFromDeg, 330)
    assert.equal(model.dial.arcStartDeg, 320)
    assert.equal(model.dial.arcEndDeg, 340)
    assert.equal(model.dial.headTailLabel, 'H')
    assert.equal(model.dial.crossLabel, 'L')

    assert.deepEqual(model.visibilityRows, [
      { label: 'RWY 01 RVR(m) / MOR(m)', rvrValue: 'P2000', morValue: '10000', isRvrGood: true },
      { label: 'RWY 19 RVR(m) / MOR(m)', rvrValue: 'P2000', morValue: '10000', isRvrGood: true },
    ])

    assert.deepEqual(model.prioritySummary, [
      { key: 'activeRunway', label: '사용 활주로', value: '01 IN USE' },
      { key: 'headTail', label: 'H/T-WS(kt)', value: 'H 03' },
      { key: 'crosswind', label: 'CROSS-WS(kt)', value: 'L 02' },
      { key: 'tenMinuteWind', label: '10분 평균풍', value: '330° / 3.3kt' },
    ])

    assert.deepEqual(model.commonCells.slice(0, 5), [
      { label: '운고(ft)', value: 'NCD' },
      { label: 'QNH(hPa)', value: '1017' },
      { label: 'QNH(inHg)', value: '30.03' },
      { label: '기온(°C)', value: '18.2' },
      { label: '이슬점(°C)', value: '12.8' },
    ])
    assert.deepEqual(model.commonCells[5], { label: '일강수량(mm)', value: '4.6' })
  })

  it('marks wind variation arcs that wrap across north', () => {
    const model = buildAmosConsoleModel({
      ...baseAmos,
      runways: [
        baseAmos.runways[0],
        {
          ...baseAmos.runways[1],
          wind_direction_min: 350,
          wind_direction_max: 10,
        },
      ],
    }, null, { icao: 'RKJB' })

    assert.equal(model.dial.arcStartDeg, 350)
    assert.equal(model.dial.arcEndDeg, 10)
    assert.equal(model.dial.arcWrapsNorth, true)
  })

  it('uses distinct fallback runway labels when airport runway metadata is missing', () => {
    const model = buildAmosConsoleModel(baseAmos, null, {})

    assert.deepEqual(model.runwayLabels, ['RWY 1', 'RWY 2'])
    assert.notEqual(model.visibilityRows[0].label, model.visibilityRows[1].label)
  })

  it('formats QNH inHg from hPa', () => {
    assert.equal(formatInHgFromHpa(1017), '30.03')
    assert.equal(formatInHgFromHpa(null), '-')
  })

  it('derives runway heading from runway label', () => {
    assert.equal(runwayHeadingFromLabel('01'), 10)
    assert.equal(runwayHeadingFromLabel('19'), 190)
    assert.equal(runwayHeadingFromLabel('36'), 360)
    assert.equal(runwayHeadingFromLabel('15L'), 150)
    assert.equal(runwayHeadingFromLabel('RWY'), null)
  })

  it('calculates head-tail and crosswind components from active runway heading', () => {
    const component = calculateRunwayWindComponent({
      windDirectionDeg: 330,
      windSpeedKt: 3.3,
      runwayHeadingDeg: 10,
    })

    assert.equal(component.headTailLabel, 'H')
    assert.equal(Math.round(component.headTailKt), 3)
    assert.equal(component.crossLabel, 'L')
    assert.equal(Math.round(component.crossKt), 2)
  })
})
