# Terminal 기상이 상시 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/terminal`의 두 전광판 헤더에서 기상이를 64px로 표시하고, 정보와 상호작용을 방해하지 않는 짧은 상시 이동 모션을 제공한다.

**Architecture:** 기존 `AgencyMascot`는 그대로 재사용하고, 표현 변경은 터미널 전용 CSS에 한정한다. CSS 키프레임이 작은 수평 왕복과 수직 바운스를 결합하며, 전역 reduced-motion 규칙이 해당 애니메이션도 정지시킨다.

**Tech Stack:** React, CSS animations, Node built-in test runner, Playwright terminal-signage contract.

## Global Constraints

- 기존 `/gisang-i/clear_3_avatar.png`를 재사용하고 새 의존성·PixelLab API·런타임 이미지 생성을 추가하지 않는다.
- 표시 크기는 정확히 64×64px다.
- 마스코트는 비상호작용 시각 요소이며 포인터 이벤트를 가로채거나 전광판 데이터·제어부를 가리지 않는다.
- `prefers-reduced-motion: reduce`에서 이동하지 않는다.
- 이미 사용자가 수정한 파일의 무관한 변경은 보존한다.

---

### Task 1: 터미널 마스코트의 안전한 상시 모션

**Files:**
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx:274-276`
- Modify: `frontend/src/features/terminal/terminal.css:86-91, 389, 598-600`
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.board-layout.test.js:155-163`
- Modify: `frontend/verification/contracts/terminal-signage.spec.mjs`
- Test: `frontend/src/features/terminal/DestinationWeatherPage.board-layout.test.js`

**Interfaces:**
- Consumes: `AgencyMascot()`가 두 헤더에서 렌더하는 `/gisang-i/clear_3_avatar.png`.
- Produces: `agency-mascot`의 64px 장식 렌더링과 `agency-mascot--roaming` CSS 모션 훅.

- [ ] **Step 1: 실패하는 소스 계약 테스트를 작성한다.**

`터미널은 프로젝트의 기상이 마스코트와 해외 공항 상세 날씨 안내를 사용한다` 테스트에 다음 단언을 추가한다.

```js
assert.match(source, /className="agency-mascot agency-mascot--roaming"/)
assert.match(styles, /\.agency-mascot \{[^}]*width: 64px[^}]*height: 64px/)
assert.match(styles, /\.agency-mascot--roaming \{[^}]*pointer-events: none[^}]*animation: agency-mascot-roam/)
assert.match(styles, /@keyframes agency-mascot-roam/)
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다.**

Run: `node --test frontend/src/features/terminal/DestinationWeatherPage.board-layout.test.js`

Expected: `agency-mascot--roaming` 또는 64px/키프레임 단언에서 FAIL.

- [ ] **Step 3: 최소 마크업과 CSS를 구현한다.**

`AgencyMascot`의 이미지 클래스에 `agency-mascot--roaming`을 추가한다. 기존의 대체 텍스트는 유지하고, `terminal.css`에서 기존 `agency-mascot`의 크기를 `64px`로 바꾸며, 비상호작용 시각 요소가 클릭을 가로채지 않도록 `pointer-events: none`을 선언한다. 이동은 헤더 안의 제목과 겹치지 않는 작은 수평 범위(최대 16px)와 약한 수직 바운스(최대 3px)만 사용한다.

```css
.agency-mascot--roaming {
  pointer-events: none;
  animation: agency-mascot-roam 3.6s ease-in-out infinite alternate;
}
@keyframes agency-mascot-roam {
  from { transform: translate(0, 0); }
  to { transform: translate(16px, -3px); }
}
@media (prefers-reduced-motion: reduce) {
  .agency-mascot--roaming { animation: none; }
}
```

Adjust the existing board and rail header grid's mascot column from `54px` to `64px`; do not change any other header layout or controls.

- [ ] **Step 4: 테스트를 다시 실행한다.**

Run: `node --test frontend/src/features/terminal/DestinationWeatherPage.board-layout.test.js`

Expected: PASS.

- [ ] **Step 5: 터미널 브라우저 계약에 실제 모션 검증을 추가한다.**

`frontend/verification/contracts/terminal-signage.spec.mjs`에서 보드와 레일 뷰의 `.agency-mascot--roaming`을 role/label로 찾을 수 없으므로, 마스코트의 기존 접근성 이름 `항공기상청 기상이`로 찾는다. 각 뷰에서 다음을 검증한다.

```js
const mascot = page.getByRole('img', { name: '항공기상청 기상이' });
const mascotBox = await mascot.boundingBox();
const titleBox = await page.getByRole('heading', { level: 1 }).boundingBox();
expect(mascotBox.x + mascotBox.width).toBeLessThanOrEqual(titleBox.x);
await expect(mascot).toHaveCSS('pointer-events', 'none');
await expect(mascot).toHaveCSS('animation-name', 'agency-mascot-roam');
await page.emulateMedia({ reducedMotion: 'reduce' });
await expect(mascot).toHaveCSS('animation-name', 'none');
```

Use the contract's existing board/rail view controls and run these assertions at both registered terminal viewports.

- [ ] **Step 6: 터미널 브라우저 계약으로 확인한다.**

Run: `npm --prefix frontend run dev:contract -- --grep terminal-signage`

Expected: terminal-signage contract passes at its desktop and RKPC evidence viewports. Capture the board and rail views and confirm the mascot stays inside the top-left header space, does not cover text or controls, and does not intercept input.

- [ ] **Step 7: 그래프와 변경 사항을 갱신·커밋한다.**

Run: `graphify update .`

The JSX and source-test files overlap user work. Stage only the mascot hunks with interactive staging, inspect the index, then commit no unrelated work:

```bash
git add -p frontend/src/features/terminal/DestinationWeatherPage.jsx frontend/src/features/terminal/DestinationWeatherPage.board-layout.test.js
git add frontend/src/features/terminal/terminal.css frontend/verification/contracts/terminal-signage.spec.mjs
git diff --cached --check
git diff --cached
git commit -m "feat(terminal): animate gisangi mascot"
```
