# 경로 입력·대체 경로 — handoff

Updated: 2026-07-18 KST · Branch: `main` · no commit/push

Plan: `docs/superpowers/plans/2026-07-18-step1-route-editor-unification.md`

VFR single-draft plan (`2026-07-18-vfr-single-draft-route-editor.md`): full-string adapter, VFR airport draft preview, draft/applied map source separation, drag→string preview, legacy snapshot normalization, and load/import common apply flow are implemented. The independent VFR list, altitude, and undo state/actions are removed; downstream distance/profile/briefing consume applied base-derived waypoints. The duplicate VFR map-layer chip is removed and mobile uses the same full-string textarea/apply flow as desktop. The current focused adapter/preview/store tests (18), all frontend tests (409), production build, and `git diff --check` pass. Real Playwright checks passed for desktop, iPad landscape, and mobile. Drag confirmation/cancel/fallback and save/load/undo still need a clean-server route-specific E2E run.

## 현재 기준

- 기본 경로와 최대 3개 복제 대체안의 모델은 존재한다. 선택 설계안만 절차·고도 비교·브리핑으로 전달한다.
- 기존 Phase 1~4 지도 상호작용 코드는 있으나, 사용자 검증 결과 첫 번째 탭의 목적과 조작 방식에 맞지 않아 완료로 간주하지 않는다.
- 새 승인 기준: `docs/superpowers/specs/2026-07-18-flight-plan-input-first-tab-design.md`.
- 첫 번째 탭의 `경로 적용`은 이제 `auto`(연결 방식 미지정)·명시적 `DCT`·명시 항공로를 구분한다. `FIX FIX`는 유일한 항공로를 찾아 모든 중간 FIX와 항공로명을 확장하고, `FIX DCT FIX`는 직선으로 보존한다. 자동 생성·문자열 적용·지도 클릭은 이 공통 결과를 사용한다.

## 다음 작업

Task 1 완료: `routeEditor`가 기준선/초안/적용 base 투영을 위한 순수 계약을 소유한다. `useRouteBriefing`은 공항·절차·문자열·미리보기·대기 의도를 여기에서 파생하며, base 투영과 base 되돌리기도 `editorFromBase()`를 사용한다.

Task 2 완료: 공항·비행 규칙·진입/이탈 FIX·SID/STAR/IAP 변경이 `updateEditorContext()`로 현재 초안만 바꾼다. 공항 교환은 한 번의 확인으로 처리하며, 승인 때만 base와 대체안을 버리고 새 기준선/빈 초안으로 전환한다. 빈 문자열의 `경로 적용`은 비활성화했고, 지도 클릭/그리기는 두 공항만 있으면 계속 활성화된다.

Task 3 완료: 자동 생성도 `buildEditorPreview()`로 수동 입력·지도 제안과 동일한 구조 en-route/editor preview를 만든다. 지도 클릭은 출발 전·FIX 사이·도착 전의 모든 삽입 위치를 실제 전체 경로 거리로 비교해 가장 짧은 유효 초안을 고른다. 기준선은 pending 초안과 함께 남고, 취소는 이전 editor snapshot을 복원한다.

Task 4 완료: `applyBaseRoute()`가 적용/undo의 base 투영, 대체안 폐기, 지도 모드 종료와 downstream 무효화를 함께 처리한다.

Task 5 완료: 첫 번째 탭은 초안/적용 상태와 읽기 전용 전체 계획을 표시한다. 지도/그리기 카드의 `적용`은 초안만 수락하고 기본 경로는 바꾸지 않으며, `취소`는 editor snapshot을 복원한다. 기본 경로를 바꾸는 유일한 동작은 패널의 `경로 적용`이다. 지도 초안은 적용 경로·항공로와 구별되는 자주색 굵은 점선·점·라벨로, 적용 경로 웨이포인트는 주황색 점·라벨로 표시한다.

Task 6 완료: 저장 snapshot v2가 base 절차 key·en-route·VFR point를 보존하며, IFR v2 load는 자동 생성 없이 저장 base를 재구성한다. Architecture 역할 설명도 갱신했다.

## 검증 상태

집중 VFR adapter/preview/store 18개와 frontend 전체 409개 테스트, production build, `git diff --check`가 통과했다. `depcruise .`는 설정 파일 부재로 실패했지만, `npx depcruise frontend/src --no-config`는 2,575 모듈/7,300 의존성에서 위반 없이 통과했다. `knip`은 entry 설정 부재로 496개 기존 파일과 7개 의존성을 미사용으로 보고한다. `graphify update .`는 성공했다. Playwright responsive smoke는 desktop·iPad landscape·mobile 모두 가로 넘침 없이 통과했다. 실제 VFR UI Playwright는 desktop/iPad/mobile에서 textarea 1개, 적용 버튼 1개, 지도 레이어 제목 1개를 확인했고 캡처는 `output/playwright/vfr-single-draft-{desktop,ipad-landscape,mobile}.png`에 있다.

## 주의

`MapView.jsx` 새 state/useEffect 금지. 자동 우회·추천·안전 판정·새 기상 데이터/레이어/점수 금지. 보호된 사용자 변경과 지정된 보호 경로를 건드리지 않는다.

## 검증 운영 피드백 (2026-07-18)

이번 지연은 구현 오류보다 검증 운영 오류였다. 처음에 실제 사용자 진입점(데스크톱 사이드바, 모바일 하단 브리핑 버튼·시트, VFR 전환 방식)을 한 번에 고정하지 않고, 데스크톱용 선택자를 모바일에도 재사용했다. 또한 재사용 개발 서버와 새 브라우저의 상태를 확인하기 전에 전체 도구 검사를 반복했다.

재발 방지: (1) 코드 변경 전 진입점·화면별 컨테이너·전환 요소를 표로 고정한다. (2) 검증은 공통 smoke 1회 뒤 기능 흐름당 desktop/iPad/mobile 스크립트 1개씩만 실행하며, 각 화면의 실제 DOM 계약을 사용한다. (3) 실패 시 먼저 선택자·시트 상태·개발 서버 상태를 확인하고, 같은 검증을 반복하지 않는다. (4) 전체 구조 검사는 소스 범위를 지정하고 설정 부재 결과를 즉시 기록한다.
