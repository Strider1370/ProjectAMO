# Phase 2 Cleanup Status

Updated: 2026-06-28 KST
Spec: docs/superpowers/specs/2026-06-28-cleanup-dead-code-and-stale-docs-design.md

## Resume Point
- Phase 2 청소 완료 (한 세션). 잔여 후속 없음.

## Done
- 삭제: `TafForecastView.jsx`(고아), 캡처 스크립트 2개(airport-panel-current-weather-capture, airport-station-plot-capture), `backend/ctps.nc`(디버그 잔재 — 코드는 CTPS를 KMA API로 실시간 fetch, 로컬파일 미사용), `docs/optimization-review-2026-05-20.md`(shipped/참조0)
- 의존성: `frontend/package.json`의 `project-kma` `file:..` 자기참조 제거 (build 그린)
- archive 이동: kim-cloud/icing-potential·airport-weather-display status 3건, kim-nwp-server-ops plan, kim-nwp-weather-layers-outline·kim-temp-layer spec, vertical-cross-section spec+plan, flight-category-overlay spec+plan
- 위치정정: 잘못 들어간 `frontend/docs/.../2026-06-09-weather-layer-timestamp-bar.md` → 정규 `docs/superpowers/plans/`
- `.superpowers/` 브레인스토밍 산출물 untrack + gitignore

## Skipped / Kept (의도적)
- 미사용 export 134개: **건너뜀**. unexport는 코드 삭제 아님(키워드만 제거) + 동적참조 리스크 + 큰 churn, 가치 낮음
- `monitoring/legacy/` 서브트리: **현역**(`/monitoring` 라우트) — 은퇴 기각
- `briefing-smoke.mjs`·`mobile-audit.mjs`: 6/27·6/25 스펙의 활성 QA 도구 — 보존(knip은 계속 unused file로 표기)
- `docs/briefing-architecture.md`: README·preflight design이 참조 중 — 보존
- `docs/research/*`: 디자인 헌법이 "참고자료"로 분류 — 보존

## Verified
- `vite build` 그린, `test:layout` 10/10, knip: unused dependencies 0 (project-kma 제거 확인)
