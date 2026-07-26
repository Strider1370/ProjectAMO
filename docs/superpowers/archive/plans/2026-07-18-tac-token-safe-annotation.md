# METAR·TAF 구조화 TAC 토큰 계약 수정 계획

> 상태: 구현 전
> 대체 대상: `2026-07-17-metar-tac-colored-display.md`의 프런트 부분 문자열 강조 방식
> 관련 설계: `2026-07-17-metar-tac-colored-display-design.md`

## 목표

항공기상 파서가 해석한 항목을 정본으로 삼는다. 백엔드는 TAC 원문과 각 단어의 역할을 함께 저장하고, 프런트는 역할을 기존 위험 색으로만 바꾼다.

```text
KMA IWXXM → 구조화 parser → TAC serializer → raw text + typed display tokens
NOAA raw  → NOAA parser    → raw text + typed display tokens
                                                  │
frontend → role(wind/visibility/weather/ceiling) → 기존 class → span
```

프런트에는 `includes`, `indexOf`, 수치 비교, 원문 재조립이 남지 않는다. 따라서 `28003KT 800 R19/0300N`은 parser/serializer가 각각 `wind`, `visibility`, `rvr`로 지정한 완전한 토큰만 갖고, 숫자가 겹쳐도 오강조될 수 없다.

## 고정 결정

- `header.raw_text`는 provider 원문을 호환용으로 보존한다. NOAA의 공백·끝 `=`·물리 줄바꿈을 바꾸지 않는다.
- `header.tac`는 아래 두 역할을 분리한다.
  - `text`: 반드시 `raw_text`와 같다.
  - `display_lines`: UI의 METAR 행 또는 TAF base/change 행이다. NOAA 한 줄 TAF는 여기에서만 base/FM/BECMG/TEMPO/PROB 행으로 나눌 수 있다. 이는 원문 정규화가 아니다.
- 국내 KMA/IWXXM은 serializer가 구조화 필드에서 원문과 역할 토큰을 동시에 만든다. 문자열을 다시 읽지 않는다.
- NOAA는 진짜 raw TAC가 정본이므로 NOAA parser가 raw를 읽는 시점에 TAC 문법·위치로 역할을 붙인다. 구조화 값은 후보 검증만 하며, 환산 시정값을 원문과 역비교하지 않는다.
- `header.tac`가 없는 과거 캐시는 METAR/TAF 모두 `raw_text` 한 행을 무색으로만 보여 준다. 프런트 fallback에서 TAF 줄 재분할이나 문자열 추측을 하지 않는다.
- 새 위험 기준·색·UI·MapView 변경은 없다. 기존 `highWind`, `visCat`, `ceilCat`, 강수/특이기상 판정을 계속 쓴다.

## 새 snapshot 계약

```js
header: {
  raw_text: 'SPECI RKJB 181420Z 28003KT 800 R19/0300N RA 25/25 Q1002',
  tac: {
    text: 'SPECI RKJB 181420Z 28003KT 800 R19/0300N RA 25/25 Q1002',
    display_lines: [{
      text: 'SPECI RKJB 181420Z 28003KT 800 R19/0300N RA 25/25 Q1002',
      slot_time: null,
      tokens: [
        { text: 'SPECI', role: 'report' }, { text: ' ', role: 'separator' },
        { text: 'RKJB', role: 'station' }, { text: ' ', role: 'separator' },
        { text: '181420Z', role: 'time' }, { text: ' ', role: 'separator' },
        { text: '28003KT', role: 'wind' }, { text: ' ', role: 'separator' },
        { text: '800', role: 'visibility' }, { text: ' ', role: 'separator' },
        { text: 'R19/0300N', role: 'rvr' }, { text: ' ', role: 'separator' },
        { text: 'RA', role: 'weather' }
      ]
    }]
  }
}
```

계약 불변식:

- `header.tac.text === header.raw_text`.
- `display_line.tokens.map((token) => token.text).join('') === display_line.text`.
- `display_lines`의 줄 합계는 `raw_text`와 같을 필요가 없다. 그것은 TAF UI의 의도된 표시 모델이다.
- 역할 allowlist: `plain`, `separator`, `report`, `station`, `time`, `validity`, `change`, `wind`, `visibility`, `rvr`, `weather`, `ceiling`, `temperature`, `qnh`, `supplementary`.
- `CAVOK`, `NSC`, `NOSIG`, `AUTO`, `AMD/COR`, `RMK`, 안전하게 분류할 수 없는 token은 이번 범위에서 `plain`이다.
- TAF `slot_time`은 해당 timeline slot의 UTC 정시 ISO 값이다. base=`valid_start` 정시, FM=시작 시각 정시, BECMG/TEMPO/PROB=범위 시작 정시, RMK=`null`. 프런트가 `DDHH` 문자열을 다시 파싱하지 않는다.

## Task 1 — 실패 사례와 계약을 backend test로 고정

**수정 파일**

- `backend/test/metar-tac.test.js`
- `backend/test/taf-tac.test.js`
- NOAA parser 테스트(새 파일이면 `backend/test/noaa-metar-tac.test.js`, `backend/test/noaa-taf-tac.test.js`)
- `backend/test/overseas-weather-processor.test.js` 또는 기존 store test 확장

1. 국내 fixture에서 serializer presentation의 `raw_text === tac.text`, `display_lines`, token 재결합을 단언한다.
2. `28003KT 800 R19/0300N RA`에서 각각 `wind`, `visibility`, `rvr`, `weather` 역할이 정확한 전체 token에 붙는지 METAR·TAF 모두 검사한다.
3. TAF base/FM/BECMG/TEMPO/PROB+RMK fixture에 `slot_time → timeline slot` 연결을 검사한다.
4. NOAA METAR `3SM`, `M1/4SM`, `P6SM`, `VRB03KT`, `AUTO`, `RMK`, 끝 `=`와 NOAA TAF base/change fixture를 추가한다. 실제 raw 표기 token만 역할을 받고, 불명확한 token은 `plain`인지 검사한다.
5. overseas processor가 NOAA parser의 `raw_text`/`tac`을 별도 overseas store까지 변경 없이 저장하는지 확인한다.

**완료 기준:** 원문 보존, 역할, TAF timeline 연결과 NOAA 저장 경로가 테스트에서 고정된다.

## Task 2 — 국내 IWXXM serializer가 원문과 토큰을 한 번에 만든다

**수정 파일**

- 새 파일: `backend/src/serializers/tac-presentation.js`
- `backend/src/serializers/metar-tac.js`
- `backend/src/serializers/taf-tac.js`
- `backend/src/processors/metar-processor.js`
- `backend/src/processors/taf-processor.js`

1. `tac-presentation.js`에는 serializer/parser가 공유할 작은 constructor만 둔다. 범용 parsing API로 키우지 않는다.

   ```js
   tacToken(text, role)
   tacDisplayLine(tokens, { slotTime })
   tacPresentation(text, displayLines)
   ```

2. `buildMetarTacPresentation(parsed)`은 report/station/time/wind/visibility/rvr/weather/ceiling/temperature/qnh/supplementary 역할 token을 구조화 필드에서 조립한다.
3. `buildTafTacPresentation(parsed)`은 base와 change group마다 display line을 만들며, body의 바람·시정·날씨·운고와 `slot_time`을 parser가 이미 가진 ISO time에서 만든다.
4. 기존 `buildMetarTac()`/`buildTafTac()`는 기존 테스트와 호출부 호환을 위해 `.text`를 반환하는 얇은 wrapper로만 남긴다. processor는 presentation 함수를 사용한다.
5. 국내 `metar-processor.js`/`taf-processor.js`에서만 아래를 설정한다.

   ```js
   parsed.header.raw_text = presentation.text
   parsed.header.tac = presentation
   ```

   `!raw_text`만으로 분기하지 않고 국내 parser provenance로 serializer 적용을 고정한다. NOAA는 이 processor가 아니라 `overseas-weather-processor.js`에서 저장되므로 덮어쓰지 않는다.

**완료 기준:** 국내 IWXXM은 구조화 필드에서 원문과 역할을 함께 만들며, 문자열 재해석이 없다.

## Task 3 — NOAA parser가 raw TAC를 한 번만 주석 처리한다

**수정 파일**

- 새 파일: `backend/src/parsers/tac-annotation.js`
- `backend/src/parsers/noaa-metar-parser.js`
- `backend/src/parsers/noaa-taf-parser.js`
- `backend/src/processors/overseas-weather-processor.js` — 동작 변경이 필요할 때만; 기본은 테스트 대상

1. `tac-annotation.js`는 raw TAC를 공백 보존 token으로 읽고 TAC 문법과 위치로 역할을 붙인다.
   - METAR: report/station/time/wind/rvr/visibility/weather/ceiling/temperature/qnh/supplementary.
   - TAF: report/station/issue/validity/change marker를 먼저 찾고, 각 base/change body의 wind/visibility/weather/ceiling을 분류.
2. 숫자 포함 여부·부분 문자열 매칭은 금지한다. `3SM`, `M1/4SM`, `P6SM`은 raw lexical token과 문법으로만 visibility가 된다.
3. parser가 애매한 token은 `plain`으로 남긴다. 틀린 강조보다 무색 원문이 안전하다.
4. NOAA parser는 provider raw를 바꾸지 않고 `raw_text`와 같은 `tac.text`, UI용 `display_lines`, 각각의 `slot_time`을 함께 설정한다.
5. 국내 IWXXM parser에는 이 annotation을 호출하지 않는다.

**완료 기준:** NOAA 원문 해석 책임도 backend parser 경계에 한 번만 존재한다.

## Task 4 — 프런트는 역할을 기존 위험 class로 투영한다

**수정 파일**

- `frontend/src/features/airport-panel/lib/metarViewModel.js`
- `frontend/src/features/airport-panel/lib/tafViewModel.js`
- `frontend/src/features/airport-panel/lib/metarViewModel.test.js`
- `frontend/src/features/airport-panel/lib/tafViewModel.test.js`

1. 먼저 `rg`로 `buildMetarTacSegments`, `buildTafTacLines`, `splitSegmentsOn`, `buildWindToken`, `buildVisibilityToken`, `buildCeilingToken`, `weatherTokens`, `lineStartKey`의 모든 caller/import/test를 확인한다.
2. `splitSegmentsOn`과 원문 검색용 helper/export/import를 삭제한다. raw TAC 강조를 위한 `includes()`/`indexOf()`는 남기지 않는다.
3. `metarViewModel.js`에 작은 순수 함수 `tacRoleClass(role, context)`만 둔다.

   | 역할 | class 부여 조건 |
   | --- | --- |
   | `wind` | `highWind`일 때 기존 wind class |
   | `visibility` | `visCat`가 VFR 이외일 때 기존 level class |
   | `weather` | 강수/특이기상일 때 기존 weather class |
   | `ceiling` | `ceilCat`가 VFR 이외일 때 기존 level class |
   | 나머지 | 무색 |

4. `buildMetarTacSegments(metar, vm)`는 `metar.header.tac.display_lines[0].tokens`를 `{ text, className }`으로 투영한다.
5. `buildTafTacLines(taf, icao)`는 `display_lines[].slot_time`으로 해당 timeline slot을 직접 찾고 token을 투영한다. `splitTafLines()`와 `lineStartKey()`는 새 계약 경로에서 제거한다.
6. `header.tac`가 없는 legacy payload는 `raw_text`를 한 무색 세그먼트·한 행으로만 반환한다.
7. `MetarTab.jsx`, `TafTab.jsx`, CSS는 현재 span 렌더와 class를 그대로 쓴다. 새 state/effect/UI는 없다.

**완료 기준:** 프런트는 원문의 의미·숫자 위치를 판단하지 않고 typed token만 소비한다.

## Task 5 — 검증과 실제 화면 확인

1. Backend focused: 국내 serializers, NOAA parsers, overseas processor persistence, token 재결합·역할·slot time fixture.
2. Frontend focused: role→class, `28003KT 800 R19/0300N` METAR·TAF, `3SM`/끝 `=` 보존, `header.tac` 없는 legacy 단일행 무색 fallback.
3. 전체 검사:

   ```powershell
   npx depcruise frontend/src --no-config
   npx knip
   npm --prefix frontend test
   npm --prefix frontend run build
   git diff --check
   graphify update .
   ```

   backend test 명령은 기존 script를 확인해 실제 명령으로 실행한다. 설정 부재 결과는 숨기지 않고 범위와 함께 기록한다.
4. `docs/operations/dev-server-and-capture.md` 절차와 Playwright로 desktop, iPad landscape, mobile을 확인한다.
   - METAR: `28003KT`/`R19/0300N`은 무색이고 실제 `800`/`RA`만 강조.
   - TAF: base/change 행의 숫자 충돌이 없고, 접기·배지·timeline/table이 유지됨.
   - legacy cache: 원문은 보이되 임의 색이 붙지 않음.
5. snapshot refresh 시점, NOAA에서 `plain`으로 남긴 문법, 실제 검증 결과를 status에 기록한다.

## 제외

- IWXXM trend/remarks 확장, 새 위험 등급, CSS 재설계, MapView 변경.
- SIGWX·레거시 경보 문자열 분류. 실제 provider fixture에서 오분류가 재현되면 구조화 필드를 정본으로 하는 별도 계획을 연다.
- 새 공개 endpoint나 snapshot version. 기존 weather snapshot에 선택 필드를 더하는 호환 변경만 한다.

## 완료 조건

- 강조 대상은 backend parser/serializer가 지정한 역할 token뿐이다.
- 숫자 충돌이 METAR·TAF 어느 곳에서도 재발하지 않는다.
- 국내 IWXXM은 serializer, NOAA는 parser가 각각 한 번만 역할을 정한다.
- NOAA raw 원문은 보존되고, TAF display line은 별도 UI 모델로 관리된다.
- legacy cache는 안전하게 무색 표시된다.
- focused/backend/frontend tests, 구조 검사, build, diff check, graphify, 3 화면 Playwright 증적과 status 기록이 남는다.
