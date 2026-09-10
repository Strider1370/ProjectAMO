# NOTAM Integration Design

> **UI 목업**: [`refs/2026-07-03-notam-ui-mockup.html`](refs/2026-07-03-notam-ui-mockup.html) (브라우저로 열기). 세 표면(전역 패널·공항탭·브리핑 경로상 NOTAM). 색=시간상태, 카테고리=아이콘.

## Purpose

대한민국 유효 항공고시보(NOTAM)를 백엔드에서 주기적으로 수집해, (1) 공항 패널의 NOTAM 탭에서 공항별로, (2) 지도 위에 카테고리별 레이어로 표시한다.

## Scope

- 백엔드: KML 크롤러 → 파서 → 프로세서 → store → API
- 프론트엔드: 사이드바 전역 NOTAM 패널(카테고리 토글 + 지도 레이어), 공항 패널 NOTAM 탭(공항별 목록)
- 비행 전 브리핑(route-briefing) 연동: `matchItems` 매칭 코어로 경로상 NOTAM을 뽑아 ③노선에 **사실 나열**하고, 그중 **공역 제한 계열이 발효 중 경로에 걸리면(=경로 저촉) Go/No-go 배너에 사실 반영**(NOTAM 간 위험 순위는 안 매김) + 지도 레이어 칩 제공. 상세는 아래 Route-Briefing Integration.

## Anti-Scope

- NOTAM 이력 저장/DB화(최신본만 유지)
- xls 소스 크롤링(KML만 사용)
- 반경 기반 공항 매칭(A필드 정확 일치만)
- AWS 프로덕션 배포 실증(별도 미해결 리스크로 기록, 이번 스코프 아님)
- SNOWTAM 등 특수 시리즈에 대한 별도 UX(전부 같은 파이프라인으로 수집·분류만 함)
- LineString형 NOTAM(회랑형 임시제한구역)의 브리핑 자동 경로매칭(아래 Route-Briefing Integration의 한계 참조 — 지도/탭 노출은 포함, 매칭만 제외)
- 경로(출발-목적지) 연동 우선순위 정렬(전역 패널에는 "선택 공항" 우선순위만 포함, 경로 연동은 브리핑 섹션 통합으로 대체)

## Verified Facts (2026-07-03 조사)

### 크롤링 소스 확인

- URL: `https://aim.koca.go.kr/xNotam/index.do?type=search2&language=ko_KR`
- 로그인 불필요. 페이지 GET 로드 시 서버가 기본 검색을 이미 실행해서 결과 테이블이 채워져 있음.
- 기본 폼 상태: `sch_inorout` 라디오 = **국내**(checked), 나머지 필터(LOCATION/SERIES/AIRSPACE 등)는 전부 빈칸.
- **"KML다운로드" 버튼**은 `kmldownload()`를 호출 → 현재 검색 컨텍스트에 따라 `/searchValidNotam.do`(유효 검색 화면 기준) 등으로 hidden form을 POST 제출, `target=_blank`로 파일 스트림 다운로드.
- 검색 버튼을 누르지 않고 기본 상태에서 바로 다운로드하는 게 정답. **날짜 필드를 건드리지 않는다**(아래 "크롤 시간창" — 사이트가 24h로 강제하므로 넓히려는 시도는 무의미).

### 크롤 시간창 = 24시간(사이트 강제) + 6시간 주기 크롤 (실측으로 결정, 2026-07-03)

**실측 검증 결과**: KOCA "유효 NOTAM" 검색은 발효종료일자를 넓혀도 `validateAndSearch()`가 **to-date를 from+1day로 조용히 clamp**한다(+2/+3/+7일 모두 시도 → 필드가 항상 익일로 리셋, 다운로드 B-max가 항상 익일). **7일 창은 이 폼으로 불가능.** 당초 7일 창 설계는 폐기.

대신 사이트 기본 24h 창을 그대로 쓰고, **크롤 주기를 6시간으로** 한다. KOCA 검색은 [now, now+24h]와 겹치는 NOTAM을 반환하므로 매 크롤이 "현재 활성 전부 + 향후 24h 내 발효 예정"을 담는다(실측: min B-date 2월 21일=장기 활성, max B-date 익일=24h내 예정). 6시간마다 크롤하면 전방 가시성이 항상 ≥18시간이라 임박 NOTAM 누락이 없다.

부수 효과: 크롤러가 **더 단순·견고**해짐 — 날짜 필드를 건드리지 않고 기본 상태에서 바로 KML다운로드만 클릭(폼 validation과 싸우지 않음).

**시간상태 전이는 크롤과 무관하게 프론트에서 실시간**: `deriveTimeState`가 저장된 B/C를 렌더 시점 live now와 비교하므로, 예정→곧발효→발효중 색 전이가 자동으로 흐른다(크롤은 "미래를 얼마나 멀리 아느냐=수평선≈24h"만 정함).

**데이터 수평선 정직 표기(필수)**: 패널에 "향후 24시간 기준 · HH:MM 수집" 같은 수집시각+수평선을 표시해 "이 너머 발효분은 아직 모름"을 명시(notaminfo의 "NOTAMs extracted at …" 관례). 크롤 실패로 stale하면 수집시각이 오래된 것으로 드러난다.

### 화면 테이블과 다운로드 파일의 차이 (중요, 실측 검증됨)

- 화면 결과 테이블(`#notamSheet-table`)은 **ISSUE TIME(발행일) 기준 최근 며칠치만** 보여줌(실측: 07-01~07-03, 103건).
- **KML 다운로드는 발행일과 무관하게 "현재 유효한" 전체 집합**을 반환함(실측: 414건, B)필드 발효시작일이 2026-02-21까지 소급되는 장기 유효 NOTAM 포함).
- 따라서 크롤러는 화면 테이블이 아니라 **KML 다운로드 결과를 기준 데이터**로 삼는다. 화면 행 수와 다운로드 건수가 다른 것은 버그가 아니라 정상 동작.
- 국내 공항 코드(`A)RK**`)만 나오는 것 확인, 국제 유출 없음.

### 헤드리스 크롤링 가능성 (실측 검증됨)

- 로컬 Windows 환경에서 Playwright(`chromium.launch({ headless: true })`, 신규 브라우저 컨텍스트, 쿠키/세션 없음)로 사이트 접속 → `KML다운로드` 텍스트 셀렉터 클릭 → `download` 이벤트로 파일 저장까지 **정상 동작 확인**(931,866 bytes, 로그인 불필요, 캡차/봇 차단 없음, 확인창 없음).
- **미검증(별도 리스크로 기록)**: AWS 프로덕션 EC2(`3.34.113.37`, Amazon Linux, `docs/aws-ec2-manual-deploy.md` 기준)에서도 동일하게 동작하는지는 이번 세션에서 사내망 클라우드 접속 차단으로 검증 못함. 배포 전 별도 확인 필요:
  1. Chromium 시스템 의존성 설치 가능 여부(`playwright install chromium --with-deps`, Amazon Linux 패키지 매니저 호환성)
  2. 아웃바운드 443 방화벽/보안그룹 허용 여부
  3. `aim.koca.go.kr`의 AWS IP 대역 차단 여부(서울 리전이라 가능성은 낮다고 추정하나 미확인)

### Q-code 카테고리 매핑 (FAA/ICAO Appendix B 공식 문서 기준, 실측 대조 완료)

출처: `https://www.faa.gov/air_traffic/publications/atpubs/notam_html/appendix_b.html` (International NOTAM Q Codes, 2nd/3rd letter = subject, 4th/5th letter = status)

실측 414건 기준 2nd/3rd letter(subject) 분포와 공식 의미:

| Subject code | 공식 의미 | 실측 건수(대표 조합) |
|---|---|---|
| RP | Prohibited area | 6 (QRPCA) — **비행금지구역** |
| RD | Danger area | 155 (QRDCA) — 위험구역 |
| RR | Restricted area(상시) | 13 (QRRCA) — 제한구역 |
| RT | Temporary restricted area | 161 (QRTCA) — 일시제한구역 |
| RA | Airspace reservation | 소수 — 공역유보 |
| OB | Obstacle | 8 (QOBCE) — **장애물** |
| PO | Obstacle clearance altitude/height | 소수 — 장애물 관련 |
| WM | Missile/gun/rocket firing | 1 (QWMLW) — 사격/훈련구역 |
| GA/GW/IC/IL/IN/IG/ID/NT/CT/CP/CA | 항행안전시설(GNSS/ILS/VOR/레이더/무선국) | 합계 다수 |
| MR/MX/MP/MD/MB/MA/LX/FA/PI/PF | 공항시설(활주로/유도로/계기접근절차 등) | 합계 다수 |

→ **지도 레이어 카테고리 7개**로 확정: 비행금지구역(RP) / 위험구역(RD) / 제한구역(RR+RT+RA) / 장애물(OB+PO) / 사격·훈련구역(WM) / 항행·공항시설 공지(나머지 시설계열 코드) / 기타(미매핑 폴백)

### 색상 = 시간 상태 (심각도 자체 판단 배제 — 안전/책임 결정)

**우리는 NOTAM의 위험도(심각도)를 판단하지 않는다.** 우리는 NOTAM 생산 주체가 아니고, 법적으로 모든 NOTAM은 "반드시 읽어야 하는 것"이다. 우리가 "이건 red(위험), 이건 amber(덜 위험)"로 순위를 매기면 (a) 우리가 할 자격 없는 안전 판단을 하는 것이고 (b) 파일럿이 우리 amber를 흘려보고 중요한 걸 놓칠 때 책임이 우리에게 온다. 그래서 카테고리→심각도 매핑(구 설계)을 **전면 폐기**한다.

대신 색상은 **시간 활성 상태**만 인코딩한다. 이는 B)/C) 필드를 읽은 **객관적 사실**이지 판단이 아니다. EFB(ForeFlight/Garmin)가 쓰는 시간-활성 색상 관례를 그대로 채택한다:

| 시간 상태 | 조건 | 색 | 라벨 |
|---|---|---|---|
| 발효 중 | B ≤ now ≤ C | red(가장 눈에 띔 — 지금 유효) | "발효 중" |
| 곧 발효 | now < B ≤ now + Nh | amber | "곧 발효" |
| 발효 예정 | now + Nh < B | gray/톤다운 | "예정" |

**핵심**: 이 색은 카테고리와 **무관하게 균일** 적용된다 — 비행금지구역이든 시설공지든, 지금 발효 중이면 둘 다 red다. 즉 "금지구역 > 시설공지"라는 위험 순위를 매기는 게 아니라 "발효 중 > 예정"이라는 시각(시간) 순위만 매긴다(카테고리 간 우열 판단 없음). 범례 라벨을 "발효 중/곧 발효/예정"으로 명시해 시간축임을 분명히 한다. 임계값 N(곧 발효 판정 시간, 예: 2h)은 config 상수로 둔다.

카테고리(비행금지/위험/제한/장애물/사격/시설/기타)는 색이 아니라 **아이콘 + 텍스트 라벨**로만 구분한다(Q-code에서 나온 사실 분류). 카드/행은 무채색, 시간상태 색은 배지·마커에만.

## Architecture

### 데이터 흐름

```
cron(6시간 주기, backend/src/index.js)
  → notam-crawler.js (Playwright: 사이트 접속 → 기본상태 그대로 KML다운로드 클릭 → 메모리 버퍼로 수신, 디스크 파일 저장 없음)
  → notam-parser.js (KML XML → 구조화 레코드: id/series/location(A필드)/qcode/validFrom/validTo/rawText/geometry)
  → notam-processor.js (Q-code → 7개 카테고리 매핑, 공항(A필드)별 그룹 인덱스 사전 계산)
  → store.save('notam', data)  (최신본만, 기존 latest.json 패턴)
  → GET /api/notam  (store.getCached('notam') 그대로 반환)
  → frontend fetchNotam()
       ├─ (A) 사이드바 NotamPanel: 카테고리 필터 + 지도 레이어 토글
       └─ (B) AirportPanel NotamTab: A필드 정확 일치 필터
```

### FIR 광역 스코프 (실측에서 발견된 갭)

실측 414건 중 342건이 `A)RKRR`(공항 코드가 아니라 **인천 FIR** 코드, 대한민국 전역에 적용됨). "공항탭 = A필드 정확 일치"만으로는 이 342건이 **어떤 개별 공항 탭에도 안 뜬다** — 실제로 전역에 영향 주는데도 누락됨.

`notam-processor.js`가 `scope: 'airport' | 'fir'`를 함께 계산:
```js
const KOREA_FIR_CODES = ['RKRR']  // 현재 확인된 것은 이거 하나, 구현 시 재확인
scope = KOREA_FIR_CODES.includes(location) ? 'fir' : 'airport'
```
`scope: 'fir'`인 레코드는 A필드 일치 여부와 무관하게 **모든 공항 탭에 "전역 공지" 섹션**으로 노출. 지도에도 342건을 폴리곤으로 겹쳐 그리면 화면이 붉게 뒤덮이므로, FIR 스코프는 폴리곤 렌더 대상에서 제외하고 리스트(전역 패널/공항탭)에서만 노출한다.

### 시간 상태 계산 (색상의 유일한 축)

크롤이 6시간 주기라 서버가 시간 상태를 박아두면 stale해진다 — **프론트에서 렌더 시점마다 계산**한다(위 "색상 = 시간 상태" 참조).
```js
// frontend/src/features/notam/lib/notamViewModel.js
const SOON_WINDOW_MS = 2 * 60 * 60 * 1000 // config 상수
function deriveTimeState(validFrom, validTo, nowMs) {
  if (nowMs >= validFrom && nowMs <= validTo) return 'active'   // 발효 중 → red
  if (nowMs < validFrom && validFrom - nowMs <= SOON_WINDOW_MS) return 'soon' // 곧 발효 → amber
  return 'upcoming' // 발효 예정 → gray
}
```
이 3상태가 배지·마커 색을 결정한다. 카테고리는 색에 관여하지 않는다.

### 선택 공항 우선순위 (전역 패널)

`App.jsx`의 기존 `selectedAirport` 상태를 `NotamPanel`에 prop으로 넘겨, 해당 공항 A필드 일치 항목을 테이블 최상단에 별도 섹션으로 고정. 새 API 호출 불필요(이미 받은 전체 리스트 재정렬만). 경로(출발-목적지) 연동은 아래 Route-Briefing Integration으로 대체하고, 전역 패널 자체의 경로 인식은 범위 밖.

### 표시 필드 매핑 (원문 → 화면)

| 원문 필드 | 화면 이름 | 노출 위치 |
|---|---|---|
| `Q)`라인 2nd/3rd letter | 카테고리(7종, 사실 분류) | 배지 라벨, 지도 심볼 아이콘 |
| B/C vs now → 시간상태(발효중/곧발효/예정) | 색(red/amber/gray) | 배지 색, 지도 마커 색 — **카테고리 무관 균일** |
| `A)` | 공항 ICAO(또는 `scope:'fir'`면 "전역 공지") | 전역패널 "공항" 열 |
| `B)` / `C)` | 유효 시작/종료 | 유효기간 표시 |
| `E)` | 요약 1줄 | 전역패널 "요약" 열, 공항탭 카드, 지도 팝업 |
| `F)`/`G)`(있으면, 기준면 AGL/AMSL 포함) 또는 Q라인 lower/upper(폴백, FL) | 고도 | 전역패널 "고도" 열, 공항탭 카드 요약 아래 한 줄, 지도 팝업 한 줄 |
| Placemark id(`G3315/26`) | NOTAM 번호 | 공항탭 카드 상단(전역패널은 행 폭 제약으로 생략) |
| 원문 전체(`GG...`~끝) | 원문 | "원문 보기" 펼치기 전용, 손 안 댐 |
| `D)` | (미노출) | 원문 펼치기 안에만 — 형식이 다양해 별도 파싱 안 함 |

**고도 표시 규칙**: 하한 0(SFC)이고 상한이 사실상 무제한(Q라인 999 등)이면 **"전고도"**로 표시. 그 외엔 `SFC–4,000FT`, `4,000–6,000FT AMSL`처럼 실제 범위 그대로. 우리 실측 데이터의 다수(342건 GPS RAIM류)가 `/000/999/`(전고도)라 이 축약이 노이즈를 크게 줄인다. `notamViewModel.js`(전역패널/공항탭 각각)에 `formatAltitude(lower, upper)` 순수함수로 구현.

**AGL vs AMSL 기준면 보존 (안전 필수)**: 고도는 반드시 기준면 라벨을 함께 표시한다 — `500FT AGL`(지표 기준)과 `500FT AMSL`(해수면 기준)은 완전히 다른 의미이고 안전에 직결된다. `F)`/`G)`필드는 `4000FT AMSL` / `1500FT AGL`처럼 기준면을 명시하므로 파서가 값+기준면을 분리 저장하고, 표시할 때 라벨을 절대 생략하지 않는다(NOTAM 차트 규범: 괄호 없음=MSL, 괄호=AGL — 하지만 우리는 원문 F)/G)의 명시 라벨을 그대로 신뢰). Q라인 밴드만 있는 경우(FL 단위)는 `FL040–FL060`으로 표시. 기준면 불명 시에는 임의 추정하지 말고 원문 값을 그대로(라벨 없이) 노출.

### 지도 팝업/겹침 처리

- 마커(점) 다수가 낮은 줌에서 겹치는 경우: Mapbox GeoJSON source `cluster: true`(라이브러리 내장) — 숫자 배지로 뭉치고 확대 시 분리.
- 폴리곤이 같은 지점에서 겹쳐 클릭된 경우: `map.queryRenderedFeatures(point, { layers: NOTAM_LAYER_IDS })`로 클릭 지점의 전체 후보를 가져와 처리.
  - 3건 이하: 팝업 안에 미니 리스트(배지+번호)로 전부 표시, 항목 클릭 시 그것만 펼쳐 요약+고도+원문
  - 4건 이상: 팝업엔 "이 지점에 N건" + 상위 몇 개만, "전체 보기" 링크로 `NotamPanel` 열고 해당 위치로 필터(리스트 스캔은 지도 팝업보다 테이블이 낫다는 §6-P3 근거 원칙 재사용)

### 백엔드 파일

| 파일 | 역할 |
|---|---|
| `backend/src/notam/notam-crawler.js` | Playwright 크롤러(사이트 접속→기본상태 그대로 KML다운로드 클릭→버퍼 수신, 날짜 조작 없음). 수집시각 기록 |
| `backend/src/parsers/notam-parser.js` | KML → 구조화 레코드 배열, Q-line·F)/G)필드에서 고도밴드 파싱 |
| `backend/src/processors/notam-processor.js` | Q-code→카테고리 매핑(사실 분류만), `scope`(airport/fir) 계산, 공항별 그룹 인덱스. **심각도 판단 안 함**(색은 프론트가 시간상태로 계산) |
| `backend/src/index.js` | cron 등록(6시간 주기, 기존 per-type lock 패턴) |
| `backend/src/store.js` | `TYPES`에 `'notam'` 추가(최신본만) |
| `backend/server.js` | `GET /api/notam` 라우트 추가, `POST /api/route-briefing` 핸들러에 `store.getCached('notam')` 주입 |
| `backend/src/briefing/briefing-composer.js` | `matchItems` 매칭 코어로 경로 NOTAM 추출 → `routeNotams`(사실 나열) + `routeConflicts`(공역제한∩발효중∩경로통과) 분리. `routeConflicts` 있으면 배너/요약 레벨 저촉 반영. `scope:'fir'` 제외. SIGMET hazards 그라데이션엔 안 넣음(binary 저촉 플래그) |
| `backend/test/notam-parser.test.js` | 실제 KML 샘플 fixture 기반 파싱 테스트(카테고리·고도 AGL/AMSL·B/C 시각) |
| `backend/test/notam-processor.test.js` | Q-code→카테고리/스코프 매핑 커버리지(확인된 코드 전부 + 미지 코드 폴백). 심각도 계산 없음 |
| `backend/test/briefing-composer.test.js` | 경로 NOTAM 매칭·`scope:'fir'` 제외·시간창 필터·`routeConflicts` 판정(공역제한 계열만·발효중만·경로통과만) + 배너 레벨 반영 케이스 |

### 프론트엔드 파일

| 파일 | 역할 |
|---|---|
| `frontend/src/api/weatherApi.js` | `fetchNotam()` 클라이언트 추가 |
| `frontend/src/app/layout/Sidebar.jsx` | NOTAM 아이콘 복귀 — `topItems`(또는 `bottomItems`) 배열에 아이콘/라벨 항목 추가 **+** `PANEL_MAP`에 `notam` 등록(둘 다 필요, 최초 스펙은 후자만 언급함) |
| `frontend/src/app/layout/MobileMoreMenu.jsx` | 모바일도 동일하게 복귀 |
| `frontend/src/features/notam/NotamPanel.jsx` | (A) 전역 패널: 카테고리 필터 타일 + 밀도형 테이블(`ap-taf-table` 패턴), `selectedAirport` 우선순위 섹션, active-first 정렬, **"향후 24시간 기준 · 수집시각" 수평선 표기**. 심각도 탭 없음(시간상태는 색으로) |
| `frontend/src/features/notam/lib/notamLayers.js` | Mapbox 소스/레이어 설치·동기화·카테고리 필터·시간상태 색, `minzoom` 기반 심볼마커↔폴리곤 전환(`NOTAM_SOURCE_IDS`/`NOTAM_LAYER_IDS` 소유권 export) |
| `frontend/src/features/notam/lib/notamGeoJson.js` | 백엔드 페이로드 → GeoJSON FeatureCollection 변환(카테고리·시간상태 property 포함), `scope: 'fir'` 레코드 제외 |
| `frontend/src/features/notam/lib/notamViewModel.js` | `deriveTimeState`(active/soon/upcoming → 색), `formatAltitude`(AGL/AMSL 보존), active-first 정렬, 청크 로딩("더 보기") |
| `frontend/src/features/notam/lib/notamLayers.test.js` | GeoJSON 변환/카테고리 분리 테스트 |
| `frontend/src/features/airport-panel/tabs/NotamTab.jsx` | (B) 공항별 NOTAM 목록 + `scope: 'fir'` 전역 공지 섹션 |
| `frontend/src/features/airport-panel/lib/notamViewModel.js` | 공항 탭 표시용 가공(배지/유효기간/고도 포맷, NOTAM 번호 표시) |
| `frontend/src/features/airport-panel/AirportPanel.jsx` | 탭 목록에 NOTAM 추가 |
| `frontend/src/features/map/MapView.jsx` | `activePanel === 'notam'` 조건부 렌더 + `useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => syncNotamLayers(map, notamModel), [notamModel])` 한 줄(ADR 0001 seam 재사용, 새 `useEffect` 추가 금지). `notamModel`을 `App.jsx`에서 prop으로 받는 배선 단계 포함(최초 스펙 누락분) |
| `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` | `MET_LAYERS`에 `{ id: 'notam', label: 'NOTAM', color: ... }` 마스터 토글 등록(위 "레이어 가시성 모델" 참조) |
| `frontend/src/features/route-briefing/lib/hazardLayers.js` | RULEBOOK에 NOTAM 카테고리→`notam` 레이어 매핑 추가 |
| `frontend/src/features/route-briefing/BriefingView.jsx` | ③노선 아래 "경로상 NOTAM" 사실 나열 서브섹션 + `routeConflicts` 상단 강조 |
| `frontend/src/features/route-briefing/BriefingBanner.jsx` | `routeConflicts` 있으면 "경로 저촉" 사유 배너 노출(사실 고지, 명령 아님) |

### 지도 렌더링

- Polygon → 반투명 fill + outline, LineString → line, Point-only(폴리곤 없는 경우, 예: GPS RAIM) → 심볼 아이콘 마커
- 색 = 시간상태 3색(발효중 red / 곧발효 amber / 예정 gray), 카테고리 무관 균일. 카테고리는 심볼 아이콘으로 구분(글자핀 아님 — 앱 기존 SIGWX 심볼 체계와 결 맞춤, 구체 심볼은 구현 단계 확정)
- **색맹 대비(필수, 아래 접근성 요구 참조)**: 지도 마커의 시간상태는 색만이 아니라 **형태로도** 구분 — 발효중=채운 마커(●) / 곧발효=반채움(◐) / 예정=외곽선만(○). 리스트 배지는 색+형태 글리프+텍스트 3중.
- 클릭 시 팝업: 카테고리+시간상태+요약+고도(AGL/AMSL)+원문 접기(SIGMET 팝업 패턴 재사용)
- `scope: 'fir'` 레코드는 폴리곤 렌더 대상에서 제외(위 FIR 광역 스코프 참조) — 342건을 다 그리면 화면이 뒤덮임
- 줌 레벨 전환: 낮은 줌(전국)에서는 카테고리 아이콘 마커만, 확대(줌 9+)하면 실제 폴리곤/라인 노출. Mapbox 레이어 정의에 `minzoom`/`maxzoom`만 추가(플랜 단계에서 스파이크로 검증 — 이 코드베이스에 동일 소스 내 마커↔폴리곤 이중 레이어 줌 전환 선례는 없음).

### 레이어 가시성 모델 (리뷰로 발견된 수정 사항)

당초 "7개 카테고리 각각 개별 토글"로 설계했으나, `hazardLayers.js`(브리핑 "지도에 관련 레이어 보기" 칩)가 토글 가능한 대상은 `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`의 `MET_LAYERS` 배열에 등록된 id뿐이고(`hazardLayers.test.js`가 강제), `MET_LAYERS`는 레이어당 on/off **하나**만 표현한다(`metVisibility.<id>`). 7개를 각각 별도 레이어로 등록하면 이 구조와 안 맞는다.

**수정된 모델**: NOTAM을 `MET_LAYERS`에 `{ id: 'notam', label: 'NOTAM', color: ... }` **마스터 토글 하나**로 등록(레이더/SIGMET과 동일 패턴). `NotamPanel`의 7개 카테고리 타일은 별도의 로컬 카테고리 필터 상태(어떤 카테고리를 보여줄지)로, `notamLayers.js`의 Mapbox `filter` 표현식에 적용 — 마스터가 꺼지면 전부 안 보이고, 마스터가 켜진 상태에서 타일로 세부 필터링. 이러면 브리핑 칩("NOTAM 레이어 보기")도 다른 위험기상 레이어와 동일하게 자연스럽게 작동한다. 카테고리 필터 상태를 어느 파일에 둘지(로컬 훅 vs `App.jsx` 리프트업)는 구현 계획 단계에서 확정.

## Route-Briefing Integration

**설계 원칙(사실 기반 반영 — 위험도 순위와 구분)**: NOTAM 간 주관적 위험 순위("금지가 장애물보다 위험")는 여전히 안 매긴다. 그러나 **Go/No-go에 객관적으로 영향을 주는 NOTAM은 배너에 반영한다** — NOTAM 데이터를 다루는 목적 자체가 그것이다. 여기서 반영 근거는 우리 의견이 아니라 두 사실의 결합이다: (a) 카테고리가 ICAO 정의상 **공역 제한 계열**(규정상 진입 제한/금지 공역) + (b) `matchItems`가 계산한 **경로∩시간∩고도 통과**(기하·시간 사실). "발효 중 비행금지구역을 경로가 지난다"는 우리 판단이 아니라 법적 사실이다.

**경로 저촉(routeConflict) 판정 = 3조건 AND (사실, 등급 아님)**:
1. 카테고리가 공역 제한 계열: 비행금지(RP) · 제한(RR/RT/RA) · 위험(RD) · 사격(WM). (장애물·항행/공항시설·기타는 제외 — 경로를 막지 않는 정보성)
2. 발효 중(비행 시간창 ETD~ETA와 겹침 — 예정/종료는 저촉 아님)
3. 경로가 해당 폴리곤을 계획고도에서 통과(`matchItems` 매칭)

세 조건을 다 만족 → 배너에 **경로 저촉 요인**으로 반영 + 사실 이유 명시("경로가 발효 중 비행금지구역 P0002 통과 — 확인 필요"). NOTAM 간 차등 없음(금지든 제한이든 모두 동일한 "경로 저촉" 취급 — 순위 안 매김). 배너 문구는 **사실 고지("통과 — 확인")이지 명령("비행 불가")이 아님** — 최종 go/no-go는 파일럿.

**재사용하는 것 / 하지 않는 것**:
- 재사용: `matchItems`의 경로∩시간∩고도 기하 매칭(순수 사실 계산)
- 재사용 안 함: `hazardLevel()`의 SIGMET/AIRMET **심각도 그라데이션**. NOTAM 경로 저촉은 그 그라데이션이 아니라 **binary 저촉 플래그**로 배너에 들어간다(등급 매기기 방지).

**연동 지점**:

1. `backend/src/briefing/briefing-composer.js` — `matchItems` 매칭 코어로 경로 매칭 NOTAM 전체를 `routeNotams`로 뽑고, 그중 위 3조건을 만족하는 것을 `routeConflicts`로 분리. `routeConflicts`가 비어있지 않으면 배너/요약 레벨을 저촉 상태로 올림(이유: 저촉 NOTAM 목록). `scope: 'fir'`(전국)는 경로 매칭에서 제외(전국 폴리곤은 어떤 경로든 무의미하게 매칭 — 사실적 제외). `routeNotams` 정렬은 발효 중 먼저 + 경로 진입거리순.
2. `backend/server.js` — `POST /api/route-briefing` 핸들러가 `store.getCached('notam')`도 읽어 `data.notam`으로 전달.
3. `frontend/src/features/route-briefing/BriefingView.jsx` — ③노선 아래 **"경로상 NOTAM N건" 사실 나열 서브섹션**(카테고리 라벨+시간상태 색+요약+고도). `routeConflicts`는 그중 상단에 "경로 저촉" 강조로 분리 표시. `BriefingBanner.jsx`는 `routeConflicts` 있으면 저촉 사유를 배너에 노출.
4. `frontend/src/features/route-briefing/lib/hazardLayers.js` — RULEBOOK에 `{ codes: [...notam categories], layers: ['notam'] }` 추가해 "지도에 NOTAM 레이어 보기" 칩 제공. `notam`이 유효 토글 대상이 되려면 `weatherOverlayLayers.js`의 `MET_LAYERS`에 `notam` id 등록 필요(`MET_LAYERS`+`hazardLayers.test.js`가 실제 강제 지점 — 최초 스펙의 `layerActions.js` 오기 수정).

**딸려오는 것**:
- 발효 중 공역 제한 NOTAM이 경로에 걸리면 배너에 "경로 저촉" 사실 노출 → 파일럿이 인지·판단
- 나머지 경로상 NOTAM(장애물·시설 등)은 배너 미반영, "경로상 NOTAM" 사실 나열만
- "지도에 NOTAM 레이어 보기" 칩으로 경로 주변 NOTAM 확인

**경계선(왜 이게 "판단"이 아닌가)**: 우리가 정하는 건 "어떤 카테고리가 공역 제한 계열인가"인데, 이는 ICAO Q-code 정의(RP=prohibited, RR/RT=restricted, RD=danger, WM=firing)를 그대로 따르는 것이지 우리 위험 척도가 아니다. 저촉 판정도 기하·시간 사실이다. 우리가 하지 않는 것은 여전히 "NOTAM A가 B보다 위험하다"는 상대 순위 매기기다.

**알려진 한계 (정직하게 기록, 이번 스코프 제외):**
- **고도 밴드 파싱**: Q-line `/000/999/`(FL밴드)와 원문 `F)/G)`필드(명시적 ft, AGL/AMSL 라벨 포함, 있을 때만)가 둘 다 존재 — 우선순위 로직 필요(F)/G) 있으면 그것 우선, 없으면 Q-line 밴드로 폴백). SIGMET/AIRMET보다 파서 작업이 더 든다.
- **LineString형 NOTAM(26건, 회랑형 임시제한구역) 매칭 불가**: `geo-time-match.js`의 `pointInPolygon`은 Polygon/MultiPolygon만 처리, 선 지오메트리는 경로 교차 판정이 안 됨. 원문에 폭 정보("1NM EITHER SIDE OF LINE")가 있으면 파서에서 얇은 폴리곤으로 버퍼링해 우회 가능하지만 별도 작업 — 이번 스코프에서는 LineString NOTAM을 지도/탭에는 노출하되 브리핑 자동매칭 대상에서는 제외한다.

## 접근성·UI 요구 (frontend-design-audit 2026-07-03 반영, 목업에 적용됨)

목업([refs/2026-07-03-notam-ui-mockup.html](refs/2026-07-03-notam-ui-mockup.html))을 15원칙으로 감사한 결과 도출. 구현 시 필수 준수:

**안전 직결(감사 심각도 3):**
1. **시간상태는 색만으로 구분 금지(색맹 대비)** — 리스트 배지는 색+형태 글리프(●◐○)+텍스트, 지도 마커는 색+형태(채움/반채움/외곽선). 남성 8% 적록색맹이 발효중(red)을 예정(gray)으로 오인하면 안 됨. 디자인 헌법 §3·§6-P6("색만으로 등급 구분 금지")와 일치.
2. **안전 핵심 값(고도·요약)은 흐린 색 금지** — 고도/요약 텍스트는 최소 `--text-2`(#424242), 11px 미만 금지. 고도밴드는 AGL/AMSL 라벨 포함 안전 값이라 `--text-3`(#616161)로 흐리게 두지 않는다.
3. **카테고리 필터 활성상태 명확화** — 켜진 타일은 채움(accent 배경+흰 아이콘)+체크(✓)로, `AviationLayerPanel`의 `is-active` 패턴 재사용. 몇 개 켜졌는지 카운트도 표기. 투명도만으로 구분 금지.

**충실도(감사 심각도 2):**
4. amber 배지 대비 확보(`--amber` #8a3d0b 사용, 최소 11px) — WCAG AA 통과선 여유 확보
5. 지도 겹침 팝업 UX 구현(3건 이하 미니리스트 / 4건 이상 "전체 목록에서 보기") — 위 "지도 팝업/겹침 처리" 참조
6. 클릭 가능한 행/카드는 호버 배경 + `cursor:pointer` + 펼침 셰브런으로 원문 접근 신호 제공
7. 카운트와 실제 표시 개수 일치("전역 공지 3건"이면 3건 표시 또는 "+N 더보기")

**경미(감사 심각도 1):**
8. 카테고리 심볼 아이콘은 형태만으로 7종 변별되게(특히 제한=방패 vs 위험=삼각형) — 구현 시 실검증
9. 필터 토글 버튼에 `aria-pressed`, 마스터 스위치에 `role="switch"`+`aria-checked`

## Error Handling

- 크롤링 실패(접속 불가/셀렉터 변경/타임아웃): 이전 `latest.json` 유지, 크론 로그만 기록, 다음 주기 재시도. `mergeWithPrevious`(공항별 stale 병합) 미사용 — NOTAM은 전체 스냅샷 단위라 부분 병합 불필요.
- KML 파싱 실패: Placemark 단위 try/catch, 깨진 항목 스킵 + 개수 로그.
- 미매핑 Q-code: 자동 "기타" 카테고리 폴백 + 로그(표 보강용).
- 프론트: `/api/notam` 실패/빈 응답 시 기존 빈 상태 UI(`ap-empty`) 재사용, 지도는 조용히 미표시(throw 없음).

## Testing

- 백엔드: 파서/프로세서 단위 테스트(실제 KML fixture 사용), `briefing-composer.test.js`에 경로 NOTAM 매칭 케이스(경로 교차/시간 겹침/고도 밴드/`scope:'fir'` 제외) 추가
- 프론트: GeoJSON 변환 단위 테스트, `deriveTimeState`(active/soon/upcoming 경계) + `formatAltitude`(AGL/AMSL 라벨 보존, 전고도 축약) 단위 테스트
- 브라우저 스모크: NOTAM 패널 카테고리 필터→지도 반영(줌 전환·시간상태 색), 공항 선택→NotamTab 필터+전역 공지 섹션, 경로 브리핑 생성→"경로상 NOTAM" 사실 나열 + 발효 중 공역 제한이 경로에 걸리면 배너에 "경로 저촉" 반영되는지 확인(장애물·시설만 걸리면 배너 미반영)

## Open Decisions Resolved During Brainstorming

- 크롤 소스: KML만 (xls 불필요, KML에 좌표+원문 다 포함)
- 보관: 최신본만 (store.js 기존 패턴)
- 주기: 6시간(실측으로 결정 — 사이트가 창을 24h로 강제하므로 daily는 불가, 6h로 전방 가시성 ≥18h 확보)
- 크롤 시간창: 24시간(사이트 강제, 실측 검증 — 발효종료일자 넓히면 validateAndSearch가 from+1day로 clamp). 날짜 조작 없이 기본 다운로드. 데이터 수평선(~24h)은 패널에 정직 표기
- 지도 분류: 소수 핵심 카테고리 + 기타(추측 아닌 FAA/ICAO 공식 표 기준으로 확정)
- 공항 매칭: A)필드 정확 일치(단, `scope: 'fir'`는 예외적으로 전체 공항에 노출 — 위 FIR 광역 스코프 참조)
- 크롤 방식: 헤드리스 Playwright, 기존 백엔드 스케줄러(`backend/src/index.js`)에 통합(A안) — 별도 프로세스 분리(B안)는 주기가 촘촘해지면 재검토
- **심각도 판단 배제(안전/책임 결정)**: 우리가 NOTAM 위험도를 판단하지 않는다. NOTAM 생산 주체가 아니고, 잘못 순위 매기면 파일럿이 놓칠 때 책임 소재가 생김. 카테고리→심각도 매핑(구 설계) 전면 폐기.
- **색 = 시간 상태**: 색상은 B/C 필드에서 나온 객관적 사실(발효중 red / 곧발효 amber / 예정 gray)만 인코딩. 카테고리 무관 균일 적용(EFB 시간-활성 색상 관례). 카테고리는 아이콘+라벨로 구분.
- UI 좌측 색 보더 카드 패턴 배제 — 무채색 카드 + 색 배지 조합으로(범용 AI 대시보드 톤 회피)
- 브리핑 연동: `matchItems` 매칭 코어만 재사용, `hazardLevel()` 심각도 그라데이션은 재사용 안 함. 경로상 NOTAM은 "경로상 NOTAM" 사실 나열 섹션으로. **단 공역 제한 계열(RP/RR/RT/RA/RD/WM)이 발효 중 경로에 걸리면 binary "경로 저촉" 플래그로 배너에 사실 반영**(사용자 결정 2026-07-03 — Go/No-go에 영향 주는 NOTAM은 반영해야 함). NOTAM 간 등급은 여전히 안 매김. 근거는 ICAO 카테고리 정의 + 기하·시간 사실이지 우리 위험 척도 아님.
- 지도 가시성 모델: 카테고리별 개별 레이어가 아니라 `MET_LAYERS` 마스터 토글 1개 + 카테고리 필터로 수정(리뷰로 발견 — 최초 설계는 `hazardLayers.js`/브리핑 칩과 안 맞았음)
- 플랜 단계 분할 권장: 스펙은 하나로 유지, `writing-plans`에서 (a) 크롤러+파서+프로세서+store+API, (b) 프론트 UI(전역패널+공항탭+지도), (c) 브리핑 연동(― (a)에 의존) 3단계로 나눠서 계획
- 표출 방향: 공식기관(FAA/EAD)의 텍스트·검색 우선이 아니라 EFB(ForeFlight/Garmin)식 지도·그래픽 우선 채택. ProjectAMO가 지도 대시보드 정체성이고 EFB 방향이 현대적·우월함이 리서치로 확인됨. 단 리스트(테이블) 완성도도 동등하게 중시.
- 지도 마커: 심볼 아이콘(카테고리) + 시간상태 색(글자 박힌 핀 방식 아님 — 한글 카테고리라 1글자 축약이 어색, 앱 기존 SIGWX 심볼 체계와 결 맞춤). 구체 심볼은 구현 단계에서 확정.
- mark-as-read / junk NOTAM 억제: 이번 스코프 제외(v2 후보).

### 외부 리서치 근거 (2026-07-03, 서브에이전트 5종 + 공개 뷰어 직접 캡처)

- **NOTAM 과부하가 도메인 핵심 문제**: 전 세계 연 170만 건, 하루 최대 3.5만 활성. 파일럿 4명 중 3명이 중요 NOTAM을 놓친 경험(Ops Group). Air Canada 759(2017) 활주로 오인 미수 — 폐쇄 NOTAM이 27p 브리핑 마지막 장에 묻힘. → 우선순위·필터·저노이즈 설계가 정당.
- **파일럿 판독 순서 "Big Three"**: ①활주로/공항 상태 ②NAVAID/TFR ③고도 제한. dep/dest/alt 먼저. Q-code 원본은 잘 안 읽고 E)본문·A)·B/C)만 봄 → 우리 E)요약 우선·원문 접기·선택공항 우선이 부합.
- **색 규범 = 시간축**: ForeFlight/Garmin이 gray→yellow→orange→red로 **활성 시각이 다가올수록** 색 진하게(카테고리 심각도가 아니라 시간 상태). 우리도 이 관례 채택 — 우리가 판단 안 해도 되는 객관적 색축이라 안전/책임 면에서도 정합.
- **과부하 관리 공통 기법**: 카테고리/고도/시간/지리 필터 + 클러스터링 + mark-as-read + junk 억제 → 우리는 mark-as-read·junk억제 외 전부 채택.
- **직접 캡처한 공개 뷰어**: notaminfo.com/ukmap(글자핀+숫자클러스터+카테고리체크박스+고도/시간필터, 전형적 과부하), skyvector.com(차트 스타일), notams.aim.faa.gov(검색·텍스트 우선), openaip.net/map(우리와 동일 Mapbox 스택, 차트색 규범이지만 전량 표시 시 과밀).

## Unresolved Risk

- AWS 프로덕션 EC2에서 Playwright/Chromium 크롤링 동작 여부 미검증(사내망 클라우드 접속 차단으로 이번 세션에서 확인 못함). **구현 완료 후 배포 전 반드시 SSH로 실사 검증 필요.**
