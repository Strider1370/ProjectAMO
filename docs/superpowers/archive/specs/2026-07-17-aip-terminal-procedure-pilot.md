# AIP 터미널 절차 데이터 파일럿 스펙

- 상태: 완료 (2026-07-17, 범위 확장 완료)
- 작성일: 2026-07-17
- 적용 범위: 포항경주공항(RKTH)의 RNAV SID·STAR와 STAR 연결 일반 RNP 접근절차를 기존 경로 확인 기능에 추가하는 파일럿

## 목적

경로 확인창이 공표된 절차의 실제 waypoint 순서를 지도와 경로선에 표시하도록 한다. 이 파일럿에서 기존 절차 JSON 형식, 선택 규칙, 원문 추적 정보를 검증한 뒤 다른 국내 공항에 같은 방식으로 적용한다.

## 데이터 단위와 원칙

- AIP 차트 제목이나 지도 선 수가 아니라, 해당 차트 다음 페이지의 `Aeronautical Data Tabulation` 또는 `Coding Tables`에 있는 **전이 경로 레코드 하나**를 절차 데이터 하나로 저장한다.
- SID는 `절차 + 활주로 + 출구 transition`, STAR는 `절차 + 활주로 + 진입 transition`을 구분한다.
- 각 레코드는 표에 나온 waypoint 순서, 좌표, path terminator, 거리, 고도·속도 제한 원문을 보존한다. 표에 없는 값은 추정하지 않고 `null`로 둔다.
- 단, 포항 RNP Y RWY 28은 coding table이 SABUM(IF)에서 끝난다. 사용자가 승인한 예외로 SABUM 이후 활주로까지의 **명확히 그려진 최종 접근선**은 차트에서 전사하며, 그 waypoint와 leg에는 `source: chart-derived`를 별도로 남긴다.
- 일반 RNP 절차의 필요한 지도 geometry가 좌표 부족으로 완결되지 않을 때만, 같은 활주로에 공표된 RNP AR 절차를 대표 geometry로 사용할 수 있다. 이때 절차명과 `fallbackReason`에는 실제 `RNP Z RWY 28 (AR)`임을 명시하며, RNP Y로 이름을 바꾸거나 운항 가능 절차처럼 판단하지 않는다.
- 표가 활주로 threshold 전·후 구간을 생략해 지도 선이 끊길 때는, 같은 활주로의 공표 threshold 좌표와 해당 차트에 명확히 그려진 연결선으로만 보완한다. 보완 fix에는 `chart-derived runway connection` 출처를 남긴다.
- SID의 첫 fix는 이륙을 시작한 threshold가 아니라 **반대쪽 활주로 끝 threshold**에서 시작한다. 이는 활주로를 벗어나 절차 비행을 시작하는 지점을 표시하며, 기존 RKSI 절차 데이터와 동일한 규칙이다.
- 절차 파일은 기존 `frontend/public/data/navdata/procedures/` 아래의 공항별 SID·STAR·대표 IAP JSON 형식을 그대로 쓴다. 새 NAVDATA 계층이나 런타임 API는 만들지 않는다.

## 포항 파일럿 범위

| 종류 | 대상 | 수 |
| --- | --- | ---: |
| SID | RNAV DORTI 1 RWY 10의 ELAPI·LOSTO·BULGA·APARU·LAPAL 전이 | 5 |
| SID | RNAV MARMI 1 RWY 28의 LOSTO·ELAPI·LAPAL·APARU·BULGA 전이 | 5 |
| STAR | RNAV EMTIK 1 RWY 10의 LAPAL·APARU·BULGA 전이, IGASA IAF까지 | 3 |
| STAR | RNAV PUDEN 1 RWY 28의 ELAPI·LAPAL·APARU 전이, RUTON IAF까지 | 3 |
| IAP | IGASA에서 시작하는 일반 RNP Y RWY 10 | 1 |
| IAP | RUTON에서 시작하는 일반 RNP Y RWY 28 | 1 |

제외 대상은 RNP AR, STAR와 연결되지 않는 IAP feeder, 복행 절차와 holding이다.

## 출처와 추적성

- SID: KOCA eAIP `2026-06-10-AIRAC`, RKTH AD Chart 2-5-1 및 2-7-1의 표
- STAR: KOCA eAIP `2025-06-26`, RKTH AD Chart 2-8-1 및 2-9-1의 표
- IAP: KOCA eAIP `2025-09-18`, 선택한 RNP Y 접근의 coding table
- 각 JSON의 metadata와 각 절차의 `source`에는 원본 URL, 발행일, 차트·표 locator를 적는다. 서로 다른 발행본을 하나의 AIRAC cycle로 표시하지 않는다.

## 완료 조건

1. RKTH가 절차 로더와 공항 목록에 등록되어 SID·STAR·연결 IAP 선택지에 나온다.
2. 선택한 SID→항로→STAR→IAF→IAP→활주로 경로가 기존 route preview에서 순서대로 이어진다.
3. 모든 waypoint 좌표와 순서가 렌더링 원표와 일치하고, 고도·속도 값은 원문 그대로 또는 `null`이다.
4. 기존 단위 테스트와 프런트엔드 빌드가 통과하고, 브라우저에서 포항 IFR 경로를 직접 확인한다.

## 비목표

- 항로(en-route) NAVDATA의 구조 변경이나 AIRAC 자동 활성화
- 비행 가능 여부, 활주로 추천, ATC 허가 판단

## 구현 결과 (2026-07-17)

파일럿 형식은 그대로 유지한 채, 국내 추가 공항까지 같은 전사·연결 규칙을 적용했다.

| 공항 | SID | STAR | 대표 IAP | 결과 |
| --- | ---: | ---: | ---: | --- |
| RKTH 포항경주 | 10 | 6 | 2 | 최초 파일럿 완료 |
| RKTU 청주 | 6 | 2 | 2 | 완료 |
| RKNW 원주 | 5 | 4 | 3 | 완료 |
| RKPS 사천 | 11 | 12 | 4 | 완료 |
| RKJJ 광주 | 8 | 7 | 3 | 완료 |
| RKJK 군산 | 0 | 0 | 2 | Coding Table 기준 SID·STAR 없음 |
| RKTN | - | - | - | Coding Table 부재로 사용자 결정에 따라 제외 |

- 모든 추가 JSON은 원문 PDF URL, 발행일, 차트·표 locator를 보존한다. 사천 SID는 2026-06-10 AIRAC 표(AD 2-4-1/2, 2-6-1/2), STAR는 AD 2-8-1, 2-9-1, 2-10-1/2, 2-11-1 locator를 사용한다.
- `procedureData.js`와 경로 확인 UI에 청주·원주·사천·광주·군산을 등록했다.
- 광주 RWY 22L MARYO SID의 좌표 순서를 공식 표에 맞게 바로잡아, 반대쪽 threshold에서 시작해 남서쪽 MARYO 방향으로 이어진다.
- 지도 해제 뒤 canvas가 사라진 경우와 IAP에 선 geometry가 없는 경우를 안전하게 처리해, 사천 도착 경로검색이 화면을 비우지 않도록 했다.

## 검증 결과

- JSON 연속성 및 절차 renderer 회귀 테스트를 포함한 프런트엔드 테스트 369개 통과
- 프로덕션 빌드 통과, Madge 순환 의존성 없음
- Playwright에서 RKJJ→RKPS IFR 경로를 `MARYO1-TEDAN` / `SOLYI1-ANUBA`로 검색: 82 NM 결과 표시, 화면 유지, 애플리케이션 오류 없음
