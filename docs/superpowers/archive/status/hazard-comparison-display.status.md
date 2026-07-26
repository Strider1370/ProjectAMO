# 경로비교·고도비교 위험기상 표시 개편 Status

Updated: 2026-07-21 09:00 KST
Spec: docs/superpowers/specs/2026-07-21-hazard-comparison-display.md
Plan: docs/superpowers/plans/2026-07-21-hazard-comparison-display.md

## Resume Point

- Last completed: `d07d246` — 고도 비교 열 정렬(FR-004) 후속 수정 + LGT 색상 수정. 계획의 5개 태스크 + 이 후속 수정까지 완료.
- Next: 없음. 후속 작업이 필요하면 새 스펙/플랜으로 시작.

## Deviations from Plan

- Task 1 완료 시점(`2cdbd08`)에는 착빙·난류·위험기상이 카드 안에서 세로로 쌓이기만 하고 실제 CSS 격자(`grid-template-columns`)가 없어 FR-004("모든 행에서 동일한 가로 위치")를 충족하지 못했음 — 사용자가 목업과 대조해 지적함. `d07d246`에서 `.rb-altitude-row`에 실제 6열 격자를 추가하고 헤더 행을 넣어 해결.
- 목업(v3)은 1180px 데모 페이지 기준으로 설계됐으나 실제 Flight Plan 사이드바는 ~440px임. 목업 그대로(배지+NM 수치+등급별 분해를 접힌 행에 전부 표시)를 이식하니 착빙/난류 배지 텍스트가 글자 단위로 줄바꿈되어 읽을 수 없었음(스크린샷으로 확인). 접힌 행은 등급 코드(NIL/LGT/MOD/SVR)와 위험기상 출처만 표시하도록 축소하고, 정확한 NM·등급별 분해·위험기상 전체 정보는 선택 시 펼치는 상세 패널로 옮김 — 정보 자체는 하나도 빠지지 않았고 위치만 바뀜.
- `.sev-lgt`가 `--level-green`을 썼는데, 이 앱에서 초록은 "양호/안전"을 뜻해(`BriefingView.css`의 VFR 배너 등) 측정값에 판단을 슬쩍 얹는 셈이었음. MOD/SVR과 같은 호박색 계열의 옅은 톤으로 교체.

## Completed

- Task 1 — `2cdbd08` (severity badges + encounter 구분), `f8a6674` (`hz.on`/`hz.near` 클래스 셀렉터 버그 수정, 미사용 `gradeLabel`/`exposureLabel` 제거). 이번 세션 시작 시점에 이미 커밋되어 있던 상태를 확인하고 잔여 미커밋 변경분(버그 수정)을 검증 후 커밋함.
- Task 2 — `ef93d4a`: `matchHazards()`가 `horizontalExposure` 필드를 반환하도록 추가. 백엔드 테스트 갱신(`backend/test/altitude-weather-comparison.test.js`), 6/6 통과.
- Task 3 — `ced2378`: `routeComparison.js`의 `exposureNm()`을 export, `AltitudeWeatherComparison.jsx` 카드에 행별 노출거리 합계(`총 N NM`) 열 추가.
- Task 4 — `190fe00`: `routeComparison.js`의 `exposureRows()`가 `{ nm, label }`을 보존하도록 변경, `exposures[]`에 사람이 읽는 `label` 필드 추가. `RouteAlternativesStep.jsx`에서 카드 잘림(`slice(0,2)`) 제거하고 노출거리 내림차순 정렬 + 상위 3건 + "N건 더 보기" 펼침으로 교체, 위험기상 노출 합계 배지 추가, 비교 델타에 중립 회색 화살표(`ChevronUp`/`ChevronDown`) 추가(색상 없음). `routeComparison.test.js`에 잘림 없음·label 사람이 읽는 문자열 테스트 추가, 4/4 통과.
- Task 5 — 아래 Verified 항목 전부 확인.

## Verified

- `frontend/verification/route-fixture.mjs`의 `altitudeComparison`(FL90 행)과 `exposure`에 착빙 MOD(보통, 18 NM)·난류 LGT(약함, 6 NM)·SIGMET Embedded Thunderstorm(실제 조우, 22 NM) 픽스처 추가 — 기존 픽스처가 전부 `없음/unavailable`이라 이번 변경이 시각적으로 검증되지 않던 문제 해결.
- `npm.cmd run dev:contract -- --grep tabcapture`: desktop 1/1 통과. 캡처 스크린샷(`artifacts/tab-capture/3-alternate-altitudes.png`)에서 강도 배지("보통"/"약함" + `sev-mod`/`sev-lgt` 스타일), 격자 정렬, 노출거리 합계("총 46 NM"), 위험기상 실제 조우 표시가 모두 정상 렌더링됨을 육안 확인. `2-alternate-routes.png`에서 기본 경로 카드가 내부 키가 아닌 사람이 읽는 라벨("Embedded Thunderstorm 수평 교차 22 NM")을 보여줌을 확인.
- `npm --prefix backend test`: 376/376 통과.
- `npm --prefix frontend test`: 438/438 통과.
- `npm --prefix frontend run build`: 성공.
- `npm.cmd run dev:contract -- --grep route-workflow`: 8 통과(4는 프로젝트 매트릭스상 스킵 — mobile-only/desktop-only 케이스), 회귀 없음.
- 픽스처에는 대안 경로(`kind: 'alternative'`)가 없어 `RouteAlternativesStep`의 "N건 더 보기" 펼침 UI 자체는 스크린샷으로 캡처되지 않음 — 해당 로직(잘림 없음, label 사람이 읽는 문자열)은 `routeComparison.test.js`의 유닛 테스트로 커버됨.

## Unverified / Skipped

- 대안 경로 카드의 "N건 더 보기" 펼침 상호작용은 스크린샷으로 캡처하지 않음(위 사유). 필요하면 `tabcapture.spec.mjs`에 대안 경로 설계안을 추가하는 후속 작업으로 캡처 가능.
- `ipad-landscape`/`mobile` 프로젝트에서의 tabcapture는 desktop-only 스킵 조건(`test.skip`)으로 실행하지 않음 — 계획에 명시된 대로 desktop만 캡처.
- 모바일 2열 격자 폴백(`RouteBriefing.css`의 `.rb-mobile .rb-altitude-row`)은 로직상 작성만 하고 스크린샷으로 확인하지 않음.
- `docs/design/mockups/briefing-preparation-summary.html`은 이 작업과 무관한 미추적 파일로 저장소에 남아있음(세션 시작 시점부터 존재) — 이번 커밋에 포함하지 않음, 별도 확인 필요.
