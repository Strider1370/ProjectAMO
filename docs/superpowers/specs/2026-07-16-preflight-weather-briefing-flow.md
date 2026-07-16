# 사전비행 경로 기상 브리핑 워크플로우 명세

- 상태: **상위 기능 명세 초안. 미구현.**
- 작성일: 2026-07-16
- 대상: 국내 IFR 사전비행계획의 en-route 기상 의사결정 지원
- 연계 스펙:
  - `docs/superpowers/specs/2026-07-14-weather-aware-route-alternatives.md`
  - `docs/superpowers/specs/2026-07-15-altitude-advisor.md`
  - `docs/superpowers/specs/2026-07-15-navlog-leg-table.md`
  - `docs/superpowers/specs/2026-07-16-aip-airway-data-pipeline.md`

## 1. 목표와 완료 모습

세 기능은 독립된 화면 세 개가 아니라, 조종사가 수평 경로를 정하고 계획 순항고도를 확인한 뒤 그 결과를 구간별 기상 브리핑으로 읽는 하나의 흐름이다. AIP 원표에서 검수된 항로 제약 JSON은 이 흐름의 공통 근거이며, 활성화된 AIRAC cycle만 고도 비교에 사용한다.

```text
[AIP 원표 수집·렌더링 확인·전사·독립 검수]
AIRAC 유효시각 이후 검증된 current JSON만 활성화
        ↓
[경로 대안: 고도 미확정]
수평 기상 노출과 변경된 노출을 비교
        ↓ 사용자가 en-route 경로 확정
[고도 대안: 경로 확정]
입력/가져온 계획 순항고도 주변의 AIP 유효 고도별 기상 비교
        ↓ 사용자가 계획 순항고도 확정
[경로 구간 기상 브리핑]
확정된 경로와 고도에서 leg별 기상·위험기상·NOTAM 확인
```

완료 시 ProjectAMO는 위 흐름에 필요한 기상 사실, 노출 범위, 자료 상태와 제약을 일관되게 제공한다. 다음은 의도적으로 제공하지 않는다.

- TAS, Ground Speed, 연료, 성능, climb/descent profile, step climb 계산
- 구간 통과시각·정확한 ETE/ETA 계산
- 안전·최적·권장·운항 가능 여부 판정 또는 자동 회피 경로/고도 추천
- SID/STAR/IAP의 성능 기반 절차 평가

## 2. 공통 원칙과 경계

### 2.1 동일한 사실을 단계마다 다르게 판정하지 않는다

한 위험기상 레코드는 기하, 수직 범위, 유효시간, 관측/예보 성격, 자료 완전성을 보존한 채 각 단계에서 필요한 조건만 추가한다.

| 단계 | 확정된 것 | 적용하는 판정 | 보여주는 핵심 |
| --- | --- | --- | --- |
| 경로 대안 | 수평 경로 후보 | 수평 교차/거리와 전체 비행시간 창의 관계 | 경로 변경으로 줄거나 새로 생긴 수평 노출 |
| 고도 대안 | en-route 경로, 계획 고도 앵커 | 수평 + 후보 고도 + 시간 창 | 고도별 바람·기온·난류·착빙·SIGMET/AIRMET 차이 |
| 구간 브리핑 | 경로와 선택 고도 | leg 수평 구간 + 선택 고도 + 시간 창 | 구간별 기상 요약과 위험기상/NOTAM 노출 |

`시간 미제공`, `수직 범위 없음`, `자료 부분 수신`은 모두 위험 없음과 별개 상태로 보존한다. 경로 대안 단계에서 `수평 교차`는 실제 조우나 운항 판단을 뜻하지 않는다.

### 2.2 단일 인계 계약

앞 단계는 다음 단계에 재해석이 필요한 텍스트가 아니라 식별 가능한 경로 객체를 넘긴다.

```js
{
  routeGeometry,
  enRouteSegments: [{ fromFix, toFix, routeId, startNm, endNm }],
  procedures: { sid, star, iap },
  routeData: { graphVersion, aipCycle, validationStatus },
  planningWindow: { etd, eta, status }
}
```

- 경로 대안의 선택 결과가 고도 비교의 입력이다.
- 고도 비교가 선택한 `selectedCruiseAltitudeFt`와 고도 제약 상태가 구간 브리핑의 입력이다.
- 세 단계 모두 동일한 `routeGeometry`, 거리 축, 위험기상 식별자, 자료 실행 시각을 참조한다.
- 화면용 문자열은 경계 밖에서 만들고, 백엔드/프런트엔드 공용 모델에는 상태 코드와 원시 단위를 둔다.

## 3. 구현 순서와 의존성

```text
공통 기반 A: 용어·상태·경로 인계 계약
        ├─ 공통 기반 B: 위험기상 공간/수직/시간 노출 모델
        ├─ 공통 기반 C: AIP 항공로 제약 데이터 파이프라인
        └─ 공통 기반 D: 검증 fixture·관측성
                 ↓
1단계: 경로 대안의 수평 기상 노출 비교
                 ↓
2단계: AIP 제약 기반 고도별 기상 비교
                 ↓
3단계: 확정 경로·고도의 구간 기상 브리핑
                 ↓
4단계: 전체 흐름 통합·브라우저 검증·문서화
```

경로 대안은 AIP 완전 적재 전에도 `graph 연결 확인` 상태로 제한된 MVP를 만들 수 있다. 반대로 고도 비교의 자동 후보 생성은 AIP ENR 제약 데이터가 준비되기 전에는 시작하지 않는다.

## 4. 선행 공통 작업

### 작업 0. 범위·용어·상태 코드 고정

**목적:** 세 스펙의 금지 범위와 자료 불확실성 표현이 구현마다 달라지는 것을 막는다.

- [ ] `horizontalExposure`, `altitudeExposure`, `timeStatus`, `confidence`, `validationStatus`의 공용 타입/상태표를 작성한다.
- [ ] `intersects`, `nearby`, `unknown`, `unavailable`, `partial`, `not_provided`의 의미와 화면 문구 책임을 정한다.
- [ ] 위험기상 사실 표시와 조종사 의사결정 문구를 분리하는 copy 규칙을 테스트 가능한 상수/헬퍼로 둔다.
- [ ] TAS·성능·연료·ETA 계산, 안전/최적 추천을 API와 화면 모델에서 배제하는 계약 테스트를 만든다.

**완료 관문:** 세 단계의 테스트 fixture가 같은 상태 코드를 사용하며, `unknown` 또는 `not_provided`가 `none`으로 변환되지 않는다.

### 작업 1. 경로 정규화와 거리 축 공통화

**목적:** 모든 비교가 동일한 en-route 경로, 방향, 거리 기준을 사용하게 한다.

- [ ] route graph, 사용자 편집 경로, SID/STAR/IAP 보존 범위를 `routeGeometry`와 정렬된 `enRouteSegments`로 정규화한다.
- [ ] route-axis를 단일 거리 축 원천으로 정하고 marker, airway segment, hazard interval이 같은 NM 좌표를 쓰도록 어댑터를 만든다.
- [ ] 경로 후보 중복 제거와 graph 연결 상태를 결과 모델에 보존한다. 그래프 연결은 운항 유효성 판정이 아니다.
- [ ] 기본 경로와 대안 경로를 재현 가능한 fixture로 준비한다.

**완료 관문:** 한 경로를 세 API에 전달했을 때 segment ID와 거리 축이 일치하며, 절차 구간은 en-route 비교 범위와 혼동되지 않는다.

### 작업 2. 위험기상 노출 엔진 분리

**목적:** 현재의 3차원 매처를 재사용하되, 고도 미확정 경로 대안에 수직 필터가 섞이지 않게 한다.

- [ ] `geo-time-match`를 기반으로 수평 교차, 최근접 거리, route interval을 계산하는 순수 모듈을 만든다.
- [ ] 위험기상마다 polygon/geometry와 해당 수직 범위·유효시간을 쌍으로 보존한다. 복수 analysis를 첫 고도 범위 하나로 축약하지 않는다.
- [ ] 수평 전용 평가(`horizontalExposure`)와 선택 고도 평가(`altitudeExposure`)를 별도 함수로 둔다.
- [ ] ETD/ETA는 전체 계획 시간 창과 유효시간의 관계만 표시하고, leg 통과시각을 추정하지 않는다.
- [ ] SIGMET/AIRMET, KIM/KTG, 번개, 향후 VAA/TCA/대류운 발생 가능성의 source·관측/예보·자료상태 어댑터를 정의한다.

**완료 관문:** 동일 위험기상에 대해 경로 단계는 수평 노출만, 고도/leg 단계는 선택 고도 조건까지 적용하며, 시간 또는 수직 정보 부재가 위험 없음으로 표시되지 않는다.

### 작업 3. AIP 항공로 제약 데이터 준비

**목적:** 고도 후보 범위와 간격을 임의의 1,000/2,000 ft 규칙이 아니라 항공로 공표 제약으로 정한다.

준비할 원천 자료는 다음이다.

- [ ] AIP ENR 3.1 ATS Routes
- [ ] AIP ENR 3.3 RNAV Routes
- [ ] AIP ENR 1.7 고도계 설정 절차
- [ ] AIP ENR 4.4 항공로명/표식 보조 정보
- [ ] AIP ENR 6 항공로 차트(전사 결과의 연결성 교차검증)
- [ ] 필요한 AIP AD 2 공항별 절차 자료(SID/STAR/IAP의 절차 제약 확장 시)
- [ ] AIRAC cycle, amendment, effective date 및 정정본

구간별 정규화 모델은 최소 다음을 보존한다.

```js
{
  routeId, fromFix, toFix, direction,
  minimumFlightAltitudeFt, lowerLimitFt, upperLimitFt,
  cruisingLevelSeriesFt,
  effectiveFrom, airacCycle, source
}
```

- [ ] 각 AIP/eAIP 원천을 Playwright로 렌더링 캡처·판독한 뒤 전사한다. 원시 HTML/PDF markup만으로 표의 의미를 추정하지 않는다.
- [ ] 파일럿 전사에서 point 행과 제약 행 결합, 병합 셀, FIR 경계, 방향별 FL series, `UNL`/`FL`/`FT AMSL` 해석 규칙을 확정한다.
- [ ] `raw`·`manual-reviewed`·`normalized`·`current`을 분리하고, 각 전사 레코드에 capture/source locator, 전사자, 독립 검수자, 검수 상태를 보존한다.
- [ ] 본 전사는 항로 단위로 병렬화하되, 전사자와 검수자를 분리한다. `reviewed` 상태가 아니면 current 활성화 후보가 될 수 없다.
- [ ] AIRAC 갱신에서는 KOCA publication diff로 변경 구간만 재전사·검수한다. 새 cycle의 실제 유효시각 전에는 current를 바꾸지 않는다.
- [ ] `routeFloorFt = max(검증된 구간 minimumFlightAltitudeFt)`와 `routeCeilingFt = min(검증된 upperLimitFt)` 계산을 테스트한다.
- [ ] lower limit과 minimum flight altitude의 의미를 합산하지 않고 원본 의미와 출처를 유지한다.
- [ ] 진행 방향별 FL series 충돌·누락 시 자동 후보 생성을 중단하고 `conflicting`/`unavailable` 상태를 반환한다.
- [ ] 기존 NOTAM 파이프라인과 접합해 명확한 불가만 후보 제외하고, 그 외에는 경고/미판정으로 둔다.

**완료 관문:** AIP cycle이 결과에 노출되고, 누락·충돌·만료 데이터를 정상 후보로 위장하지 않는다.

### 작업 4. 공통 검증 fixture와 자료 상태 관측성

**목적:** 각 단계가 서로 다른 샘플이나 자료 시각으로 모순되는 것을 예방한다.

- [ ] 정상, 위험기상 수평 교차, 고도 범위 불일치, 시간 미제공, 복수 polygon, AIP 제약 충돌, NOTAM 미판정 fixture를 만든다.
- [ ] 모든 API 응답에 자료 run/유효시간, source 목록, partial/unavailable 사유를 포함한다.
- [ ] route ID, AIP cycle, KIM/KTG run, advisory ID를 로그/테스트에서 추적할 수 있게 한다.
- [ ] 백엔드 단위 테스트와 API 통합 테스트의 최소 실행 묶음을 정한다.

**완료 관문:** 공통 fixture 한 세트로 세 단계의 결과를 재현하고, 화면에서 자료 부족 이유를 확인할 수 있다.

## 5. 단계별 구현 계획

### 1단계. 기상 노출 기반 대안 경로 비교

**선행 조건:** 작업 0, 1, 2 완료. AIP는 있으면 경로 검증에 사용하되, 아직 없으면 graph 연결 상태를 명시한다.

- [ ] 기본 경로와 graph/user-edit 대안을 구성하고, SID/STAR/IAP는 사용자가 확정한 값을 유지한다.
- [ ] TS/CB·대류성 SIGMET, VA/VAA, TC/TCA를 우선 수평 노출 비교 대상으로 구현한다.
- [ ] 난류·착빙은 고도 미확정의 참고 노출로만 보이고, 선택 고도 확인이 필요함을 명시한다.
- [ ] 대류운 발생 가능성은 가능성 자료, 번개는 최근 관측, TAF/공항 경보는 공통 목적지 브리핑으로 분리한다.
- [ ] 카드에 기본 경로 대비 교차 구간/거리의 변화, 새 노출, 유효시간, 수직 범위, 자료 상태를 사실로 표시한다.
- [ ] 선택 결과를 2.2의 단일 인계 계약으로 고도 비교에 전달한다.

**테스트:** 수평 교차 제거, 새 노출 추가, 중심점만 있는 VA/TC 자료, 시간 미제공, graph-only 후보 상태, route handoff를 검증한다.

**출시 관문:** 경로 후보의 순서는 안전 순위가 아니며, UI/API에 safe/optimal/recommended 표현이나 위험 점수 합산이 없다.

### 2단계. 고도별 기상 비교

**선행 조건:** 1단계의 경로 인계 계약, 작업 3의 AIP 데이터 및 작업 2의 수직 노출 엔진 완료.

- [ ] 사용자가 입력하거나 FPL에서 가져온 `plannedCruiseAltitudeFt`를 비교 앵커로 사용한다. 거리나 출발/도착지로 중심 고도를 추정하지 않는다.
- [ ] AIP 방향별 FL series에서 앵커 아래 최대 2개·위 최대 2개, 총 최대 5개 후보를 만든다.
- [ ] 입력 고도가 유효하지 않아도 `input_invalid` 행으로 보존하고 사유를 표시한다.
- [ ] KIM 압력면에 정확한 값이 없으면 인접 압력면을 수직 보간하고, 보간 범위 또는 자료 부재를 명시한다.
- [ ] 바람은 경로 거리 가중 tail/headwind 성분의 평균·최소·최대를, 기온은 거리 가중 요약을 계산한다.
- [ ] 난류·착빙은 최고 강도와 강도별 노출 NM을, SIGMET/AIRMET은 수평·수직·시간 조건을 함께 표시한다.
- [ ] 선택한 고도와 제약 상태를 구간 브리핑에 전달한다.

**테스트:** 구간 하한/상한 결합, 방향별 FL series, 유효하지 않은 입력, KIM 보간, 거리 가중 바람, 시간 미제공, NOTAM 제외/경고/미판정을 검증한다.

**출시 관문:** AIP 제약 데이터가 없거나 충돌하면 자동 후보는 만들지 않으며, 기상 결과를 고도 추천·성능 판단으로 표현하지 않는다.

### 3단계. 경로 구간 기상 브리핑

**선행 조건:** 2단계에서 확정한 경로·고도와 공통 route-axis/노출 엔진 완료.

- [ ] en-route marker 또는 AIP 구간 경계로 모든 leg를 생성한다. 임의의 열 개수 제한으로 leg를 생략하지 않는다.
- [ ] 각 leg에 From/To, 거리, True Course, 선택 고도, 거리 가중 바람·기온, 난류·착빙 노출, SIGMET/AIRMET, NOTAM 상태를 담는다.
- [ ] SID/STAR/IAP는 이 요약 leg에서 제외하고 기존 상세 브리핑 경계에 남긴다.
- [ ] SIGMET/AIRMET과 NOTAM은 해당 leg의 수평 거리 구간과 선택 고도 조건을 모두 만족할 때 연결한다.
- [ ] 모바일은 열 축소 대신 leg 카드 표현을 제공하고, 각 위험기상 항목에서 지도/상세 브리핑의 같은 거리 구간으로 연결한다.

**테스트:** marker 기반 leg 생성, 경계 접촉 처리, 거리 가중 요약, 선택 고도 변경 전파, 시간 미제공, AIP 제약 미확인, 시간·속도·연료 필드 부재를 검증한다.

**출시 관문:** 화면 명칭은 `경로 구간 기상 브리핑`이며, 항공기 성능 NavLog 또는 OFP처럼 보이는 시간·연료·Heading·ETA 필드를 포함하지 않는다.

## 6. 통합 및 운영 준비

### 작업 5. 흐름 상태와 실패 복구

- [ ] 경로 변경 시 고도 선택과 leg 결과의 무효화/재계산 규칙을 정의한다.
- [ ] 고도 변경 시 leg 브리핑만 갱신하고, 선택한 수평 경로를 바꾸지 않는다.
- [ ] data run 또는 AIP cycle 변경 시 어떤 결과가 오래되었는지 표시하고 사용자의 재확인을 요구한다.
- [ ] 일부 데이터가 실패해도 다른 기상 자료와 확정된 사용자 입력은 유지하며, 실패 범위를 표시한다.

### 작업 6. API·UI 통합 검증

- [ ] 하나의 고정 route fixture로 `대안 선택 → 고도 선택 → leg 브리핑` API 인계를 통합 테스트한다.
- [ ] 데스크톱과 모바일의 세 단계 전환, 자료 부족 문구, 지도 선택 연결을 Playwright로 검증한다.
- [ ] 브라우저 검증 시 프로젝트 dev-server 절차와 캡처 정책을 따른다.
- [ ] 위험기상 자료가 없는 경우와 자료가 불완전한 경우가 서로 다른 문구·상태로 표시되는지 확인한다.

### 작업 7. 문서·인수·배포 준비

- [ ] 실제 구현된 모듈과 데이터 책임을 `Architecture.md` File Roles에 반영한다.
- [ ] AIP/VAA/TCA/대류운 자료의 갱신 주기, 출처, 실패 경보, 데이터 보존 정책을 운영 문서로 만든다.
- [ ] Codex Scheduled task는 AIRAC 사전 점검·유효일 점검·사후 점검을 실행한다. 작업은 KOCA 발행본 탐지와 diff 보고부터 시작하며, 변경 구간의 전사·독립 검수·유효시각 확인을 모두 통과할 때만 current 활성화를 요청한다.
- [ ] Scheduled task가 실행되는 환경의 프로젝트 접근성, 네트워크 권한, 실행 실패 알림과 dry-run 절차를 운영 문서에 명시한다.
- [ ] 세 원본 스펙의 완료 기준을 하나의 사용자 시나리오로 추적하는 인수 체크리스트를 만든다.
- [ ] `docs/superpowers/status/preflight-weather-briefing-flow.status.md`를 작업 완료마다 Resume Point와 검증 결과로 갱신한다.

## 7. 단계별 의사결정 관문

| 관문 | 통과 조건 | 통과하지 못하면 |
| --- | --- | --- |
| 공통 모델 | 고도 미확정/확정 노출과 자료 부족 상태가 분리됨 | 단계 기능 구현을 시작하지 않음 |
| AIP 제약 | ENR 구간·방향·FL series·cycle·원표 검수 상태가 추적 가능함 | 고도 자동 후보 생성 보류 |
| 경로 대안 | 수평 노출 변화가 사실로 비교되고 추천이 없음 | 고도 단계로의 인계 보류 |
| 고도 비교 | AIP 제약과 KIM/위험기상 결과가 후보별로 설명됨 | leg 브리핑에 고도 확정값을 전달하지 않음 |
| leg 브리핑 | 선택 경로·고도와 모든 leg 결과가 일치함 | 전체 흐름 출시 보류 |
| 통합 QA | 자료 부족·변경·모바일을 포함한 Playwright 검증 통과 | 배포 보류 |

## 8. 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| AIP HTML/PDF 구조 또는 AIRAC 갱신 변화 | 원문 출처·cycle·effective date·렌더링 캡처를 저장하고 전사/파서 회귀 fixture를 유지한다. |
| 위험기상 복수 polygon과 수직/시간 정보가 분리됨 | analysis 단위 객체를 유지하고 geometry만 병합하지 않는다. |
| KIM 압력면과 AIP 후보 FL 불일치 | 보간 여부와 양쪽 압력면을 표시하며, 범위 밖은 unavailable로 둔다. |
| 시간 정보 부족을 무위험으로 오해 | `not_provided`/`unavailable`을 노출 결과와 별도 표시한다. |
| EFB와 같은 성능 기능으로 오해 | 모든 단계의 API·UI·테스트에서 TAS/GS/ETA/연료/추천 필드를 배제한다. |
| AIP·NOTAM·기상 run이 서로 다른 시점 | 응답과 화면에 cycle/run/유효시간을 표시하고 변경 시 재확인을 유도한다. |

## 9. 실행 시작 기준

이 명세의 구현은 작업 0~4를 하나의 기반 phase로 먼저 완료한 뒤에만 시작한다. 이후에는 1단계, 2단계, 3단계를 순서대로 진행한다. 각 phase 종료 시에는 단위/API 테스트, 필요한 브라우저 검증, 스펙 범위 검토를 완료하고 status 파일을 갱신한다.
