import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteWeatherLegs } from '../src/briefing/route-weather-legs.js'

const axis = {
  totalDistanceNm: 20,
  samples: [
    { distanceNm: 0, bearingDeg: 90 },
    { distanceNm: 10, bearingDeg: 90 },
    { distanceNm: 20, bearingDeg: 90 },
  ],
}

const values = (field, entries) => ({
  altFt: 9000,
  values: entries.map((value, index) => ({ distanceNm: index * 10, altFt: 9000, [field]: value })),
})

test('buildRouteWeatherLegs keeps every aligned segment and aggregates its selected-altitude facts', () => {
  const result = buildRouteWeatherLegs({
    routeModel: {
      enRouteSegments: [
        { id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 0, endNm: 10, alignmentStatus: 'aligned' },
        { id: 'B-C', fromFix: 'B', toFix: 'C', startNm: 10, endNm: 20, alignmentStatus: 'aligned' },
      ],
    },
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 9000,
    crossSection: {
      levels: [
        values('u', [10, 20, 30]),
        values('v', [0, 0, 0]),
        // 단면 샘플러(cross-section-sampler)가 실제로 내보내는 키·단위: 소문자 t, 섭씨.
        values('t', [-40, -39, -38]),
        values('icing', [1, 2, 3]),
      ],
    },
    turbulence: { levels: [values('ktg', [0.2, 0.6, 0.8])] },
    hazards: [{
      source: 'SIGMET', code: 'SEV_TURB', label: 'Severe turbulence', airportScope: null,
      routeIntervalNm: { startNm: 11, endNm: 19 }, altitudeExposure: { status: 'unknown' }, timeStatus: 'unavailable',
    }],
    routeNotams: [{
      id: 'N1', summary: 'Restricted area', routeIntervalNm: { startNm: 11, endNm: 19 }, comparisonStatus: 'undetermined',
    }],
    aipConstraints: {
      status: 'matched',
      provenance: { publicationId: 'AIP-2026-07' },
      segments: [{ id: 'B-C', status: 'matched', constraints: { minimumFlightAltitude: { value: 8000, unit: 'FT' } } }],
    },
  })

  assert.deepEqual(result.legs.map(({ from, to, distanceNm }) => ({ from, to, distanceNm })), [
    { from: 'A', to: 'B', distanceNm: 10 },
    { from: 'B', to: 'C', distanceNm: 10 },
  ])
  assert.deepEqual(result.legs[1].wind, { meanComponentKt: 39, minComponentKt: 39, maxComponentKt: 39, directionDeg: 270, speedKt: 39 })
  assert.deepEqual(result.legs[1].temp, { meanC: -39, minC: -39, maxC: -39, isaDevC: -36 })
  assert.deepEqual(result.legs[1].icing, { peakLevel: 2, exposures: [{ level: 2, distanceNm: 10 }] })
  assert.equal(result.legs[1].turbulence.peakLevel, 'moderate')
  assert.deepEqual(result.legs[1].hazards.map(({ code, verticalStatus }) => ({ code, verticalStatus })), [{ code: 'SEV_TURB', verticalStatus: 'unknown' }])
  assert.deepEqual(result.legs[1].notams, [{ id: 'N1', summary: 'Restricted area', effect: 'undetermined' }])
  assert.equal(result.legs[1].altitudeConstraint.status, 'matched')
  assert.equal(result.legs[1].altitudeConstraint.sourceCycle, 'AIP-2026-07')
  assert.equal('eta' in result.legs[1], false)
  assert.equal('headingDeg' in result.legs[1], false)
})

test('procedure NAVLOG groups keep SID, STAR, and IAP compact ranges with expandable weather legs', () => {
  const result = buildRouteWeatherLegs({
    routeModel: { enRouteSegments: [] },
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36], [128, 35], [129, 34]] },
    routeMarkers: [
      { label: 'RKAA', lon: 126, lat: 37 },
      { label: 'RKZZ', lon: 129, lat: 34 },
    ],
    procedureContext: {
      procedures: [
        { type: 'SID', id: 'ALPHA1A', fixes: [{ id: 'S1', lon: 126.5, lat: 36.5 }, { id: 'E1', lon: 127, lat: 36 }] },
        { type: 'STAR', id: 'BRAVO2B', fixes: [{ id: 'X1', lon: 128, lat: 35 }, { id: 'S2', lon: 128.5, lat: 34.5 }] },
        { type: 'IAP', id: 'ILS18', fixes: [{ id: 'I1', lon: 128.5, lat: 34.5 }, { id: 'RW18', lon: 129, lat: 34 }] },
      ],
    },
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 9000,
    crossSection: { levels: [values('t', [-20, -21, -22])] },
  })

  assert.deepEqual(result.procedures.map(({ type, id }) => ({ type, id })), [
    { type: 'SID', id: 'ALPHA1A' },
    { type: 'STAR', id: 'BRAVO2B' },
    { type: 'IAP', id: 'ILS18' },
  ])
  assert.deepEqual(result.procedures.map(({ from, to }) => ({ from, to })), [
    { from: 'RKAA', to: 'E1' },
    { from: 'X1', to: 'S2' },
    { from: 'I1', to: 'RKZZ' },
  ])
  assert.ok(result.procedures.every((procedure) => procedure.endNm > procedure.startNm))
  assert.ok(result.procedures.every((procedure) => procedure.coordinates.length >= 2))
  assert.ok(result.procedures.every((procedure) => procedure.legs.length >= 1))
  assert.deepEqual(result.procedures[0].legs.map((leg) => [leg.from, leg.to]), [['RKAA', 'S1'], ['S1', 'E1']])
})

// FL310 NAVLOG에 지표시정(AIRMET)이 매 구간 붙던 실제 문제를 고정한다.
// hazard-section이 지표 현상에 지표~FL100 밴드를 매기면 altitudeExposure가 clear가 되고,
// 구간 표는 그 clear를 보고 빼야 한다.
test('순항고도 밖으로 확정된(clear) 위험기상은 구간에 붙지 않는다', () => {
  const build = (status) => buildRouteWeatherLegs({
    routeModel: { enRouteSegments: [{ id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 0, endNm: 20, alignmentStatus: 'aligned' }] },
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 31000,
    crossSection: { levels: [values('t', [-40, -39, -38])] },
    hazards: [{
      source: 'AIRMET', code: 'SFC_VIS', label: 'Surface Visibility', airportScope: null,
      routeIntervalNm: { startNm: 0, endNm: 20 }, altitudeExposure: { status }, timeStatus: 'matched',
    }],
  }).legs[0].hazards

  assert.deepEqual(build('clear'), [])
  assert.equal(build('unknown').length, 1)
})

// ForeFlight 등 상용 EFB는 바람을 성분(CMP)과 실제 풍향/풍속(DIR/SPD) 두 가지로 같이 준다.
// 성분만으로는 어느 쪽에서 부는지 알 수 없어 대체 고도·경로 판단에 못 쓴다.
test('바람은 항로 성분과 실제 풍향·풍속을 함께 낸다', () => {
  // u=서→동 10m/s, v=0 → 서풍(270°에서 불어옴), 19.4kt.
  const westerly = buildRouteWeatherLegs({
    routeModel: { enRouteSegments: [{ id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 0, endNm: 20, alignmentStatus: 'aligned' }] },
    weatherAxis: axis, // 전 구간 bearing 90° = 정동진
    selectedCruiseAltitudeFt: 9000,
    crossSection: { levels: [values('u', [10, 10, 10]), values('v', [0, 0, 0])] },
  }).legs[0].wind

  assert.equal(westerly.directionDeg, 270)
  assert.equal(westerly.speedKt, 19)
  // 동쪽으로 가는데 서풍 → 뒷바람(양수), 성분 크기는 풍속과 같다.
  assert.equal(westerly.meanComponentKt, 19)
})

// 고도가 같아도 ISA 대비 얼마나 따뜻한지가 성능·결빙 판단의 기준이다.
test('기온에 ISA 편차를 함께 낸다', () => {
  const leg = (altitudeFt, tempC) => buildRouteWeatherLegs({
    routeModel: { enRouteSegments: [{ id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 0, endNm: 20, alignmentStatus: 'aligned' }] },
    weatherAxis: axis,
    selectedCruiseAltitudeFt: altitudeFt,
    crossSection: { levels: [{ altFt: altitudeFt, values: [0, 1, 2].map((i) => ({ distanceNm: i * 10, altFt: altitudeFt, t: tempC })) }] },
  }).legs[0].temp

  // 해면 15°C가 ISA 기준 — 편차 0.
  assert.equal(leg(0, 15).isaDevC, 0)
  // FL310 ISA = 15 - 1.98 x 31 = -46.4°C. 실측 -27°C면 ISA+19.
  assert.equal(leg(31000, -27).meanC, -27)
  assert.equal(leg(31000, -27).isaDevC, 19)
  // 대류권계면(36,089ft) 위는 -56.5°C로 고정된다.
  assert.equal(leg(41000, -50).isaDevC, 7)
})

// NAVLOG 칩 색은 "실제 저촉(conflict)"으로 정해야 한다. comparisonStatus는 "시간·고도를
// 비교할 수 있었나"라서, 그걸 쓰면 정보성 시설 NOTAM(TAR 정비 등)까지 빨갛게 뜬다.
test('NOTAM 칩은 실제 저촉만 warn으로 낸다', () => {
  const effects = (notam) => buildRouteWeatherLegs({
    routeModel: { enRouteSegments: [{ id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 0, endNm: 20, alignmentStatus: 'aligned' }] },
    weatherAxis: axis, selectedCruiseAltitudeFt: 31000,
    routeNotams: [{ id: 'N1', summary: 's', routeIntervalNm: { startNm: 0, endNm: 20 }, ...notam }],
  }).legs[0].notams.map((n) => n.effect)

  assert.deepEqual(effects({ conflict: true, comparisonStatus: 'warn' }), ['warn'], '진짜 저촉만 빨강')
  assert.deepEqual(effects({ conflict: false, comparisonStatus: 'warn' }), ['info'], '비교는 됐지만 저촉 아님 → 정보')
  assert.deepEqual(effects({ conflict: false, comparisonStatus: 'undetermined' }), ['undetermined'])
})

// 절차 자료는 한국 공항에만 있다. 해외 목적지는 접근절차 그룹이 안 만들어져 NAVLOG 마지막
// 줄이 목적지가 아니라 마지막 항로점이 됐다 — 도착지 기상이 제일 중요한 노선에서.
test('buildRouteWeatherLegs: 절차가 없으면 출발·도착 공항을 양 끝에 잇는다', () => {
  const result = buildRouteWeatherLegs({
    routeModel: {
      enRouteSegments: [
        { id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 5, endNm: 10, alignmentStatus: 'aligned' },
      ],
    },
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 37], [128, 37]] },
    routeMarkers: [
      { label: 'RKSI', lon: 126, lat: 37, kind: 'AIRPORT' },
      { label: 'RJBB', lon: 128, lat: 37, kind: 'AIRPORT' },
    ],
    procedureContext: null,
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 9000,
  })

  assert.equal(result.legs.at(0).from, 'RKSI', '첫 줄은 출발공항에서 시작해야 한다')
  assert.equal(result.legs.at(-1).to, 'RJBB', '마지막 줄은 목적지로 끝나야 한다')
  assert.ok(result.legs.every((leg, index, all) => index === 0 || leg.startNm >= all[index - 1].startNm), '거리 순으로 정렬돼야 한다')
})

test('buildRouteWeatherLegs: 구간이 없으면 공항 줄도 만들지 않는다', () => {
  const result = buildRouteWeatherLegs({
    routeModel: { enRouteSegments: [] },
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [128, 37]] },
    routeMarkers: [
      { label: 'RKSI', lon: 126, lat: 37, kind: 'AIRPORT' },
      { label: 'RJBB', lon: 128, lat: 37, kind: 'AIRPORT' },
    ],
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 9000,
  })
  assert.deepEqual(result.legs, [])
})

test('buildRouteWeatherLegs: SID가 출발공항을 이미 품었으면 공항 줄을 또 만들지 않는다', () => {
  const result = buildRouteWeatherLegs({
    routeModel: {
      enRouteSegments: [
        { id: 'A-B', fromFix: 'A', toFix: 'B', startNm: 5, endNm: 10, alignmentStatus: 'aligned' },
      ],
    },
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [126.5, 37], [127, 37], [128, 37]] },
    routeMarkers: [
      { label: 'RKSI', lon: 126, lat: 37, kind: 'AIRPORT' },
      { label: 'RJBB', lon: 128, lat: 37, kind: 'AIRPORT' },
    ],
    procedureContext: {
      procedures: [{ type: 'SID', id: 'SID1', fixes: [{ id: 'A', lon: 126.5, lat: 37 }] }],
    },
    weatherAxis: axis,
    selectedCruiseAltitudeFt: 9000,
  })

  const sidGroup = result.procedures.find((group) => group.type === 'SID')
  assert.equal(sidGroup?.from, 'RKSI', 'SID 그룹이 출발공항을 품는다')
  assert.equal(result.legs.filter((leg) => leg.from === 'RKSI').length, 0, '그룹이 품었으면 별도 줄을 만들지 않는다')
  assert.equal(result.legs.at(-1).to, 'RJBB', '도착공항은 절차가 없으니 여전히 붙는다')
})
