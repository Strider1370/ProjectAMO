# AIP 항공로 제약 데이터 수집·정규화·AIRAC 갱신 설계 스펙

- 상태: **설계 초안. 미구현.**
- 작성일: 2026-07-16
- 적용 범위: 대한민국 AIP의 en-route 항공로 제약 데이터를 ProjectAMO의 버전형 JSON으로 보존·갱신하는 데이터 파이프라인
- 연계 기능:
  - `2026-07-14-weather-aware-route-alternatives.md`
  - `2026-07-15-altitude-advisor.md`
  - `2026-07-15-navlog-leg-table.md`
  - `2026-07-16-preflight-weather-briefing-flow.md`

## 1. 목적

ProjectAMO가 고도별 기상 비교에서 임의의 고도 간격이나 일반 반원고도 규칙을 추정하지 않고, 실제 AIP 공표 항공로 구간의 최소비행고도·상한·방향별 FL series를 근거로 후보 고도를 생성할 수 있게 한다.

이 파이프라인은 항공로·항로 제약 자료를 **수집하고 사실대로 정규화·버전 관리**한다. 항공기 성능 계산, 최적 경로/고도 추천, 운항 가능 여부 판정, ATC 허가 가능성 판단은 범위 밖이다.

## 2. 원천과 수집 범위

초기 대상은 KOCA eAIP의 다음 자료다.

| 우선순위 | 원천 | 쓰는 정보 |
| --- | --- | --- |
| 1 | ENR 3.1 ATS Routes | conventional ATS 항로 구간, 방향, 고도·FL series·비고 |
| 2 | ENR 3.3 RNAV Routes | RNAV 항로 구간과 동등한 제약 정보 |
| 3 | ENR 1.7 | altimeter setting 및 고도 기준 해석에 필요한 절차 |
| 4 | ENR 4.4 | 항로명·식별 관련 보조 정보 |
| 항상 | eAIP 발행 인덱스, AIRAC amendment, 일반 AIP amendment, amendment/supplement 목록 | cycle·발행일·유효일·정정 여부 |

KOCA eAIP의 ENR 3.1 표에는 항로명, significant point와 좌표, 양방향 track/거리, 상한·하한, minimum flight altitude, 방향별 FL series, 공역 등급과 비고가 있다. 이 표는 정규화의 원문 근거이며, HTML의 화면 모양 자체는 API 계약이 아니다.

- 원문 확인: <https://aim.koca.go.kr/eaipPub/>
- ENR 3.1 표 예시: <https://aim.koca.go.kr/eaipPub/Package/2024-11-27-AIRAC/html/eAIP/KR-ENR-3.1-ko-KR.html>
- AIRAC 일정·NIL 통보 기준: <https://aim.koca.go.kr/eaipPub/Package/2025-05-01/html/eAIP/KR-GEN-3.1-en-GB.html>

## 3. AIRAC와 일반 amendment의 처리

AIRAC 유효일은 28일 주기다. 그러나 모든 AIRAC date에 ENR 변경이 있는 것은 아니며, NIL 통보·일반 AIP amendment·정정·supplement가 별도로 존재할 수 있다.

따라서 스케줄은 고정 AIRAC 주기를 실행 시점으로 사용하되, 활성화 대상은 KOCA eAIP 발행 인덱스가 밝히는 실제 amendment와 유효일로 결정한다.

```text
AIRAC 유효일 1~2일 전
  → KOCA 인덱스에서 대상 AIRAC/일반 amendment 확인
  → 원문 수집 및 후보 JSON 생성
  → 구조·연결·변경 검증

공표 유효시각 이후
  → 인덱스/원문 재확인
  → 검증 통과 후보만 current 활성화

유효일 다음날
  → 수집 누락·정정·파싱 경고 점검
```

고정 날짜만 계산해 무조건 교체하지 않는다. 새 항공로 제약은 실제 유효시각 전에는 활성 데이터가 될 수 없다.

## 4. 저장 모델

### 4.1 원문·후보·활성 데이터 분리

```text
backend/data/aip/
  raw/<publication-id>/             # 수집한 HTML/PDF와 manifest, 불변 보관
  manual-reviewed/<publication-id>/ # 렌더링 원표로 전사·독립 검수한 후보 JSON
  normalized/<publication-id>/      # 파서 또는 수동 전사에서 나온 정규화 후보와 validation report
  current/                          # 검증된 현재 활성 cycle을 가리키는 manifest/JSON
```

- `raw`는 원문 URL, 다운로드 시각(UTC), SHA-256, publication/effective date, AIRAC 여부를 담은 manifest와 함께 보관한다.
- `manual-reviewed`의 레코드는 원표 캡처 locator, 전사자/검수자, 검수 시각, 검수 상태를 보존한다. 수동 전사자와 승인 검수자는 같을 수 없다.
- `normalized`는 새 원문을 덮어쓰지 않는다. 생성 방식(파서 또는 수동 전사), 도구/규칙 버전, source reference, 경고, 이전 cycle 대비 diff를 저장한다.
- `current`는 검증을 통과하고 유효시각이 지난 단 하나의 publication을 가리킨다.
- 부분 수집·전사·파싱·검수 실패는 마지막 정상 `current`를 대체하지 않는다.

### 4.2 정규화 JSON

한 레코드는 항로 전체가 아니라 **방향과 고도 제약이 특정되는 en-route 구간**이다.

```json
{
  "routeId": "B332",
  "navigationSpecification": "RNAV2",
  "fromFix": "KANSU",
  "toFix": "PALDU",
  "from": { "ident": "KANSU", "lat": 0, "lon": 0 },
  "to": { "ident": "PALDU", "lat": 0, "lon": 0 },
  "trackMagDeg": { "forward": 180, "reverse": 360 },
  "distanceNm": 40.2,
  "upperLimitFt": null,
  "lowerLimitFt": null,
  "minimumFlightAltitudeFt": 20000,
  "mocaFt": 1500,
  "cruisingLevelSeries": {
    "forward": "odd",
    "reverse": "even"
  },
  "lateralLimitNm": null,
  "airspaceClass": ["A", "G"],
  "remarks": [],
  "review": {
    "method": "manual-rendered-table-transcription",
    "status": "reviewed",
    "transcribedBy": "operator-a",
    "reviewedBy": "operator-b",
    "reviewedAt": "2026-07-16T00:00:00Z"
  },
  "source": {
    "section": "ENR 3.1",
    "publicationId": "2024-11-27-AIRAC",
    "effectiveAt": "2024-11-27T16:00:00Z",
    "sourceUrl": "https://aim.koca.go.kr/...",
    "locator": "table/row reference"
  }
}
```

예시의 수치·식별자는 모델 설명용이다. 실제 JSON은 수집한 해당 publication 원문만 근거로 생성한다.

다음 의미는 절대 합쳐 쓰지 않는다.

- `minimumFlightAltitudeFt`: 해당 구간의 공표 최소비행고도
- `mocaFt`: 괄호 등으로 함께 공표된 MOCA/관련 값. 원문 표기와 해석 상태를 보존
- `lowerLimitFt`, `upperLimitFt`: 공역/항로의 수직 한계
- `cruisingLevelSeries`: 방향별 공표 FL 계열 또는 명시된 예외

원문 표기를 확실히 구조화할 수 없으면 추측한 수치를 넣지 않고 `null`과 `parseWarnings`를 남긴다.

## 5. 원표 판독·전사·파싱 규칙

### 5.1 수집기

- KOCA eAIP 인덱스에서 현재·다음·최근 archive publication을 읽는다.
- 대상 publication의 원문 URL을 manifest에 기록한 뒤 HTML/PDF를 그대로 저장한다.
- HTTP 실패, 예상치 못한 content type, 비정상 크기, 해시 불일치를 수집 실패로 기록한다.
- 원문을 갱신하거나 재다운로드해도 과거 AIRAC 원문을 덮어쓰지 않는다.

### 5.2 렌더링 확인 공통 규칙

- 각 AIP/eAIP source는 전사 또는 파서 구현·수정 전에 Playwright로 **실제 렌더링 표/문서를 캡처·판독**한다. 병합 셀, 반복 header, amendment 표시, 각 행이 다음 segment에 적용되는 관계를 화면에서 먼저 확인하고, 내려받은 HTML/PDF 구조와 대조한다. 원시 markup의 cell 순서만으로 열 의미를 추정하지 않는다. 캡처 또는 capture manifest는 전사·parser review를 위해 ignored artifacts에 보관한다.

### 5.3 수동 전사와 품질 규칙 확정

- 초기 데이터셋은 일반 파서 완성보다 **렌더링 원표 기반 수동 전사**를 우선한다. 이 방식은 원표·출처·AIRAC 유효시각·검수 상태가 연결된 내부 데이터셋을 만드는 것이 목적이며, 공개 재배포를 뜻하지 않는다.
- 파일럿에서는 ENR 3.1, ENR 3.3, FIR 경계 구간, 상·하한 또는 방향별 FL series가 특이한 구간을 서로 독립적으로 나누어 전사한다. 각 파일럿은 해당 route 표 전체의 캡처와 구간 JSON을 함께 남긴다.
- 파일럿 결과를 원표와 대조하여 다음 규칙을 명시적으로 확정한다: point 행과 뒤따르는 제약 행의 결합, 양방향 track와 FL series의 대응, `UNL`/`FL`/`FT AMSL` 단위 해석, FIR 경계·병합 셀·비고의 처리, ENR 6 차트와의 연결성 교차검증.
- 규칙을 확정하기 전에는 나머지 항로를 일괄 전사하거나 `current`로 활성화하지 않는다. 애매한 표기는 추측하지 않고 `reviewRequired`와 원문 문자열을 남긴다.
- 본 전사는 항로 단위로 병렬 분할할 수 있으나, 전사한 담당자와 다른 검수자가 캡처 원표를 독립 대조한다. 검수 완료 전 레코드는 `reviewed` 상태가 될 수 없다.
- AIRAC 갱신 때는 새 publication 전체를 자동 재전사하지 않는다. raw/capture/정규화 결과의 diff로 변경된 route·구간만 다시 전사·독립 검수한다. 구조 규칙이 바뀌면 파일럿 품질 검증을 다시 수행한다.

### 5.4 ENR 표 파서

- 항로 header를 찾고 그 아래 significant point 행을 순서대로 읽어 인접 point 쌍을 segment로 만든다.
- 공통 header/관제 주파수/비고 블록은 해당 route 또는 segment에 연결하되, 다음 route header가 시작되면 이전 범위를 종료한다.
- 방향별 track, 거리, FL series는 열 위치가 아니라 표 header 의미와 방향 표시를 기준으로 읽는다.
- `FL 200`, `10 000 FT`, `AMSL`, 괄호의 MOCA/보조 표기를 단위·원문 문자열과 함께 정규화한다.
- `Odd/Even`, 숫자 단위 계열, 항로별 특례, 단방향/PPR 같은 비고는 구조화 가능한 필드와 `remarks` 원문 모두에 남긴다.
- HTML에서 reference가 해소되지 않아 `unknown reference`처럼 보이는 표식은 FIX 식별자와 좌표로 교차 검증한다. 식별 불가 시 자동 매칭하지 않는다.

### 5.5 검증기

- 구간의 `fromFix`/`toFix`가 기존 route graph/navpoint와 일치하는지 확인한다.
- 출발·도착 좌표, 거리, 방향, 고도 단위, FL series를 기본 형식 검증한다.
- `minimumFlightAltitudeFt > upperLimitFt` 같은 명백한 모순, 방향별 series 충돌, source locator 누락은 오류로 처리한다.
- 매칭 실패, 애매한 cell, 새 route/fix, 삭제된 route, 변경된 고도/FL series/비고는 diff report에 남긴다.
- ENR 3.1과 ENR 3.3이 같은 segment를 주장할 때는 source와 cycle을 비교하고, 자동 우선순위를 추측하지 않는다.
- 수동 전사 레코드는 원표 capture locator, source locator, 전사자, 독립 검수자, 검수 시각, `reviewed` 상태가 모두 있어야 활성화 후보가 된다.

## 6. 활성화와 실패 안전성

```text
수집 성공
  → 원문 manifest 기록
  → 후보 JSON 생성
  → 구조/graph/diff 검증
  → 유효시각 확인
  → 검증 통과: current manifest 원자적 교체
  → 경고/실패: current 유지 + 운영 경보
```

- 자동 활성화의 최소 조건은 원문·cycle·effective time·파서 버전·검증 report가 모두 존재하는 것이다.
- 새 cycle이 route graph에 없는 FIX를 포함하거나, 고도/FL series를 해석할 수 없으면 `current`를 교체하지 않고 검수 대상으로 올린다.
- current가 만료되었고 새 cycle 활성화에 실패하면, API는 마지막 정상 cycle의 유효기간과 `aipDataStatus: stale`을 명시한다. 이를 유효한 최신 제약으로 표시하지 않는다.
- AIP 데이터가 unavailable/conflicting이면 고도별 기상 비교는 자동 후보 생성을 중단하고, 사용자가 입력한 고도에 대한 기상 브리핑만 자료 상태와 함께 제공한다.

## 7. Codex Scheduled task의 역할

Codex Scheduled task는 파서 자체가 아니라, 준비된 수집·검증 명령을 정해진 AIRAC 시점에 실행하고 결과를 보고하는 운영 자동화다.

- ChatGPT 데스크톱 앱에서 이 프로젝트를 대상으로 예약한다.
- 로컬 데이터·코드를 변경하는 실행은 진행 중 작업과 격리된 Git worktree를 기본으로 한다.
- 예약 작업은 최소 권한 sandbox와 필요한 KOCA 네트워크 접근만 사용한다.
- 작업 prompt는 cycle 탐지, 수집, 후보 생성, 검증, 활성화 조건, 실패 시 금지 행동을 명시한다.
- 첫 몇 회는 자동 활성화 없이 `dry-run`과 diff report만 생성해 파서 신뢰도를 확인한다.
- 검증된 뒤에도 새 route/fix, 제약 해석 실패, 큰 diff는 사람 검수로 승격한다.

Codex Scheduled는 CLI가 아닌 ChatGPT 웹/데스크톱의 Scheduled 관리 화면에서 생성·관리한다. 로컬 프로젝트를 쓰는 예약 작업은 PC와 앱이 실행 중이어야 한다.

- 공식 안내: <https://learn.chatgpt.com/docs/automations.md>

## 8. 구현 경계

### 백엔드

- API client: KOCA eAIP index와 publication 원문 요청
- parser: publication metadata, ENR section table, altitude/FL 표현
- processor: 원문 보관, 후보 생성, validation, diff, current 활성화
- store: versioned manifest와 마지막 정상 snapshot 보존
- scheduler: per-type lock, AIRAC preflight/effective/follow-up 실행
- API: 현재 cycle, source/effective time, stale/partial/conflicting 상태 노출

### 프런트엔드

- 초기 단계에서 항공로 원문을 직접 보여줄 필요는 없다.
- 고도 비교와 leg 브리핑에 AIP cycle·제약 상태·자료 부족 사유만 표시한다.
- `AIP constraint unavailable`, `conflicting`, `stale`는 위험 없음과 시각적으로 구분한다.

## 9. 검증 기준

- ENR 3.1 고정 fixture에서 route header와 인접 point 행이 올바른 segment JSON으로 변환된다.
- 파일럿 수동 전사의 각 구간은 렌더링 원표 캡처와 source locator로 역추적할 수 있고, 전사자와 독립 검수자가 다르다.
- 파일럿에서 확정한 병합 셀·FIR 경계·방향별 FL series·`UNL`/`FL`/`FT AMSL` 규칙이 본 전사 레코드에 일관되게 적용된다.
- 방향별 Odd/Even 또는 숫자 FL series가 forward/reverse에 뒤바뀌지 않는다.
- `FL`, `FT`, `AMSL`, 괄호 값이 원문·정규화 값·단위와 함께 보존된다.
- 변경 없는 재수집은 동일 해시/동일 normalized 결과를 만들고 current를 불필요하게 바꾸지 않는다.
- 새 AIRAC cycle은 유효시각 전 current가 되지 않는다.
- 수집·파싱·검증 중 어느 하나가 실패해도 마지막 정상 current JSON은 보존된다.
- route graph 미매칭, 신규 FIX, 모순된 고도 제약은 자동 활성화가 아니라 검수 필요 상태가 된다.
- 고도 비교는 unavailable/conflicting AIP 데이터에서 후보 고도를 자동 생성하지 않는다.

## 10. 후속 구현 순서

1. ENR 3.1·3.3의 서로 다른 표 유형을 Playwright로 캡처하고, 항로 단위 파일럿 수동 전사와 독립 검수를 수행한다.
2. 파일럿에서 확인한 행 결합·단위·방향·비고 규칙과 검수 체크리스트를 확정한다.
3. 확정 규칙으로 ENR 3.1, 이어 ENR 3.3의 나머지 항로를 병렬 전사·독립 검수하고 validation/diff report를 만든다.
4. raw/manual-reviewed/normalized/current manifest와 원자적 활성화 모델을 만든다.
5. KOCA index 기반 publication discovery와 변경 구간만 재검수하는 dry-run scheduler를 추가한다.
6. ENR 1.7, ENR 4.4와 필요한 AD 2 절차 자료로 원천 범위를 확장한다.
7. Codex Scheduled task를 AIRAC preflight/effective/follow-up cadence로 등록한다.

각 단계는 실제 원문 fixture, 단위 테스트, 이전 cycle 비교 결과를 검토한 뒤에 다음 단계로 진행한다.
