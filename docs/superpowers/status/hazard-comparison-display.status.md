# 경로비교·고도비교 위험기상 표시 개편 Status

Updated: 2026-07-21 02:00 KST
Spec: docs/superpowers/specs/2026-07-21-hazard-comparison-display.md
Plan: docs/superpowers/plans/2026-07-21-hazard-comparison-display.md

## Resume Point

- Last completed: Task 5 (전체 검증) — 계획의 5개 태스크 전부 완료.
- Next: 없음. 후속 작업이 필요하면 새 스펙/플랜으로 시작.

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
