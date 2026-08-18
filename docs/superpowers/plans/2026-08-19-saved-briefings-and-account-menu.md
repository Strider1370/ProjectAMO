# 3단계: 저장된 브리핑과 내 계정 메뉴 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고도까지 확정된 브리핑을 저장하고, 내 계정 메뉴에서 한 번에 다시 연다. 비행 알림은 그 저장된 브리핑을 감시한다.

**Architecture:** 저장 형식은 그대로 두고 스냅샷에 종류 표시(`kind`)만 더한다. 브리핑 저장은 이미 있는 저장 통로(`saveRoute`)를 그대로 쓰고, 여는 것은 2단계에서 만든 `openSavedBriefing`을 그대로 쓴다. 새로 만드는 것은 종류 구분, 계정 메뉴 화면, 그리고 알림 등록의 목록 교체뿐이다.

**Tech Stack:** React 18 + Fluent UI, Express + better-sqlite3, `node --test`.

## Global Constraints

- 스펙: [2026-08-18 저장된 브리핑과 내 계정 메뉴](../specs/2026-08-18-saved-briefing-and-account-menu-design.md) · 선행: [2단계 상태](../status/2026-08-18-saved-route-load-without-research.status.md)
- **저장 payload 상한 20,000 B** (`backend/src/me/routes.js:8`). 2단계 실측 최대 9,280 B.
- **저장 형식을 새로 만들지 않는다.** `routes` 테이블과 `POST /api/me/routes`를 그대로 쓰고 스냅샷에 `kind`만 더한다. 새 테이블·새 라우터 금지.
- **기상을 저장하지 않는다.** 열 때마다 다시 계산한다.
- **`kind`가 없는 기존 저장분은 경로로 취급한다.** 2단계까지 저장된 것들이 그렇다.
- Linux 전용. 테스트는 `node --test`. 프레임워크 추가 금지.
- **작업 트리 주의:** 여러 세션이 공유한다. 커밋 시 `git add`로 해당 파일만 담는다. **`git add -A` 금지.**

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `frontend/src/features/route-briefing/lib/routeStore.js` | `kind` 보존 + 종류별 목록 조회 | 수정 |
| `frontend/src/features/route-briefing/lib/routeStore.test.js` | 위 테스트 | 수정 |
| `frontend/src/features/route-briefing/BriefingView.jsx` | `브리핑 저장` 버튼 | 수정 |
| `frontend/src/features/route-briefing/useRouteBriefing.js` | 브리핑 저장 동작 | 수정 |
| `frontend/src/features/account/AccountPanel.jsx` | 내 계정 화면 (저장 브리핑 + 개인설정 + 로그아웃) | **신규** |
| `frontend/src/app/App.jsx` | 계정 패널 연결 | 수정 |
| `frontend/src/features/settings/SettingsModal.jsx` | 개인설정 탭 제거 | 수정 |
| `frontend/src/features/personal/usePersonalSettings.js` | 알림 템플릿을 브리핑에서 | 수정 |
| `frontend/src/features/personal/PersonalSettingsPanel.jsx` | 템플릿 라벨 문구 | 수정 |

---

## 배경 — 왜 나누는가

브리핑은 경로만으로 성립하지 않는다. 대안 경로를 비교하고 순항고도를 정해야 나온다. 저장 경로를 불러와 곧바로 브리핑을 띄우면 **사용자가 정한 적 없는 고도의 판단 화면**이 뜬다. 2단계에서 실제로 그렇게 만들었다가 되돌렸다.

알림도 같은 이유다. 스케줄러는 순항고도로 착빙·난류를 판정하는데, 없으면 9000ft로 가정한다(`scheduler.js:19` `DEFAULT_CRUISE_ALT_FT`). FL350 계획을 9000ft로 판정한 경보는 무의미하다.

**저장 재료는 이미 다 있다.** 현재 스냅샷이 `cruiseAltitudeFt`·`selectedAlternativeId`·`alternatives`·`etd`·`eta`와 1·2단계에서 넣은 기하·`routeModel`·`routeMarkers`·`airacCycle`을 담는다. 브리핑을 되살리는 코드(`openSavedBriefing`)도 2단계에서 만들어 검증까지 끝냈다. **이 단계는 구분과 화면이 전부다.**

---

### Task 1: 저장물에 종류를 붙인다

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeStore.js`
- Modify: `frontend/src/features/route-briefing/lib/routeStore.test.js`

**Interfaces:**
- Produces:
  - `normalizeRouteSnapshot`이 `kind: 'route' | 'briefing'`을 보존한다. 없으면 `'route'`.
  - `listSavedRoutes({ kind })` — 종류로 거른 목록. 인자 없으면 전부.
  - `saveRoute(name, snapshot)`는 그대로. 호출자가 `kind`를 스냅샷에 넣는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`routeStore.test.js` 끝에 추가한다.

```js
test('normalizeRouteSnapshot: kind를 보존하고, 없으면 경로로 본다', () => {
  const briefing = normalizeRouteSnapshot({
    version: 3, kind: 'briefing',
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(briefing.kind, 'briefing')

  // 2단계까지 저장된 것들에는 kind가 없다 — 경로로 취급한다.
  const legacy = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(legacy.kind, 'route')
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeStore.test.js
```

Expected: FAIL — `undefined !== 'briefing'`

- [ ] **Step 3: 최소 구현**

`routeStore.js`의 v3 분기에 한 줄, 그리고 목록 조회에 필터를 더한다.

```js
    version: 3,
    // 'route' = 경로(다음 비행의 출발점) · 'briefing' = 고도까지 확정된 한 번의 비행.
    // 2단계까지 저장된 것들에는 없다 — 경로로 본다.
    kind: snapshot.kind === 'briefing' ? 'briefing' : 'route',
    base: persistedDesign(snapshot.base),
```

`listSavedRoutes`를 고친다.

```js
// kind로 거른 목록. 인자 없으면 전부.
export async function listSavedRoutes({ kind } = {}) {
  const all = await listAllSavedRoutes()
  return kind ? all.filter((entry) => (entry.kind === 'briefing' ? 'briefing' : 'route') === kind) : all
}
```

기존 `listSavedRoutes` 본문을 `listAllSavedRoutes`로 이름만 바꿔 내부 함수로 남긴다(export 하지 않는다).

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test
```

Expected: 전부 PASS. `listSavedRoutes()`를 인자 없이 부르던 곳들이 그대로 동작해야 한다.

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/lib/routeStore.js frontend/src/features/route-briefing/lib/routeStore.test.js
git commit -m "feat(route): tag saved snapshots as route or briefing"
```

---

### Task 2: 브리핑 저장 버튼

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` (`saveCurrentBriefing`)
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx` (버튼)

**Interfaces:**
- Consumes: `buildSavedGeometry` (1·2단계), `saveRoute`, `kind` (Task 1).
- Produces: 훅 액션 `saveCurrentBriefing()` — 이름을 묻고 `kind: 'briefing'`으로 저장한다.

브리핑이 이미 만들어진 상태에서만 부른다. 저장 내용은 `RouteBriefingPanel.handleSaveCurrentRoute`가 만드는 것과 같되 `kind`와 **적용된 고도**가 들어간다.

- [ ] **Step 1: 훅에 저장 함수를 더한다**

`useRouteBriefing.js`의 `handleGenerateBriefing` 근처에 넣는다. 패널의 저장 함수와 같은 재료를 쓰되, 고도는 브리핑에 실제로 쓰인 값을 넣는다.

```js
  // 브리핑 저장 — 고도까지 확정된 한 번의 비행을 통째로 남긴다. 경로 저장과 형식은 같고
  // kind로만 갈린다. 기상은 담지 않는다(열 때마다 새로 계산).
  async function saveCurrentBriefing() {
    if (!briefing) return null
    const base = routeDesigns.find((design) => design.id === activeAppliedDesignId)
      ?? routeDesigns.find((design) => design.id === 'base')
    const def = `${routeForm.departureAirport || '?'} → ${routeForm.arrivalAirport || '?'}`
    const name = window.prompt('브리핑 이름', def)
    if (name == null) return null
    const { routeGeometry, enrouteGeometry, routeModel, routeMarkers } = buildSavedGeometry({
      routeResult: base?.routeResult ?? routeResult,
      vfrWaypoints: appliedVfrWaypoints,
      selectedSid, selectedStar, selectedIap,
    })
    const airacCycle = (await loadNavdata()).publicationId ?? null
    return saveRoute(name.trim() || def, {
      version: 3,
      kind: 'briefing',
      cruiseAltitudeFt, tasKt, etd, eta,
      routeGeometry, enrouteGeometry, routeModel, routeMarkers, airacCycle,
      alternateAirport: alternateAirport || null,
      selectedAlternativeId: null, // 저장 시점에 고른 설계안이 곧 base다
      base: base && {
        id: 'base', kind: 'base', name: base.name,
        routeForm: base.routeForm,
        procedureIds: { sid: base.procedures?.sid?.id ?? null, star: base.procedures?.star?.id ?? null, iapKey: base.procedures?.iapKey ?? null },
        enroute: base.enroute,
        routeString: base.routeString,
      },
      alternatives: [],
    })
  }
```

`saveRoute`·`buildSavedGeometry`·`loadNavdata` import가 훅에 없으면 더한다. 훅 반환 `actions`에 `saveCurrentBriefing`을 노출한다.

**`selectedAlternativeId: null`과 `alternatives: []`인 이유:** 브리핑은 이미 고른 하나의 비행이다. 대안 목록까지 담으면 payload가 커지고, 열었을 때 "어느 것이 이 브리핑인가"가 다시 모호해진다.

- [ ] **Step 2: 브리핑 화면에 버튼을 단다**

`BriefingView.jsx`에서 브리핑이 있을 때 보이는 자리에 버튼을 넣는다. 기존 버튼들과 같은 Fluent `Button`을 쓴다.

```jsx
<Button appearance="primary" onClick={onSaveBriefing}>브리핑 저장</Button>
```

`onSaveBriefing` prop을 받아 상위에서 `actions.saveCurrentBriefing`을 연결한다. 저장 성공 후 사용자에게 결과를 알린다 — 기존 `MessageBar` 패턴을 따른다.

- [ ] **Step 3: 빌드 확인**

```bash
npm --prefix frontend run build
```

Expected: 성공. `appliedVfrWaypoints`·`selectedIap`·`activeAppliedDesignId`가 훅 스코프에 있는지 확인한다(`handleGenerateBriefing`이 이미 쓴다).

- [ ] **Step 4: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/BriefingView.jsx
git commit -m "feat(briefing): save a briefing with its cruise altitude"
```

---

### Task 3: 내 계정 패널

**Files:**
- Create: `frontend/src/features/account/AccountPanel.jsx`
- Modify: `frontend/src/app/App.jsx`
- Modify: `frontend/src/features/settings/SettingsModal.jsx`

**Interfaces:**
- Consumes: `listSavedRoutes({ kind: 'briefing' })` (Task 1), `PersonalSettingsContent` (기존), `useAuth`.
- Produces: `AccountPanel` — 저장 브리핑 목록·개인설정·로그아웃.

- [ ] **Step 1: 계정 패널을 만든다**

`AccountPanel.jsx`를 만든다. `PersonalSettingsPanel.jsx`의 Fluent 사용 방식과 `SettingsModal.jsx`의 탭 구성을 따른다.

구성:
- 상단: 사용자 이름·역할
- **저장한 브리핑** 목록 — 이름, 저장 시각(`relativeTime` 재사용), `열기` / `삭제`
- **개인설정** — `PersonalSettingsContent`를 그대로 렌더
- 로그아웃

`열기`는 `onOpenBriefing(entry)`를 부른다. 상위에서 `mapRef.current?.loadRouteBriefing?.(entry)`로 잇는다 — 2단계에서 딥링크가 쓰는 그 통로다.

목록이 비면 `저장한 브리핑이 없습니다`를 보여주고, 브리핑 화면에서 저장할 수 있다고 한 줄로 안내한다.

- [ ] **Step 2: 로그인 버튼을 계정 패널로 잇는다**

`App.jsx:221`의 `onProfileClick={() => setAuthOpen(true)}`를 바꾼다.

```jsx
onProfileClick={() => (user ? setAccountOpen(true) : setAuthOpen(true))}
```

`accountOpen` 상태와 `AccountPanel` 렌더를 더한다. 로그인 전에는 지금처럼 `AuthModal`이 뜬다.

- [ ] **Step 3: 설정 모달에서 개인설정 탭을 뺀다**

`SettingsModal.jsx:48`의 `<Tab value="personal" ...>개인설정</Tab>`과 `:82`의 렌더를 제거한다. `PersonalSettingsContent` import도 뺀다. 표시 설정만 남는다.

**`PersonalSettingsPanel.jsx` 파일은 지우지 않는다** — `PersonalSettingsContent`를 계정 패널이 그대로 쓴다.

- [ ] **Step 4: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
```

Expected: 둘 다 성공. 설정 모달을 참조하는 테스트가 개인설정 탭을 기대하면, 그 기대를 계정 패널로 옮긴다. **그냥 지우지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/account/AccountPanel.jsx frontend/src/app/App.jsx frontend/src/features/settings/SettingsModal.jsx
git commit -m "feat(account): gather saved briefings and personal settings in one place"
```

---

### Task 4: 비행 알림이 브리핑을 감시한다

**Files:**
- Modify: `frontend/src/features/personal/usePersonalSettings.js:33-40` (`refreshTemplates`)
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx` (라벨)

**Interfaces:**
- Consumes: `listSavedRoutes({ kind: 'briefing' })` (Task 1).

알림 등록은 템플릿을 복제해 `alert_enabled=1` 행을 만든다(`me/alerts.js:62`). 복제되는 것이 브리핑이면 그 payload에 순항고도가 들어 있어, 스케줄러의 `buildBriefingRequest`가 `p.cruiseAltitudeFt`를 읽어 정확한 고도로 판정한다. **백엔드는 고칠 것이 없다** — 이미 그 필드를 읽는다(`scheduler.js:45`).

- [ ] **Step 1: 템플릿 목록을 브리핑으로 바꾼다**

`usePersonalSettings.js`의 `refreshTemplates`가 `/api/me/routes`를 직접 부른다. `listSavedRoutes({ kind: 'briefing' })`를 쓰도록 바꾼다.

```js
  // 감시 대상은 저장된 브리핑이다 — 순항고도가 확정돼 있어야 착빙·난류 판정이 맞는다.
  // 경로만으로는 고도를 몰라 스케줄러가 9000ft로 가정한다(scheduler.js DEFAULT_CRUISE_ALT_FT).
  const refreshTemplates = useCallback(async () => {
    if (!user) return
    try { setTemplates(await listSavedRoutes({ kind: 'briefing' })) }
    catch { /* best-effort */ }
  }, [user])
```

- [ ] **Step 2: 라벨을 고친다**

`PersonalSettingsPanel.jsx`의 `경로 템플릿` 라벨과 `선택하세요` 안내를 브리핑 기준으로 바꾼다 — `감시할 브리핑`. `aria-label`도 함께 고친다.

목록이 비었을 때 안내를 더한다: `저장한 브리핑이 없습니다 — 브리핑 화면에서 먼저 저장하세요`.

- [ ] **Step 3: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
```

- [ ] **Step 4: 커밋**

```bash
git status --short
git add frontend/src/features/personal/usePersonalSettings.js frontend/src/features/personal/PersonalSettingsPanel.jsx
git commit -m "feat(alerts): watch saved briefings instead of routes"
```

---

### Task 5: 관문 — 저장하고, 열고, 감시한다

**Files:** 없음 (검증만)

- [ ] **Step 1: 서버를 띄운다**

```bash
ss -ltnp | grep -E ':3001|:5173'
DISABLE_COLLECTION=1 npm run dev:serve
```

`DISABLE_COLLECTION=1`은 자동수집을 끄되 admin 자동 로그인은 하지 않는다 — 일반 사용자로 확인해야 한다.

- [ ] **Step 2: 브리핑을 만들고 저장한다**

`test` / `test1234`로 로그인. 경로를 만들고 대안 비교·고도 설정을 거쳐 브리핑까지 간 뒤 **`브리핑 저장`**.

- [ ] **Step 3: 관문 A — 저장 내용을 확인한다**

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db',{readonly:true});
for (const r of db.prepare('SELECT id, name, payload FROM routes ORDER BY id').all()) {
  const p=JSON.parse(r.payload);
  console.log(r.id, r.name, { kind: p.kind ?? '(없음)', bytes: Buffer.byteLength(r.payload,'utf8'), alt: p.cruiseAltitudeFt, coords: p.routeGeometry?.coordinates?.length });
}"
```

**통과 기준:** 새 저장물의 `kind`가 `briefing`, `cruiseAltitudeFt`가 화면에서 고른 값과 같고, 크기가 20,000 B 미만.

- [ ] **Step 4: 관문 B — 계정 메뉴에서 연다**

브라우저를 완전히 새로 고친다. 사이드바 프로필(로그인 버튼 자리)을 누른다.

**통과 기준:**
- 계정 패널이 열리고 방금 저장한 브리핑이 목록에 있다
- `열기`를 누르면 **브리핑 페이지가 그대로 뜬다** — 고도가 저장한 값이고, NAVLOG와 연직단면도가 채워져 있다
- 개인설정(기상 미니마·비행 알림)이 같은 패널 안에 있다
- 설정 모달에는 개인설정 탭이 없다

- [ ] **Step 5: 관문 C — 경로 저장과 섞이지 않는다**

`경로` 메뉴를 연다.

**통과 기준:** 저장한 **브리핑이 경로 목록에 보이지 않는다.** 반대로 계정 패널의 브리핑 목록에 경로가 보이지 않는다.

- [ ] **Step 6: 관문 D — 알림이 브리핑을 감시한다**

계정 패널 > 비행 알림에서 방금 저장한 브리핑을 골라 ETD를 **현재 + 1시간**으로 등록한다. 그다음 스케줄러를 1회 돌린다.

```bash
node /home/john_doe/ProjectAMO/../scratch/tick.mjs   # 없으면 아래 curl
curl -s -b <쿠키> -X POST http://127.0.0.1:3001/api/dev/tick | cat
```

**통과 기준:** `evaluated >= 1`, `skipped == 0`. 그리고 DB에서 그 행의 payload에 `cruiseAltitudeFt`가 있어 스케줄러가 9000ft 기본값을 쓰지 않는다.

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db',{readonly:true});
for (const r of db.prepare('SELECT id, name, alert_enabled, payload FROM routes WHERE alert_enabled=1').all()) {
  console.log(r.id, r.name, 'alt:', JSON.parse(r.payload).cruiseAltitudeFt);
}"
```

- [ ] **Step 7: 결과를 상태 파일에 남긴다**

`docs/superpowers/status/2026-08-19-saved-briefings-and-account-menu.status.md`에 한 페이지로: 저장물 종류·크기·고도, 네 관문 결과, 남은 위험.

- [ ] **Step 8: 커밋**

```bash
git add docs/superpowers/status/2026-08-19-saved-briefings-and-account-menu.status.md
git commit -m "docs: record stage 3 gate results"
```

---

## 완료 조건

- `npm test` (루트) 전체 통과
- `npm --prefix frontend run build` 성공
- 관문 A~D 전부 통과
- 우리 커밋에 다른 세션의 변경이 섞이지 않았다

## 이 단계에서 하지 않는 것

- **푸시 알림** — 4단계. 발송 규칙·감시창·구독 스위치는 [2026-08-17 스펙](../specs/2026-08-17-saved-route-briefing-and-push-design.md)의 3단계 절 그대로.
- **변경점 띠와 `FlightAlertDetail` 제거** — 4단계. 띠에 무엇을 쓸지는 알림 규칙이 바뀐 뒤에 정한다.
- **저장 형식 변경** — `kind` 한 필드만 더한다. 새 테이블·새 라우터를 만들지 않는다.
- **브리핑 개수 제한 분리** — 기존 경로 100개 상한을 공유한다.
- **`loadSavedRoute`(재검색 경로) 제거** — 게스트 localStorage의 구형 저장분 대비로 남긴다.
- **기상 저장** — 열 때마다 다시 계산한다.
