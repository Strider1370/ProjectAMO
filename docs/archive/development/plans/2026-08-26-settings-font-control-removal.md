# Settings Font Control Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete font chooser and account-migration notice from the settings modal without changing remaining settings behavior.

**Architecture:** `SettingsModal.jsx` owns the displayed controls and local draft state. Remove only the font-specific import, state, and JSX row, plus the static notice; leave timezone/language persistence untouched.

**Tech Stack:** React, Vite, Playwright.

## Global Constraints

- Keep UTF-8 Korean source intact.
- Preserve timezone, language, reset, apply, and save behavior.
- Verify the user-visible modal in Playwright.

---

### Task 1: Remove obsolete settings controls

**Files:**
- Modify: `frontend/src/features/settings/SettingsModal.jsx`
- Test: `frontend/verification/contracts/notam-and-settings.spec.mjs`

**Interfaces:**
- Consumes: `useTimeZone()` with `setTz(timeZone)`.
- Produces: Settings modal with only timezone and language controls in the display tab.

- [ ] **Step 1: Write the failing browser contract**

```js
await expect(page.getByText('글꼴 (테스트)', { exact: true })).toHaveCount(0)
await expect(page.getByText(/기상 미니마와 비행 알림은/)).toHaveCount(0)
await expect(page.getByLabel('시간대')).toBeVisible()
await expect(page.getByLabel('언어')).toBeVisible()
```

- [ ] **Step 2: Run the contract to verify it fails**

Run: `CONTRACT_REUSE_SERVER=1 npx playwright test --project=desktop verification/contracts/notam-and-settings.spec.mjs -g "renders only active display settings controls"`

Expected: FAIL because the font row and notice are rendered.

- [ ] **Step 3: Remove the font-only UI state and static notice**

```jsx
// Delete FONT_OPTIONS/applyFont/getFontPref import and fontPref state.
// Delete the 글꼴 (테스트) label/select and the migration notice paragraph.
```

- [ ] **Step 4: Run the contract and production build**

Run: `CONTRACT_REUSE_SERVER=1 npx playwright test --project=desktop verification/contracts/notam-and-settings.spec.mjs -g "renders only active display settings controls" && npm run build`

Expected: PASS; timezone, language, and footer actions remain usable.
