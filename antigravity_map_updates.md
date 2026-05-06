# Antigravity 맵 스타일 및 레이어 렌더링 수정 작업 로그

이 문서는 Antigravity와 사용자가 협업하여 Mapbox GL JS 기반의 맵 컴포넌트(`MapView.jsx`)와 Aviation WFS 레이어 렌더링 스타일을 개선한 작업 내역을 정리한 것입니다. Claude는 이 문서를 참고하여 현재 프론트엔드의 맵 렌더링 아키텍처와 스타일링 상태를 파악하시기 바랍니다.

## 1. 공항 마커와 WFS 공항 레이어의 라벨 겹침(중복) 문제 해결
- **문제점**: 날씨 정보 등을 표시하기 위한 동적 공항 마커 레이어(`kma-weather-airports-label`)와 정적 WFS 공항 레이어(`aviation-airports-label`)가 동시에 렌더링되면서 ICAO 라벨이 겹쳐서 표시됨.
- **수정 내역 (`frontend/src/components/Map/MapView.jsx`)**:
  - `airportGeoJSON` (마커 데이터)이 업데이트될 때마다, 현재 활성화된 마커의 ICAO 코드를 추출.
  - `map.setFilter`를 사용하여 `aviation-airports-label` 레이어에 필터(`['!', ['in', ['get', 'icao'], ['literal', icaos]]]`)를 동적으로 적용하여, 마커가 존재하는 공항은 WFS 기본 라벨이 렌더링되지 않도록 차단함.

## 2. 공항 마커 라벨 간격 조정
- **수정 내역 (`frontend/src/components/Map/MapView.jsx`)**:
  - `AIRPORT_LABEL_LAYER`의 레이아웃 속성 중 `text-offset`을 기존 `[0, 1.35]`에서 `[0, 0.8]`로 축소.
  - 이를 통해 원형 심볼과 텍스트 사이의 간격을 줄여 보다 일체감 있고 깔끔한 UI 구성.

## 3. 라벨 마스크 레이어(두꺼운 배경 타일) 일괄 제거 및 아웃라인 통합
- **문제점**: `waypoint`, `navaid`, `airport` 등의 Point 심볼 라벨 아래에 시인성을 위해 별도의 마스크 레이어(`addPointLabelMaskLayer`)가 추가되어 뭉뚝하고 두꺼운 배경이 그려지고 있었음.
- **수정 내역 (`frontend/src/layers/aviation/addAviationWfsLayers.js`)**:
  - 불필요하게 텍스트를 중복 렌더링하던 `addPointLabelMaskLayer` 함수와 관련된 모든 호출을 삭제.
  - 대신 기본 텍스트를 그리는 `addPointLabelLayer`의 `paint` 속성에 공항 마커와 동일한 얇은 테두리 효과(`'text-halo-color': '#ffffff'`, `'text-halo-width': 1.5`)를 일괄 적용하여 세련된 디자인으로 통일함.

## 4. SVG 심볼 맞춤형 실루엣 아웃라인(마스크) 직접 적용 및 겹침 문제 완벽 해결
- **문제점 1**: 사용자는 특정 웨이포인트(KARBU)의 실루엣에만 테두리를 넣거나, 테두리와 함께 속을 하얗게 채우는(EGOBA) 마스크 효과를 원했음.
- **문제점 2**: Mapbox 상에서 NAVAID, 일반 Waypoint 등 짙은 색상의 기호가 검은색 항로 선(Route)과 겹칠 때, 항로 선이 기호를 덮거나 관통하여 가독성을 크게 훼손함. (Mapbox 슬롯/렌더링 순서 한계)
- **수정 내역 (SVG 파일 원본 수정)**:
  - `waypoint-rnav-flyby.svg`, `waypoint-rnav-flyover.svg`, `waypoint-conventional-flyby.svg`, `waypoint-conventional-flyover.svg`, `navaid-vortac.svg`, `navaid-vor-dme.svg`, `navaid-tacan.svg` 파일들 내부에 `<g id="...-bg">` 레이어를 주입함.
  - 기호의 형상을 따라 `stroke="#ffffff" stroke-width="4"` 및 속 채우기(`fill="#ffffff"`)를 적용하여 완벽한 백그라운드 실루엣 블록을 생성, 항로 선을 물리적으로 가리게 처리.
  - 특히 일반 Fly-by 웨이포인트는 사용자 요청에 따라 세모 안쪽의 빈 공간까지 하얀색으로 꽉 채움.

## 5. SVG 테두리 잘림(Clipping) 방지 처리 (여백 확보)
- **문제점**: 4번 작업에서 SVG 기호 외부에 두꺼운 테두리(stroke)를 추가하자, 기존 SVG 도화지(`viewBox`) 가장자리 밖으로 삐져나간 선명한 테두리(특히 밑변)가 잘려나가는 현상 발생.
- **수정 내역 (SVG 파일 원본 수정)**:
  - 수정한 5개의 SVG 파일들에 대해 `width`, `height`, `viewBox`의 상하좌우 크기를 넉넉하게 확장하고, 내부 기호 렌더링 `transform matrix`의 X/Y 좌표를 옮겨 충분한 캔버스 여백(Padding)을 확보함.

## 6. 기호 크기 조정 (일반 Waypoint)
- **수정 내역**: 일반 웨이포인트 기호(`waypoint-conventional-flyby/flyover`)가 너무 작게 보인다는 피드백 반영.
- `viewBox` 비율은 유지한 채, `<svg>` 태그의 `width`와 `height` 속성만 20% 곱하여 크기를 상향 적용함. (Mapbox 내부 아이콘 사이즈 로직 건드림 없이 안전하게 크기 확대)

## 7. Mapbox 강제 원형 마스크(`pointMaskLayerId`) 제거
- **수정 내역 (`frontend/src/layers/aviation/addAviationWfsLayers.js`)**:
  - 기존에 항로 선이 아이콘을 관통하는 것을 막기 위해 `circle` 레이어로 동그란 색종이를 밑에 깔아두던 `addPointMaskLayer` 로직 삭제. 커스텀 화이트 아웃라인(4번 작업)이 차폐막을 온전히 대체함.

## 8. Sector 라벨의 불필요한 배경 타일(Halo) 제거
- **문제점**: Sector 라벨 텍스트 주변에 불필요하게 커다란 네모 배경 블록이 렌더링됨.
- **수정 내역 (`frontend/src/layers/aviation/addAviationWfsLayers.js`)**:
  - `addSectorLabelLayer`에 설정되어 있던 `'text-halo-width': 4` 속성이 글자 간격을 모두 메워 사각형 배경처럼 보이게 만든 원인임을 파악.
  - 이를 다른 라벨들과 동일하게 `'text-halo-width': 1.5`, `'text-halo-color': '#ffffff'`로 변경하여 깔끔한 윤곽선 스타일로 수정함.

## 9. 실사용 SVG 심볼 파일 폴더 정리 및 참조 경로 정규화
- **문제점**: `public/Symbols` 하위에 수많은 ICAO/App 참조 심볼 폴더가 난잡하게 섞여 있어 실사용 기호 관리가 어려웠음.
- **수정 내역**:
  - `public/Symbols/Reference Symbols/` 폴더를 신규 생성하여 기존 모든 참조용 이미지 폴더들을 이동시킴 (원본 보존).
  - 현재 실제 서비스 중인 핵심 기호 10개 파일만 추출하여 `public/Symbols/` 최상단으로 복사함.
  - 공항 아이콘의 불분명했던 파일명 변경 (`84.svg` -> `airport-civil.svg`, `86.svg` -> `airport-military.svg`, `88.svg` -> `airport-joint.svg`).
  - `frontend/src/layers/aviation/aviationWfsLayers.js` 의 모든 이미지 참조 경로(`url`)를 1 뎁스의 깔끔한 경로(`/Symbols/xxx.svg`)로 일괄 변경.
