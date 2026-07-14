# 구간(레그)별 표 — 설계 스펙

- 상태: **설계 초안.** 미구현
- 작성일: 2026-07-15
- 목적: **경로를 "고도 층"이 아니라 "지나가는 순서"로 읽게 한다.** 웨이포인트 사이 구간마다
  거리·시간·상층바람·기온·그 구간에 걸린 위험을 한 줄씩.
- 벤치마크 출처: ForeFlight Mobile v10.0 Performance Guide **p.26~29 (Navlog)** — 특히 p.27 레그별 성능표

## 1. 문제 — 재료는 다 있는데 축이 반대다

지금 ④ 노선 섹션의 원자료 표(`rawWindsModel.js` `buildRawWindsTable`)는
**행 = 고도 층(FL), 열 = 웨이포인트**다. 계획고도에 가장 가까운 셀만 하이라이트되어
**표를 대각선으로 관통하며 읽어야 한다.**

이건 "어느 고도가 어떤가"를 묻는 표다. 비행 중에 필요한 건 반대 질문이다 —
**"다음 구간에 뭐가 있나."**

위험 구간 정보도 이미 거리 기준으로 계산돼 있다:
- `enroute-model.js` → `elements[].intervals = [{ startNm, endNm, level }]` (착빙·난류)
- `hazard-section.js` → 각 hazard의 `routeIntervalNm` (SIGMET/AIRMET)
- `notam-briefing.js` → `routeConflicts` (경로 저촉)

**셋 다 `distanceNm` 축 위에 있다. 웨이포인트도 `markers[].distanceNm`을 갖는다.
같은 축에 있는 것들을 아직 한 표로 합치지 않았을 뿐이다.**

## 2. 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 새 데이터 | **없음** | §1. 기존 브리핑 payload + crossSection + verticalProfile로 전부 유도된다 |
| 위치 | **프론트 순수 모듈** (`route-briefing/lib/legModel.js`) | 입력이 전부 프론트에 이미 도착해 있다. 백엔드 왕복 불필요 |
| 구간 정의 | **연속한 두 마커 사이** (`verticalProfile.markers`) | 마커 = 웨이포인트. 이미 `distanceNm` 정렬돼 있다 |
| 구간 시간 | **`거리 / cruiseSpeedKt` (바람 미보정)** | ⚠️ §2-A. 이유가 중요하다 |
| 바람·기온 값 | **구간 중점의 계획고도 값** | 구간 평균이 아니라 중점. 층 보간(`altitudeAtDistance`)을 이미 갖고 있고, 중점이면 한 번만 뽑으면 된다 |
| 기존 원자료 표 | **유지. 대체하지 않는다** | 접기(fold) 안에 있는 전문가용 표다. 이 표는 그 **위**에 놓는 요약이다 |
| 인쇄/내보내기 | **범위 밖** | ForeFlight Navlog의 본질이지만 우리 v1은 화면 표 하나 |

### 2-A. ⚠️ 구간 시간에 바람을 넣지 않는 이유 (중요)

대지속도(ground speed) = 순항속도(TAS) + 배풍성분 으로 구간 시간을 내면 **더 정확하다.**
그런데 그러면 **구간 시간의 합계 ≠ 화면 상단의 ETA**가 된다.
현재 ETA는 `etaCalc.js`가 `ETD + 총거리 / cruiseSpeedKt`로 계산하고,
그 ETA가 **도착지 TAF 구간 선택(`selectTafAtEta`)에까지 쓰인다.**

즉 바람 보정을 넣는 순간:
- 한 화면에 **서로 다른 두 개의 총 소요시간**이 뜨거나,
- `etaCalc.js`를 고쳐야 하는데 그러면 **TAF 판정·교체공항 1-2-3 판정이 함께 움직인다.**

**한 화면에 모순된 두 숫자가 뜨는 것이 부정확한 한 숫자보다 나쁘다.**
v1은 기존 ETA와 **같은 기준**을 쓴다. 바람 성분은 **별도 컬럼으로 보여주기만** 한다
(사용자가 "맞바람 30kt면 더 걸리겠구나"를 스스로 읽는다).

**바람 보정 ETA는 별도 결정 사항으로 올린다.** `etaCalc.js`를 단일 출처로 만들고
구간 합계 = ETA가 되도록 함께 고치는 것이 조건이다. 조용히 추가하지 않는다.

## 3. 모듈 설계

### 3-A. `frontend/src/features/route-briefing/lib/legModel.js` (신규, 순수)

```
buildLegTable({ verticalProfile, crossSection, enroute, hazards, routeConflicts, cruiseSpeedKt }) -> {
  legs: [{
    from, to,                    // 마커 label (예: 'RKSI', 'GUKDO')
    startNm, endNm, distanceNm,
    minutes,                     // distanceNm / cruiseSpeedKt × 60 (§2-A)
    altitudeFt,                  // 중점의 계획고도 (altitudeAtDistance 재사용)
    wind: { dir, speedKt } | null,   // 중점·계획고도. uvToWind 재사용
    tempC: number | null,
    risks: [{ kind, label, level }]  // §3-B
  }],
  totalNm, totalMinutes,
}
```

- `altitudeAtDistance`, `uvToWind`, `pickColumns` — **전부 `rawWindsModel.js`에 이미 있다. import해서 쓴다.**
  ⚠️ **복사하지 말 것.** 두 벌이 되면 바람 부호 규칙이 갈라진다.
- ⚠️ `pickColumns`는 마커가 많으면 **7개로 균등 샘플링**한다. 레그 표는 **샘플링하면 안 된다**
  (구간을 건너뛰면 그 구간의 위험이 사라진다). `verticalProfile.markers`를 **전부** 쓴다.
  마커가 20개를 넘으면 스크롤로 처리하고, **줄이지 않는다.**

### 3-B. 구간 위험 매칭 — 구간 겹침 판정

```
겹침(leg, interval) = interval.startNm < leg.endNm && interval.endNm > leg.startNm
```

세 출처를 같은 규칙으로 접는다:

| 출처 | 입력 | risks[].kind |
|---|---|---|
| `enroute.elements[].intervals` | 착빙·난류 (`level: '중'|'심'`) | `'icing'` / `'turbulence'` |
| `sections.adverse.hazards` (`encounter==='on'`, `routeIntervalNm` 보유) | SIGMET/AIRMET | `'sigmet'` / `'airmet'` |
| `routeConflicts` | 경로 저촉 NOTAM·공역 | `'notam'` |

- 한 구간에 여러 위험 → **전부 표시.** 최악만 남기지 않는다(구간이 짧아 칩 2~3개는 읽힌다).
- 위험 없음 → `–` (빈칸 아님. 빈칸은 "자료 없음"으로 오독된다)
- ⚠️ `routeIntervalNm`이 `null`인 hazard(공항경보 등 `airportScope` 보유)는 **구간 표에서 제외**한다.
  경로 위의 사건이 아니다. 이미 ① 위험 다이제스트가 담당한다.

### 3-C. 프론트 표시 — `BriefingView` ④ 노선 섹션 상단

- 목업: 이 대화의 `foreflight_benchmark_mockups_1_to_4` 위젯 3번.
- 배치: ④ 섹션 안에서 **hazard ribbon 아래, 단면도 위.** 단면도(그림)의 텍스트 대응물이다.
- 기존 원자료 표(`buildRawWindsTable`)는 지금처럼 **접기 안에 유지.**
- 위험 칩 색: `--level-red`(심) / `--level-amber`(중) — 기존 레벨색 재사용. 새 토큰 없음.
- 모바일(≤719px): 표를 축소하지 말고 **구간당 카드 1장**으로 재구성 (디자인 헌법 §6-A P3 —
  "데스크톱 표를 그대로 축소해 12px 미만으로 넣으면 위반").

## 4. 검증 (`frontend/src/features/route-briefing/lib/legModel.test.js`, node --test)

| 입력 | 기대 |
|---|---|
| 마커 4개 (0/30/80/120 NM) | `legs.length === 3`, `distanceNm` = 30/50/40 |
| `cruiseSpeedKt: 120`, 구간 60NM | `minutes === 30` |
| 착빙 구간 `{startNm:40, endNm:60}`, 레그 30~80 | 그 레그 `risks`에 icing 1건 |
| 착빙 구간 `{startNm:80, endNm:90}`, 레그 30~80 | **겹침 없음** (경계 배타 — `endNm > startNm` 엄격부등호 확인) |
| hazard `routeIntervalNm: null` (공항경보) | 어느 레그에도 안 들어감 |
| 마커 12개 | `legs.length === 11` (**`pickColumns`로 7개 샘플링되지 않음을 고정**) |
| `totalNm` | 마지막 마커 `distanceNm`와 일치 |
| `totalMinutes` | `etaCalc.js`가 같은 입력으로 내는 소요시간과 **일치** (§2-A 회귀 방지) |

마지막 항목이 §2-A의 결정을 코드로 고정한다. **누군가 나중에 바람 보정을 몰래 넣으면 이 테스트가 깨진다.**

## 5. 범위 밖

- 바람 보정 대지속도·ETA (§2-A — 별도 결정)
- 인쇄·PDF·이메일 내보내기
- 연료 잔량 컬럼 (기체 성능 데이터 없음 — `2026-07-15-altitude-advisor.md` §3 참조)
- RAIM 예측 (FAA API 기반 — 우리 소스 없음)
- 주파수·활주로 표 (ForeFlight p.28 — 공항 패널이 이미 담당)
- Step climb
