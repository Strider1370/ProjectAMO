# Plan: 경로 설계안 색상 구분·표시 토글·위험기상 상세

**Spec:** `docs/superpowers/specs/2026-07-21-route-design-identity-and-detail.md`
**Goal:** 지도·패널에서 경로 설계안을 색으로 구분하고, 눈 아이콘으로 지도 표시를 껐다 켤 수 있게 하며, 위험기상 상세(출처·고도대·시간·거리)를 펼쳐볼 수 있게 한다.

## Global Constraints

- 색상은 고정 4색만 쓴다: 기본=`#f97316`(기존과 동일), A=`#2563eb`, B=`#7c3aed`, C=`#0d9488`. 비선택 시 회색은 `#475569`(`tokens.css`의 `--level-gray`와 동일 값)로 통일한다.
- 지도(`routePreview.js`/`routePreviewSync.js`)와 패널(`RouteAlternativesStep.jsx`)이 같은 색 계산 함수를 import해서 쓴다 — 색이 두 군데서 따로 계산되면 어긋날 수 있으므로 반드시 공유 함수.
- 판단 문구(위험/추천 등)를 추가하지 않는다. 시간 상태는 "겹침/안 겹침/정보 없음" 같은 사실 서술만 쓴다.
- 백엔드 변경 없음 — `routeExposure.hazards[]`에 이미 있는 `source`, `label`, `bandFt`, `timeStatus`, `horizontalExposure`만 쓴다.

---

## Task 1: 색상 계산 함수 + 표시/숨김 상태

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeDesignColors.js`
- Test: `frontend/src/features/route-briefing/lib/routeDesignColors.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js:57-59` (상태 선언부 근처), `:1124-1134` (`removeSelectedRouteDesign`), `:1798` 부근 (actions 반환 객체)

**Interfaces:**
- Produces: `routeDesignColor(design, allDesigns): string` (hex), `ALT_ROUTE_COLORS`, `BASE_ROUTE_COLOR`, `UNSELECTED_ROUTE_COLOR` — Task 2·3이 그대로 import
- Produces (useRouteBriefing.js): state에 `hiddenRouteDesignIds`(Set), actions에 `toggleRouteDesignVisibility(id)`

- [ ] Step 1: `routeDesignColors.js` 작성:
  ```js
  export const BASE_ROUTE_COLOR = '#f97316'
  export const ALT_ROUTE_COLORS = ['#2563eb', '#7c3aed', '#0d9488']
  export const UNSELECTED_ROUTE_COLOR = '#475569'

  export function routeDesignColor(design, allDesigns = []) {
    if (!design || design.kind === 'base' || design.id === 'base') return BASE_ROUTE_COLOR
    const altIndex = allDesigns.filter((d) => d.kind === 'alternative').findIndex((d) => d.id === design.id)
    return ALT_ROUTE_COLORS[altIndex] ?? ALT_ROUTE_COLORS[ALT_ROUTE_COLORS.length - 1]
  }
  ```
- [ ] Step 2: 테스트 추가 — base는 항상 주황, 대안 3개가 각각 다른 색, 목록에 없는 id는 마지막 색으로 폴백(방어적 동작)하는지 확인. **주의:** 색은 `designs` 배열에서의 현재 위치(대안 중 몇 번째)로 계산되므로, 대안을 삭제하면 남은 대안들의 색이 바뀔 수 있다(예: 경로 A 삭제 시 경로 B가 A의 옛 자리로 밀려 파란색이 됨). 스펙의 Non-Goal로 명시된 트레이드오프이며 버그가 아니다 — 고치려 하지 말 것.
- [ ] Step 3: `useRouteBriefing.js`에 상태 추가(57-59행 근처):
  ```js
  const [hiddenRouteDesignIds, setHiddenRouteDesignIds] = useState(() => new Set())
  ```
  `toggleRouteDesignVisibility` 함수 추가:
  ```js
  function toggleRouteDesignVisibility(id) {
    setHiddenRouteDesignIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  ```
- [ ] Step 4: `removeSelectedRouteDesign`(1124-1134행)에서 설계안 삭제 시 `hiddenRouteDesignIds`에서도 해당 id를 제거(FR-005):
  ```js
  setHiddenRouteDesignIds((prev) => {
    if (!prev.has(selectedRouteDesignId)) return prev
    const next = new Set(prev); next.delete(selectedRouteDesignId); return next
  })
  ```
  기존 로직(1124-1134행) 안, `setSelectedRouteDesignId(next.selectedId)` 다음 줄에 추가.
- [ ] Step 5: state 반환 객체에 `hiddenRouteDesignIds` 추가, actions 반환 객체(1798행 부근, `duplicateSelectedRouteDesign,` 옆)에 `toggleRouteDesignVisibility,` 추가.
- [ ] Step 6: Verify — `npm --prefix frontend test -- routeDesignColors`; 통과 기대.
- [ ] Step 7: Commit.

## Task 2: 지도 — 경로별 색 + 숨김 필터

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routePreviewSync.js:152-241`
- Modify: `frontend/src/features/route-briefing/lib/routePreview.js:198-206` (`ROUTE_BASELINE_LINE`), `:250-261` (`ROUTE_DESIGN_LINE`)
- Modify: 위 두 sync 함수의 호출부(MapView.jsx 또는 이를 감싸는 effect) — `hiddenRouteDesignIds`를 인자로 전달하도록 시그니처 변경 지점 확인 필요(Step 1에서 먼저 호출부를 찾는다)

**Interfaces:**
- Consumes: Task 1의 `routeDesignColor()`, `hiddenRouteDesignIds`(Set)
- Produces: `route-design-line`/`route-baseline-line` role을 가진 GeoJSON feature에 `properties.color` 추가, 숨긴 설계안의 feature는 소스 데이터에서 제외

- [ ] Step 1: `grep -n "syncRoutePreview\|routePreviewSync" frontend/src/features/map/MapView.jsx`로 호출부를 찾아 `hiddenRouteDesignIds`를 어디서 받아 전달할지 확인한다. 이 태스크의 다른 줄번호(154, 176, 179, 180, 187, 196, 203, 209, 238행)도 Task 1·이전 커밋 이후 밀렸을 수 있으니 grep으로 내용 기준 재확인 후 수정할 것 — 줄번호를 맹신하지 않는다.
- [ ] Step 2: `routePreviewSync.js`의 sync 함수 시그니처에 `hiddenRouteDesignIds = new Set()` 매개변수를 추가한다(154행 부근, 기존 매개변수 목록에 추가).
- [ ] Step 3: 154-241행에서 `routeDesigns`를 순회해 feature를 만드는 지점마다:
  - `hiddenRouteDesignIds.has(design.id)`이면 그 설계안의 feature를 건너뛴다(배열에 아예 안 넣음 — opacity 0이 아니라 완전 제외해서 hit-layer 클릭도 안 잡히게).
  - 살아남은 feature의 `properties`에 `color: routeDesignColor(design, routeDesigns)`를 추가한다(176, 179, 180, 187, 196, 203, 209, 238행 각각의 `properties: { ... }` 객체에 추가).
- [ ] Step 4: `routePreview.js`의 `ROUTE_DESIGN_LINE` paint(255-259행)를 다음으로 교체. `['get','color']`는 Step 3에서 `color`를 못 받은 feature가 하나라도 있으면 `null`이 되어 Mapbox paint 표현식 전체가 깨질 수 있으므로 `['coalesce', ['get','color'], '#f97316']`로 방어한다:
  ```js
  paint: {
    'line-color': ['case', ['boolean', ['get', 'selected'], false], ['coalesce', ['get', 'color'], '#f97316'], '#475569'],
    'line-width': ['case', ['boolean', ['get', 'selected'], false], 5, 3],
    'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 1, 0.6],
  },
  ```
- [ ] Step 5: `ROUTE_BASELINE_LINE` paint(202-205행)도 동일한 패턴으로 교체(현재 `'#64748b'`로 하드코딩된 부분을 `#475569`로, 선택 시 색은 `['coalesce', ['get','color'], '#f97316']`로).
- [ ] Step 6: Verify — `npm --prefix frontend run build`; 성공 기대. 유닛 테스트로 GeoJSON feature 생성 로직을 검증하는 기존 테스트가 있으면(`routePreviewSync.test.js` 존재 여부 확인) 통과 확인, 없으면 스킵.
- [ ] Step 7: Commit.

## Task 3: 패널 — 색 표시 + 눈 아이콘 토글

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteAlternativesStep.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx:115`(prop 시그니처), `:648`, `:733`(두 호출부)
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

**Interfaces:**
- Consumes: Task 1의 `routeDesignColor()`, `hiddenRouteDesignIds`, `toggleRouteDesignVisibility`
- Produces: 카드마다 색 점 + 눈 아이콘 버튼

- [ ] Step 1: `RouteAlternativesStep.jsx`에 `import { Eye, EyeOff } from 'lucide-react'`, `import { routeDesignColor } from './lib/routeDesignColors.js'` 추가.
- [ ] Step 2: 컴포넌트 props에 `hiddenDesignIds = new Set()`, `onToggleVisibility` 추가.
- [ ] Step 3: 기본 경로 박스와 각 대안 카드의 `<strong>{name}</strong>` 앞에 색 점 추가:
  ```jsx
  <span className="rb-route-color-dot" style={{ background: routeDesignColor(design, designs) }} aria-hidden="true" />
  ```
  (기본 경로 쪽은 `design` 대신 `baseDesign`, `designs` 그대로.)
- [ ] Step 4: **확정된 구조 — 리뷰에서 지적된 중첩 button 문제를 다음으로 해결한다.**
  기본 경로(`.rb-comparison-summary`)는 이미 `<div>` 바깥 + `<button class="rb-comparison-summary-select">`(이름·통계) + `<Button>`(우회안 만들기) 형제 구조라 문제없다. 눈 아이콘을 세 번째 형제 `<button>`으로 추가하면 된다:
  ```jsx
  <div className={`rb-comparison-summary${selectedDesignId === baseDesign.id ? ' is-selected' : ''}`}>
    <button type="button" className="rb-comparison-summary-select" ...>...</button>
    <button type="button" className="rb-card-visibility" aria-pressed={!hiddenDesignIds.has(baseDesign.id)}
      onClick={() => onToggleVisibility?.(baseDesign.id)}>
      {hiddenDesignIds.has(baseDesign.id) ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
    <Button appearance="primary" ...>이 경로에서 우회안 만들기</Button>
  </div>
  ```
  대안 카드는 지금 카드 전체가 `<button className="rb-alternative-card">`(96행)라서 그 안에 또 `<button>`을 넣을 수 없다. **카드 자체를 `<div role="button" tabIndex={0}>`로 바꾼다** — `<button>`이 아니므로 내부에 진짜 `<button>`(눈 아이콘)을 형제로 자유롭게 넣을 수 있다:
  ```jsx
  <div key={design.id} role="button" tabIndex={0} aria-selected={selected}
    className={`rb-alternative-card${selected ? ' is-selected' : ''}`}
    onClick={() => onSelect(design.id)}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(design.id) } }}>
    <strong>...</strong>
    ...(기존 내용 그대로)...
    <button type="button" className="rb-card-visibility" aria-pressed={!hiddenDesignIds.has(design.id)}
      onClick={(event) => { event.stopPropagation(); onToggleVisibility?.(design.id) }}>
      {hiddenDesignIds.has(design.id) ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
  ```
  닫는 태그를 `</button>`에서 `</div>`로 바꾸는 것도 잊지 말 것. `role="button"`은 네이티브 버튼의 클릭·엔터·스페이스 동작을 직접 구현해야 하므로 `onKeyDown` 핸들러가 필수다(브라우저가 자동으로 안 해줌). `event.stopPropagation()`은 눈 아이콘 클릭이 카드 선택(`onSelect`)까지 같이 발동하는 걸 막는다.
  두 카드 모두 `.rb-card-visibility`는 `position:absolute`(우측 상단)로 얹는다 — 이제 `<button>` 안에 `<button>`이 아니라 `<div>` 안에 `<button>`이라 DOM상 문제없다.
- [ ] Step 5: `RouteBriefing.css`에 스타일 추가:
  ```css
  .rb-route-color-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .rb-card-visibility { position: absolute; top: 10px; right: 10px; background: none; border: none; padding: 4px; cursor: pointer; color: var(--text-3); border-radius: var(--radius-md); }
  .rb-card-visibility:hover { background: var(--level-gray-bg); }
  .rb-alternative-card, .rb-comparison-summary { position: relative; }
  ```
- [ ] Step 6: `RouteBriefingPanel.jsx` 두 호출부(648, 733행)에 `hiddenDesignIds={hiddenRouteDesignIds}`, `onToggleVisibility={toggleRouteDesignVisibility}` 추가. 115행 함수 시그니처와 172-241행 구조분해 할당에도 `hiddenRouteDesignIds`/`toggleRouteDesignVisibility` 추가.
- [ ] Step 7: Verify — `npm --prefix frontend run build`; 성공 기대.
- [ ] Step 8: Commit.

## Task 4: 위험기상 상세보기

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteAlternativesStep.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`
- Test: `frontend/src/features/route-briefing/RouteAlternativesStep.test.jsx`(신규 파일 — 현재 존재하지 않음)

**Interfaces:**
- Consumes: `hazard.bandFt`(`{ lowFt, highFt }`, `planned-altitude.js:39-44`가 만드는 형태 — `AltitudeWeatherComparison.jsx`의 `altitudeLabel()`이 쓰는 `{ lower_fl, upper_fl }` 형태와 **다르므로 재사용 불가**, 새 헬퍼 필요), `hazard.timeStatus`(`'matched' | 'not_provided' | 'unavailable' | null`, `shared/briefing-status.js:16-20`)
- Produces: `bandFtLabel()`, `timeStatusLabel()` 헬퍼, 카드별 "상세보기" 토글 상태

- [ ] Step 1: 헬퍼 함수 추가:
  ```js
  function bandFtLabel(bandFt) {
    if (!bandFt) return '고도 범위 없음'
    const fmt = (ft) => (ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft).toLocaleString()} ft`)
    return `${fmt(bandFt.lowFt)}–${fmt(bandFt.highFt)}`
  }
  function timeStatusLabel(timeStatus) {
    if (timeStatus === 'matched') return '비행 시간과 겹침'
    if (timeStatus === 'not_provided') return 'ETD/ETA 미입력'
    if (timeStatus === 'unavailable') return '유효기간 정보 없음'
    return '시간 겹치지 않음'
  }
  ```
- [ ] Step 2: `const [detailDesignIds, setDetailDesignIds] = useState(() => new Set())` state 추가(다른 `useState` 선언들 옆).
- [ ] Step 3: 각 카드(기본 경로 포함)에 "상세보기"/"상세 접기" 토글 버튼 추가(위험기상 칩 행 아래):
  ```jsx
  {hazards.length > 0 && (
    <button type="button" className="rb-card-detail-toggle" onClick={(event) => {
      event.stopPropagation()
      setDetailDesignIds((prev) => { const next = new Set(prev); next.has(design.id) ? next.delete(design.id) : next.add(design.id); return next })
    }}>
      {detailDesignIds.has(design.id) ? '상세 접기' : '상세보기'}
    </button>
  )}
  {detailDesignIds.has(design.id) && (
    <span className="rb-card-hazard-detail">
      {hazards.map((hazard) => (
        <span key={`${hazard.sourceId}-detail`} className="rb-card-detail-line">
          {hazard.source} · {hazard.label} · {bandFtLabel(hazard.bandFt)} · {timeStatusLabel(hazard.timeStatus)} · {Math.round(exposureNm(hazard))} NM
        </span>
      ))}
    </span>
  )}
  ```
  기본 경로는 `hazards`/`design.id` 대신 `baseHazards`/`baseDesign.id`로 동일 패턴 적용.
  `.rb-card-hazard-detail`/`.rb-card-detail-line` 클래스는 `AltitudeWeatherComparison.jsx`에서 쓰던 것과 이름을 맞춘다 — CSS는 이미 `RouteBriefing.css`에 정의돼 있으므로(고도 비교 탭 작업에서 추가) 재사용, 새로 정의하지 않는다.
- [ ] Step 4: `.rb-card-detail-toggle` 버튼 스타일만 추가(다른 detail 관련 클래스는 기존 재사용):
  ```css
  .rb-card-detail-toggle { justify-self: start; background: none; border: none; padding: 2px 0; font: inherit; font-size: 12px; font-weight: 600; color: var(--accent); cursor: pointer; }
  ```
- [ ] Step 5: 테스트 추가(`RouteAlternativesStep.test.jsx`, 신규) — `bandFtLabel()`/`timeStatusLabel()` 순수 함수 단위 테스트(컴포넌트 렌더 테스트 프레임워크가 이미 있으면 활용, 없으면 함수를 export해서 순수 함수 테스트만).
- [ ] Step 6: Verify — `npm --prefix frontend test`; 통과 기대. `npm --prefix frontend run build`; 성공 기대.
- [ ] Step 7: Commit.

## Task 5: 계약 검증 및 정리

**Files:**
- Modify: `docs/superpowers/status/route-design-identity-and-detail.status.md`(작성)

- [ ] Step 1: `npm --prefix backend test`, `npm --prefix frontend test` 전체 실행 — 통과 확인.
- [ ] Step 2: `npm --prefix frontend run build` — 성공 확인.
- [ ] Step 3: 사용자의 서버를 죽이지 않는 캡처 방법(기존 `frontend/scripts/_tmp-route-compare-capture.mjs` 확장 또는 신규)으로 다음을 스크린샷 확인: 대안 A/B/C 색 구분, 선택 시 나머지 회색화, 눈 아이콘으로 숨김/복원, 기본 경로 상세보기 펼침.
- [ ] Step 4: 사용자 동의 하에 `npm.cmd run dev:contract -- --grep route-workflow` 실행(서버를 새로 띄우므로 먼저 확인) — 회귀 없는지 확인.
- [ ] Step 5: `docs/superpowers/status/route-design-identity-and-detail.status.md` 작성 — 완료 커밋, 검증 결과 기록.
- [ ] Step 6: Commit.
