# 공항패널 METAR — TAC 원문 중심 + 임계값 색칠 디자인

> 작성: 2026-07-17. 상태: **승인됨(브레인스토밍 완료), 구현 전.**
> 근거: [디자인 헌법](../../policies/design/design-language.md) §2(색=의미)·§4(색 3버킷)·§5(토큰) — 이 문서와 충돌하면 헌법이 우선.

## 0. 배경 · 문제

`MetarTab.jsx`는 지금 해독 카드 그리드(시정/운고/RVR/바람/현재날씨/온도/습도/QNH)를 먼저 보여주고, 원문(TAC)은 맨 아래 접힌 `<details>`에 흑백 텍스트로 둔다.

조종사는 훈련받은 TAC 표기를 직접 읽는 게 카드보다 짧은 시간에 더 빠르다. 다만 TAC를 그냥 흑백 텍스트로 키우기만 하면 "표시하는 의미가 없다"(사용자 원 요청) — 문제 있는 값이 시각적으로 튀어야 스캔 속도가 실제로 빨라진다.

## 1. 결정 사항

1. **TAC가 메인, 해독 카드는 접기.** 카드 그리드는 그대로 두되 `<details>`로 감싸 기본 접힘 — AMOS 모바일 상세, TAF 원문 접기와 같은 기존 패턴.
2. **원문 글자는 한 글자도 바꾸지 않는다.** `metar.header.raw_text`를 그대로 렌더링하고, 그 위에 이미 파싱된 값이 원문 안에서 발견되는 구간만 색 `<span>`으로 감싼다. 값 자체를 재조립하지 않는다(원문·실제 관측 100% 일치 보장, 색칠 실패해도 원문은 항상 온전).
3. **VFR/IFR/LIFR 배지**를 TAC 문자열 맨 앞에 인라인 칩으로 붙인다.
4. **색은 기존에 이미 계산된 값만 재사용한다** — 새 임계값 로직을 만들지 않는다:
   - `visCat`/`ceilCat`/`flightCat` (`classifyVisibilityCategory`/`classifyCeilingCategory`/`getFlightCategory`, `shared/weather/helpers.js`)는 이미 `getAirportMinimaRule`을 통해 **공항별 커스텀 미니마**(예: RKSI/RKSS는 시정 175m)까지 반영한다. 이 함수들이 돌려주는 `.color`/`.valueColor`를 그대로 쓴다 — 헌법 §5 `--level-green/amber/red`로 수렴된 값.
   - 강수(`precipitationWeather`)·특이기상(`specialWeather`)·강풍(`highWind`)은 지금 TAF `날씨`/`바람` 줄이 쓰는 것과 **동일한 색·클래스**를 재사용한다(`ap-taf-seg--precip`, `--special`, highWind 로즈 하이라이트) — 화면 간 일관성, 새 색 발명 안 함.
5. **데스크톱·모바일 동일 컴포넌트.** 헌법 §2-6 "하나의 시스템, 반응형 표현" — 색·의미·배치 로직은 하나, 폰트 크기·패널 폭만 반응형.
6. 목업(승인됨): [Artifact — METAR TAC 중심 재구성 목업](https://claude.ai/code/artifact/d1539ee0-f2d9-4652-82d6-5ad847e4279e). VFR/IFR/LIFR 배지 색은 이후 §5 헌법 색으로 정정해서 구현(목업은 레거시 `FLIGHT_CATEGORY_META` 색을 썼음 — 아래 §5 참고).

## 2. 아키텍처

```
metar.header.raw_text (원문, 불변)
        │
        ▼
buildMetarViewModel(...)          ← 기존 함수, 변경 없음
        │  (visCat, ceilCat, flightCat, highWind, precipitationWeather, specialWeather, obs)
        ▼
buildMetarTacSegments(rawText, viewModel)   ← 신규, metarViewModel.js
        │  [{ text, className? }, ...]  순서 있는 배열, 이어붙이면 rawText와 100% 동일
        ▼
MetarTab.jsx  — 배열을 <span> 시퀀스로 렌더 (+ 맨 앞 flightCat 칩)
```

`buildMetarTacSegments`는 **탐색만** 한다 — 새 파싱이나 재조립이 아니다:

1. `rawText`를 처음엔 통짜 세그먼트 하나로 둔다.
2. 강조 대상 순서대로(바람 → 시정 → 날씨현상 → 운고) "이 값이 원문에서 어떤 문자열로 나타나야 하는가"를 계산한다.
   - 바람: `highWind`가 true일 때만 — `obs.wind`로 `dddssKT`/`dddssGggKT` 형태 토큰 조립 후 탐색.
   - 시정: `visCat.category !== 'VFR'`일 때만 — `obs.visibility.value` 기반 숫자 그룹(4자리, 또는 국제 표기 `NNSM`) 탐색.
   - 날씨현상: `precipitationWeather || specialWeather`일 때만 — `obs.display.weather` 원 코드 토큰(들, 공백으로 구분된 `-RA`, `BR` 등 복수 그룹 가능) 각각 탐색.
   - 운고: `ceilCat.category !== 'VFR'`일 때만 — `obs.clouds`에서 가장 낮은 BKN/OVC의 `AMT+base/100` 그룹(`OVC012` 등) 탐색.
3. 찾은 구간마다, 그 문자열을 포함하는 (아직 안 쪼개진) 세그먼트를 `[앞, 매치(className 부여), 뒤]`로 쪼갠다. 검사 순서(바람→시정→날씨→운고)와 무관하게 최종 배열은 항상 **원문 내 실제 등장 위치 순서**를 유지한다(문자열을 그 자리에서 쪼개기 때문). 못 찾으면 해당 항목은 건너뛰고 세그먼트는 그대로 둔다(§4 에러 처리).
4. 최종 세그먼트 배열을 반환 — 모든 세그먼트의 `text`를 이어붙이면 `rawText`와 정확히 같다.

## 3. 컴포넌트 변경

- `MetarTab.jsx`: 지금 `ap-mv2-grid` 카드 블록을 `<details className="ap-metar-detail">`로 감싸 기본 접힘(요약 "해독 카드 보기"). TAC 라인을 그 위, `flightCat` 칩과 함께 새로 렌더링. 접기 UX는 AMOS `ap-amos-mobile-detail`/TAF `ap-raw-fold`와 같은 네이티브 `<details>` 패턴 재사용(신규 JS 상태 불필요).
- 맨 아래 "원문(TAC)" 접기 섹션은 삭제(중복 — 이제 원문이 항상 위에 보임).
- 새 CSS 클래스: `.ap-metar-tac`(모노스페이스, 큰 폰트), `.ap-metar-tac-chip--VFR/IFR/LIFR`(헌법 `--level-*` 토큰), 시정/운고/날씨/바람 하이라이트는 기존 TAF `.ap-taf-seg--precip`/`--special` 색과 동일 값으로 새 클래스 추가(클래스 자체는 METAR 전용으로 새로 만들되 색 값은 공유).

## 4. 에러 처리

- 탐색 실패(포맷 예외, CAVOK, 통계마일 표기 등) → 그 항목만 하이라이트 없이 평문. **원문 전체는 항상 빠짐없이 렌더**(탐색은 "찾으면 색 추가"일 뿐 "못 찾으면 자르기"가 아님).
- `metar.header.raw_text`가 없으면 기존 가드(`if (!metar) return <div className="ap-empty">...`)와 동일하게 처리 — TAC 없이 카드만(현재 폴백 유지).
- `buildMetarTacSegments`는 순수 함수, 예외를 던지지 않는다(탐색 실패는 값 없음이지 에러가 아님).

## 5. 색 값 (헌법 §5 기준)

| 용도 | 색 | 출처 |
|---|---|---|
| VFR 배지/시정·운고 정상 | `--level-green` `#166534` | 헌법 §5, `visCat`/`ceilCat`/`flightCat`이 반환 |
| IFR 배지/시정·운고 IFR급 | `--level-amber` `#92400e` | 상동 |
| LIFR 배지/시정·운고 LIFR급(공항별 미니마 포함) | `--level-red` `#c0291f` | 상동 |
| 강수 날씨현상 | 기존 TAF `.ap-taf-seg--precip` 값 재사용 | `AirportPanel.css` |
| 특이기상(뇌우 등) | 기존 TAF `.ap-taf-seg--special` 값 재사용(점선 아웃라인) | 상동 |
| 강풍(`highWind`) | 기존 AMOS/TAF 강풍 하이라이트 값 재사용 | 상동 |

⚠️ 참고(범위 밖): `shared/weather/helpers.js`의 `FLIGHT_CATEGORY_META`가 아직 레거시 색(#15803d/#f59e0b/#dc2626)을 갖고 있어 헌법 §5 값과 미세하게 다르다(헌법도 "코드 `--cat-*` 잔여 정리 필요"라고 이미 인지). 이번 작업은 **새로 렌더링하는 배지/하이라이트만** 헌법 값으로 맞추고, `FLIGHT_CATEGORY_META` 자체를 고치는 건 이 스펙의 범위 밖(다른 화면들도 그 값을 쓰고 있어 별도 정리 필요).

## 6. 테스트

- `metarViewModel.test.js`에 `buildMetarTacSegments` 케이스 추가: IFR 시정 하이라이트, LIFR 강풍(돌풍) 하이라이트, 정상 VFR(하이라이트 0개), 탐색 실패 케이스(하이라이트 없이 원문 그대로 보존되는지).
- Playwright: RKSI(IFR류) / VFR 사례 각각에서 배지 색·하이라이트 색·카드 접힘 확인, 데스크톱·모바일 폭 둘 다.

## 7. 범위 밖

- `FLIGHT_CATEGORY_META` 레거시 색 정리(§5 참고).
- TAF 타임라인에도 같은 TAC-중심 패턴 적용 — 사용자가 원 대화에서 "먼저 METAR만 해보고 결과 보고 판단"이라고 하지 않았지만, 이번 스펙은 METAR 한정. 확장은 별도 스펙.
