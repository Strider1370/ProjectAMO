# 포항 AIP 터미널 절차 파일럿 계획

1. 공식 PDF의 렌더링 표를 독립 대조해 RKTH SID 10개, STAR 6개, 연결 IAP 2개의 waypoint·좌표·제한값을 전사한다.
2. 기존 공항별 JSON 형식으로 `rkth-sid-procedures.json`, `rkth-star-procedures.json`, `rkth-representative-iap-routes.json`을 추가한다.
3. `procedureData.js`에 RKTH SID·STAR 파일과 공항 식별자만 등록한다. 기존 로더·렌더러는 수정하지 않는다.
4. JSON 구조·SID/STAR/IAP 연결·경로의 연속성을 검사하는 작은 회귀 테스트를 추가한다.
5. 기존 테스트와 빌드를 실행하고, 개발 서버의 경로 확인창에서 RKTH IFR 경로를 선택해 지도 표시를 Playwright로 검증한다.

중단 조건: 표의 좌표·경로·발행본이 서로 맞지 않거나 en-route 연결 FIX가 현재 NAVDATA에 없으면 데이터를 추정해 넣지 않고 검토 대상으로 남긴다.
