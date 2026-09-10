# 모바일·태블릿 대안경로 드래그 편집 구현 계획

> **실행 시점:** 계획 리뷰와 사용자 구현 승인을 받은 뒤에만 시작한다.

**목표:** 모바일·태블릿에서 선택한 대안 경로를 드래그해 좌표 웨이포인트를 추가하고, 손을 놓은 지점 높이에 표시되는 확인 카드를 통해 적용 또는 취소할 수 있게 한다.

**구현 원칙:** 기존 대안 경로 삽입 콜백과 확인 카드 흐름을 재사용한다. 데스크톱 마우스 동작과 실제 웨이포인트 스냅 동작은 바꾸지 않는다.

---

## 1. 대안 경로 선에 터치 드래그 삽입 연결

**파일**
- 수정: `frontend/src/features/route-briefing/lib/routePreview.js`
- 수정: `frontend/src/features/route-briefing/lib/routePreview.test.js`
- 수정: `frontend/src/features/route-briefing/useRouteBriefing.js`
- 수정: `frontend/src/features/route-briefing/useRouteBriefing.selection.test.js`

**작업**
1. 선택된 대안 경로 선에 대한 `touchstart` → `touchmove` → `touchend`가 `{ designId, kind: 'insert', index, coordinates, snapToNavpoint: false }` 콜백을 내보낸다는 실패 테스트를 먼저 작성한다.
2. 마우스와 터치가 같은 드래그 시작·이동·종료 로직을 사용하도록 최소한으로 정리한다. 터치 좌표는 Mapbox 이벤트의 원래 터치 지점에서 읽고, 임시 웨이포인트/경로와 맵 패닝 잠금은 기존 동작을 그대로 재사용한다.
3. `touchend`에서 기존 `onDesignWaypointDrop`을 호출하고, `touchcancel`에서는 임시 source와 드래그 상태를 원상 복구하고 맵 패닝을 다시 켠다. 두 경우를 단위 테스트한다.
4. `useRouteBriefing.js`에서 `snapToNavpoint: false`인 삽입 요청은 `resolveNearestNavpoint` 결과를 사용하지 않고 드롭 좌표를 그대로 좌표 WP로 만든다. 기존 데스크톱 요청은 스냅 동작을 유지한다.
5. 기존 마우스 테스트를 포함해 라이브러리와 상태 단위 테스트를 실행한다.

**완료 기준**
- 선택된 대안 경로에서만 터치 삽입이 시작된다.
- 손을 놓으면 기존 삽입 확인 흐름으로 정확한 좌표와 삽입 인덱스가 전달된다.
- 모바일·태블릿 드롭은 가까운 공개 FIX로 자동 치환되지 않는다.
- 터치 취소 후 임시 경로와 WP가 남지 않고, 지도 이동이 복구된다.
- 데스크톱 `mousedown`/`mousemove`/`mouseup` 동작은 유지된다.

## 2. 모바일에서 대안 경로를 선택·생성하면 시트를 peek으로 전환

**파일**
- 수정: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- 수정: `frontend/src/features/route-briefing/RouteBriefing.mobile-alternatives.test.js`

**작업**
1. 모바일에서 대안 경로 선택 또는 복제가 발생했을 때 모바일 시트 detent가 `peek`이 되는 실패 테스트를 먼저 작성한다.
2. 해당 두 기존 핸들러를 감싸는 작은 로컬 래퍼에서만 `peek` 전환을 추가하고, 이어서 원래 선택·복제 동작을 호출한다.
3. 데스크톱에서는 원래 핸들러만 실행되게 유지한다.

**완료 기준**
- 대안 경로를 새로 만들거나 선택하면 지도 조작 영역이 드러난다.
- 별도의 편집 모드·이동·삭제 UI는 추가하지 않는다.

## 3. 확인 카드 적용으로 대안경로를 즉시 확정

**파일**
- 수정: `frontend/src/features/route-briefing/useRouteBriefing.js`
- 수정: `frontend/src/features/route-briefing/useRouteBriefing.selection.test.js`

**작업**
1. 확인 카드의 적용이 좌표 WP가 포함된 대안경로를 즉시 확정하고 pending/draft 상태를 정리한다는 실패 테스트를 먼저 작성한다.
2. 카드의 적용 콜백이 기존 대안경로 초안 확정 경로를 공유하게 한다. 같은 갱신을 별도로 구현하거나 두 번째 폼 적용을 요구하지 않는다.
3. 취소는 삽입 전 초안 상태를 복원한다는 기존 보장을 유지하고, 적용·취소 각각을 테스트한다.

**완료 기준**
- 카드에서 적용을 한 번 누르면 좌표 WP 삽입과 대안경로 갱신이 완료된다.
- 카드 취소는 초안에 임시 WP를 남기지 않는다.

## 4. 드롭 위치 높이에 맞는 최상단 확인 카드 배치

**파일**
- 수정: `frontend/src/features/route-briefing/lib/routePreview.js`
- 수정: `frontend/src/features/map/MapView.css`
- 수정: `frontend/src/features/map/MapView.mobile-confirmation.test.js`

**작업**
1. 모바일 카드가 화면 좌우 12px에 고정되고, 상단 지도 컨트롤 아래와 하단 작업 바/peek 시트 위 사이로 세로 위치가 제한되는 실패 테스트를 먼저 작성한다.
2. 확인 카드를 지도 컨테이너의 스태킹 컨텍스트 밖, 앱 최상위 레이어에 배치한다. 지도 투영 좌표의 세로 위치를 기준으로 하되, 카드 높이를 반영해 안전 영역 안으로 clamp한다.
3. 카드 적용·취소 버튼의 터치 이벤트가 지도 드래그로 전파되지 않게 하고, 최소 터치 대상 크기(44px)를 보장한다. 카드 제거 시에는 앱 최상위 레이어의 DOM도 함께 정리한다.
4. 데스크톱 카드의 기존 지도 좌표 기반 배치를 유지한다.

**완료 기준**
- 카드가 배지·지도 컨트롤·모바일 시트보다 앞에 표시된다.
- 화면 가장자리에서 드롭해도 카드가 화면 밖으로 나가지 않는다.
- 적용·취소 모두 기존 대안 경로 삽입 확정/해제 로직을 사용한다.

## 5. 브라우저 계약 검증

**파일**
- 수정: `frontend/verification/contracts/route-workflow.spec.mjs` (기존 모바일 경로 계약이 있으면 그 파일을 우선 사용)

**작업**
1. 작업 전 Pixel 및 iPad 뷰포트의 기존 상태를 캡처하고, 변경 영향과 기준 상태를 기록한다.
2. Pixel 및 iPad 뷰포트에서 대안 경로 선택/생성 → 선 터치 드래그 → 확인 카드 표시 → 적용과 취소를 각각 검증하는 계약을 추가한다.
3. 상단·중간·하단 드롭에서 카드가 지도 컨트롤 아래, 하단 작업 바/peek 시트 위에 있고 화면 밖으로 나가지 않는지 실제 브라우저에서 검증한다.
4. `touchcancel` 후 원상 복구와 데스크톱 마우스 드래그 회귀도 계약으로 검증한다.
5. `npm --prefix frontend run dev:contract:fast -- <대상 계약>`으로 이미 실행 중인 검증 서버에서 우선 검증한다. 서버 상태상 불가하면 실패 원인을 기록하고, 별도 포트의 정식 계약 실행으로 재시도한다.
6. 관련 단위 테스트와 전체 대상 계약을 실행한다.

**완료 기준**
- 실제 모바일·태블릿 포인터 입력으로 삽입/적용/취소 및 카드 가시성이 확인된다.
- 기존 데스크톱 경로 설계 계약이 통과한다.

## 최종 확인

1. 수정 파일의 관련 단위 테스트를 실행한다.
2. 브라우저 계약 출력과 스크린샷을 남긴다.
3. `graphify update .`를 실행한다.
4. 변경 파일과 테스트 결과만 보고하고, 커밋·푸시는 별도 요청이 있을 때만 한다.

## 자체 검토

- 명세의 범위(드래그 삽입, 확인, peek, 카드 가시성)를 각각 작업으로 연결했다.
- 스냅, 모바일 이동/삭제, 멀티터치, 별도 편집 모드는 계획에 추가하지 않았다.
- 현재 확인·삽입 콜백을 재사용하므로 중복 상태나 새 의존성을 만들지 않는다.
