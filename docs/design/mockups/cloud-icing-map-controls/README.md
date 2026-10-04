# 지도 위 구름·착빙 조작 비교

제품에 적용하기 전 UI 시안. 기존 저장 KIM A안 HTML의 실제 지도를 그대로 읽어 A(한 줄 버튼), B(접힌 버튼), C(고도 레일 옆 세로 버튼)를 비교한다. 체크박스·패널 내 추가 설정 상자는 없다.

`node docs/design/mockups/cloud-icing-map-controls/build.mjs`로 `../cloud-icing-map-controls.html`을 생성한다. 저장 KIM A안 HTML이 먼저 존재해야 한다. 제품 서버·기상청 API를 호출하지 않으며 HTTP 요청을 차단한다.

구름·착빙 토글, 등온선 숨김/0·−20/0·−10·−20 메뉴, 부모 끄기/선택 복원, 저장 기압층과 예보 이동, 크게 보기, 모바일 배치를 비교할 수 있다. 각 안의 상태는 독립적이다. 기상 수치·경계는 원래 시안에서 가져오며 지도 이동·확대는 구현하지 않았다. 고도·시각 카드와 레일·범례는 위치 검토용 모형으로 실제 제품 컴포넌트가 아니다.

출처: [Mapbox의 지도 위 레이어 켬/끔](https://docs.mapbox.com/mapbox-gl-js/example/toggle-layers/), [Google Maps의 상단 지도 조작 버튼](https://developers.google.com/maps/documentation/javascript/examples/control-custom). 세 배치와 등온선 메뉴의 결합은 ProjectAMO에 맞춘 제안이며 해당 제품의 복제 화면이 아니다.
