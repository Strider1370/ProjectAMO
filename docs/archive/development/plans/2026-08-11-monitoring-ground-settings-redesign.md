# Monitoring Ground Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모니터링 지상 설정창을 `일반 / 화면 전환`으로 단순화하고 화면 전환 설정의 정보 순서를 개선한다. 전환 기본 속도는 1000ms로 하며 지도 복귀 시 퇴장 페이드를 보장한다.

**Architecture:** 기존 `Settings` 컴포넌트의 모드별 탭 렌더링을 명시적인 탭 목록으로 바꾸고, 화면 전환 콘텐츠의 DOM 순서를 핵심 작업 중심으로 재배치한다. 저장 모델과 slideshow 도메인 로직은 변경하지 않는다.

**Tech Stack:** React, JSX, CSS, Node test runner, Playwright monitoring contract.

## Global Constraints

- 지상 모드 탭은 `일반`, `화면 전환`만 노출한다.
- 운항 모드의 기존 다섯 탭과 설정 저장 키를 보존한다.
- 화면 전환 장면 순서와 설정 검증 규칙을 변경하지 않는다.
- 한국어 UTF-8 소스는 encoding-safety 정책을 따른다.

---

### Task 1: 설정 탭 노출 계약 추가

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx`
- Test: `frontend/src/features/monitoring/legacy/components/alerts/Settings.test.js`

**Interfaces:**
- `Settings` consumes the existing `isGroundMode` prop.
- The component continues to render the existing tab content and callbacks.

- [ ] **Step 1: Write the failing test**

  Add source-level tests that assert the component defines mode-specific tab metadata and that ground mode excludes `alert`, `traffic`, and `advisory` while retaining `general` and `slideshow`.

- [ ] **Step 2: Run test to verify it fails**

  Run `node --test frontend/src/features/monitoring/legacy/components/alerts/Settings.test.js`.
  Expected: FAIL because the current component renders all five tab buttons unconditionally.

- [ ] **Step 3: Write minimal implementation**

  Define tab metadata with `general`, `alert`, `traffic`, `advisory`, and `slideshow`; derive the rendered list from `isGroundMode`; render the same labels and active state for the selected tab.

- [ ] **Step 4: Run test to verify it passes**

  Run `node --test frontend/src/features/monitoring/legacy/components/alerts/Settings.test.js`.
  Expected: PASS.

### Task 2: 화면 전환 설정 구조 재배치

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx`
- Modify: `frontend/src/features/monitoring/legacy/App.css`
- Test: `frontend/src/features/monitoring/legacy/components/alerts/Settings.test.js`

**Interfaces:**
- Existing slideshow props and callbacks remain unchanged.
- Existing `validateMonitoringSlideshowConfig` remains the source of validation messages.

- [ ] **Step 1: Write the failing test**

  Assert that the source places the enabled/status and target block before the slide list, exposes a collapsible advanced section for effect/duration, and keeps the existing slide IDs and callback names.

- [ ] **Step 2: Run test to verify it fails**

  Run `node --test frontend/src/features/monitoring/legacy/components/alerts/Settings.test.js`.
  Expected: FAIL because the current JSX renders target/effect/duration before the slide list and has no advanced disclosure.

- [ ] **Step 3: Write minimal implementation**

  Reorder the existing controls into sections for status/target, slides, schedule, image, and actions. Keep target in the basic section, add a `다음 페이지` action next to preview/stop, and add a native `details`/`summary` advanced section around effect/duration. Keep all existing values, ranges, callbacks, validation, and footer actions intact. Set the slideshow default transition speed to 1000ms and keep outgoing content mounted through the fade when returning to the live map. Add focused CSS for section headings, slide rows, image metadata, and the advanced disclosure without changing monitoring layout breakpoints.

- [ ] **Step 4: Run test to verify it passes**

  Run `node --test frontend/src/features/monitoring/legacy/components/alerts/Settings.test.js` and `npm --prefix frontend test -- --runInBand` if supported by the frontend scripts.
  Expected: PASS.

### Task 3: Browser verification

**Files:**
- Verify: `frontend/verification/contracts/monitoring.spec.mjs`
- Evidence: `artifacts/responsive-screenshots/monitoring-settings/<timestamp>/`

- [ ] **Step 1: Run the focused monitoring contract**

  Run `npm run dev:contract -- --grep monitoring`.
  Expected: monitoring contract passes for desktop and iPad landscape.

- [ ] **Step 2: Capture the ground and ops settings states**

  Use the project-managed Playwright flow to capture `/monitoring?mode=ground` with the settings opened on `일반` and `화면 전환`, then capture `/monitoring` with the settings opened. Store the manifest and screenshots under the timestamped artifact directory.

- [ ] **Step 3: Run graph update**

  Run `graphify update .` after code changes.
