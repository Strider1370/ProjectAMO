# KIM 구름·착빙 A안 — 제품 적용 결과

2026-10-03. **실제 프로젝트 frontend에 적용 완료.** HTML 전용 디자인 변경이 아니다. 기존 다른 세션 변경은 유지했고, 새 의존성·backend/API 수집·AWS 배포·로컬 서버 실행은 없다.

## 실제 동작

- 기상 패널의 수치모델 여섯 타일과 `구름·착빙` 진입을 유지한다. 자식 체크박스 상자는 제거하고 기존 지도 하단 범례 옆에 `구름 / 착빙` 두 버튼을 붙였다.
- 회색 T−Td 구름 판정·농도·blur는 유지한다. 착빙은 LGT `#ACC7FF`, MOD `#6B88CD`, SEV `#383D6F` 불투명 면과 공통 흰 점으로 변경했다. 기준 간격 9px, 반지름 0.85px, 점 불투명도 0.82다. Mapbox 텍스처는 64×64·4회 반복·pixelRatio 16/9를 사용하며 줌에 따른 기존 패턴 스케일 처리를 따른다.
- 윤곽선은 기존 전 등급 합집합의 최외각만 사용한다. 내부 등급 경계·구멍에 새 선을 추가하지 않는다. 밝은 지도와 어두운/위성 지도에 따라 외곽선 대비를 바꾼다.
- 지도는 빨간 0°C 실선·−20°C 파선과 라벨을 고정 표시한다. 두 면을 모두 꺼도 부모 보기·등온선·고도 레일은 유지한다. 부모 OFF·전체 끄기·바람/난류/운정 전환 시 halo·라벨까지 숨긴다. 모두 false인 마지막 자식 선택도 복원한다.
- 지도 등온선 버튼·−10°C 옵션은 없다. 단면의 등온선 켬/끔·−10°C detail은 기존대로 유지한다.
- 실제 하단 범례는 착빙 색 면·흰 점과 LGT/MOD/SEV, 빨간 실선/파선을 함께 표시한다. 지도 현상 버튼에는 자료 상태와 지원층 밖을 연결하고, T 자료 실패는 기존 자료 시각 카드의 note로 연결했다.
- 독립 단면 창·브리핑 인라인/확대·AI 보관 결과·기관 발표 단면이 같은 A 정의를 사용한다. 실제 착빙/난류 셀 교차 시 `난류 보기`로 구름·착빙 면을 숨기고 `이전 표시로` 돌아간다. 이전 면 선택을 복원하면서 다른 토글 선택은 유지한다. 브리핑과 기관 발표의 일반/확대는 같은 소유 상태를 사용한다.
- 기관 pinned 지도에는 기존 패널 자리의 `기상표시`를 연결하고 바람/구름·착빙/난류 세 항목만 제공한다. 고정 변수별 revision 조회를 유지한다. pinned 범례를 숨기던 CSS를 제거하고 `showControls=false`는 모든 관련 조작을 숨긴다. 연결 항목 정보 카드는 실제 범례 높이에 따라 위로 이동한다.

## 변경 코드의 역할

| 파일 | 역할 |
| --- | --- |
| `shared/weather/cloudIcingPresentation.js` | 제품 공통 등급 면색·흰 점·지도 온도색·범례 CSS 정의 |
| `weather-overlays/lib/icingPatternOverlay.js` | 불투명 RGBA 패턴, A image ID, 기존 paint 갱신, 배경별 윤곽선·style 재설치·cleanup |
| `weather-overlays/lib/temperatureContourOverlay.js` | 지도 0/−20만 생성하고 선·라벨을 빨간색으로 동기화 |
| `weather-overlays/CloudIcingMapControls.jsx`·CSS | 기존 dock의 두 버튼·44px 터치 영역·선택/지원층/자료 상태 |
| `weather-overlays/CloudIcingLegend.jsx`·CSS, `WeatherLegends.jsx` | 실제 하단 지도 범례와 단면 범례의 A 표현·온도 문맥 구분 |
| `weather-overlays/lib/metLayerVisibility.js`, `useNwpOverlays.js`, `cloudIcingModel.js` | 독립 부모 상태, legacy 정규화, false 선택 복원, 같은 KIM 자료 선택과 정렬 |
| `route-briefing/VerticalProfileChart.jsx`, `lib/cloudIcingProfile.js` | SVG A 표현과 원래 셀/윤곽, chart와 안내가 같은 난류 셀을 사용 |
| `route-briefing/lib/crossSectionLayerState.js`, `crossSectionLayers.jsx` | 난류 임시 보기·복원·실제 중첩 안내 |
| `VerticalProfileWindow.jsx`, `BriefingView.jsx`, `OrganizationPresentation.jsx` | 각 진입 화면에 공통 조작을 연결하고 일반/확대 상태 공유 |
| `organization-lounge/OrganizationMap.jsx`·CSS, `map/MapView.jsx` | pinned 패널·자료 선택·범례 조작·높이 연계, feature gate의 숨김 sync |

파일 경로는 `frontend/src/features/` 기준이며 shared 항목은 `frontend/src/` 기준이다. 검색·AI ID/별칭, 단면 시간·고도·waypoint 보정 소유권, 지점 조회 샘플러는 기존 구조를 유지한다.

## 검증

- `npm run check` 통과: backend 1,456, frontend 1,803 테스트, shared·개발/설치·배포 offline 검사 및 build. 마지막 기관 CSS/범례 높이 보완 후 frontend 1,803 테스트와 build도 통과했다. 기존 중복 key·대형 bundle 경고는 남아 있다.
- 실제 KIM `2026091006`, F+6/F+9의 600/500/450hPa에서 착빙 면/외곽 GeoJSON과 기본 등온선 경로를 작업 전 백업과 비교해 일치했다. RKSI→RKPC 21층의 구름/착빙 셀·최외각도 일치한다. 500hPa F+6의 NONE/LGT/MOD/SEV 격자 수는 31,314/3,196/134/1이다.
- Mapbox image의 불투명 픽셀·흰 점·전 등급 동일 논리 간격, 이미 설치된 layer paint 갱신, detail source 제거, reload/cleanup을 검사했다.
- 제품 Mapbox·SVG 저장 자료 검사: 면/최외각 함께 숨김, F6/F9, 250hPa 지원층 밖, style 교체, 확대·축소, 390px, 늦은 응답·부분 실패, pinned 정확한 revision·T 누락·live 대체 없음 통과.
- 실제 App/MapView 파일 기반 실행: 1440×1000, 1180×820, 1024×768, 390×844에서 패널·범례·두 버튼·레일·시간 축을 확인했다. 두 면 OFF 후 부모/전체 끄기/바람/운정/난류 복귀, temp enable 멱등, 빨간 0/−20 선·라벨을 확인했다.
- 실제 소비자 컴포넌트: bottom/side/mobile-full 단면, 브리핑 인라인/모바일 확대의 상태 공유, AI 보관 결과의 재조회 없는 단면, 기관 일반/확대 단면 및 pinned 지도 세 항목·revision을 검사했다. JS/console/외부 요청/실패 요청 모두 0이다.
- A/B–F 비교 mockup 소비자도 갱신했다. A만 제품 정의를 읽고 B–F는 로컬 과거 스타일을 유지한다.

검증 기록은 `artifacts/cloud-icing-production/`의 `check.log`, `frontend-final.log`, `build-final.log`, `verification.json`, `data-invariance.json`과 캡처에 있다. 파일 기반 HTML은 서버 OFF 지시를 유지하기 위한 **제품 코드 실행용 검증 산출물**이며 제품에서 import하지 않는다. 검증 때문에 색/상태 로직을 가상 변환하지 않았다.

**확인 범위의 한계:** 온라인 Mapbox Standard·위성, 실제 iPad/휴대전화, DPR 2의 별도 시각 확인, 실제 서버에서 지도 선/고도 비교의 전체 사용자 진입과 실시간 자료 수집은 실행하지 않았다. 저장 실자료와 별도로 난류 중첩에는 명시적인 GKTG 시험 밴드를 사용했고, 브리핑/기관 검증 지형은 평탄 fixture다. 기관 실시간 지도는 `showControls=false` 경로를 확인했으며 고정 지도는 일반/확대의 자료·버튼·범례를 확인했다. AWS 반영 여부는 이번 결과에 포함하지 않는다.
