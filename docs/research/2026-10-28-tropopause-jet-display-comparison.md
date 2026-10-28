# 권계면·제트 로컬 표시 비교

추가 사용자 검토: 짧은 축의 강풍 중심을 검은 점·풍속·FL로 표시하던 기능은 제거했다. 기본 지도와 비교 화면 모두 대표 제트 축만 표시한다. 아래 강풍 중심 수는 자료 분석 기록이며 지도 표시 수가 아니다.

사용자 요청에 따라 운영에 게시된 KIM 결과를 내려받아 기존 표시와 제안 표시를 같은 지도 범위에서 비교했다. 사용자 검토 후 2026-10-28 제안 표시를 기본 지도에 채택했다. 운영 수집·계산과 원 격자는 변경하지 않는다.

## 실행

```bash
node scripts/capture-tropopause-comparison.mjs
npm run dev --prefix frontend -- --host 0.0.0.0 --port 5173 --strictPort
```

주소: `http://localhost:5173/concepts/tropopause-jet-comparison`.

다운로드 스크립트는 이미 게시된 `/api/kim/tropopause/index`와 `/field`만 읽는다. 계산·수집을 시작하지 않는다. 사본은 무시되는 `artifacts/tropopause-comparison/data/`에 저장하며, 시각·영역·revision·수신시각·출처 URL·SHA-256을 `index.json`에 기록한다. Vite 개발 미들웨어만 이 사본을 제공한다. 운영 빌드에는 비교 화면 진입점과 사본 제공 경로가 없다.

이번 비교는 동아시아 영역 `ea`, `2026102800` 회차 F000/F006/F010/F012를 사용했다. 첨부 화면과 같은 F010은 2026-10-28 19:00 KST 유효 자료다. 동일 자료를 다시 선택하려면 보관한 인덱스 파일을 다운로드 스크립트의 인자로 전달한다.

## 비교안

- 권계면 경계: 기존 FL300/340/380/420/450 → FL250/300/350/400/450. 색상과 등고선·범례는 같은 경계를 사용한다. FL450 표시 상한과 원자료 지점 값은 유지한다.
- 제트: 기존 품질 검사 통과 여부 외에 최소 표본 수와 축 길이를 확인한다. 500km 이상 축, 또는 300~500km이면서 최대풍 120kt 이상인 축을 후보로 남긴다.
- 연결: 끝점 100km 이내, 방향 25° 이내, 최대풍 고도 차 FL30 이내이며 연결 구간이 80kt 이상인 경우에만 시도한다. 흐름 방향을 거슬러 연결하지 않는다.
- 중복: 같은 고도의 같은 방향 축이 75km 이내에서 길이 표본의 70% 이상 겹치면 긴 대표 축을 남긴다.
- 짧은 축에 있는 120kt 이상 중심은 원 격자에서 확인한 뒤 보존한다. 주축·다른 중심과 같은 고도로 75km 이내인 중복은 줄인다. 확대 수준 4.5부터 작은 점과 풍속·FL을 표시한다.
- 기호: 강한 제트부터 바람깃·FL의 화면 공간을 예약한다. 표식 전체가 겹치면 생략한다. 숨긴 축을 얇은 점선으로 확인할 수 있다.

이 수치는 초기 시각화 비교용 튜닝값이며 공식 제트 판별 기준이 아니다. 제트의 80kt 기준과 운영 원 격자는 바꾸지 않았다. 기존 표시의 데이터 품질 한계와 제트 추적 자체의 오류를 보정하는 재계산은 이번 범위 밖이다.

## 운영 자료에서의 선택 결과

| 예보시각 | 기존 표시 축 | 제안 축 | 별도 보존 강풍 중심 | 축 연결 |
| --- | ---: | ---: | ---: | ---: |
| F000 / 09:00 KST | 6 | 2 | 1 | 0 |
| F006 / 15:00 KST | 8 | 2 | 0 | 0 |
| F010 / 19:00 KST | 16 | 2 | 6 | 0 |
| F012 / 21:00 KST | 19 | 4 | 7 | 0 |

강풍 중심 수는 후보 수다. 실제 화면에는 확대 수준·화면 범위·충돌 검사에 따라 일부만 표시한다. 이번 네 시각에는 연결 조건을 만족한 축이 없었다. 연결 로직은 별도의 합성 사례에서 확인했다.

## 검증과 캡처

```bash
node --test frontend/src/features/weather-overlays/lib/jetAxisSelection.test.js frontend/src/features/weather-overlays/lib/tropopauseJetModel.test.js
node frontend/scripts/tropopause-comparison-capture.mjs
node frontend/scripts/tropopause-main-capture.mjs
```

브라우저 스크립트는 네 시각 전환, 카메라 동기화, 표시 옵션 분리, 큰 보기와 숨긴 축 확인을 검사한다. 날씨 필드는 로컬 사본만 요청하는지도 확인한다. 캡처는 `artifacts/tropopause-comparison/screenshots/`, 결과는 `browser-verification.json`에 저장한다.

일반 지도에서도 같은 모델을 사용한다. `tropopause-main-capture.mjs`는 저장한 운영 필드를 일반 지도 API에 주입해 레이어 켜기·끄기, 확대 시 중심 표시, 두 번의 기본지도 변경, 캔버스 중복과 소스 정리까지 확인한다. 비교 화면의 왼쪽은 채택 전 기준을 고정해 두어 이후에도 차이를 볼 수 있다.

이번 네 시각은 한 회차의 시각화 검증 범위다. 다른 회차·계절의 짧은 독립 제트와 분기·합류 사례는 지속적으로 점검한다.

참고: [WAFC SIGWX 해석 지침 §3.9](https://www.icao.int/sites/default/files/WACAF/MeetingDocs/2025/New%20SADIS%20API/SIGWX-interpretation-Guide-V2.01.pdf#page=13)의 권계면 등고선 간격은 5,000ft다.
