# 모바일 UI/UX 정비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 3표면(지도/레이어·공항상세·브리핑)을 증거 기반으로 캡처·분석하고, 디자인 헌법에 맞춰 일관되게 정비한다.

**Architecture:** 헌법 갱신(6대원칙·토큰) → 도구(axe) → 캡처 → 병렬 분석 → 제안서(승인 게이트, 여기서 STOP) → 승인 후 구현 → audit. 헌법 §7 Proposal-First: 구조 변경은 별도 명시 승인 후에만.

**Tech Stack:** React 18 · Vite · @fluentui/react-components · Playwright · @axe-core/playwright · Node test runner.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-01-mobile-design-audit-design.md` (verbatim 기준).
- 대상 표면: 지도/레이어 · 공항상세 · 브리핑. **monitoring·더보기 제외.**
- 일관성 3축: 헌법 준수 + 데스크톱 패리티 + 세 화면 상호 일관.
- 인코딩 안전: `apply_patch` 또는 Node `fs.writeFileSync(..., 'utf8')`. PowerShell `Set-Content`/`Out-File`/`>` 금지.
- 토큰 드리프트는 개별 화면 아닌 `tokens.css`+`tokens.js`(1:1, `tokens.test.js` 강제)·공유 CSS에 반영.
- 맵 레이어/오버레이/타임라인 로직은 소유 feature 모듈 `useXOverlay` 훅. `MapView.jsx`에 신규 state/useEffect 금지 (ADR 0001).
- 캡처 절차: `docs/dev-server-and-capture.md` (포트 5173 `--strictPort`, DOM ready selector, `networkidle` 금지).
- 코드 수정 후 `graphify update .`.
- 커밋: 사용자 지시 시에만. `main` 직접 커밋 금지 → 작업 브랜치.
- **Task 7(제안서)에서 하드 STOP.** 사용자 승인 없이 Task 8+ 진행 금지.

---

## Phase 1 — Foundation (헌법·도구, pre-capture)

### Task 1: 헌법 §5 토큰 추가 — `--touch-min`

**Files:**
- Modify: `frontend/src/shared/theme/tokens.css` (radius 블록 뒤 새 그룹)
- Modify: `frontend/src/shared/theme/tokens.js` (CSS_VARS 동일 키 추가)
- Modify: `docs/design/design-language.md` (§5 CSS 토큰 블록 + radius 줄에 주석 반영)
- Test: `frontend/src/shared/theme/tokens.test.js` (기존 — 1:1 parity 강제, 수정 불필요)

**Interfaces:**
- Produces: CSS 변수 `--touch-min: 44px` (P5·이후 구현이 참조).

- [ ] **Step 1: 테스트가 먼저 깨지는지 확인 (RED)** — `tokens.css`에만 먼저 추가하면 parity 테스트가 깨져야 함. `tokens.css`의 radius 블록(L49) 뒤에 추가:

```css

  /* 터치 (Apple HIG 최소) */
  --touch-min: 44px;
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm.cmd --prefix frontend test -- tokens.test.js` (또는 `node --test frontend/src/shared/theme/tokens.test.js`)
Expected: FAIL — `parsed`에 `--touch-min` 있으나 `CSS_VARS`에 없어 `deepEqual` 불일치.

- [ ] **Step 3: `tokens.js`에 동일 키 추가 (GREEN)** — `CSS_VARS`의 radius 그룹 뒤에 `'--touch-min': '44px',` 추가. (파일 형식은 기존 키 스타일 그대로 따를 것.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test frontend/src/shared/theme/tokens.test.js`
Expected: PASS.

- [ ] **Step 5: 헌법 문서 반영** — `docs/design/design-language.md` §5 "### radius" 항목 뒤에 한 줄 추가:
```
### 터치
`touch-min 44` (Apple HIG 최소 터치 타깃, P5 참조)
```
그리고 §5의 CSS 토큰 블록(```css ... ```) 안 `--radius-circular:9999px;` 뒤에 `--touch-min:44px;` 추가.

- [ ] **Step 6: 커밋** (사용자 승인 시)

```bash
git add frontend/src/shared/theme/tokens.css frontend/src/shared/theme/tokens.js docs/design/design-language.md
git commit -m "feat(design): --touch-min 토큰 추가 (모바일 터치 타깃 P5)"
```

---

### Task 2: 헌법 §6 — 모바일 8원칙 → 6대원칙 교체 + 8원칙 강등

**Files:**
- Modify: `docs/design/design-language.md` (§6 "### 모바일 8원칙" 블록 전체 교체)

**Interfaces:**
- Produces: 헌법 §6 "6-A 모바일 대원칙(P1~P6)" + "6-B 적용 예" — 분석 서브에이전트가 판정 기준으로 참조.

- [ ] **Step 1: 기존 "### 모바일 8원칙 (정식 목표)" 섹션 삭제** — 스펙 4절의 6대원칙(P1~P6) + 6-B 블록으로 통째 교체. 텍스트는 `docs/superpowers/specs/2026-07-01-mobile-design-audit-design.md` §4를 verbatim 복사(P5 검증법의 "axe(target-size)", P6의 "axe(color-contrast·aria)" 문구 포함).

- [ ] **Step 2: 상호 참조 정리** — §6 내 "monitoring 화면이 참조 모델" 등 삭제된 8원칙을 가리키는 문장이 있으면 6-B로 재지시. `docs/` 내 "모바일 8원칙" 문자열 검색해 깨진 참조 없는지 확인:

Run: `grep -rn "모바일 8원칙" docs/`
Expected: 남은 참조가 있으면 "모바일 대원칙"으로 갱신.

- [ ] **Step 3: 스캔 가능성 확인** — §6이 여전히 빠르게 스캔되는지 육안 확인(헌법 §9). 대원칙 6개 + 6-B 한 문단.

- [ ] **Step 4: 커밋** (사용자 승인 시)

```bash
git add docs/design/design-language.md
git commit -m "docs(design): §6 모바일 8원칙 → AI 검증형 6대원칙 교체, 8원칙은 6-B 적용예로 강등"
```

---

### Task 3: `@axe-core/playwright` 추가

**Files:**
- Modify: `frontend/package.json` (devDependencies)

**Interfaces:**
- Produces: `import AxeBuilder from '@axe-core/playwright'` — Task 4 캡처 스크립트가 사용.

- [ ] **Step 1: 설치**

Run: `npm.cmd --prefix frontend install -D @axe-core/playwright`
Expected: `package.json` devDependencies에 `@axe-core/playwright` 추가, 설치 성공.

- [ ] **Step 2: import 스모크 확인**

Run: `node --input-type=module -e "import('@axe-core/playwright').then(m=>console.log(typeof m.default))"` (frontend 디렉터리에서)
Expected: `function` 출력.

- [ ] **Step 3: 커밋** (사용자 승인 시)

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): @axe-core/playwright 추가 (모바일 접근성 스캔)"
```

---

### Task 4: 롱컨텍스트 status 파일 생성

**Files:**
- Create: `docs/superpowers/status/mobile-design-audit.status.md`

- [ ] **Step 1: status 파일 작성** (롱컨텍스트 정책 §3 표준):

```markdown
# 모바일 UI/UX 정비 Status

Updated: 2026-07-01 (작성 시각 KST로 갱신)
Spec: docs/superpowers/specs/2026-07-01-mobile-design-audit-design.md
Plan: docs/superpowers/plans/2026-07-01-mobile-design-audit.md

## Resume Point
- Last completed: (없음 — 시작 전)
- Next: Task 1 Step 1

## Verified
- (없음)

## Unverified / Skipped
- (없음)
```

- [ ] **Step 2: 이후 각 Task 완료 시 이 파일 Resume Point·Updated 한 줄 갱신** (매 밀리스톤, 세션 종료 전 필수).

---

## Phase 2 — Evidence (캡처)

### Task 5: 모바일 audit 캡처 스크립트 작성·실행 (before)

**Files:**
- Create: `frontend/scripts/mobile-audit-capture.mjs`
- Output: `artifacts/responsive-screenshots/mobile-audit-2026-07-01/<state>/` (PNG + `axe.json` + `manifest.json`)

**Interfaces:**
- Consumes: `@axe-core/playwright` (Task 3), dev 서버(포트 5173).
- Produces: 표면×상태별 `{png, axe.json}` + manifest — Task 6 분석 입력.

- [ ] **Step 1: 상태 트리거 셀렉터 확정 (discovery)** — 스크립트 작성 전, dev 서버를 띄우고(`npm.cmd run dev:serve`) 모바일 뷰포트에서 각 상태 진입 방법을 Playwright `page` 스냅샷/`getByRole`로 확인해 표에 채운다. 알려진 앵커:
  - 지도 베이스: route `/`, ready `.map-shell`
  - 항공 시트: `page.getByRole('button', { name: '항공정보 레이어' }).click()` (`.mobile-map-layer-btn`)
  - 기상 시트: `page.getByRole('button', { name: '기상정보 레이어' }).click()`
  - AIRMET 리스트 / 공항경보 리스트: 상단 칩(스냅샷으로 정확한 name 확인 — 예: "AIRMET", "공항경보")
  - 공항 상세: deep-link `/?airport=RKSI` (App.jsx 딥링크), ready `.airport-panel` (실제 클래스는 `AirportPanel.css`에서 확인) → 탭 6개는 탭바 role 버튼 클릭
  - 브리핑: 진입 트리거 확인(하단 탭바 "브리핑" 또는 route-check 패널). 상태 4개: 경로입력 / 위험요약결과(샘플 경로 입력 후) / VFR자동생성 / 수직프로파일(`VerticalProfileWindow` 오픈)
  확정한 셀렉터를 스크립트 `STATES` 배열에 기입.

- [ ] **Step 2: 캡처 스크립트 작성** — 아래 골격. `STATES`는 Step 1에서 확정한 값으로 채운다:

```js
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const OUT = new URL('../../artifacts/responsive-screenshots/mobile-audit-2026-07-01/', import.meta.url)

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop-parity', width: 1536, height: 864 },
]

// surface: map | airport | briefing
// setup(page): 상태 진입 후 ready 될 때까지 대기 (networkidle 금지)
const STATES = [
  { surface: 'map', name: 'base', path: '/', setup: async (p) => { await p.waitForSelector('.map-shell') } },
  { surface: 'map', name: 'aviation-sheet', path: '/', setup: async (p) => {
      await p.waitForSelector('.map-shell')
      await p.getByRole('button', { name: '항공정보 레이어' }).click()
    } },
  { surface: 'map', name: 'met-sheet', path: '/', setup: async (p) => {
      await p.waitForSelector('.map-shell')
      await p.getByRole('button', { name: '기상정보 레이어' }).click()
    } },
  // ... Step 1에서 확정한 나머지 상태(airmet-list, warning-list, timeline,
  //     airport 6탭, briefing 4상태)를 동일 형식으로 채운다.
]

await mkdir(fileURLToPath(OUT), { recursive: true })
const browser = await chromium.launch()
const manifest = { capturedAt: new Date().toISOString(), viewports, states: [] }
try {
  for (const vp of viewports) {
    for (const st of STATES) {
      // 데스크톱 패리티는 지도/공항/브리핑 대표 상태만 (모바일 전상태 반복 불필요)
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
      await page.goto(`${APP_URL}${st.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await st.setup(page)
      const dir = new URL(`${st.surface}/${st.name}/`, OUT)
      await mkdir(fileURLToPath(dir), { recursive: true })
      const png = fileURLToPath(new URL(`${vp.name}.png`, dir))
      await page.screenshot({ path: png, fullPage: false })
      let axe = null
      try { axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze() } catch (e) { axe = { error: String(e) } }
      await writeFile(fileURLToPath(new URL(`${vp.name}.axe.json`, dir)),
        JSON.stringify({ violations: axe?.violations ?? axe }, null, 2), 'utf8')
      manifest.states.push({ surface: st.surface, name: st.name, viewport: vp.name, png })
      console.log(png)
      await page.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(fileURLToPath(new URL('manifest.json', OUT)), JSON.stringify(manifest, null, 2), 'utf8')
}
```

- [ ] **Step 3: 서버 기동 후 실행**

Run (dev-server 문서 절차):
```
npm.cmd run dev:serve   # 별도 실행, 5173 확인
$env:PROJECTAMO_URL = 'http://127.0.0.1:5173'
node frontend/scripts/mobile-audit-capture.mjs
```
Expected: 각 상태 폴더에 `mobile.png` + `mobile.axe.json`(+ 패리티 상태는 `desktop-parity.*`), 루트에 `manifest.json`. 콘솔에 PNG 경로들.

- [ ] **Step 4: 산출물 검증** — 상태 수 = STATES 항목 수와 일치하는지, 깨진(0바이트) PNG 없는지, axe.json에 violations 배열 존재하는지 확인.

- [ ] **Step 5: manifest 보강 + status 갱신** — manifest에 `branch/commit`, `method: "mobile-audit-capture.mjs"` 추가. status 파일 Resume Point 갱신.

- [ ] **Step 6: 커밋** (사용자 승인 시) — 스크립트 + artifacts(용량 고려, 필요 시 스크린샷은 gitignore 여부 확인 후):

```bash
git add frontend/scripts/mobile-audit-capture.mjs
git commit -m "feat(audit): 모바일 캡처 스크립트(상태별 스크린샷+axe 스캔)"
```

---

## Phase 3 — Analysis (병렬)

### Task 6: 표면별 병렬 분석 → 결함 목록

**Files:**
- Create: `artifacts/responsive-screenshots/mobile-audit-2026-07-01/review/issues-map.md`
- Create: `artifacts/responsive-screenshots/mobile-audit-2026-07-01/review/issues-airport.md`
- Create: `artifacts/responsive-screenshots/mobile-audit-2026-07-01/review/issues-briefing.md`
- Create: `.../review/issues-cross.md` (상호 일관성, 메인 작성)

**Interfaces:**
- Consumes: Task 5 산출물(png + axe.json + manifest).
- Produces: 결함 목록 4개 — Task 7 제안서 입력.

- [ ] **Step 1: 표면당 read-only 리뷰어 서브에이전트 3개 병렬 dispatch.** 각 브리프에 반드시 포함:
  - 대상 표면 1개의 스크린샷 경로들 + 데스크톱 패리티 샷 + axe.json
  - 소유 소스 파일 목록 (지도: `frontend/src/features/map/*`, `frontend/src/app/layout/Mobile*.jsx`; 공항: `frontend/src/features/airport-panel/**`; 브리핑: `frontend/src/features/route-briefing/**`)
  - 판정 기준: 헌법 `docs/design/design-language.md` §3·§5·§6(6대원칙 P1~P6)
  - **"graphify 먼저" 규칙 명시** (넓은 코드 탐색 전 `graphify query`)
  - 출력 형식(아래) + **요약 600자 이내 회수, 본문은 파일로**
  - 결함 1건 = `{상태, 스크린샷 파일, 위반 원칙(P1~P6)/축(헌법/패리티/상호), 심각도(기계적깨짐|운영명료성|폴리시), 증거(구체 수치/좌표), 수정방향, 분류힌트(토큰|구조)}`
  - **write set 제한: 각자 자기 `issues-<surface>.md`만 작성.**

- [ ] **Step 2: 3개 결과 회수·검증** — 각 `issues-<surface>.md`가 생성됐고 결함이 형식대로 태깅됐는지 diff로 확인(본문 재열람 아님, 롱컨텍스트 §5.5).

- [ ] **Step 3: 상호 일관성 4th 패스 (메인 직접)** — 3표면 스크린샷/소스를 나란히 놓고 헤더·시트·칩·1차버튼·탭 패턴 대조. 표면 간 불일치를 `issues-cross.md`에 P4 위반으로 기록.

- [ ] **Step 4: status 갱신** (분석 완료, Resume Point → Task 7).

---

## Phase 4 — Proposal (승인 게이트) ⛔

### Task 7: 제안서 작성 + STOP

**Files:**
- Create: `docs/superpowers/specs/2026-07-01-mobile-design-audit-proposal.md`

**Interfaces:**
- Consumes: Task 6 결함 목록 4개.
- Produces: 승인 대상 제안서(2버킷 분류).

- [ ] **Step 1: 결함 통합·중복 제거·우선순위화** — 4개 issues 파일을 표면·원칙별로 묶고 심각도순 정렬.

- [ ] **Step 2: 2버킷 분류** — 각 결함을 버킷1(토큰/시각: 간격·색·타이포·터치타깃·그림자·기존 구조 내 위계) 또는 버킷2(구조: 섹션 재배치·시트↔풀스크린·탭 모델·drawer→sheet)로. 각 항목: `id · 표면 · 증거샷 · 위반 원칙 · 심각도 · 수정방향 · 버킷 · 예상 공수`.

- [ ] **Step 3: 제안서 문서화** — 요약 → 버킷1 표 → 버킷2 표 → 각 버킷2 항목의 운영자 관점 근거·기대효과.

- [ ] **Step 4: status 갱신 후 STOP** — 사용자에게 제안서 리뷰 요청. **버킷1 승인 / 버킷2 항목별 명시 승인**을 받기 전 Task 8+ 진행 금지 (헌법 §7).

---

## Phase 5 — Implementation (승인 후, 조건부)

> Task 8·9의 구체 수정 코드는 **Task 7 제안서가 확정한 항목**으로 채운다(제안서가 이 구간의 하위 스펙 역할). 승인된 항목만 구현.

### Task 8: 버킷1 (토큰/시각) 구현

**Files:** 제안서가 지정 (예: `frontend/src/features/*/**.css`, 공유 토큰).

- [ ] **Step 1: 토큰 드리프트부터** — 하드코딩 px/hex를 §5 토큰으로 치환. 반복되는 값은 개별 화면 아닌 `tokens.css`+`tokens.js`(1:1)·공유 CSS에 반영. `lint-colors.mjs` 통과 확인.
- [ ] **Step 2: 표면별 시각 수정** — 간격·타이포·위계·터치타깃(`min-height/width: var(--touch-min)`)·그림자. 소유 모듈 안에서만.
- [ ] **Step 3: 검증** — `node --test frontend/src/shared/theme/tokens.test.js` + `frontend`빌드(`npm.cmd --prefix frontend run build`) 통과. `graphify update .`.
- [ ] **Step 4: 커밋** (사용자 승인 시), 항목 단위로.

### Task 9: 버킷2 (구조) 구현 — 항목별 승인분만

**Files:** 제안서가 지정. 맵 관련은 소유 feature 모듈 `useXOverlay` 훅 (ADR 0001), `MapView.jsx` 신규 state/useEffect 금지.

- [ ] **Step 1: 승인된 구조 변경 항목만** 소유 모듈에서 구현. 미승인 항목 착수 금지.
- [ ] **Step 2: 검증** — 빌드 + 관련 단위 테스트 + `graphify update .`.
- [ ] **Step 3: 커밋** (사용자 승인 시).

### Task 10: 재캡처(after) + 대조

- [ ] **Step 1:** 캡처 스크립트 재실행(출력 폴더 라벨 `after`, 예: `PROJECTAMO_SCREENSHOT_LABEL` 또는 OUT 경로에 `-after`). axe 재스캔.
- [ ] **Step 2:** before/after 스크린샷 + axe violations 수 대조. 회귀(신규 위반) 없는지 확인.
- [ ] **Step 3:** status 갱신.

### Task 11: `frontend-design-audit` 최종 검수

- [ ] **Step 1:** `frontend-design-audit` 스킬로 3표면 모바일 소스/캡처 검수(사용자 승인 하에 스킬 실행).
- [ ] **Step 2:** 지적사항 반영(버킷1은 즉시, 버킷2급이면 재승인).

### Task 12: 마무리 — Architecture.md · status 종료

**Files:**
- Modify: `Architecture.md` (File Roles: `mobile-audit-capture.mjs` 신설, §6 헌법 변경 반영 필요 시)
- Modify/Delete: `docs/superpowers/status/mobile-design-audit.status.md`

- [ ] **Step 1:** `Architecture.md`에 신설 캡처 스크립트 역할 한 줄 추가, 헌법 §6 변경으로 스테일해진 참조 갱신.
- [ ] **Step 2:** status 파일을 `docs/superpowers/status/archive/`로 이동하거나 삭제(정책 §10).
- [ ] **Step 3:** 최종 커밋 (사용자 승인 시).

---

## Self-Review (작성자 체크 결과)

- **Spec 커버리지:** §3 Fluent 범위→Task 8·9 규칙 반영 / §4 6대원칙→Task 2 / §5 토큰→Task 1 / §6 axe→Task 3·5 / §7.1 캡처→Task 5 / §7.2 분석→Task 6 / §7.3 제안서→Task 7 / §7.4 구현규칙→Task 8·9 / §7.5 검증→Task 10·11·12. 갭 없음.
- **미해결 의존:** Task 5 Step 1(셀렉터 discovery)은 DOM 확인이 필요한 실작업 — placeholder가 아니라 명시된 조사 단계. Task 8·9 코드는 Task 7 제안서 확정 후 채움(감사 특성상 사전 확정 불가).
- **타입/이름 일관:** 캡처 산출 경로(`artifacts/.../mobile-audit-2026-07-01/<surface>/<state>/`)·issues 파일명·버킷 명칭이 Task 5·6·7 간 일치.
