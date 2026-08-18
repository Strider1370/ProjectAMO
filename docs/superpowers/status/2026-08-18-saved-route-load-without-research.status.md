# 2단계 재검색 없는 저장 경로 열기 — 상태

**계획:** [2026-08-17-saved-route-load-without-research.md](../plans/2026-08-17-saved-route-load-without-research.md) · **스펙:** [2026-08-17](../specs/2026-08-17-saved-route-briefing-and-push-design.md), [2026-08-18](../specs/2026-08-18-saved-briefing-and-account-menu-design.md)

**상태: 2단계 완료, 관문 통과.** 브랜치 `feat/saved-route-load`.

## 관문 결과 (2026-08-18)

일반 사용자 계정(`test`, role=pilot)으로 브라우저에서 직접 확인.

| 관문 | 결과 |
|---|---|
| **A. payload 20,000 B 미만** | 최대 **9,280 B** (해외 IFR). 1단계 기준선 2,721 B → `routeModel`·`routeMarkers`·`eta` 추가분 포함 |
| **B. 해외 IFR 원클릭** | **통과.** RKSI → RJBB가 새로고침 후 저장분만으로 열린다. `No RNAV route path` 없음 |
| **C. 재검색 안 함** | **통과.** 항로망 자료(`enroute.json`·`route-graph-overseas.json`·`route-segments-overseas.json`) 요청 없음. 절차 파일(`rksi-*-procedures.json`)은 SID/STAR 드롭다운과 이름표 복원용으로만 받는다 — 경로 재조립과 무관 |

지도에 그려진 선 확인: `route-preview-line` 26좌표 = 저장된 최종선(SID 포함). 앞 9좌표가 EGOBA2A의 fix와 정확히 일치(RWY15L→AD020→…→EGOBA).

저장 payload 실측:

| | RKSS→RKPC | RKSI→RJBB |
|---|---|---|
| 크기 | 7,819 B | 9,280 B |
| 경로선 / 스켈레톤 | 38 / 11 | 26 / 18 |
| 구간 / 마커 | 8 / 11 | 15 / 18 |
| `routeModel`에 좌표선 중복 | 없음 | 없음 |

테스트: 백엔드 850 통과(1 스킵 — 레이더 픽스처 없음, 기존), 프론트엔드 1,396 통과, 빌드 성공.

## 계획에서 벗어난 것

### `로드`와 브리핑 열기를 갈랐다

계획은 `로드`도 브리핑으로 보내는 것이었다. **사용자 판단으로 갈랐다** — 브리핑은 대안 경로 비교와 순항고도 설정을 거친 뒤에 나와야 한다. 저장분의 고도로 브리핑을 띄우면 사용자가 정한 적 없는 고도의 판단 화면이 된다.

- `경로` 메뉴 `로드` → `loadSavedRouteIntoEditor` — 경로 입력 상태까지만
- 딥링크 `?flight=` → `openSavedBriefing` — 브리핑까지

이 결정에서 [2026-08-18 스펙](../specs/2026-08-18-saved-briefing-and-account-menu-design.md)이 나왔다: 경로 저장과 브리핑 저장을 나누고, 비행 알림은 저장된 브리핑을 감시한다.

### 최소 routeResult가 필요한 필드를 빠뜨렸다 — 여섯 번

저장분으로 만든 최소 `routeResult`에서 "브리핑에 안 쓰일 것"이라 판단해 뺀 필드들이 실제로는 쓰였다. **유닛 테스트로는 하나도 안 잡혔고 전부 브라우저 확인에서 나왔다.**

| 증상 | 빠진 것 |
|---|---|
| 지도에 출발→도착 직선만 | `routeResult` 자체를 안 세움 |
| SID 구간이 안 그려짐 | 절차를 비운 채 경로 글자를 넣어 재조립이 SID를 버림 |
| 경유점 이름 없음 | `route-preview-point` 피처 |
| NAVLOG 순항 구간 빔 | `routeModel` |
| NAVLOG 공항 줄·연직단면도 이름 없음 | `routeMarkers` |
| 연직단면도 부실 | `fetchVerticalProfile` 호출 자체 |
| 기준 픽스 이름표 없음 | `entryFix`/`exitFix` |
| VFR 경유점 편집 불가 | `manualRoute` |

**교훈:** 소비처를 처음에 전부 훑었어야 했다. 한 번 훑고 `segments`를 "편집 화면 전용"으로 잘못 분류한 뒤, 증상이 나올 때마다 한 필드씩 채우는 방식이 반복됐다.

최종 처리 방식은 **`routeResult`가 저장분(`routeModel`·`routeMarkers`)을 들고 다니게** 하고, 소비 지점(`handleGenerateBriefing`, `buildRouteProfileMarkersPayload`)이 "들고 있으면 그걸 쓰고 없을 때만 계산"하도록 바꾼 것이다. 한 경로만 고치는 방식을 그만뒀다.

### 토큰 재적용이 덮어쓰는 함정

경로 글자가 바뀌면 그 글자로 경로를 다시 만드는 효과(`useRouteBriefing.js:559`)가 저장된 선을 덮어썼다. 파일 임포트가 먼저 겪은 문제라 우회 장치(`skipImportedTokenReapplyRef`)가 이미 있었고 **그것을 재사용**했다.

규칙은 코드 주석에 이미 있었다(`:538`): **공항은 routeForm이, 절차는 procedures가, 경유점은 경로 글자가 쥔다.** 경로를 통째로 얹을 때 셋을 다 채워야 하는데 절차를 비운 것이 원인이었다. 설계 결함이 아니다.

### 계획 밖에서 함께 고친 것

- **개인 미니마 프리셋** — VFR 1000ft → **1500ft**(관제권 VFR 최저치, `flight-category.js`의 IFR 경계와 일치), IFR 500ft/1600m → **CAT-I 200ft/550m**
- **ETA 저장** — 스냅샷이 `eta`를 버리고 있었다. 사용자가 손으로 고친 도착시각이 저장에서 사라졌다
- **해외 목적지 NAVLOG** — 공항 줄이 SID·접근절차 그룹 안에서만 나오는데 절차 자료가 한국 공항에만 있어, 해외 목적지는 NAVLOG 마지막 줄이 목적지가 아니라 마지막 항로점이었다. **선행 버그이며 이번 작업과 무관하다.** 절차가 공항을 품지 않으면 양 끝에 구간을 잇도록 고쳤다

## 남은 위험

- **`loadSavedRoute`(재검색 경로)가 남아 있다.** 기하 없는 구형 저장분 대비용. 서버 DB에는 그런 경로가 없고 게스트 localStorage만 해당된다. 시간이 지나면 죽은 코드가 된다
- **VFR 저장 경로가 한 번도 검증되지 않았다.** 저장된 VFR 경로가 없다. `manualRoute` 복원과 `named` 구분은 유닛 테스트로만 덮였다
- **`FlightAlertDetail`이 고아 상태다.** 어디서도 렌더하지 않는다. 3단계에서 변경점 띠를 만들 때 지운다
- **`airacCycle`은 기록만 한다.** 오래된 경로 경고 화면 없음
- 개발 DB에 테스트 계정 `test`/`test1234`(role=pilot, status=active)가 있다. 배포 DB에는 없다

## 다음

3단계 — 브리핑 저장/불러오기 + 내 계정 메뉴. [2026-08-18 스펙](../specs/2026-08-18-saved-briefing-and-account-menu-design.md) 기준. 계획 미작성.
