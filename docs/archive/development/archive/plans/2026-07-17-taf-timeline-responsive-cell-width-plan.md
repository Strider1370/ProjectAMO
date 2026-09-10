# TAF 타임라인 글자 짤림 — 눈금 자동 넓힘 + 가로 스크롤 구현 계획

> 작성: 2026-07-17. 상태: **원복됨(2026-07-17)** — 아래 계획대로 구현·검증까지 마쳤으나, 실제로 써보니 사용자가 "반응형으로 늘어나는" 느낌이 별로라고 판단해 전량 되돌림(`tafViewModel.js`/`tafViewModel.test.js`/`TafTab.jsx`는 git checkout으로 완전 원복, `AirportPanel.css`는 TAF 관련 규칙만 수동 원복 — 같은 파일의 AMOS 작업은 유지). TAF 타임라인은 다시 원래 %-폭 방식(글자 짤림 이슈 포함)으로 돌아간 상태. 이 문서는 시도했던 접근과 원복 사유를 남기는 기록용.
> 근거 스펙 = [§11 TAF 타임라인 글자 짤림](../specs/2026-07-13-airport-panel-single-scroll-tac-hero-design.md#11-taf-타임라인-글자-짤림--눈금-자동-넓힘--가로-스크롤-2026-07-13-미구현) — 스펙 쪽 상태도 이 결과를 반영해 갱신 필요(미구현 유지 또는 "시도 후 보류" 표기).
> 라벨(비행조건/날씨/바람/시정/운고) 컬럼 고정(sticky): 처음엔 넣었다가 사용자가 되돌림 — 스크롤하면 라벨도 같이 왼쪽으로 스크롤되는 쪽으로 조정했었음(이후 기능 전체 원복으로 무의미).
> 2차 조정: 짧거나 변화 없는 예보에서 pxPerHour가 작으면 타임라인이 패널 폭의 절반만 쓰는 문제를 발견해 `ResizeObserver` 기반 채움 로직을 추가했었음(이후 기능 전체 원복으로 무의미).

## 0. 문제

`frontend/src/features/airport-panel/lib/tafViewModel.js:77` `groupTafSlots()`가 세그먼트 폭을 **패널 너비의 %**로 계산한다. 예보가 길수록(예 30h) 짧은 구간이 6%대로 쪼그라들어 `29008KT`·`9999` 등 글자가 잘린다. `AirportPanel.css:1495-1509` `.ap-taf-seg`는 `overflow:hidden`만 있고 `text-overflow`/`white-space:nowrap`이 없어 잘림이 더 지저분하게 보인다.

## 1. 성공 기준 (verify)

- 긴 예보 공항(RKSI 등)에서 5줄(비행조건/날씨/바람/시정/운고) 어떤 칸도 글자가 중간에 잘리지 않음(안 들어가면 `…` + 기존 `title` 툴팁).
- 칸이 좁아서 필요한 총 폭이 패널보다 넓으면 `.ap-taf-timeline` 내부에서 가로 스크롤.
- 라벨 컬럼은 스크롤하면 본문과 함께 왼쪽으로 스크롤(고정 아님, 최종 결정).
- 5줄 + 시간눈금이 스크롤 중에도 같은 시각끼리 세로 정렬 유지.
- 짧거나 변화 없는 예보에서도 타임라인이 패널의 원래 폭을 다 씀(빈 여백으로 남지 않음).
- `tafViewModel.test.js` 통과(폭 계산 시그니처 변경 반영).
- Playwright: RKSI 등 긴 예보 공항, 데스크톱·iPad 폭에서 짤림 0 / 스크롤 동작 / 5줄 정렬 확인. 짧은 예보 공항에서 패널 폭이 다 채워지는지도 확인.

## 2. 단계

### Phase 1 — `tafViewModel.js`: % 폭 → 콘텐츠 기반 px/hour

- `estimateSegWidthPx(text, hasIcon)` 추가: 문자수 근사(모노 계열 × char폭) + `.ap-taf-seg` 패딩/보더 고정값 + (날씨·바람 줄은) 아이콘 폭. 캔버스 측정 없이 근사치로 충분(스펙이 두 방식 다 허용).
- `computeTafPxPerHour(rows, floorPx = 18)` 추가: 5줄 전체 세그먼트 중 `필요폭 / 구간시간(칸 수)`이 최대인 값을 찾아 그 값을 px/hour로 반환(`Math.max(floorPx, ...)`).
- `groupTafSlots(slots, keyFn)`는 **그룹핑만** 하도록 축소 — `width: '%'` 계산 제거. 폭 부여는 Phase 2에서 별도 단계로.
- ⚠ **하위 호환 깨짐**: `tafViewModel.test.js:34-42`가 `group.width === '50%'`를 직접 검사 중 → **확정**: `groupTafSlots`는 `width` 프로퍼티를 아예 반환하지 않도록 고치고, 테스트는 그룹핑(순서·`key`)만 검사하게 수정. `computeTafPxPerHour`용 테스트는 별도로 새로 추가(기존 테스트 수정과 섞지 않음).

### Phase 2 — `TafTab.jsx`: 렌더 순서 변경 + px 폭 부여

- 5줄을 먼저 그룹핑(`groupTafSlots`, 폭 없이) → 각 줄의 그룹+텍스트+아이콘여부로 `computeTafPxPerHour` 호출 → 하나의 `pxPerHour` 산출.
- 각 세그먼트에 `width: `${group.items.length * pxPerHour}px`` 부여(기존 `%` 대신).
- `.ap-taf-scale`에 인라인 스타일로 `--taf-px-per-hour: `${pxPerHour}px`` 전달(기존 `--taf-hour-count`와 나란히).

### Phase 3 — `AirportPanel.css`: 스크롤 + 고정 라벨 레이아웃

- `.ap-taf-scale` (1469-1476행): `grid-template-columns: repeat(var(--taf-hour-count), minmax(18px, 1fr))` → `repeat(var(--taf-hour-count), var(--taf-px-per-hour, 18px))`. **이 규칙이 `.ap-taf-scale`엔 이미 단독으로 존재**(1462-1467행의 공용 2컬럼 규칙을 덮어씀)하므로, 눈금 줄의 폭은 이 한 줄만으로 결정됨.
- `.ap-taf-line` (1462-1467행 공용 규칙, `.ap-taf-scale`엔 위 override가 이겨서 적용 안 됨): 2번째 컬럼 `minmax(0, 1fr)` → `max-content` — **데이터 5줄(비행조건~운고)에만 해당**. 트랙 폭이 세그먼트 합계 px만큼 실제로 커지게 해서 넘친 만큼 스크롤 대상이 되게 함.
- `.ap-taf-timeline` (1456-1460행): `overflow-x: auto` 추가. 이 컨테이너가 가로 스크롤을 담당(스펙 표현 그대로 — 개별 줄이 아니라 타임라인 전체가 함께 스크롤돼야 5줄 정렬이 깨지지 않음).
- ~~라벨 고정~~: 처음엔 `.ap-taf-line-label`에 `position: sticky`를 넣었으나 **사용자가 되돌림** — 라벨은 그냥 본문과 같이 스크롤(추가 CSS 없음).
- `.ap-taf-seg` (1495-1509행): `flex-shrink: 0` 추가(없으면 flex가 좁은 컨테이너에 맞춰 다시 욱여넣음). 내부 텍스트 `<span>`에 `white-space: nowrap; text-overflow: ellipsis; overflow: hidden; min-width: 0` 추가(부모도 `min-width:0` 필요).
- `.ap-taf-line-track` (1486-1493행): `overflow: hidden` 제거(가로 스크롤은 이제 `.ap-taf-timeline`이 담당하므로 여기서 클리핑하면 안 됨). `min-width: 0`도 불필요해지면 정리.

### Phase 4 — 검증

- `npm.cmd run dev:smoke` 또는 포커스 Playwright 스크립트로 RKSI(예보 김) TAF 탭을 데스크톱(1600px)·iPad(768~1024px대) 폭에서 캡처.
- 확인 항목: 5줄 글자 잘림 0(또는 `…`+툴팁), 라벨 고정, 스크롤 시 5줄 시간축 정렬 유지, 짧은 예보 공항(스크롤 불필요 케이스)도 기존과 동일하게 보임.
- `node --test frontend/src/features/airport-panel/lib/tafViewModel.test.js` (또는 프로젝트 테스트 러너)로 단위 테스트 통과 확인.

### Phase 5 — 사용 후 조정: 빈 여백 없이 패널 폭 다 채우기 (2026-07-17 추가)

- 문제: 예보가 30시간 내내 거의 안 바뀌면(긴 그룹 하나) `computeTafPxPerHour`가 뽑는 값이 작아서(글자 안 잘리는 최소치일 뿐) `hourCount × pxPerHour`가 패널 폭보다 작아짐 → 오른쪽에 빈 여백이 남음(예전 `%` 폭 방식은 항상 100% 채웠으므로 이건 회귀).
- 해결: `TafTab.jsx`에 `useRef` + `useLayoutEffect`(`ResizeObserver`)로 `.ap-taf-timeline`의 실제 렌더 폭(`containerWidth`)을 측정 → `fillPxPerHour = floor((containerWidth - 58 - 6) / hourCount)` 계산 → 최종 `pxPerHour = max(contentPxPerHour, fillPxPerHour)`. 즉 "글자 안 잘리는 최소치"와 "패널을 다 채우는 값" 중 큰 쪽을 씀 — 내용이 넓게 필요하면 스크롤(Phase 3 그대로), 내용이 헐렁하면 패널 폭까지 늘어남.
- `TAF_LABEL_COL_PX=58`, `TAF_ROW_GAP_PX=6`는 CSS `.ap-taf-line { grid-template-columns: 58px max-content; gap: 6px }`와 값이 같아야 함(주석으로 명시).
- `ResizeObserver`가 창 크기·드로어 폭 변화에도 반응하므로 반응형 유지.

### 참고 — 리뷰에서 나왔으나 범위 밖으로 확인된 것

- `AirportPanel.css:669-728`의 `.ap-current-taf .ap-taf-*` 규칙(같은 클래스명에 다른 오버라이드)은 리뷰 중 충돌 우려로 제기됐으나, **`.ap-current-taf`는 실제 컴포넌트 어디서도 쓰이지 않는 죽은 CSS**로 확인됨(grep 결과 JSX 어디에도 없음). 이번 작업과 무관 — 별도 정리 대상으로만 남겨둠.
- `floorPx = 18`은 기존 `.ap-taf-scale`의 `minmax(18px, 1fr)`에서 그대로 가져온 값(회귀 방지용 하한선).

## 3. 트레이드오프 (스펙에서 이미 인지)

- 가장 빡빡한 칸 하나가 눈금 전체를 넓혀서, 여유 있는 칸까지 같이 넓어져 스크롤이 필요 이상으로 생길 수 있음. 우선 이 정도로 가고, 과하면 CSS Grid/subgrid로 필요한 시간대만 넓히는 정밀화로 승격(5줄 flex→격자 리팩터라 선제 적용 안 함).
- 문자수 근사치라 폰트 렌더링에 따라 1~2px 오차 가능 — 안전하게 살짝 여유(floor/올림) 두는 정도로 대응, 실사용 후 필요하면 canvas measure로 전환.

## 4. 영향받는 파일

- `frontend/src/features/airport-panel/lib/tafViewModel.js` (수정)
- `frontend/src/features/airport-panel/lib/tafViewModel.test.js` (수정 — 폭 계산 계약 변경 반영)
- `frontend/src/features/airport-panel/tabs/TafTab.jsx` (수정)
- `frontend/src/features/airport-panel/AirportPanel.css` (수정, `.ap-taf-*` 규칙)
