# 브리핑 신뢰도 경고 (2단계 경고 체계) — 설계 스펙

- 상태: **설계 초안.** 미구현
- 작성일: 2026-07-15
- 목적: **"날씨가 얼마나 나쁜가"와 "그 판정을 얼마나 믿을 수 있는가"를 분리해 표시한다.**
- 벤치마크 출처: ForeFlight Mobile v10.0 Performance Guide **p.24 하단 ~ p.25 상단 (Errors and Warnings)**

## 1. 문제 — 자료가 없어서 조용한 것과, 안전해서 조용한 것이 구별되지 않는다

지금 Go/No-go 배너의 색은 **날씨 심각도 한 축**뿐이다(`flight-category.js` → `levelForCategory`).

**코드에서 확인한 침묵 경로 3건:**

| # | 위치 | 지금 일어나는 일 |
|---|---|---|
| 1 | `briefing-composer.js:66` `buildBanner()` | `category === 'UNKNOWN'`인 공항을 **`filter`로 제거한다.** METAR가 없는 공항은 배너에서 **아예 사라진다.** 남은 공항이 다 VFR이면 배너는 **초록**이 된다 — "도착지 상태를 모른다"가 "안전하다"로 표시된다 |
| 2 | `taf-window.js` `buildDestination()` → `briefing-composer.js:121` | ETA를 덮는 TAF 구간이 없으면 `category`가 없고 `level`은 `'gray'`가 된다. **회색은 화면에서 "해당 없음"처럼 읽힌다.** "도착시각 예보가 없다"는 사실이 전달되지 않는다 |
| 3 | `airport-summary.js:90` | `observationTime`을 **payload에 이미 담아 보내는데, 아무도 경과시간을 판정하지 않는다.** 3시간 전 METAR와 5분 전 METAR가 화면에서 똑같이 보인다 |

**안전 시스템에서 가장 위험한 실패는 틀린 값이 아니라, 모른다는 사실을 숨긴 채 초록으로 보이는 것이다.**

## 2. 핵심 근거 — 자리가 이미 비어 있다

`composeBriefing`의 반환 객체 마지막 줄(`briefing-composer.js:154`):

```js
warnings: [],          // ← 항상 빈 배열. 아무도 채우지 않는다
```

**이 스펙은 새 필드를 만들지 않는다. 이미 있는 빈 배열을 채운다.** 프론트 계약 변경 없음.

## 3. 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 축 | **심각도(색)와 신뢰도(고지)를 분리** | 색에 두 의미를 실으면 디자인 헌법 §3 위반("한 색에 두 의미"). 조종사는 주황을 **기상 위험(IFR)**으로 읽도록 훈련돼 있다 |
| 신뢰도 표현 | **배너 아래 칩 줄** (색 아님, 텍스트+아이콘) | 위 이유. 칩은 앰버 톤을 쓰되 **배너 색 판정에는 영향을 주지 않는다** |
| 판정 색 변경 | **하지 않는다** | 신뢰도가 낮다고 초록을 앰버로 바꾸면 "날씨가 나쁘다"는 거짓말이 된다. 두 축은 끝까지 섞지 않는다 |
| 배너에서 UNKNOWN 공항 | **더 이상 감추지 않는다** | §4-A. `filter` 제거가 아니라 **별도 목록으로 노출** |
| 임계값 | **METAR 60분 · SPECI 30분** | ICAO 정시 관측 주기 1시간. 다음 관측이 나올 때가 지났으면 "낡음". SPECI는 급변 상황에서 나오므로 더 짧게 |
| 백엔드/프론트 분담 | **판정은 백엔드, 표시는 프론트** | 신뢰도 판정은 규칙이지 표현이 아니다. 테스트 가능한 순수 함수로 둔다 |
| 심각도 등급 | **`error` / `warning` 2단계** | ForeFlight p.25 정의를 그대로 차용 |

### 3-A. 두 등급의 정의 (ForeFlight p.25)

| 등급 | 뜻 | 우리 예 |
|---|---|---|
| **error** | 판정 자체가 **불가능**하다 | 출발/도착 공항 METAR 없음 · 경로 지오메트리 없음 |
| **warning** | 판정은 했지만 **정확도를 보증할 수 없다** | METAR 낡음 · TAF가 ETA 미포함 · ETD가 예보 지평선 밖 · 교체공항 자료 결측 |

## 4. 모듈 설계

### 4-A. 신규 순수 모듈 — `backend/src/briefing/confidence.js`

```
buildConfidenceWarnings({ airports, destination, request, now, kimRun }) -> warnings[]

warnings[] = [{
  severity: 'error' | 'warning',
  code:     'METAR_MISSING' | 'METAR_STALE' | 'TAF_NOT_COVERING_ETA'
          | 'TAF_MISSING' | 'ETD_BEYOND_FORECAST' | 'ALTERNATE_NO_WARNING_DATA',
  scope:    { role, icao } | null,
  label:    string,        // 화면에 그대로 나가는 한 줄
  detail:   string | null, // 펼쳤을 때 (예: "관측 14:00Z · 현재 14:52Z")
}]
```

**규칙 (전부 순수 함수, 시각은 `now` 주입 — `Date.now()` 직접 호출 금지):**

| code | 조건 | severity |
|---|---|---|
| `METAR_MISSING` | `airports[role].category === 'UNKNOWN'` (출발·도착) | **error** |
| `METAR_MISSING` | 〃 (교체공항) | warning |
| `METAR_STALE` | `now − observationTime > 60분` (SPECI면 30분) | warning |
| `TAF_MISSING` | 도착지 TAF payload 없음 | warning |
| `TAF_NOT_COVERING_ETA` | `destination.category == null` 인데 TAF는 존재 | warning |
| `ETD_BEYOND_FORECAST` | `etd > kimRun.validTime + 마지막 예보시간` | warning |
| `ALTERNATE_NO_WARNING_DATA` | 교체공항이 `AIRPORT_WARNINGS` 대상 목록에 없음(해외 등) | warning |

⚠️ **`TAF_NOT_COVERING_ETA`와 `TAF_MISSING`을 반드시 구분한다.** 전자는 "예보는 있는데 그 시각까지 안 간다",
후자는 "예보 자체가 없다". 사용자 대응이 다르다(전자는 ETD를 당기면 해결, 후자는 안 됨).

### 4-B. `briefing-composer.js` 변경 — 2줄

```js
warnings: buildConfidenceWarnings({ airports, destination, request, now, kimRun }),
```

`buildBanner`의 `filter((a) => a.category !== 'UNKNOWN')`는 **그대로 둔다.**
(배너의 "최악 카테고리"는 실측이 있는 공항 중에서 고르는 게 맞다.)
대신 걸러진 공항이 `warnings`에 `METAR_MISSING`으로 **반드시 나타나므로 더는 조용하지 않다.**

> 이것이 이 설계의 요점이다: **판정 로직은 한 줄도 안 건드린다.** 침묵을 소리로 바꾸는 층을 옆에 붙일 뿐이다.

### 4-C. 프론트 — `BriefingBanner.jsx` 아래 칩 줄

- 목업: 이 대화의 `foreflight_benchmark_mockups_1_to_4` 위젯 2번.
- `error` 칩: `--level-red` 톤 + `ti-alert-circle` 상당 아이콘.
- `warning` 칩: `--level-amber` 톤. 자료 결측(중립)은 `--level-gray` 톤.
- 칩 0개 → **줄 자체를 렌더하지 않는다.** (정상 상태에 노이즈를 더하지 않는다)
- 칩 아래 한 줄 캡션: `색 = 날씨가 얼마나 나쁜가 · 이 줄 = 그 판정을 얼마나 믿을 수 있는가`
- ⚠️ 배너의 색·문구는 **변경 금지.** 이 스펙은 아래에 줄 하나를 더할 뿐이다.

## 5. 검증 (`backend/test/confidence.test.js`)

| 입력 | 기대 |
|---|---|
| 도착 공항 METAR 없음, 나머지 VFR | `warnings`에 `severity:'error'`, `code:'METAR_MISSING'` 1건. **`banner.worst.category`는 여전히 `VFR`** (판정 불변 확인) |
| METAR `observation_time` = now − 90분 | `METAR_STALE` 1건 |
| METAR = now − 30분, `report_type:'METAR'` | 경고 **없음** |
| SPECI = now − 40분 | `METAR_STALE` 1건 (SPECI 임계 30분) |
| TAF 존재하나 ETA가 유효창 밖 | `TAF_NOT_COVERING_ETA` 1건, `TAF_MISSING` **없음** |
| TAF payload 자체 없음 | `TAF_MISSING` 1건, `TAF_NOT_COVERING_ETA` **없음** |
| 모든 자료 정상·최신 | `warnings` **빈 배열** |
| 교체공항 METAR 없음 | `severity:'warning'` (출발·도착이면 error인 것과 대비) |

## 6. 범위 밖

- 신뢰도에 따른 **판정 색 변경** (§3 — 절대 하지 않는다)
- 자료 신선도 점수화(0~100 같은 합성 지표)
- NOTAM 신선도 · KIM run 지연 경고 (별도 결정)
- 자동 재조회 / 갱신 알림
