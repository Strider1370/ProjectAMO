# Map Tools — Measurement & Drawing Suite

**Date:** 2026-07-14
**Status:** 구현 완료. (원 스펙은 what/why, Plan(how)는 별도 문서.)

## Goal

지도 위에서 쓰는 그리기·측정 도구를 하나의 "지도 도구(Map Tools)" 묶음으로 제공한다.
현재 폴리곤 그리기만 있는 것을, 항공 운항에서 실제 쓰는 측정 도구들까지 확장한다.

성공 기준: 사용자가 지도 도구 툴바를 열어 아래 6개 도구를 각각 켜고, 지도 클릭만으로
거리·반경·좌표·방위·표고를 확인/작도할 수 있으며, 결과가 정확한 단위로 표시된다.

## Current state (기준선)

- `frontend/src/features/custom-area/` — 폴리곤 그리기 엔진(`usePolygonDraw`) + 패널(`CustomAreaOverlay`).
  `@mapbox/mapbox-gl-draw` 사용. 지도 클릭으로 점을 모아 폴리곤을 완성하고, 색상 선택·좌표 직접입력 지원.
- 트리거: 왼쪽 사이드바 "임의구역" 항목 → `activePanel === 'custom-area'` 일 때 패널 렌더(MapView.jsx).
- `backend/src/terrain/terrain-sampler.js` — `createTerrainSampler({ terrainRoot })` / `createDefaultTerrainSampler(dataRoot)`.
  표고 계산 로직은 이미 존재하나 브리핑 내부에서만 사용, **HTTP로 노출된 조회 주소가 없음.**

## Decisions (확정)

- **단위**: 거리·반경 = 해리(nm). 고도 = 피트(ft). 면적 = km²(기본).
- **방위**: 자북(MN)·진북(TN) **둘 다 병기** — 예 `MN 097° / TN 105°`.
  - 자편각(magnetic declination)은 좌표·날짜로 계산하는 WMM 표준모델(`geomagnetism` 패키지)로 산출.
    한국은 지역별 7~9.5°W로 최대 2.5° 차이라 고정값은 부적절. (반대 시 서울 기준 고정 8.5°W + `ponytail:` 주석)
- **런처 위치**: **베이스맵 선택 버튼(`.basemap-switcher`, `top:12 right:12`) 바로 왼쪽.**
  - "지도 도구" 런처 버튼은 베이스맵 토글과 **같은 크기·스타일**(흰색 라운드 사각, `.basemap-switcher-toggle` 참고)로 만들어
    시각적으로 한 쌍처럼 보이게 한다. 앵커: `top:12px; right: calc(12px + 베이스맵버튼폭 + gap)` (정확한 값은 Playwright로 튜닝).
  - 클릭 시 도구 목록/활성 도구 패널은 **아래 방향으로** 펼친다(오른쪽 정렬). 우측 아래 확대/축소, 우측 강수 범례와 겹치지 않게 확인.
  - 사이드바 "임의구역" 항목은 제거하고 이 런처로 대체한다.

## Tools (6개)

각 도구는 툴바에서 하나만 활성(모드). 활성 도구의 세부 컨트롤/결과는 툴바에 붙는 작은 패널에 표시.

| # | 도구 | 입력(지도 상호작용) | 출력/표시 | 계산 |
|---|---|---|---|---|
| 1 | 좌표 확인 | 클릭 1점 | 위·경도 (DD/DMS/DDM 전환) | `coordFormat.js` 역방향 포맷 |
| 2 | 거리측정(자) | 점 이어찍기, 더블클릭 종료 | 구간별 + 총거리(nm) | `@turf/length` |
| 3 | 반경 링 | 중심 클릭 + 반경(nm) 입력 | 원(동심원 다중 가능) | `@turf/circle` |
| 4 | 방위/코스선 | 2점 | `MN xxx° / TN xxx°` + 거리(nm) | `@turf/rhumb-bearing`(or bearing) + WMM |
| 5 | 고도 확인 | 클릭 1점 | 표고(ft) | 백엔드 조회(아래) |
| 6 | 폴리곤(기존) | 점 이어찍기 | 구역 + 넓이(km²) | 기존 + `@turf/area` |

세부 동작:
- **좌표 확인**: 클릭 지점에 마커 + 라벨. 형식 드롭다운(dd/dms/ddm)은 기존 `COORD_FORMAT_OPTIONS` 재사용.
- **거리측정**: 폴리곤과 같은 점찍기 UX(미리보기 선/점). 각 구간 라벨에 nm, 마지막에 총합. 더블클릭/첫점 근처 클릭으로 종료 아님 — 열린 경로.
- **반경 링**: 중심 1점 후 반경 입력(기본 예: 10nm). "링 추가"로 동심원. 각 링에 반경 라벨.
- **방위/코스선**: 두 점 사이 대권/항정선 코스. MN은 TN − 자편각(W는 음수 규약 주의)로 산출.
- **고도**: 클릭 → `GET /api/terrain/elevation?lat=&lng=` → ft 변환 표시. 데이터 없는 지점은 "표고 없음".
- **폴리곤**: 완성 시 넓이(km²) 라벨 추가. 나머지는 기존과 동일.

## Backend change

`backend/src/terrain/` 의 기존 샘플러를 감싸는 얇은 라우트 1개 추가:
- `GET /api/terrain/elevation?lat={}&lng={}` → `{ elevationM: number|null }`
- 서버 부팅 시 `createDefaultTerrainSampler(DATA_PATH)` 재사용. (운영 DATA_PATH=/opt/projectamo/shared/data)
- 입력 검증: lat[-90,90], lng[-180,180]. 범위 밖/미싱 타일 → `elevationM: null`.

## Dependencies

- `@turf/turf` (또는 개별 `@turf/length`,`@turf/area`,`@turf/circle`,`@turf/bearing`) — 지오메트리 계산.
- `geomagnetism` — 자편각(WMM). (반대 시 미도입, 고정값 대체)

## Architecture 준수

- ADR-0001(MapView layer gravity): 각 도구의 지도 레이어/이벤트는 **owning feature module의 `useXOverlay` 훅**으로.
  MapView에는 바 상태/`useEffect`를 새로 넣지 않는다. 현재 `useCustomAreaOverlay` 패턴을 형제 훅으로 확장.
- design-language.md: 툴바·패널은 기존 Fluent 토큰(`var(--space-*)`, `var(--stroke-*)`, `var(--radius-*)`) 사용.
  신규 색/여백 하드코딩 금지. 모바일(iPad/PWA) 구조 대개편은 이 스펙 범위 밖 — 데스크톱 우선, 모바일은 후속.

## Risks & open points (스펙 리뷰 결과)

- **turf 번들 크기**: `@turf/turf` 메타 패키지는 큼(수백 KB). 현재 빌드도 큰 청크 경고가 있으므로
  **개별 패키지만 설치**(`@turf/length` `@turf/area` `@turf/circle` `@turf/distance` `@turf/bearing` `@turf/helpers`). → 확정.
- **도구 배타성 + 폴리곤 선택 충돌**: 한 번에 한 도구만 활성. 측정 도구가 활성일 땐, 기존 폴리곤 클릭이
  선택/패널 열기를 가로채면 안 됨(mapbox-gl-draw selection 게이트 필요). 도구 전환 시 진행 중 작도는 취소.
- **베이스맵 전환 생존**: `usePolygonDraw`는 지도 style 교체 시 완성 도형을 저장→재설치한다.
  새 도구(자·링·코스선)의 결과도 같은 map-identity swap 처리를 타야 크래시/소실 없음. 공통 오버레이 패턴으로 흡수.
- **거리 vs 방위 기준 정합**: 거리는 대권(`@turf/length`/`distance`). 코스선 방위도 **초기 대권방위(`@turf/bearing`)**로
  통일한다(rhumb 아님) — 국내 단거리는 차이 무시 가능, 지표 혼용을 피함.
- **자편각 부호**: 한국은 W(서편차) → declination 음수. `MN = TN − declination`에서 부호 실수 주의. 단위 테스트로 고정.
- **좌표 포맷터는 신규 코드**: `coordFormat.js`는 현재 파싱(문자열→십진)만 있음. 표시용 역포맷(십진→DD/DMS/DDM)은
  새로 추가하는 함수 — 재사용이 아니라 확장. 자체 검증(assert) 남긴다.
- **런처는 데스크톱 전용(1차)**: 모바일에선 베이스맵 스위처가 숨겨짐(`.amo-sheet-full .basemap-switcher{display:none}`).
  지도 도구 런처도 동일하게 모바일 숨김. 모바일 진입점은 후속 제안.
- **표고 단위 확인**: `terrain-sampler` 반환이 m인지 원시값인지 phase 5에서 확인 후 ft 변환.

## Non-goals (범위 밖)

- 저장/공유/영속화(그린 도구 결과를 서버에 저장) — 세션 내 표시만.
- 비행계획 통합(코스선을 브리핑 경로로 전송 등).
- 모바일 전용 레이아웃 재설계 — 별도 제안.
- ForeFlight식 시간·연료 계산(항공기 성능 프로파일) — 범위 밖.

## Build order (phases — 상세는 plan 문서)

0. 도구함 골격: 오른쪽 위 플로팅 툴바 + 도구 선택 상태, 폴리곤을 첫 도구로 이동, `@turf` 설치, 사이드바 항목 제거.
1. 좌표 확인 (최소, `coordFormat` 재사용)
2. 거리측정(자)
3. 반경 링
4. 방위/코스선 (+ `geomagnetism`)
5. 고도 확인 (+ 백엔드 라우트)

각 단계 Playwright로 실제 클릭 검증 후 다음 단계.
