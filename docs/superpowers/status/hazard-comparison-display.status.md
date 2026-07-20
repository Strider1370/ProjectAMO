# 경로비교·고도비교 위험기상 표시 개편 Status

Updated: 2026-07-21 00:20 KST
Spec: docs/superpowers/specs/2026-07-21-hazard-comparison-display.md
Plan: docs/superpowers/plans/2026-07-21-hazard-comparison-display.md

## Resume Point

- Last completed: 스펙·계획 승인 및 문서화(커밋 `303fd27` 이후, 아직 구현 미착수).
- Next: Task 1 Step 1 — `AltitudeWeatherComparison.jsx`에 `SEVERITY_LABEL` 함수 추가.

## Verified

- 목업 v3(강도 배지, `encounter` 구분, `exposureNmByGrade` 분해)의 데이터 전제를 백엔드 코드(`altitude-weather-comparison.js`, `route-exposure.js`, `iwxxm-advisory-parser.js`)와 대조해 확인함. `horizontalExposure`가 계산되지만 반환에서 누락된 것을 확인(Task 2의 근거).
- 현상 코드 18개 중 강도 인코딩이 있는 것은 `SEV_ICE`/`MOD_ICE`/`SEV_TURB`/`MOD_TURB` 4개뿐임을 확인 — FR-002 근거.
- `lucide-react`가 이미 설치·사용 중임을 확인(`package.json:31`, 15개 이상 파일에서 사용).

## Unverified / Skipped

- 실제 위험기상이 있는 화면 캡처는 아직 없음 — 현재 `route-fixture.mjs` 픽스처가 전부 `없음/unavailable`이라 Task 5 Step 1에서 픽스처 보강이 필요함.
- 백엔드/프런트 테스트는 아직 실행하지 않음(구현 미착수).
