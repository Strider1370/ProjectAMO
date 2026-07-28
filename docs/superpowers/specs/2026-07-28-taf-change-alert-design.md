# TAF 변화 알람 — 새 TAF가 직전보다 나빠졌을 때 알린다

- 작성일: 2026-07-28
- 대상 화면: `/monitoring` (운항 모드)
- 상태: 설계 확정, 구현 전
- 선행 문서: [모니터링 알람 표시 개편](2026-07-27-monitoring-alert-redesign-design.md) — 알람 표·요소 반짝임·강조 시간의 정의를 그 문서에 의존한다

## 1. 배경

지금의 TAF 알람(`taf_adverse_weather`)은 **상태** 알람이다. 현재 예보를 펼쳐 앞으로 6시간 안에 임계값을 넘는 시각이 있으면 알린다. 이전 TAF를 보지 않는다 — 트리거 서명이 `evaluate(current, _previous, params)`로, `previous` 자리가 밑줄 처리되어 명시적으로 버려져 있다(`frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js:148`).

그래서 이런 일이 생긴다.

| 현상 | 원인 |
|---|---|
| 나쁜 예보가 계속 나쁘면 계속 걸려 있다 | 이미 아는 사실이 자리를 차지한다 |
| 예보가 방금 나빠진 순간을 짚어주지 못한다 | "나쁘다"와 "나빠졌다"를 구분하지 않는다 |
| AMD(수시수정)가 나와도 표시가 달라지지 않는다 | 발표 종류를 판정에 쓰지 않는다 |

운영자에게 급한 정보는 "예보가 나쁘다"가 아니라 **"예보가 방금 나빠졌다"** 이다. 특히 AMD는 예보관이 정규 발표 시각을 기다리지 못할 만큼 상황이 바뀌었다는 뜻이므로, 그 사실 자체가 신호다.

### 확인한 사실

아래는 코드에서 직접 확인했다. 추정이 아니다.

| 사실 | 근거 |
|---|---|
| TAF는 이미 **시간별 표**로 펴져서 들어온다. TEMPO/BECMG/PROB 문법이 파서 단계에서 해소된다 | `backend/src/parsers/taf-parser.js:341-369` |
| 각 칸에 시각·바람·시정(CAVOK 여부)·기상현상·구름이 있다 | 같은 곳 |
| 발표 종류(`NORMAL`/`AMENDMENT`/`CORRECTION`/`CANCELLATION`)를 뽑아 쓰고 있다 | `backend/src/parsers/taf-parser.js:386`, `backend/src/serializers/taf-tac.js:53`, `backend/test/taf-tac.test.js:28` |
| 서버는 TAF **내용이 실제로 바뀔 때만** 새 파일을 쓴다 (정규화 해시 비교) | `backend/src/store.js:225-228, 268-280` |
| 프런트는 TAF **내용 해시가 바뀔 때만** 내려받는다 | `frontend/src/features/monitoring/monitoringApi.js:103, 137` |
| 알람 엔진이 넘기는 `previous`는 **직전 TAF가 아니라 직전 폴링**이며, React ref에만 있어 새로고침하면 사라진다 | `frontend/src/features/monitoring/MonitoringPage.jsx:115, 229-235` |
| 알람의 "아직 유효한가" 재확인은 `previous`를 **비운 채** 다시 판정한다 | `frontend/src/features/monitoring/MonitoringPage.jsx:249` |
| 저장 파일 보관은 10개, 파일 하나에 전 공항이 함께 들어간다 | `backend/src/config.js:359`, `backend/src/processors/taf-processor.js:17-31` |

마지막 두 줄이 설계를 결정했다. 직전 폴링을 비교 기준으로 쓰면 6시간에 단 한 번의 폴링에서만 차이가 보이고, 그 순간 화면이 새로고침되었으면 영영 놓친다. 저장 파일을 거슬러 올라가 특정 공항의 직전 TAF를 찾는 방법도 보관 개수와 파일 구성 때문에 신뢰할 수 없다.

## 2. 목표

1. 새 TAF가 직전 TAF보다 위험기상이 늘었으면 그 사실을 알린다.
2. AMD를 정규 발표와 구분하고, 위험 증가가 없어도 AMD가 나왔다는 사실을 전한다.
3. 브라우저를 새로고침하거나 공항을 바꾸거나 서버를 재시작해도 판정이 이어진다.
4. 기존 TAF 상태 알람의 판정과 임계값은 건드리지 않는다.
5. 새 임계값 설정 항목을 만들지 않는다.

## 3. 범위

### 추가

- 트리거 `taf_change` — 겹치는 구간의 악화, AMD 통지
- 트리거 `taf_new_period` — 이전 TAF가 커버하지 않던 구간의 위험
- 서버의 공항별 직전 TAF 보관

### 변경하지 않음

- 기존 트리거 `taf_adverse_weather`의 판정·임계값·문구
- METAR·낙뢰 계열 트리거 전부
- 소리 동작
- TAF 파싱 규칙

### 범위 밖

- 위험이 **줄어든** 경우의 알림. 이번 작업은 늘어난 경우만 다룬다
- PROB30/PROB40이 확정 예보로 승격되는 경우의 별도 판정. 시간표가 확률을 흡수하므로 `change_groups`를 따로 읽어야 하며, 이번 범위에 넣지 않는다
- 해외 공항 TAF(`tafOverseas`). 해외 파서는 발표 종류를 다르게 채우므로(`backend/src/parsers/noaa-taf-parser.js:216`) 별도 검토가 필요하다
- 경로 브리핑 쪽 알림(`backend/src/alerts/`). 별개 계통이다

## 4. 구조

```
서버 (taf-processor)
  새 TAF 수신
    → 공항별로 issued 비교
    → 달라졌으면 직전 것을 previous 칸으로 이동
    → 같으면 previous 그대로 유지
    → current + previous 를 함께 저장·전송

프런트 (alert-triggers)
  taf_change      ─┐
  taf_new_period  ─┴→ current.previous 를 읽어 판정
                      개인 임계값 그대로 사용
```

판정을 프런트에 두는 이유는 임계값이 사용자별 개인 설정이기 때문이다(`frontend/src/features/monitoring/legacy/utils/alerts/alert-settings.js`). 서버가 판정하면 설정창의 임계값 항목이 의미를 잃는다.

두 트리거는 알람 엔진이 넘기는 `previous` 인자를 쓰지 않고 **`current.previous`를 읽는다.** 그 결과 §1에서 확인한 "유효성 재확인 시 `previous`를 비운다"는 동작에도 판정이 그대로 성립하며, 알람이 다음 TAF가 올 때까지 살아 있다가 새 TAF가 오면 교체된다. 별도의 수명 관리 코드가 필요 없다.

## 5. 서버: 직전 TAF 보관

### 규칙

```
새로 받은 header.issued  vs  현재 보관 중인 header.issued

  다르다 → 새 TAF
           현재 것 → previous
           새 것   → current

  같다   → 같은 TAF의 재수신
           previous 를 건드리지 않는다
```

**"같으면 그대로 둔다"가 이 설계의 핵심이다.** 이것이 빠지면 다음 폴링에서 previous가 current로 덮여 비교 기준이 사라지고, 프런트가 겪던 문제가 서버로 옮겨갈 뿐이다.

### 내려보내는 모양

```
taf.airports.RKSI = {
  header,
  base,
  change_groups,
  timeline,
  previous: {          ← 추가
    header,            ← issued, valid_start, valid_end, report_status
    timeline           ← 비교에 필요한 값만
  }
}
```

`previous.timeline`에는 시각·시정(CAVOK 포함)·구름·바람·기상현상만 담는다. 화면 표시용 문자열(`display`)과 원문은 제외한다.

### 비용

프런트는 TAF 내용 해시가 바뀔 때만 내려받으므로(§1), 늘어난 크기는 실제로 새 TAF가 온 순간에만 발생한다. 정상 운영에서 6시간에 한 번, AMD가 나면 그때 한 번 더다. 폴링마다 두 배가 되는 것이 아니다.

### 재시작

`previous`는 저장 파일에 함께 들어가므로 서버를 재시작해도 남는다. 다만 **최초 1회**는 `previous`가 없으며, 이때 두 트리거는 아무것도 발동하지 않는다. 오류가 아니다.

## 6. 판정 규칙

### 6.1 위험 시각

시간표의 각 칸에 대해 요소별로 위험 여부를 표시한다.

| 요소 | 위험 조건 | 임계값 출처 |
|---|---|---|
| 시정 | 임계값 미만 | 기존 `taf_adverse_weather`의 `vis_threshold` |
| 특이기상 | 지정 현상 포함 | 기존 `taf_adverse_weather`의 `phenomena` |
| 운고 | BKN/OVC 중 최저 운저가 임계값 미만 | `low_ceiling`의 `threshold`·`amounts` |
| 바람 | 풍속 또는 거스트가 임계값 이상 | `high_wind`의 `speed_threshold`·`gust_threshold` |

**새 임계값 설정을 만들지 않는다.** 이미 있는 값을 그대로 읽는다. 근거: 같은 "위험의 기준"이 관측용과 예보용으로 갈리면 사용자가 어느 쪽을 고쳐야 하는지 매번 판단해야 한다.

부작용으로 METAR 계열 임계값을 조정하면 TAF 변화 판정도 함께 움직인다. 의도된 결합이다.

### 6.2 비교 구간

```
비교 시작 = max(이전 valid_start, 새 valid_start, 지금)
비교 끝   = min(이전 valid_end,   새 valid_end)
```

두 TAF의 유효기간이 겹치는 곳, 그중 현재 시각 이후만 본다. 겹치는 구간이 없으면 악화 판정을 생략한다.

### 6.3 악화 판정

두 가지만 본다. "구간이 새로 생김"과 "구간이 길어짐"은 계산상 같은 조건이므로 합쳤다 — 구간이 길어지려면 반드시 이전에 위험하지 않던 시각이 위험해져야 한다.

**규칙 ① 안 위험하던 시각이 위험해졌다**

이전 시간표에서 위험이 아니었고 새 시간표에서 위험인 시각이 하나라도 있으면 악화다.

**규칙 ② 원래 위험하던 시각이 한 단계 더 나빠졌다**

값이 조금 나빠진 것까지 잡으면 소음이 된다. 아래 경계를 새로 넘을 때만 악화로 본다.

| 요소 | 경계 | 근거 |
|---|---|---|
| 시정 | 500m 미만 | `alert-triggers.js:52` |
| 운고 | 200ft 미만 | `alert-triggers.js:134` |
| 바람 | 거스트 50kt 이상 | `alert-triggers.js:75` |
| 특이기상 | TS 신규 등장 | `alert-triggers.js:176` |

이 값들은 기존 트리거가 심각도를 `warning`에서 `critical`로 올릴 때 이미 쓰고 있는 경계다. 새 숫자를 만들지 않았다.

### 6.4 좋아진 경우

위험이 줄거나 사라진 경우는 발동하지 않는다.

### 6.5 오탐 억제

판정은 **새 TAF가 도착한 때에만** 일어난다. 값이 임계값 근처를 오르내려도 알람은 발표 주기보다 잦아질 수 없다. 별도의 히스테리시스나 대기 시간을 두지 않는다.

## 7. 알람 두 종류

### 7.1 `taf_change` — 직전 대비 악화

| 조건 | 심각도 | 표시 |
|---|---|---|
| 악화 있음 · 정규 발표 | `warning` (TS 신규면 `critical`) | 악화 내용 |
| 악화 있음 · AMD | 한 단계 위 (`warning`→`critical`, 이미 `critical`이면 그대로) | 제목에 AMD 표기 |
| 악화 없음 · AMD | `info` | "AMD 발표됨 — 위험 증가 없음" |
| 악화 없음 · 정규 발표 | 발동하지 않음 | — |

AMD 통지를 별도 트리거로 분리하지 않고 한 함수 안에서 갈라내는 이유는, 악화와 AMD 통지가 동시에 발동해 같은 발표에 대해 두 줄이 생기는 것을 막기 위해서다.

### 7.2 `taf_new_period` — 처음 보이는 구간의 위험

이전 TAF의 `valid_end` 이후이면서 새 TAF의 유효기간 안인 구간을 본다. 이 구간에 위험 시각이 있으면 `info` 등급으로 한 줄 낸다.

비교 대상이 없으므로 "늘었다"고 말하지 않는다. 문구는 "새 구간에 위험이 있다"로 쓴다.

AMD는 유효기간이 직전과 같거나 짧은 것이 보통이므로 꼬리 구간이 거의 생기지 않는다. 생기면 정규 발표와 동일하게 처리한다 — 심각도를 올리지 않는다. AMD의 무게는 §7.1이 이미 표현한다.

### 7.3 공통 규칙

- **한 번의 발표는 한 줄.** 시정·운고·바람·특이기상이 동시에 악화해도 `taf_change`는 한 건이며, 본문에 요소별로 나열한다. 심각도는 나열된 것 중 가장 높은 것을 따른다
- 단, `taf_change`와 `taf_new_period`는 서로 다른 알람이므로 **한 발표에서 둘 다 발동할 수 있다.** 겹치는 구간의 악화와 처음 보이는 구간의 위험은 다른 사실이고 심각도도 다르다. 의도된 동작이다
- 알람 키에 새 TAF의 `issued`를 포함한다. 발표마다 별개의 알람이 되어 재알림 간격이 발표를 가로막지 않는다
- 수명은 다음 TAF 도착까지다(§4)

### 7.4 문구 예

```
┃ ■ 경고 │ TAF 악화: 저시정 1500m               12:04Z × ┃
           12:00Z 발표 (직전 06:00Z 대비)
           시정  19~21시 새로 위험 (최저 1500m)
           운고  20시 400ft로 더 낮아짐

┃ █ 위험 │ TAF AMD 악화: 저시정 800m            14:22Z × ┃
           14:20Z AMD (직전 12:00Z 대비)
           시정  16~19시 새로 위험 (최저 800m)

┃ ░ 정보 │ TAF AMD 발표됨                       14:22Z × ┃
           14:20Z AMD — 위험 증가 없음

┃ ░ 정보 │ TAF 새 구간: 내일 14시 TS 예보        12:04Z × ┃
```

## 8. 화면 강조

선행 문서의 "요소 반짝임"(§5·§6)에 그대로 얹는다. 새 대응표를 만들지 않는다.

```
taf_change      → { panel: 'taf', fields: [악화된 요소], times: [악화된 시각] }
taf_new_period  → { panel: 'taf', fields: [위험 요소],   times: [위험 시각] }
```

TAF 타임라인이 화면에 없거나 해당 시각이 표시 범위 밖이면 **강조를 생략한다.** 선행 문서 §6의 "대상을 표시할 수 없을 때" 규칙을 그대로 적용하며, 오류로 취급하지 않는다.

## 9. 설정

### 추가

| 항목 | 기본값 |
|---|---|
| "TAF가 바뀌어 위험이 늘면 알림" (`taf_change`) | 켬 |
| "TAF 새 구간에 위험이 있으면 알림" (`taf_new_period`) | 켬 |

켜기/끄기만 추가한다. **임계값 입력 칸은 하나도 늘어나지 않는다**(§6.1).

### 변경 없음

기존 TAF 알람 항목, METAR 계열 항목, 소리, 방해금지 시간, 재알림 간격.

## 10. 오류 처리

| 상황 | 처리 |
|---|---|
| `previous` 없음 (최초 실행) | 두 트리거 모두 발동하지 않음 |
| 유효기간이 겹치지 않음 | 악화 판정 생략 |
| 시간표 칸의 값이 비어 있음 | 그 칸을 판정에서 제외. **없는 값을 0으로 읽지 않는다** |
| CAVOK / NSC | 위험 아님 |
| 강조 대상이 화면에 없음 | 강조만 생략, 목록은 유지 |
| 트리거 실행 중 예외 | 기존과 동일 — 경고 로그 후 나머지 트리거 계속 (`alert-engine.js:42`) |

### 취소 통보 (`CANCELLATION`)

취소가 오면 시간표가 비어 들어온다. 그대로 두면 다음과 같이 오작동한다.

```
1. 정상 TAF        위험 구간 있음
2. 취소 통보       시간표 빔 → 위험이 사라진 것으로 보여 조용함 (여기까지는 맞음)
                   그러나 previous 가 '빈 것'으로 갱신됨
3. 다음 정상 TAF   빈 것과 비교 → 모든 위험이 "신규"로 판정 → 가짜 악화 알람
```

**처리: `report_status`가 `CANCELLATION`이면 `previous`를 갱신하지 않고 판정도 하지 않는다.** 다음 정상 TAF는 취소 이전의 마지막 정상 TAF와 비교된다.

## 11. 검증

### 단위 테스트 — 프런트 (신규 파일)

알람 폴더에는 현재 테스트 파일이 없다. 실행기는 이미 있다(`frontend/package.json`의 `node --test`).

| 확인 | 기대 |
|---|---|
| `previous` 없음 | 발동 없음 |
| 안 위험하던 시각이 위험해짐 | 악화 |
| 위험하던 시각이 500m 미만으로 내려감 | 악화 |
| 위험이 줄어듦 | 발동 없음 |
| 시정·운고·바람 동시 악화 | **한 건**으로 병합, 심각도는 최고값 |
| AMD + 악화 | 심각도 한 단계 상승 |
| AMD + 악화 없음 | `info` 통지 |
| 정규 발표 + 악화 없음 | 발동 없음 |
| 취소 통보 | 발동 없음 |
| 유효기간 미중첩 | 발동 없음 |
| 값이 빈 칸 | 위험으로 세지 않음 |
| 꼬리 구간에 위험 | `taf_new_period` 발동 |
| 알람 키 | 발표마다 달라짐 |

### 단위 테스트 — 백엔드

| 확인 | 기대 |
|---|---|
| `issued` 동일 재수신 | `previous` **유지** |
| `issued` 변경 | 직전 것이 `previous`로 이동 |
| `CANCELLATION` 수신 | `previous` 미변경 |
| 재시작 후 로드 | `previous` 복원 |

첫 줄이 가장 중요하다. 여기가 틀리면 다음 폴링에서 비교 기준이 지워져 알람이 영구히 발동하지 않는다.

### 브라우저 계약 (`frontend/verification/contracts/monitoring.spec.mjs`)

- 악화 알람이 하단 알람 표에 나타나는가
- 여러 요소가 악화해도 줄이 하나인가
- TAF 타임라인의 해당 시간칸에 강조가 붙는가
- AMD 알람이 정규 발표 알람보다 위에 정렬되는가
- 다음 TAF 도착 시 이전 줄이 빠지고 교체되는가

## 12. 영향 파일

| 파일 | 변경 |
|---|---|
| `backend/src/processors/taf-processor.js` | `issued` 비교, `previous` 이동·유지, 취소 예외 |
| `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js` | 트리거 2종 추가 |
| `frontend/src/features/monitoring/legacy/utils/alerts/alert-state.js` | 새 트리거의 알람 키(`issued` 포함) |
| `shared/alert-defaults.js` | 새 트리거 2종 기본 설정 |
| `frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx` | 설정 항목 2개, 라벨 |
| `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js` | 신규 |
| `backend/test/taf-processor.test.js` | 신규 또는 기존에 추가 |
| `frontend/verification/contracts/monitoring.spec.mjs` | 계약 추가 |
| `docs/policies/verification/contracts.md` | 계약 통과일 갱신 |

## 13. 기존 코드와의 관계

`backend/src/alerts/diff.js`가 경로 알림 계통에서 같은 모양의 판정을 이미 한다 — 선 크로싱 시에만 발화하고 회복·지속은 발화하지 않으며(`diff.js:26-30`), 더 빡빡한 두 번째 선으로 심각도를 올리고(`diff.js:32`), 이전에 없던 항목만 취한다(`diff.js:62-64`).

**코드를 공유하지 않는다.** `diff.js`는 한 시점의 공항 상태를 다루고 이 문서는 시간표 전체를 다루므로, 억지로 합치면 양쪽 모두 나빠진다. 대신 원칙을 맞춘다 — 순수 함수, 상태 없음, 이전→현재 전이만 판단(`diff.js:3`이 같은 원칙을 명시한다).
