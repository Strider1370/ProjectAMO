# Status — Map Tools Measurement Suite

**Spec:** `docs/superpowers/specs/2026-07-14-map-tools-measurement-suite.md`
**Updated:** 2026-07-14

## Progress

- [x] **Phase 0 — 툴바 골격** (검증 완료, Playwright PHASE0_OK)
  - `frontend/src/features/map-tools/MapToolsLauncher.jsx` — 런처 버튼(연필+자 아이콘)
  - `MapView.css` `.map-tools-launcher` — 베이스맵 스위처 왼쪽(top:12, right:66, 46×46). 모바일 숨김(App.css).
  - MapView.jsx: `<MapToolsLauncher>` 렌더, `activePanel==='custom-area'` 토글(onOpenCustomAreaPanel/onClosePanel).
  - Sidebar.jsx: "임의구역" 항목 제거(런처로 대체).
  - 패널은 기존 `custom-area/CustomAreaOverlay`(폴리곤) 그대로 재사용, 위치는 앱 관행대로 좌상단.
- [ ] **Phase 1 — 좌표 확인** (다음)
- [ ] Phase 2 — 거리측정(자) + `@turf/*` 설치
- [ ] Phase 3 — 반경 링
- [ ] Phase 4 — 방위/코스선 + `geomagnetism`
- [ ] Phase 5 — 고도 확인 + 백엔드 `GET /api/terrain/elevation`

## Notes / decisions in flight

- 단위: 거리·반경 nm, 고도 ft, 면적 km². 방위 MN·TN 병기.
- 런처는 데스크톱 전용(모바일은 후속). turf는 개별 패키지만.
- 패널 위치: 스펙 초안은 "런처 아래"였으나 앱 관행(좌상단 패널)과 맞춰 좌상단 유지. 도구 선택 UI는
  2번째 도구 추가 시(폴리곤+좌표) 패널 헤더에 도구 전환 붙일 예정 — 지금은 폴리곤 단일이라 미도입(YAGNI).

## 기존 PR #2 와의 관계

원 PR #2(wolfpack116, feature/custom-area-v2)의 그리기 엔진(usePolygonDraw)만 채택.
`/sandbox` 페이지와 AviationLayerPanel 내 버튼은 미채택 — 런처로 대체. 이 작업 브랜치는 main 기준.
