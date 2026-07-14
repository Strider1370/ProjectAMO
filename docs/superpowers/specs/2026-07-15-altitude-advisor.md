# 고도 비교표 (Altitude Advisor) — 설계 스펙

- 상태: **설계 초안.** 미구현
- 작성일: 2026-07-15
- 목적: **순항고도를 "입력하는 칸"에서 "고르는 목록"으로 바꾼다.**
  후보 고도마다 바람·기온·착빙·난류·위험현상을 한 표에 늘어놓고, 사용자가 결과를 보고 고른다.
- 벤치마크 출처: ForeFlight Mobile v10.0 Performance Guide **p.18(Altitude Advisor), p.28(Navlog 고도 비교표)**

## 1. 문제

지금 사용자는 순항고도를 **하나만** 찍는다(`useRouteBriefing.js` `cruiseAltitudeFt`, 기본 9,000ft).
브리핑은 그 하나의 고도로만 판정한다(`planned-altitude.js` → `enroute-model.js`).

**다른 고도가 더 나은지 알려면 고도를 바꿔 다시 조회하는 수밖에 없다.** 사용자가 손으로 이진탐색을 한다.

그런데 우리는 이미 **모든 고도의 답을 갖고 있다.** 아래 §2가 그 근거다.

## 2. 핵심 근거 — 단면은 이미 고도 독립적이다

`loadRouteCrossSection`(`backend/src/briefing/enroute-cross-section.js:74`)은
**계획고도를 입력으로 받지 않는다.** KIM 전 기압면(`KIM_NWP_LEVELS` 중 `kind==='pressure'`)의
`u`/`v`/`T`/`icingGrade`와 KTG 난류 고도층을 **경로 축을 따라 통째로** 반환한다.

계획고도가 개입하는 곳은 그 **다음 단계** 하나뿐이다 —
`summarizeEnrouteModel`(`enroute-model.js:78`)이 `seriesAtAltitude()`로 `alt(d)` 위치의 값을 뽑을 때.

```
loadRouteCrossSection(경로)          ← 1회. 무겁다(격자 디코딩)
  └→ summarizeEnrouteModel(단면, 고도 A)   ← 순수 산술. 싸다
  └→ summarizeEnrouteModel(단면, 고도 B)   ← 〃
  └→ ... N개 고도
```

**따라서 N개 고도 비교의 추가 비용 ≈ N × (샘플수 × 층수) 회의 보간뿐이다. 새 데이터 수집도, 새 upstream 호출도 없다.**
이것이 이 기능을 1순위로 두는 유일한 이유다. 데이터가 없어서 못 하는 게 아니라, **이미 있는 걸 안 보여주고 있었다.**

## 3. 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 연료·소요시간 컬럼 | **넣지 않는다** | 기체 성능 데이터가 없다(`aircraftProfiles.js`는 `tasKt`·`altitudeFt` 2개 필드뿐). 연료를 지어내면 위험한 가짜 숫자가 된다 |
| 비용 지표 | **정풍/배풍 성분(kt)** | 연료·시간의 물리적 대리값. u/v를 경로 방위에 투영하면 나온다. **우리 데이터만으로 정직하게 계산 가능** |
| 후보 고도 집합 | **KIM 압력면 고도(`level.altFt`)** 그대로 | 자료가 실제로 있는 고도 = 답을 낼 수 있는 고도. 임의 1,000ft 간격을 만들면 층 사이를 보간해 "없는 정밀도"를 꾸미게 된다 |
| 반원식 고도규칙 필터(동편/서편) | **v1 제외** | ICAO 반원식은 **자침로(magnetic track)** 기준인데 우리 축은 진방위다. 편각(한국 ~8°W) 처리를 결정하지 않은 채 필터를 걸면 경계 고도에서 틀린다. **틀린 필터는 필터 없음보다 나쁘다.** v2로 미룬다 |
| 자료 없는 고도 | **`——` 명시** | ForeFlight의 `-----`와 같은 원칙(p.18). 침묵하면 "안전함"으로 오독된다 |
| 권장 고도 | **1줄 제시 + 이유 병기** | 순위 알고리즘은 §4-C. 이유 없는 추천은 신뢰받지 못한다 |
| 계산 위치 | **백엔드 신규 라우트** | 단면 디코딩은 백엔드 전용(격자 파일 접근). 프론트로 raw 격자를 내보내지 않는다 |

## 4. 모듈 설계

### 4-A. 백엔드 — `POST /api/briefing/altitudes` (신규)

`server.js`에 라우트 추가. 기존 `POST /api/briefing/cross-section`과 **같은 로더를 재사용**한다.

```
요청:  { routeGeometry, etd, eta, tmfc?, hf? }        // 계획고도를 받지 않는다
응답:  {
  available: true,
  totalDistanceNm,
  run: { tmfc, hf, validTime },                        // 표에 "예보 시각" 표기용
  rows: [{
    altFt, fl,                                         // 4200 → "FL140" 형식은 프론트에서
    windComponentKt,                                   // +뒷바람 / −맞바람. null 가능
    windDir, windSpeedKt,                              // 경로 평균 벡터풍
    tempC,                                             // 경로 평균
    icing:      { level: '중'|'심'|null, intervals: [...] },
    turbulence: { level: '중'|'심'|null, intervals: [...] },
    hazards:    [{ code, label, encounter: 'on'|'nearby' }],   // §4-D
    available: true|false                              // false면 프론트가 `——` 행으로
  }],
  recommended: { altFt, reason: string } | null
}
```

### 4-B. 신규 순수 모듈 — `backend/src/briefing/altitude-options.js`

```
buildAltitudeOptions({ crossSection, turbulence, totalDistanceNm, axis, hazards }) -> rows[]
```

- 후보 고도 = `crossSection.levels`의 `altFt` (오름차순).
- 각 고도에 대해 **`summarizeEnrouteModel`을 그대로 재호출**한다.
  `cruiseAltitudeFt = 후보고도`를 넣으면 상승·하강 곡선까지 반영된 값이 나온다.
  ⚠️ **주의:** 그 결과는 "그 고도로 갔을 때 경로 전체"의 위험이지, "그 고도층만"의 위험이 아니다.
  이게 맞다 — 사용자가 알고 싶은 건 "이 고도를 선택하면 어떻게 되는가"다.
- **바람 성분** — 신규 계산:
  ```
  각 거리 샘플 i:
    trackDeg  = axis.samples[i].bearing            (진방위, route-axis.js)
    u, v      = seriesAtAltitude(levels, ..., 'interp')  (m/s)
    // u=동향, v=북향 성분 → 진행방향 투영
    tailwindKt = (u·sin(track) + v·cos(track)) · 1.94384
  windComponentKt = mean(tailwindKt)               // 경로 전체 평균 (ForeFlight p.18과 동일 정의)
  ```
  ⚠️ `rawWindsModel.js:8`의 `uvToWind`는 **불어오는 방향(기상풍향)**을 만든다. 여기서 필요한 건
  **불어가는 방향의 성분**이다. 부호를 뒤집어 쓰지 말고 위 식을 직접 쓴다.

### 4-C. 권장 고도 — 규칙 (알고리즘 아님, 사다리)

```
1. 위험 조우(hazards encounter='on')가 있는 고도 제외
2. 착빙·난류 '심' 있는 고도 제외
3. 남은 고도 중 windComponentKt 최대
4. 남은 게 없으면 recommended = null  ("모든 고도에 위험이 있습니다")
```

- **가중합 점수를 만들지 않는다.** 위험과 바람은 단위가 다르고, 가중치는 근거 없는 숫자가 된다.
  위험을 먼저 걸러내고 그 안에서 바람만 비교하는 **사전식 순서(lexicographic)** 가 정직하다.
- `reason`은 그 고도가 왜 뽑혔는지 한 줄: `"뒷바람 +12kt · 위험현상 없음"`.

### 4-D. 위험현상(SIGMET/AIRMET) 고도별 매칭

`hazard-section.js`의 `buildHazardSection`은 이미 `cruiseAltitudeFt`를 받아 `on`/`nearby`를 태그한다.
**고도별로 다시 호출한다.** 시간·수평 매칭 결과는 고도와 무관하므로,
성능이 문제되면 수평·시간 매칭을 한 번만 하고 수직 판정(`hazard-matcher.js`)만 N회 도는 형태로 쪼갠다.
**v1은 그냥 N회 호출한다** — 후보 고도가 10개 내외라 측정 없이 최적화하지 않는다.

### 4-E. 프론트 — `frontend/src/features/route-briefing/AltitudeOptionsTable.jsx` (신규)

- 진입: `RouteBriefingPanel`의 순항고도 입력 옆 **"고도 비교"** 버튼.
- 목업: 이 대화의 `foreflight_benchmark_mockups_1_to_4` 위젯 1번.
- 색: 배풍 = `--level-green`, 맞바람 = `--level-red`(강함) / `--level-amber`(약함), 자료없음 = `--text-disabled`.
  ⚠️ 디자인 헌법 §3 "색만으로 등급 구분 금지" → **부호(+/−)와 "맞바람"/"뒷바람" 라벨을 반드시 병기**한다.
- 행 클릭 → `cruiseAltitudeFt` 갱신 → 기존 브리핑 재조회. **표는 브리핑을 대체하지 않고 고도 선택기다.**
- 임계값(맞바람 몇 kt부터 red인가): **−15kt**. 근거 없는 값이므로 상수 한 곳(`ALTITUDE_TABLE`)에 두고 조정 가능하게 둔다.

## 5. 검증 (`backend/test/altitude-options.test.js`)

| 입력 | 기대 |
|---|---|
| 단면 levels 3개 + 균일 서풍(u>0, v=0), 경로 진방위 090° | 모든 고도 `windComponentKt > 0` (뒷바람) |
| 같은 단면, 경로 진방위 270° | 모든 고도 `windComponentKt < 0` (맞바람), 절댓값 동일 |
| 한 고도에만 icing grade 3 | 그 고도 `icing.level === '심'`, `recommended.altFt !== 그 고도` |
| 모든 고도에 SIGMET `on` | `recommended === null` |
| 특정 고도 층 데이터 결측(NaN) | 그 행 `available: false`, 다른 행은 정상 |
| 후보 고도 = 단면 층 수 | `rows.length === crossSection.levels.length` |
| 같은 고도로 `summarizeEnrouteModel` 직접 호출한 결과와 대조 | 위험 구간이 **완전 일치** (회귀 방지 — 표와 브리핑이 다른 답을 내면 신뢰가 무너진다) |

마지막 항목이 이 스펙의 핵심 안전장치다. **고도 비교표와 실제 브리핑은 같은 함수를 써야 하고, 그것을 테스트가 강제한다.**

## 6. 범위 밖 (명시적으로 안 함)

- 연료·소요시간 컬럼 (기체 성능 데이터 없음)
- 반원식 고도규칙 필터 (§3 — 편각 결정 후 v2)
- VFR 고도 필터
- Step climb (단계 상승)
- 지상풍/저고도(KTG 커버리지 밖) 고도 후보
