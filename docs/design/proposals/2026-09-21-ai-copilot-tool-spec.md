# AI Copilot 도구(Function Calling) 명세 초안

- 작성일: 2026-09-21
- 상태: 초안. 구현 전 §9의 결정 사항을 확정해야 한다.
- 범위: 「ProjectAMO AI Copilot 도입 계획서」 5장의 초기 PoC 기능.

> 2026-09-21 재검토: 사용자는 **공항 도구 + 준비된 김포–제주 경로의 브리핑 → 같은 WSL의 Codex CLI에서 로컬 MCP 검증 → 자체 챗봇과 자동 경로 생성 확장** 방향을 확인했다. 후속 작업은 [챗봇·MCP 개정안](2026-09-21-ai-copilot-chatbot-v2.md)을 기준으로 한다. 공개 주소·nginx·OAuth는 로컬 검증 뒤로 분리하며, PoC 필수 범위와 후속 기능도 개정안 §2.1·§12에 구분했다. 아래 본문은 최초 논의 기록이므로 공개 연결 선행 등 상충하는 내용은 현재 작업 지시로 사용하지 않는다. 구현·등록·시연은 아직 수행하지 않았다.

> 추가 검토: 목표는 실사용 챗봇이며 로컬 시연은 검증 수단이다. 구현 가능성과 저비용·정확도 달성 여부는 구분한다. 개정안 §9에 재사용/신규 개발 범위, 질문 전체의 토큰 집계, 미측정 목표, 실제 비용·품질 평가 순서를 반영했다. 아래의 도구 결과 크기만으로 질문당 운영비를 계산하지 않는다.

## 1. 기본 원칙

1. **AI는 서버가 만든 규격 데이터만 본다.** 화면 캡처, 경로 좌표, 격자 원자료, 원문 전문은 기본적으로 넘기지 않는다.
2. **계산·판단은 서버가 한다.** AI는 도구 결과에 들어 있는 값만 인용한다. 순위·권고는 서버가 `rank` 같은 필드로 돌려준 경우에만 말한다.
3. **도구 결과는 요약본(digest)이 기본이다.** 상세 내용은 사용자가 물을 때만 별도 도구로 가져온다. 목표는 도구 결과 1회당 약 1,500토큰 이하다.
4. **시간 변환은 서버가 한다.** AI는 "날짜 + 현지 시각 + 시간대" 형태로 넘기고, UTC 변환과 검증은 서버가 맡는다. "지금"은 시연 모드를 반영한 `getEffectiveNow()` 기준이다.
5. **데이터를 바꾸는 동작은 사용자 확인 후에만 실행한다.** 이번 범위에서는 알람 등록과 해제가 해당한다.
6. **화면 버튼은 AI가 아니라 서버 규칙이 붙인다.** 어떤 도구가 성공했는지에 따라 버튼 목록을 정해진 규칙으로 결정하므로 토큰이 들지 않고, 결과도 매번 같다.

## 2. 전체 흐름과 진행 순서

### 2.1 진행 순서 (2026-09-21 결정)

1. **도구 함수**: 서버 안의 일반 함수로 만든다. LLM·MCP와 무관하게 테스트 가능해야 한다.
2. **MCP 연결**: 같은 백엔드에 `/mcp` 주소를 추가한다. 1차는 로그인 없이 공개 기상 도구만 연다.
3. **실사용으로 다듬기**: 개발자 본인 Claude 계정에 사용자 지정 커넥터로 붙여서 실제 질문을 던져 본다. 도구 설명·입력·요약 형식을 서버 쪽에서만 고친다. 이 단계의 LLM 비용은 본인 요금제 안에서 처리되고, 채팅창 개발도 필요 없다.
4. **자체 채팅창**: 검증된 같은 도구를 ProjectAMO 채팅창이 쓴다. 화면 제어(`ui_action`)와 확인 카드는 이 단계에서 붙인다.
5. **개인 데이터 도구와 공식 등재**: OAuth 2.1 로그인을 만든 뒤 저장 경로·알람 도구를 MCP로 열지, ChatGPT·Claude 디렉터리에 등재할지 판단한다.

### 2.2 구조

```
             ┌─ /mcp (MCP 서버, 2단계) ◀── Claude·ChatGPT
도구 함수 ◀──┤
(backend/src/ai/tools)
             └─ /api/ai/chat (자체 채팅창, 4단계) ◀── ProjectAMO 브라우저
```

- 도구 함수는 **서버 혼자 끝까지 실행한다.** 경로 계산을 공용 코드로 옮겨 서버에서도 돌린다(§8.1). 그래서 어느 쪽에서 호출하든 결과가 같다.
- LLM API 키는 서버에만 둔다(4단계).
- 화면 조작은 자체 채팅창에서만 가능하다. MCP 쪽에서는 해당 화면으로 가는 링크(예: 기존 `?flight=` 바로가기)를 결과에 넣는다.

## 3. 공통 규약

### 3.1 입력 형식

| 항목 | 형식 | 비고 |
|---|---|---|
| 공항 | ICAO 4자 대문자 (`RKSS`) | 국내 15개 공항(`shared/airports.js`)의 ICAO·한글명 표를 시스템 지시문에 넣는다(약 300토큰, 캐시 대상). 해외 공항은 PoC 범위에서 제외한다. |
| 시각 | `{ "date": "YYYY-MM-DD", "time": "HH:mm", "tz": "KST" \| "UTC" }` | "내일" 같은 상대 날짜는 AI가 날짜로 바꾼다. 매 요청마다 서버가 기준 시각(KST·UTC 모두)을 넣어 준다. UTC 변환은 서버가 한다. |
| 고도 | `altitude_ft` 정수 (FL340 → `34000`) | 서버 검증 범위: 0~60000. 표시할 때는 기존 규칙(14,000 ft 이하는 ft, 초과는 FL)을 따른다. |
| 비행 방식 | `"IFR"` \| `"VFR"` | 기본값 결정 필요(§9). |

### 3.2 결과 공통 형식

```json
{
  "ok": true,
  "data": { },
  "sources": [{ "name": "TAF", "issuedAt": "2026-09-21T05:00Z", "stale": false }],
  "missing": ["NOTAM"],
  "error": null
}
```

- `sources`: 사용한 자료와 발표·관측 시각. AI는 답변 끝에 이 정보를 한 줄로 밝힌다.
- `stale`: 수집 실패로 마지막 정상 자료를 쓰는 중이면 `true`. 이 경우 AI는 반드시 그 사실을 알린다.
- `missing`: 조회하지 못한 자료. AI는 "자료 없음"이라고 말하고 추정하지 않는다.

### 3.3 오류 코드와 AI의 대응

| code | 의미 | AI 대응 |
|---|---|---|
| `MISSING_INPUT` | 필수 입력 없음(`error.fields`에 목록) | 빠진 항목을 한 번에 모아서 되묻는다 |
| `INVALID_INPUT` | 형식·범위 오류(과거 ETD 등) | 이유를 설명하고 다시 묻는다 |
| `NOT_FOUND` | 공항·저장 경로 없음 | 후보를 제시하거나 목록 조회를 제안한다 |
| `ROUTE_FAILED` | 경로를 만들지 못함 | 실패 사실을 알리고 브리핑 패널에서 직접 입력하도록 안내한다 |
| `DATA_UNAVAILABLE` | KIM 실행분 없음 등 | 해당 항목은 자료 없음으로 답한다 |
| `AUTH_REQUIRED` | 로그인 필요 | 로그인 안내 |
| `CONFIRM_REQUIRED` | 사용자 확인 대기 | 확인 카드가 떴다고 알리고 멈춘다 |

## 4. 도구 목록 (PoC)

| # | 이름 | 로그인 | MCP 공개 | 목적 |
|---|---|---|---|---|
| 1 | `get_airport_weather` | 불필요 | 2단계 | 공항 실황·예보·경보 요약 |
| 2 | `get_route_briefing` | 불필요 | 2단계 | 경로 생성 + 종합 브리핑 요약 |
| 3 | `compare_altitudes` | 불필요 | 2단계 | 고도별 난류·착빙·위험기상 비교 |
| 4 | `get_briefing_detail` | 불필요 | 2단계 | 직전 브리핑의 특정 부분 상세 |
| 5 | `list_my_routes` | 필요 | 5단계 | 저장 경로·브리핑 검색 |
| 6 | `open_saved_route` | 필요 | 5단계 | 저장 경로 불러오기 + 브리핑 |
| 7 | `set_route_alert` | 필요(확인 후) | 5단계 | 저장 경로 알람 등록·해제 |
| 8 | `ui_action` | 불필요 | 없음 | 화면 열기·레이어 켜기·공항 선택(자체 채팅창 전용) |

MCP는 호출 사이에 대화 상태를 들고 있지 않을 수 있다. 그래서 `briefing_ref`는 서버가 짧게 보관하는 결과를 가리키는 id로 두고, 만료되면 `NOT_FOUND`와 함께 "같은 입력으로 `get_route_briefing`을 다시 호출하라"는 안내를 돌려준다.

### 4.1 `get_airport_weather`

사용자가 공항 날씨를 묻는 경우에 쓴다. 여러 공항을 한 번에 조회한다("남부권 공항" 등).

```json
{
  "icaos": ["RKPC", "RKPK"],
  "window": { "from": {"date":"2026-09-22","time":"06:00","tz":"KST"}, "to": {"date":"2026-09-22","time":"12:00","tz":"KST"} },
  "include_raw": false
}
```

- `icaos`: 필수, 1~15개.
- `window`: 선택. 없으면 현재 실황과 TAF 전체 기간을 요약한다.
- `include_raw`: 선택, 기본값 `false`. `true`면 METAR·TAF 원문을 포함한다. 사용자가 원문을 요청한 경우에만 쓴다.

digest(공항별):
- `current`: 관측 시각, 바람(방향/속도/돌풍 kt), 시정(m), 운고(ft), 현재 일기, 비행 범주, SPECI 여부
- `forecast`: window 안의 TAF 구간별 비행 범주와 그 원인(운고·시정·일기). TEMPO/BECMG/PROB 구분 포함
- `warnings`: 유효한 공항 경보 목록(종류·유효 시각)

근거 코드: `/api/metar`, `/api/taf`, `/api/warning`이 쓰는 저장 자료, `backend/src/briefing/airport-summary.js`, `taf-window.js`, `flight-category.js`.

### 4.2 `get_route_briefing`

```json
{
  "departure": "RKSS",
  "arrival": "RKPC",
  "alternate": null,
  "etd": { "date": "2026-09-22", "time": "09:00", "tz": "KST" },
  "cruise_altitude_ft": 34000,
  "flight_rule": "IFR"
}
```

- 필수: `departure`, `arrival`, `etd`, `cruise_altitude_ft`
- 선택: `alternate`, `flight_rule`
- 처리 순서(모두 서버):
  1. 입력 검증·UTC 변환
  2. 공용 경로 계산(§8.1): 경로 검색 → 절차 자동 추천 → 경로선·구간 모델 → ETA(기체 성능 기본값)
  3. `composeBriefing` 실행 후 digest 생성
- 자체 채팅창에서는 같은 입력으로 브리핑 화면을 채우는 버튼을 붙인다. 화면도 같은 공용 계산을 쓰므로 결과가 같다.

digest:
- `route`: 경로 문자열(SID·항로·STAR), 총거리 NM, ETD·ETA(UTC/KST)
- `banner`: 최악 비행 범주 공항과 원인(`briefing.banner.worst`)
- `summary`: 항목별 위험 레벨(`briefing.summary`)
- `hazards`: 경로상 SIGMET/AIRMET 등. 종류, 순항고도 교차 여부(`encounter`), 고도대, 유효 시각, 시간 상태. 최대 10건이고 나머지는 개수만 표시
- `enroute`: 순항고도 기준 난류·착빙 노출 요약(`sections.enroute.model`), KIM·KTG 실행 시각
- `airports`: 출발·도착·교체 공항의 현재 범주와 원인
- `destination`: ETA 전후 도착지 TAF 범주와 교체 공항 비교
- `notam`: 경로 저촉 NOTAM 개수와 제목 최대 5건
- `briefing_ref`: 이 브리핑의 대화 내 참조 id(§4.4에서 사용)

근거 코드: `backend/src/briefing/briefing-composer.js` 반환값(`meta`, `banner`, `summary`, `sections.adverse|enroute|current|destination`, `routeNotams`, `routeConflicts`, `provenance`), `frontend/src/features/route-briefing/useRouteBriefing.js`의 `runRouteSearch`, `handleAutoRecommend`, `handleGenerateBriefing`.

### 4.3 `compare_altitudes`

```json
{
  "departure": "RKSS",
  "arrival": "RKPC",
  "etd": { "date": "2026-09-22", "time": "09:00", "tz": "KST" },
  "planned_altitude_ft": 34000,
  "altitudes_ft": [32000, 34000]
}
```

- 필수: `departure`, `arrival`, `etd`, `planned_altitude_ft`
- 선택: `altitudes_ft`. 없으면 서버가 계산한 후보 고도 전부를 쓴다. 후보는 ENR 1.7 반원 규칙과 AIP 항로 제한을 반영한다.
- 직전 `get_route_briefing`과 경로·ETD가 같으면 경로를 다시 계산하지 않는다.
- 사용자가 요청한 고도가 규칙상 불가능하면(`status !== 'valid'`) 그 사실을 결과에 넣는다.

digest(고도별 행):
- `altitude_ft`, `label`, `status`(유효/입력값만/불가)
- `turbulence`: KTG 강도별 노출 거리 NM
- `icing`: 강도별 노출 거리 NM
- `hazards`: 교차하는 SIGMET/AIRMET 수와 종류
- `notams`: 고도대가 겹치는 NOTAM 수
- `rank`: **순위 기준이 정해지기 전까지는 항상 `null`** (§9-1). `null`이면 AI는 표만 보여 주고 어느 고도가 낫다고 말하지 않는다.

근거 코드: `/api/briefing/altitudes`, `backend/src/briefing/altitude-weather-comparison.js`(`exposureSummary`, `matchHazards`, `matchNotams`).

### 4.4 `get_briefing_detail`

직전 브리핑의 한 부분만 자세히 가져온다. 토큰 절약을 위한 핵심 도구다.

```json
{ "briefing_ref": "b1", "section": "notam", "filter": { "icao": "RKPC" } }
```

- `section`: `notam` | `taf_raw` | `metar_raw` | `legs` | `winds_aloft` | `hazards_all`
- 서버는 대화별로 마지막 브리핑 결과 원본을 짧게(예: 30분) 보관하고, 요청된 부분만 잘라서 돌려준다.

### 4.5 `list_my_routes`

```json
{ "query": "제주", "kind": "any", "limit": 5 }
```

- 결과: `[{ id, name, departure, arrival, etd, kind: "route"|"briefing", savedAt, alertActive }]`
- `alertActive`는 해당 항목을 원본(`sourceBriefingId`)으로 하는 감시 행이 있는지로 판단한다.

근거 코드: `GET /api/me/routes`, `backend/src/me/routes.js` `toEntry`.

### 4.6 `open_saved_route`

```json
{ "route_id": 42, "etd_override": null }
```

- 서버가 저장 스냅샷으로 경로를 복원해 §4.2와 같은 digest를 만든다.
- 자체 채팅창에서는 기존 `loadRouteBriefing` → `openSavedBriefing`으로 화면에도 불러온다.

근거 코드: `frontend/src/app/App.jsx`의 딥링크 처리(`mapRef.current.loadRouteBriefing`), `MapView.jsx`.

### 4.7 `set_route_alert`

```json
{ "route_id": 42, "enabled": true, "etd": { "date": "2026-09-22", "time": "09:00", "tz": "KST" } }
```

- 켜기: `etd` 필수. 기존 알람은 "저장 경로 + 예정 ETD"를 복제해 감시하는 구조다(`POST /api/me/alerts { templateId, etd, eta }`). 과거 ETD는 거절한다.
- 끄기: 해당 경로를 원본으로 하는 감시 행을 찾아 `DELETE /api/me/alerts/:id`를 호출한다. 감시 행 id와 저장 경로 id가 다르다는 점에 주의한다.
- **2단계 실행**: 첫 호출은 `CONFIRM_REQUIRED`와 함께 확인 카드("제주행 · 9/22 09:00 KST · 알람 켜기")를 띄운다. 사용자가 카드를 누르면 서버가 실제로 실행한다. 확인 결과는 LLM을 거치지 않는다.
- 임계치와 판단 로직은 건드리지 않는다.

근거 코드: `backend/src/me/alerts.js`.

### 4.8 `ui_action`

```json
{ "action": "layer_on", "target": "turbulence" }
```

| action | target 허용값 | 실행 |
|---|---|---|
| `open_panel` | `PANEL_ACTIONS`의 id | `setActivePanel` |
| `layer_on` | `MET_ACTIONS`·`AVIATION_ACTIONS`의 id | `mapRef.setLayerOn` |
| `select_airport` | 국내 ICAO | `setSelectedAirport` |
| `open_briefing` | 없음 | 경로 브리핑 화면의 briefing 단계 |
| `open_vertical_profile` | 없음 | 연직단면 창 열기(직전 경로 필요) |
| `open_altitude_comparison` | 없음 | 고도 비교 단계 |

- 허용값은 `frontend/src/features/map/layerActions.js`에서 자동으로 만든다. 레이어가 추가되면 목록도 함께 늘어난다.
- 실행은 `App.jsx`의 기존 `runAction`을 재사용하고, 경로 관련 세 동작만 새로 추가한다.
- 사용자가 명시적으로 요청한 경우("난류 켜줘")에만 호출한다. 그 외에는 §5.4의 버튼으로 제안한다.
- 연직단면 격자는 LLM에 넘기지 않는다. 연직단면은 화면으로만 보여 준다.

## 5. LLM 운용 규칙

### 5.1 시스템 지시문 핵심 (요지)

1. 항공기상 수치는 도구 결과에 있는 값만 쓴다. 결과에 없으면 "자료 없음"이라고 말한다.
2. `rank`가 없으면 고도·경로의 우열을 말하지 않는다.
3. 필수 입력이 빠지면 도구를 부르기 전에 빠진 항목을 **한 번에** 묻는다.
4. 답변 끝에 자료 발표·관측 시각을 한 줄로 밝힌다. `stale`이면 맨 앞에 알린다.
5. 지원하지 않는 요청은 할 수 없다고 말한다.
6. 답변은 한국어로, 항공기상 용어와 약어는 그대로 쓴다.
7. 시간은 사용자가 쓴 시간대로 답하고 괄호 안에 UTC를 병기한다.

### 5.2 필수 입력과 기본값

| 항목 | 경로 브리핑 | 고도 비교 | 알람 켜기 | 없을 때 |
|---|---|---|---|---|
| 출발·도착 공항 | 필수 | 필수 | — | 묻는다 |
| ETD | 필수 | 필수 | 필수 | 묻는다 |
| 순항고도 | 필수 | 필수(기준고도) | — | 묻는다 |
| 비행 방식 | 선택 | 선택 | — | §9-2 |
| 교체 공항 | 선택 | — | — | 없이 진행 |
| TAS | 선택 | 선택 | — | 기존 기체 성능 기본값 |

### 5.3 대화 상태(슬롯)

서버가 대화별로 다음 값을 따로 들고 있다가 매 요청 앞부분에 짧게 넣는다(약 100토큰).

```
departure=RKSS arrival=RKPC etd=2026-09-22T00:00Z(09:00 KST) cruise_ft=34000 rule=IFR
last_briefing_ref=b1 last_route_id=42
```

- 새 도구 호출이 성공하면 슬롯을 갱신한다. "FL320이랑 FL340 중엔?"처럼 생략된 질문은 슬롯으로 채운다.
- 대화 기록은 최근 6턴까지만 원문으로 유지한다. 더 오래된 도구 결과는 한 줄 요약("b1: RKSS→RKPC FL340 브리핑, 위험 amber")으로 바꾼다.

### 5.4 응답 버튼(서버 규칙)

| 성공한 도구 | 붙는 버튼 |
|---|---|
| `get_route_briefing`, `open_saved_route` | [전체 브리핑 보기] [연직단면도 보기] [고도 비교 보기] |
| `compare_altitudes` | [고도 비교 보기] [연직단면도 보기] |
| `get_airport_weather` (공항 1곳) | [공항 상세 열기] |
| `list_my_routes` | 항목별 [불러오기] |

## 6. 토큰 예산 (목표치, 미측정)

| 부분 | 목표 | 비고 |
|---|---|---|
| 시스템 지시문 + 도구 정의 + 공항 표 | ~3,000 | 프롬프트 캐싱으로 반복 비용 절감 |
| 슬롯 | ~100 | |
| 대화 기록 | ~2,000 이하 | §5.3 압축 규칙 |
| 도구 결과 1회 | ~1,500 이하 | digest 기본 |

구현 첫 단계에서 김포-제주 브리핑의 원본 JSON과 digest 토큰 수를 실측해 이 표를 갱신한다.

## 7. 시나리오별 호출 순서

**시나리오 1 — 경로 브리핑(입력 부족)**

```
사용자: 내일 오전 9시에 김포에서 제주 갈 건데 브리핑해줘
AI: (도구 호출 없음) 순항고도를 알려 주세요.
사용자: FL340
AI → get_route_briefing{RKSS, RKPC, etd 2026-09-22 09:00 KST, 34000}
   ← digest (자체 채팅창이면 [전체 브리핑 보기]로 같은 결과를 화면에 채움)
AI: 요약 답변 + [전체 브리핑 보기] [연직단면도 보기] [고도 비교 보기]
```

**시나리오 2 — 고도 비교(슬롯 재사용)**

```
사용자: FL320이랑 FL340 중 어디가 더 좋아?
AI → compare_altitudes{슬롯의 RKSS/RKPC/ETD, planned 34000, [32000, 34000]}
AI: 고도별 표. rank가 null이면 "순위 기준 미정"으로 판단은 하지 않음
```

**시나리오 3 — 저장 경로 + 알람**

```
사용자: 지난번 제주행 경로 불러와줘
AI → list_my_routes{query:"제주"}  (여러 개면 목록을 보여 주고 선택 요청)
AI → open_saved_route{42}
사용자: 이 경로 알람 켜줘
AI: (ETD가 슬롯에 없으면) 출발 예정 시각을 알려 주세요.
AI → set_route_alert{42, true, etd} ← CONFIRM_REQUIRED
화면: 확인 카드 → 사용자가 [켜기] 클릭 → 서버가 등록
```

## 8. 새로 만들 것

### 8.1 경로 계산을 공용 코드로 이동 (1단계 선행 작업)

조사 결과(2026-09-21):

- 경로 계산 코드가 브라우저에 의존하는 곳은 **항로·절차 JSON을 `fetch('/data/navdata/...')`로 읽는 부분뿐**이다. 해당 위치는 `routePlanner.js`의 `fetchJson`과 `procedureData.js`다.
- 따라서 "JSON 읽기"만 주입받도록 바꾸면 된다. 브라우저는 `fetch`, 서버는 `frontend/public/data/navdata`의 파일 읽기를 쓴다. 서버가 이 폴더를 읽는 선례는 이미 있다(`backend/src/config.js`의 `airports-overseas.json`).
- 공용 폴더 선례도 있다: `shared/route-model.js`(`buildCommonRouteModel`)는 이미 양쪽에서 쓴다.

옮길 대상:

| 파일 | 줄 수 | 작업 |
|---|---|---|
| `lib/routePlanner.js` | 740 | JSON 읽기 주입으로 변경 후 이동 |
| `lib/procedureData.js` | 85 | 같음 |
| `lib/recommendProcedures.js` | 148 | 이미 입출력 주입식. 그대로 이동 |
| `lib/manualRouteInput.js` | — | 의존성 없음. 그대로 이동 |
| `lib/routeBriefingModel.js` | 385 | 순수 함수. `routePreview.js`의 순수 부분만 함께 이동 |
| `lib/routePreview.js` | — | **지도·DOM 코드와 섞여 있음.** 순수 경로 계산 함수만 분리 |
| `lib/etaCalc.js`, `lib/aircraftProfiles.js`, `lib/verticalProfileRequest.js` | 220 | 순수 함수. 이동 |

주의할 점:

- **흩어진 순서 로직을 하나로 모아야 한다.** 경로 검색 → 절차 추천 → 절차 선택 → 경로선 → ETA의 순서가 지금은 `useRouteBriefing.js`(2,871줄)의 여러 함수와 effect에 나뉘어 있다. 이를 화면 없이 도는 함수 하나(예: `planRoute({ departure, arrival, flightRule, etd, metar })`)로 추출한다. 화면도 이 함수를 쓰게 해서 두 결과가 갈라지지 않게 한다.
- **항로 데이터 갱신**: AIP 활성화 스크립트가 `enroute.json`을 다시 만들면 서버 메모리의 항로 그래프도 새로 읽어야 한다. 파일 변경 시각이나 매니페스트로 캐시를 무효화한다.
- 이동 후에도 기존 테스트(`routePlanner.*.test.js`, `recommendProcedures.test.js` 등)가 그대로 통과해야 한다.

### 8.2 백엔드

- `backend/src/ai/tools/`: 도구 함수, 입력 검증(zod), digest 변환기, 오류 형식
- `backend/src/ai/mcp.js`: MCP 서버. 공식 TypeScript SDK(`@modelcontextprotocol/sdk`)의 Streamable HTTP + Express 연동을 쓴다. **의존성이 추가되므로 배포는 `deploy/deploy-vm-full.sh`로 해야 한다.**
- MCP 공개 주소의 호출 제한: IP 기준 분당 N회. 공개 기상 API와 같은 수준으로 둔다.
- 4단계: `POST /api/ai/chat`, `POST /api/ai/confirm`, 대화·슬롯 저장소, 사용자별 하루 사용량 제한
- 5단계: OAuth 2.1 인가 서버(기존 세션 로그인과 연동)

### 8.3 프론트엔드 (4단계)

- 채팅창 컴포넌트(데스크톱 사이드 패널, 모바일 `MobileSheet`)
- `ui_action` 실행기: `App.jsx`의 `runAction` 재사용 + 경로 관련 동작 3종
- 알람 확인 카드

**재사용하는 것**: 브리핑·고도 비교·연직단면 계산, 저장 경로·알람 API, 레이어 동작 목록, 로그인 세션.

## 9. 구현 전에 정해야 할 것

1. **고도 순위 기준**: 난류·착빙·SIGMET·바람 가운데 무엇을 얼마나 무겁게 볼지. 정해지기 전에는 `rank = null`이다.
2. **비행 방식 기본값**: 말하지 않으면 IFR로 볼지, 되물을지. 초안은 IFR을 기본으로 하고 답변에 "IFR 기준"이라고 밝히는 안이다.
3. **LLM 공급자와 모델**: 도구 정의는 공급자 중립 형식(JSON Schema)으로 관리하고, 공급자별 변환층을 둔다.
4. **비로그인 사용 허용 여부와 하루 사용량 한도**.
5. **"지난번 브리핑과 비교"(계획서 4.6)**: 알람의 변경 감지(`last_briefing_snapshot_id`)를 재사용해 2차 범위로 둘지.

## 10. 작업 목록

**1단계: 도구 함수**
1. `get_airport_weather` + digest. 경로 계산 이동 없이 바로 가능하므로 가장 먼저 한다.
2. 경로 계산 공용화(§8.1)와 `planRoute` 추출. 화면 동작이 그대로인지 기존 테스트와 브라우저 확인으로 검증한다.
3. `get_route_briefing`, `get_briefing_detail`, `compare_altitudes` + digest
4. 김포-제주 브리핑의 원본 대비 digest 토큰 수 실측. 이후 §6 갱신

**2단계: MCP 연결**
5. `/mcp` 주소 + 공개 도구 4종 + 호출 제한. 테스트 인스턴스에 먼저 배포한다.

**3단계: 실사용**
6. 본인 Claude 계정에 커넥터로 연결하고 계획서 12장 시연 시나리오를 실행한다. 문제는 도구 설명·digest 수정으로 해결한다.
7. 잘 된 시나리오를 "질문 → 기대 도구 호출" 자동 테스트로 고정한다.

**4단계 이후**: 자체 채팅창 → 개인 데이터 도구·OAuth → 등재 판단.
