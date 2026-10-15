# 공통 연직단면도 UI

`VerticalProfileViewer`가 차트·레이어 선택·범례·탐색을 소유한다. 시안은 같은 운영 컴포넌트를 재사용하며, 운영 코드에서 합성 자료를 참조하지 않는다.

- `VerticalProfileWindow`: 지도 경로·지도에 그린 선·챗봇 보관 결과의 이동/크기 조절 창. 휠로 확대한다.
- `embedded`: 브리핑·조직 발표 안에 삽입한다. 페이지 휠 스크롤을 유지하고 버튼 확대/드래그를 사용한다. `fillContainer`는 발표 및 전체화면처럼 부모 높이를 채울 때만 사용한다.
- `layers`/`onToggleLayer`: 패널과 확대 화면이 레이어 상태를 공유한다. 난류·권계면·등풍속선은 기본 켜짐. 조직의 모델 구름량 기본값은 유지한다.
- `onSelectCandidateAltitude`, `onSelectForecastHour`, `onSetWaypointNwpOffset`이 없는 보관/발표 화면에는 해당 편집 UI가 없다. 표시 레이어·탐색은 허용한다.
- `highlightRangeNm`: NAVLOG 구간 강조. `linkedItems`/`activeLinkedItemId`/`onSelectLinkedItem`: 발표 자료 연결.
- `referenceAltitudeFt`는 선택 고도/비행계획 고도로 보완한다. 지형 단면에는 경로를 생성하지 않는다.
- 지형자료 부족은 `allowMissingTerrain`을 명시한 지도 선·발표 화면에서만 허용한다. 결측/오류를 정상으로 대체하지 않는다.
- `statusMessage`는 재시도 콜백 유무와 관계없이 표시한다. `sourceNote`는 자료 설명에 사용한다. 기존 계산 기준·모델 구름량 상태·KTG 적용시각은 차트 메타 정보에 유지한다.
- 고도는 ft. 마우스 안내선과 터치 탭은 축의 위치 값만 표시하며 기상 값을 추정하지 않는다.
- 웨이포인트는 실제 글자 폭으로 간격 조절한다. 이름을 선택한 뒤 좌우/Home/End 키로 생략된 지점까지 접근한다. 별도 지점 선택 목록은 없다.

검증: `node frontend/scripts/verify-shared-profile.mjs`, `node frontend/scripts/verify-operational-profile.mjs`. 브라우저 계약은 `briefing-view`, `route-workflow`의 단면도 사례를 사용한다. 구성별 검증은 실제 조직 계정/챗봇 생성 전체 흐름 검증을 대신하지 않는다.

성능: 구름·난류 셀은 거리/고도 좌표의 SVG 경로를 캐시하고 확대·리사이즈 시 좌표 변환만 갱신한다. 같은 행에서 겹치지 않는 동일 색 셀만 묶어 결측 공백·좁은 강도 구간·겹침의 투명도를 보존한다. 착빙은 화면 좌표에서 묶어 점무늬 크기를 유지한다. 등온선 격자 계산과 권계면/등풍속선 원본 도형은 자료 변경 시 재계산하며, 라벨 충돌 판정은 화면 크기에 맞춰 갱신한다. 휠·창 드래그 입력은 requestAnimationFrame으로 합치고 포인터 해제 시 마지막 창 위치를 반영한다.

고도 비교: 제공된 후보 경로를 기본으로 모두 표시한다. 선택 경로는 파란 실선과 흰색 테두리로 마지막에 그려 겹침에도 식별되게 한다. 비교 고도 행은 모든 후보를 ft로 펼쳐 표시하며, 편집 콜백이 있는 화면에서만 버튼으로 선택한다. 보관/발표 화면에서는 같은 행을 읽기 전용으로 보여 준다. 드롭다운 및 별도의 비교 경로 표시 토글은 사용하지 않는다.
