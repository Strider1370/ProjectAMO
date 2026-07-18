# 경로비교 우회안 편집·비교 상태

> 갱신: 2026-07-19 · 상태: Task 1~5 구현·검증 진행

## 정본

- 스펙: `docs/superpowers/specs/2026-07-19-route-comparison-alternatives-design.md`
- 계획: `docs/superpowers/plans/2026-07-19-route-comparison-alternatives-implementation.md`

## 이번에 확정한 것

- 두 번째 탭 이름은 `경로비교`다.
- 기준 경로는 보존하고, 기준 또는 우회안을 복제한 최대 3개 우회안(총 4개)만 편집한다.
- 편집은 문자열과 지도 waypoint/`+` 핸들 drag뿐이다. 클릭 추가·그리기·별도 구간 우회 모드는 경로비교에서 제거한다.
- VFR은 `DEP DCT … DCT ARR` 전체 문자열이 설계안별 draft 정본이다.
- applied와 draft/pending을 설계안별로 분리한다. draft는 저장·거리·ETA·위험 노출·고도·브리핑을 바꾸지 않는다.
- 비교는 동일 ETD/TAS·기상 snapshot·final geometry 정책에서만 delta를 표시한다.
- 기상 snapshot은 프런트 시간값이 아니라 서버 batch exposure가 한 번 고정한 cache snapshot으로 보장한다.
- 저장은 v3에서 base와 alternatives의 applied 입력값만 저장하고, 불러올 때 공통 preview→apply로 재계산한다.

## 코드 조사 결론

- 현재 `useRouteBriefing.js`는 전역 `routeEditor`를 써서 alternative draft를 독립 보관하지 못한다.
- 현재 alternative apply는 IFR만 지원하며 VFR preview/map sync는 전역 branch다.
- 현재 복제는 부모 undo를 복사하고, selection이 고도/브리핑을 바로 clear한다.
- 지도는 기존 `briefing-route-baseline`/`briefing-route-applied`/`briefing-route-pending` source로 필요한 상태를 표현할 수 있다. `MapView.jsx`에 새 state/effect는 필요 없다.

## 구현 진행

- Task 1: `routeDesigns`에 base/alternative kind와 design별 draft/pending 분리를 추가했다. 복제는 applied 값만 독립 복사하며 draft/pending/undo를 복사하지 않는다.
- Task 1: `routeComparison`의 거리·ETA·현상별 노출 delta와 design별 final geometry helper를 추가했다.
- Task 1: `/api/briefing/route-exposure/batch`가 요청 시작 시 SIGMET/해외 SIGMET/AIRMET/낙뢰 cache를 한 번 읽고 같은 snapshot hash를 모든 결과에 붙인다.
- Focused tests: frontend routeDesigns/routeComparison 9개, backend route exposure/integration 5개 통과.
- Task 2: alternative 전용 `draftEditor` preview/apply/cancel action을 `useRouteBriefing`에 추가했고, base의 기존 settings editor는 유지했다.
- Task 3: comparison design이 있을 때 base/applied alternatives/pending draft를 기존 baseline/applied/pending source로 분리했다. `MapView.jsx`에는 state/effect 없이 기존 binder ref만 추가했다. 선택 VFR의 waypoint/`+` handle 및 IFR 수동 문자열 waypoint는 design-scoped draft confirmation으로 연결했고, compare 단계에서는 기존 click/draw/segment interaction을 끈다.
- Task 4: 두 desktop/mobile `경로비교` 렌더 경로에서 alternative 문자열 편집·preview·apply controls를 새 action에 연결하고, 기존 클릭 추가/그리기/구간 우회 버튼을 제거했다. 기준 카드는 복제만 제공하고, 우회안 삭제는 inline 확인 뒤에만 실행한다. 위험 표시는 disclosure로 분리하고, 선택 우회안에는 현상별 노출 delta와 지도 상태 범례를 표시한다.
- Build: `npm.cmd run build --prefix frontend` 통과 (2026-07-19).
- 전체 tests: `npm.cmd test` 424개 통과 (2026-07-19).
- Browser smoke: `npm.cmd run dev:smoke`가 desktop·tablet landscape·mobile 포함 6개 viewport에서 overflow 없이 통과 (2026-07-19).
- 정적 검사: `npx depcruise .`는 저장소 config 부재로 실행 불가; `npx knip`은 entrypoint config 부재로 500개 false positive를 보고했다. `graphify update .`는 외부 처리 권한 재승인 대기다.
- graphify: 재승인 뒤 `graphify update .` 완료 (6,557 nodes, 10,467 edges).
- v3: 저장 버튼은 base/alternatives applied 입력값만 저장하고, load는 alternatives도 preview→apply 재계산한다. 최신 전체 tests 424개 통과 및 `git diff --check` 통과 (2026-07-19).
- Batch: alternative apply와 v3 load 뒤 base와 applied alternatives의 exposure를 batch endpoint로 함께 재계산해 동일 snapshot을 붙인다. snapshot이 다르면 위험 노출 delta를 숨긴다.
- Lifecycle: 목록 선택은 active applied route를 바꾸지 않으며, 고도 비교 요청은 active applied design의 final geometry/model을 사용한다.
- Focused tests: route comparison/store/preview/preview sync 32개 통과 (2026-07-19).
- Full frontend tests: 428개 통과 (2026-07-19).
- Build: `npm.cmd run build --prefix frontend` 통과 (2026-07-19, 최신 변경).
- Browser smoke: `npm.cmd run dev:smoke`가 desktop·iPad landscape·mobile 포함 6개 viewport에서 overflow 없이 통과 (2026-07-19, 최신 변경).
- graphify: 최신 코드 그래프 갱신 완료 (6,535 nodes, 10,451 edges).
- Browser: Playwright로 VFR 기준 경로 생성 → `경로비교` 진입 → 우회안 복제·선택·문자열 편집 UI 노출을 확인했다. 같은 우회안 화면에서 iPad landscape(1180×820)와 mobile(390×844)도 기준/우회안 카드·위험 표시·상세 delta·고도 비교 제어가 접근 가능했다 (2026-07-19).

## 최신 수정·검증

- `적용` 클릭 이벤트가 설계안 ID로 잘못 전달되어 조용히 무시되던 문제를 수정했다. 이제 선택된 우회안만 적용하며, 적용 실패는 해당 초안과 화면에 오류로 남긴다.
- 적용 뒤 이전 applied snapshot이 undo stack에 들어가므로 `되돌리기`는 실제 되돌릴 내용이 있을 때만 표시된다.
- `더보기`를 제거하고 직접 편집·되돌리기·복제·이름 변경·삭제를 바로 노출했다.
- 최신 focused tests(route store/design/preview/sync)와 frontend build, `git diff --check` 통과 (2026-07-19).

## 다음 시작점

커밋·푸시 요청으로 전체 작업트리와 v0.2.5 업데이트 내역을 함께 배포한다. `depcruise`와 `knip`은 저장소 설정 부재로 각각 config 오류와 전역 false-positive만 보고했다.
