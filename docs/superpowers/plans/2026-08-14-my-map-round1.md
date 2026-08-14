# 내 지도 1판 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조종사가 구글어스에서 만든 `.kml`/`.kmz`를 사이드바 **내 지도**에서 올려 우리 지도 위에 겹쳐 보고, 폴더 단위로 켜고 끄고, 다음에 다시 열 수 있게 한다.

**Architecture:** 필요한 것 전부를 `features/my-map/`에 담고 `MapView.jsx`와 `Sidebar.jsx`는 몇 줄만 건드린다. 계산(압축 해제·폴더 트리·색칠·접기/찾기·판정·보관)은 순수 모듈로 빼서 `node --test`로 굳히고, 화면은 그것을 배선하는 얇은 층으로 둔다. **파일이 몇 개든 지도 레이어는 4개**(면·선·점·이름표)로 고정하고 feature에 심은 `__file`·`__folder`를 필터로 걸러 켜고 끈다.

**Tech Stack:** React, Mapbox GL JS 3.23.1, `@tmcw/togeojson` (`kmlWithFolders`), 브라우저 내장 `DecompressionStream`·IndexedDB·localStorage, `node --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-14-my-map-design.md`

**Policies:** [정책 색인](../../policies/index.md) → [map and layers](../../policies/engineering/map-and-layers.md), [browser verification](../../policies/verification/browser-verification.md), [계약 등록부](../../policies/verification/contracts.md), [encoding safety](../../policies/encoding-safety.md)

## Global Constraints

- Linux 전용. `npm`/`node`/`git`은 Linux 셸에서만 실행한다.
- 사용자 노출 문구는 한국어. 비ASCII 편집 전 [encoding safety](../../policies/encoding-safety.md)를 읽는다.
- **새 의존성을 추가하지 않는다.**
- 스타일은 파일이 정한 값을 쓴다. 값이 없을 때만 기본값을 쓴다.
- **어떤 도형도 숨기지 않는다.** 고도는 무시하고 평면으로 그린다(3D는 3판).
- 파일 크기 제한을 두지 않는다.
- **그리기 순서: 기상 > 내 지도 > 지형 근접 > 기본 지도.**
- `features/my-map/` 밖은 이 계획이 명시한 파일만 수정한다.
- 각 태스크는 `cd frontend && node --test <파일>`이 통과한 뒤에만 커밋한다. 전체는 `npm test`.
- 커밋 전 `git status`로 브랜치를 확인하고 **이 계획이 만든 파일만** `git add` 한다. `git add -A`를 쓰지 않는다.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `frontend/src/features/my-map/lib/kmzUnzip.js` | zip 바이트 → 지도 내용 문자열. **kml-viewer에서 이동** |
| `frontend/src/features/my-map/lib/kmlFolderTree.js` | 폴더 트리 → 평평한 목록, 상위/하위 표시 판정. **이동** |
| `frontend/src/features/my-map/lib/kmlPaint.js` | KML 속성을 읽는 Mapbox 표현식 상수. **이동** |
| `frontend/src/features/my-map/lib/folderView.js` (신규) | 접기·찾기로 보일 줄을 고른다. 순수 |
| `frontend/src/features/my-map/lib/mapFileGuard.js` (신규) | "경로가 아니라 지도다" 판정. 순수 |
| `frontend/src/features/my-map/lib/myMapStore.js` (신규) | 파일 원본·목록 보관 (IndexedDB + localStorage) |
| `frontend/src/features/my-map/lib/parseMyMapFile.js` (신규) | 바이트 → 폴더 목록·통계. 순수(비동기) |
| `frontend/src/features/my-map/useMyMap.js` (신규) | 파일 상태 + 지도 배선 |
| `frontend/src/features/my-map/MyMapPanel.jsx` / `.css` (신규) | 패널 화면 |
| `frontend/src/app/layout/Sidebar.jsx` (수정) | 항목 한 줄, `PANEL_MAP` 한 줄 |
| `frontend/src/features/map/MapView.jsx` (수정) | 훅 호출·패널 표시 |
| `frontend/src/features/route-briefing/useRouteBriefing.js` (수정) | 지도 파일 거부 |
| `frontend/verification/contracts/my-map.spec.mjs` (신규) | 브라우저 계약 |
| `frontend/test/fixtures/my-map/` (신규/이동) | 시험용 파일 |

---

### Task 1: 순수 모듈을 my-map으로 옮긴다

스파이크에서 만들어 시험 22개로 굳혀 둔 세 모듈을 새 자리로 옮긴다. **복사가 아니라 이동이다** — 사본이 두 개가 되면 한쪽만 고치는 사고가 난다. `/kml` 스파이크 페이지는 3판 측정에 계속 쓰므로 남겨 두고, import 경로만 새 자리를 가리키게 한다.

**Files:**
- Move: `frontend/src/features/kml-viewer/lib/{kmzUnzip,kmlFolderTree,kmlPaint}.js` (+ `.test.js`) → `frontend/src/features/my-map/lib/`
- Move: `frontend/test/fixtures/kml-viewer/tiny.kmz` → `frontend/test/fixtures/my-map/tiny.kmz`
- Modify: `frontend/src/features/kml-viewer/useKmlMap.js`, `frontend/src/features/kml-viewer/KmlViewerPage.jsx`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `readKmlFromBuffer(arrayBuffer, fileName)` → `Promise<string>`
  - `buildLayerList(tree)` → `Array<{ id, name, path, depth, parentId, features }>`
  - `isLayerVisible(list, id, hiddenSet)` → `boolean`
  - `LINE_PAINT`, `FILL_PAINT`, `CIRCLE_PAINT`, `LABEL_LAYOUT`, `LABEL_PAINT`, `httpsIcon(url)`

- [ ] **Step 1: 파일을 옮긴다**

```bash
cd /home/john_doe/ProjectAMO/frontend
mkdir -p src/features/my-map/lib test/fixtures/my-map
git mv src/features/kml-viewer/lib/kmzUnzip.js       src/features/my-map/lib/kmzUnzip.js
git mv src/features/kml-viewer/lib/kmzUnzip.test.js  src/features/my-map/lib/kmzUnzip.test.js
git mv src/features/kml-viewer/lib/kmlFolderTree.js       src/features/my-map/lib/kmlFolderTree.js
git mv src/features/kml-viewer/lib/kmlFolderTree.test.js  src/features/my-map/lib/kmlFolderTree.test.js
git mv src/features/kml-viewer/lib/kmlPaint.js       src/features/my-map/lib/kmlPaint.js
git mv src/features/kml-viewer/lib/kmlPaint.test.js  src/features/my-map/lib/kmlPaint.test.js
git mv test/fixtures/kml-viewer/tiny.kmz test/fixtures/my-map/tiny.kmz
rmdir test/fixtures/kml-viewer src/features/kml-viewer/lib 2>/dev/null || true
```

`kmlWalls.js`와 `kmlWalls.test.js`는 3판 재료라 `kml-viewer/lib/`에 남는다. 위 `rmdir`이 실패하는 것은 정상이다.

- [ ] **Step 2: 시험이 찾는 시험용 파일 경로를 고친다**

`frontend/src/features/my-map/lib/kmzUnzip.test.js`의 경로 한 줄을 바꾼다:

```js
const KMZ = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/my-map/tiny.kmz', import.meta.url)))
```

폴더 깊이가 같으므로 `../../../../`는 그대로다. `kml-viewer` → `my-map`만 바뀐다.

- [ ] **Step 3: 옮긴 시험 22개가 그대로 통과하는지 확인**

```bash
cd frontend && node --test src/features/my-map/lib/
```
Expected: PASS — 22개 (압축 해제 5, 폴더 트리 7, 색칠 10).

- [ ] **Step 4: 스파이크 페이지의 import를 새 자리로 돌린다**

`frontend/src/features/kml-viewer/useKmlMap.js`:

```js
import { isLayerVisible } from '../my-map/lib/kmlFolderTree.js'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT } from '../my-map/lib/kmlPaint.js'
```

`frontend/src/features/kml-viewer/KmlViewerPage.jsx`:

```js
import { readKmlFromBuffer } from '../my-map/lib/kmzUnzip.js'
import { buildLayerList, isLayerVisible } from '../my-map/lib/kmlFolderTree.js'
import { httpsIcon } from '../my-map/lib/kmlPaint.js'
```

`./lib/kmlWalls.js` import는 건드리지 않는다.

- [ ] **Step 5: 전체 시험과 빌드**

```bash
cd frontend && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -2
```
Expected: 시험 전부 통과, 빌드 성공. 빌드가 실패하면 남은 import 경로가 있다는 뜻이다:
```bash
grep -rn "kml-viewer/lib/\(kmzUnzip\|kmlFolderTree\|kmlPaint\)" frontend/src/
```

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/lib frontend/src/features/kml-viewer frontend/test/fixtures/my-map
git commit -m "refactor(my-map): move the spike's pure modules to their real home"
```

---

### Task 2: 접기와 찾기

폴더 176개 중 접힌 상태에서 101줄이 뜬다. 최상위 101개 중 하위가 있는 것은 4개뿐이라 **접기만으로는 안 줄고 찾기가 주된 도구**다. 두 동작 모두 순수 함수로 만들어 시험으로 굳힌다.

**Files:**
- Create: `frontend/src/features/my-map/lib/folderView.js`
- Test: `frontend/src/features/my-map/lib/folderView.test.js`

**Interfaces:**
- Consumes: Task 1의 `buildLayerList` 결과 모양 — `{ id, name, depth, parentId, features }[]`
- Produces:
  - `visibleRows(list, { expanded, query })` → `list`의 부분집합(원래 순서 유지)
  - `hasChildren(list, id)` → `boolean`
  - `toggleExpanded(expandedSet, id)` → 새 `Set`

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/my-map/lib/folderView.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleRows, hasChildren, toggleExpanded } from './folderView.js'

// buildLayerList가 주는 모양만 흉내낸다. 도형은 이 모듈의 관심사가 아니다.
const L = (id, name, depth, parentId) => ({ id, name, depth, parentId, features: [] })
const TREE = [
  L('f0', 'RKTA TAEAN', 0, null),
  L('f1', 'RKTA 출항절차', 1, 'f0'),
  L('f2', 'CROSS COUNTRY', 1, 'f0'),
  L('f3', 'RKTA-RKJU JEONJU', 2, 'f2'),
  L('f4', 'RESTRICTED/MOA AREA', 0, null),
  L('f5', 'Seoul TMA', 0, null),
]

test('처음에는 최상위만 보인다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(), query: '' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f4', 'f5'])
})

test('펼치면 그 자식만 보이고 손자는 안 보인다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(['f0']), query: '' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f1', 'f2', 'f4', 'f5'])
})

test('손자는 부모까지 펼쳐야 보인다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(['f0', 'f2']), query: '' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'])
})

test('찾기: 맞는 폴더와 그 조상이 함께 보인다', () => {
  // 접힘 상태와 무관하게 조상이 따라온다 — 안 그러면 결과가 화면에 안 뜬다.
  const rows = visibleRows(TREE, { expanded: new Set(), query: 'JEONJU' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f2', 'f3'])
})

test('찾기는 대소문자를 가리지 않는다', () => {
  assert.deepEqual(visibleRows(TREE, { expanded: new Set(), query: 'seoul' }).map((r) => r.id), ['f5'])
})

test('찾기는 원래 순서를 지킨다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(), query: 'RKTA' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f1'])
})

test('맞는 것이 없으면 빈 목록', () => {
  assert.deepEqual(visibleRows(TREE, { expanded: new Set(), query: '없는이름' }), [])
})

test('검색어를 지우면 접힘 상태로 돌아간다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(), query: '   ' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f4', 'f5'])
})

test('hasChildren: 하위 폴더가 있는지', () => {
  assert.equal(hasChildren(TREE, 'f0'), true)
  assert.equal(hasChildren(TREE, 'f1'), false)
  assert.equal(hasChildren(TREE, 'f5'), false)
})

test('toggleExpanded: 원본을 바꾸지 않고 새 Set을 준다', () => {
  const before = new Set(['f0'])
  const after = toggleExpanded(before, 'f2')
  assert.deepEqual([...before], ['f0'])
  assert.equal(after.has('f2'), true)
  assert.equal(toggleExpanded(after, 'f0').has('f0'), false)
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/my-map/lib/folderView.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/my-map/lib/folderView.js`:

```js
// 폴더 목록에서 지금 화면에 그릴 줄만 고른다.
//
// 맥케이 파일 기준 폴더가 176개인데 최상위가 101개고, 그중 하위 폴더를 가진 것은
// 4개뿐이다. 접기로 줄어드는 것은 75줄뿐이라 실제로는 찾기가 주된 도구다. 그래서
// 찾기는 접힘 상태를 무시하고 동작한다 — 맞는 폴더가 접힌 조상 안에 있다고 해서
// 결과가 안 나오면 찾기의 뜻이 없다.

const norm = (s) => String(s ?? '').trim().toLowerCase()

export function hasChildren(list, id) {
  return list.some((l) => l.parentId === id)
}

export function toggleExpanded(expanded, id) {
  const next = new Set(expanded)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function visibleRows(list, { expanded = new Set(), query = '' } = {}) {
  const byId = new Map(list.map((l) => [l.id, l]))
  const q = norm(query)

  if (q) {
    // 맞는 폴더 자신과 조상 전부를 남긴다. 조상이 없으면 화면에 들어갈 자리가 없다.
    const keep = new Set()
    for (const l of list) {
      if (!norm(l.name).includes(q)) continue
      keep.add(l.id)
      let p = l.parentId
      while (p) { keep.add(p); p = byId.get(p)?.parentId ?? null }
    }
    return list.filter((l) => keep.has(l.id))
  }

  // 조상이 전부 펼쳐져 있어야 보인다. 최상위는 조상이 없으므로 항상 보인다.
  return list.filter((l) => {
    let p = l.parentId
    while (p) {
      if (!expanded.has(p)) return false
      p = byId.get(p)?.parentId ?? null
    }
    return true
  })
}
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/my-map/lib/folderView.test.js
```
Expected: PASS — 10개.

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/lib/folderView.js frontend/src/features/my-map/lib/folderView.test.js
git commit -m "feat(my-map): fold and search the folder list"
```

---

### Task 3: 지도 파일을 브리핑에서 거른다

`비행 전 브리핑`의 경로 불러오기는 **선 하나를 비행경로로 삼는** 기능이다. 맥케이 같은 지도 파일을 올리면 도형 2,135개를 경로로 해석하려다 이상해진다. 판정은 보수적으로 한다 — **지금 정상 동작하는 경우를 막으면 안 된다.** 선이 여럿인 파일은 지금도 "어느 것을 쓸지" 고르게 하므로 그것만으로는 막지 않는다.

**Files:**
- Create: `frontend/src/features/my-map/lib/mapFileGuard.js`
- Test: `frontend/src/features/my-map/lib/mapFileGuard.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` (`parseRouteFile` 호출 직후)

**Interfaces:**
- Consumes: `parseRouteFile(name, text)`의 결과 — `{ format: 'kml', geojson }`
- Produces: `describeMapFile(geojson)` → `{ isMap, features, polygons, lines, points }`, 상수 `MAP_FILE_LIMITS`

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/my-map/lib/mapFileGuard.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { describeMapFile, MAP_FILE_LIMITS } from './mapFileGuard.js'

const fc = (...features) => ({ type: 'FeatureCollection', features })
const line = (n = 2) => ({ type: 'Feature', properties: {},
  geometry: { type: 'LineString', coordinates: Array.from({ length: n }, (_, i) => [127 + i * 0.01, 37]) } })
const point = () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [127, 37] } })
const poly = () => ({ type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37]]] } })

test('선 하나짜리 경로 파일은 지도가 아니다', () => {
  const r = describeMapFile(fc(line()))
  assert.equal(r.isMap, false)
  assert.equal(r.lines, 1)
})

test('선이 몇 개 있는 것만으로는 막지 않는다', () => {
  // 지금도 여러 경로 중 하나를 고르게 하는 화면이 있다. 그 동작을 뺏으면 안 된다.
  assert.equal(describeMapFile(fc(line(), line(), line())).isMap, false)
})

test('경유점만 있는 파일도 지도가 아니다', () => {
  assert.equal(describeMapFile(fc(point(), point(), point())).isMap, false)
})

test('면이 하나라도 있으면 지도다', () => {
  const r = describeMapFile(fc(line(), poly()))
  assert.equal(r.isMap, true)
  assert.equal(r.polygons, 1)
})

test('선이 아주 많으면 지도다', () => {
  const many = Array.from({ length: MAP_FILE_LIMITS.maxLines + 1 }, () => line())
  assert.equal(describeMapFile(fc(...many)).isMap, true)
})

test('지점이 아주 많으면 지도다', () => {
  const many = Array.from({ length: MAP_FILE_LIMITS.maxPoints + 1 }, () => point())
  assert.equal(describeMapFile(fc(...many)).isMap, true)
})

test('도형 묶음 안의 면도 센다', () => {
  const bundle = { type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [
    { type: 'LineString', coordinates: [[127, 37], [128, 37]] },
    { type: 'Polygon', coordinates: [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37]]] },
  ] } }
  const r = describeMapFile(fc(bundle))
  assert.equal(r.polygons, 1)
  assert.equal(r.isMap, true)
})

test('여러 갈래 도형도 갈래마다 센다', () => {
  const multi = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [
    [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37]]],
    [[[128, 38], [128.1, 38], [128.1, 38.1], [128, 38]]],
  ] } }
  assert.equal(describeMapFile(fc(multi)).polygons, 2)
})

test('빈 파일이나 깨진 값에도 던지지 않는다', () => {
  assert.equal(describeMapFile(null).isMap, false)
  assert.equal(describeMapFile(fc()).features, 0)
  assert.equal(describeMapFile({ type: 'FeatureCollection' }).features, 0)
})

test('개수를 그대로 돌려준다 — 사용자에게 보여줄 값이다', () => {
  const r = describeMapFile(fc(line(), poly(), point()))
  assert.equal(r.features, 3)
  assert.deepEqual([r.polygons, r.lines, r.points], [1, 1, 1])
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/my-map/lib/mapFileGuard.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/my-map/lib/mapFileGuard.js`:

```js
// 브리핑의 경로 불러오기는 "선 하나를 비행경로로 삼는" 기능이다. 지도 파일을 거기
// 올리면 도형 수천 개를 경로로 해석하려다 이상해진다.
//
// 판정은 보수적으로 한다. 지금 정상 동작하는 경우를 막으면 새 기능이 아니라 회귀다.
// 선이 여럿인 파일은 지금도 "어느 것을 쓸지" 고르는 화면이 있으므로 그것만으로는
// 막지 않는다. 면이 하나라도 있으면 경로 파일이 아니고(맥케이 파일은 16,170개),
// 선·지점이 터무니없이 많아도 경로가 아니다.
export const MAP_FILE_LIMITS = { maxLines: 20, maxPoints: 200 }

function countGeometry(g, out) {
  if (!g) return
  if (g.type === 'GeometryCollection') {
    for (const x of g.geometries ?? []) countGeometry(x, out)
    return
  }
  if (g.type === 'Polygon') out.polygons += 1
  else if (g.type === 'MultiPolygon') out.polygons += (g.coordinates?.length ?? 0)
  else if (g.type === 'LineString') out.lines += 1
  else if (g.type === 'MultiLineString') out.lines += (g.coordinates?.length ?? 0)
  else if (g.type === 'Point') out.points += 1
  else if (g.type === 'MultiPoint') out.points += (g.coordinates?.length ?? 0)
}

export function describeMapFile(geojson) {
  const features = geojson?.features ?? []
  const out = { features: features.length, polygons: 0, lines: 0, points: 0 }
  for (const f of features) countGeometry(f?.geometry, out)
  out.isMap = out.polygons > 0 || out.lines > MAP_FILE_LIMITS.maxLines || out.points > MAP_FILE_LIMITS.maxPoints
  return out
}
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/my-map/lib/mapFileGuard.test.js
```
Expected: PASS — 10개.

- [ ] **Step 5: 브리핑에 배선**

`frontend/src/features/route-briefing/useRouteBriefing.js` 맨 위 import 목록에 추가:

```js
import { describeMapFile } from '../my-map/lib/mapFileGuard.js'
```

같은 파일에서 `const parsed = parseRouteFile(file.name, text)` 바로 다음 줄에 끼워 넣는다. **`try` 블록 안이므로 `return` 앞에 에러 문구를 세팅하는 형태여야 한다** — 아래처럼 `mapFile` 변수를 잡아 두고 `try` 밖에서 판단한다:

```js
    let candidates = []
    let droppedTotal = 0
    let mapFile = null
    try {
      // file.text()는 무조건 UTF-8로 읽는다 — Garmin FPL은 UTF-16이라 깨진다.
      const text = decodeImportedFile(await file.arrayBuffer())
      const parsed = parseRouteFile(file.name, text)
      // KML만 검사한다. GPX/FPL/GeoJSON은 애초에 경로 형식이고, 여기서 함께 막으면
      // 지금 되던 것을 막게 된다.
      if (parsed.format === 'kml') {
        const described = describeMapFile(parsed.geojson)
        if (described.isMap) mapFile = described
      }
      const extracted = extractRoutePaths(parsed)
      candidates = extracted.candidates
      droppedTotal = extracted.droppedTotal
    } catch {
      setImportError('파일을 해석할 수 없습니다. GeoJSON·GPX·KML·FPL 파일인지 확인하세요.')
      return
    }
    if (mapFile) {
      setImportError(
        `이 파일은 비행경로가 아니라 지도로 보입니다 (도형 ${mapFile.features.toLocaleString()}개, `
        + `면 ${mapFile.polygons.toLocaleString()}개). 왼쪽 '내 지도'에서 열어보세요.`,
      )
      return
    }
```

- [ ] **Step 6: 전체 시험과 빌드**

```bash
cd frontend && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -2
```
Expected: 전부 통과. 기존 `route-import` 계약이 쓰는 GPX는 KML이 아니므로 영향이 없다.

- [ ] **Step 7: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/lib/mapFileGuard.js frontend/src/features/my-map/lib/mapFileGuard.test.js frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(my-map): turn map files away from the route importer"
```

---

### Task 4: 올린 파일을 보관한다

원본 바이트를 그대로 보관한다. 맥케이 파일은 원본 1.8MB인데 풀면 15.8MB라, 원본만 두고 켤 때마다 다시 푸는 편이 낫다(0.8초). 큰 파일은 IndexedDB에, 목록은 localStorage에 둔다 — 이 저장소의 `features/monitoring/lib/monitoringSlideshow.js`가 이미 쓰는 구조다.

**Files:**
- Create: `frontend/src/features/my-map/lib/myMapStore.js`
- Test: `frontend/src/features/my-map/lib/myMapStore.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `normalizeFileList(raw)` → `Array<{ id, name, size, addedAt }>` (순수)
  - `listMyMapFiles()` → 위 배열 (보관소 없으면 `[]`)
  - `saveMyMapFile(file)` → `Promise<{ ok, entry } | { ok: false, error }>`
  - `loadMyMapFile(id)` → `Promise<{ ok, buffer }>` (`buffer`는 `ArrayBuffer`)
  - `deleteMyMapFile(id)` → `Promise<{ ok }>`

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/my-map/lib/myMapStore.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFileList, listMyMapFiles, saveMyMapFile, loadMyMapFile, deleteMyMapFile } from './myMapStore.js'

// node에는 localStorage도 indexedDB도 없다. 이 환경에서 조용히 실패하는지가
// 곧 사생활 보호 모드 브라우저에서 앱이 안 죽는지와 같은 질문이다.

test('normalizeFileList: 쓸 수 있는 항목만 남긴다', () => {
  const out = normalizeFileList([
    { id: 'a', name: '맥케이.kmz', size: 1867169, addedAt: 1755000000000 },
    { id: '', name: '이름만', size: 10, addedAt: 1 },      // id 없음
    { id: 'b', name: '', size: 10, addedAt: 1 },            // 이름 없음
    null,
    'x',
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'a')
  assert.equal(out[0].name, '맥케이.kmz')
})

test('normalizeFileList: 배열이 아니면 빈 목록', () => {
  assert.deepEqual(normalizeFileList(null), [])
  assert.deepEqual(normalizeFileList({}), [])
  assert.deepEqual(normalizeFileList('nope'), [])
})

test('normalizeFileList: 숫자가 아닌 크기·시각은 0으로 고친다', () => {
  const out = normalizeFileList([{ id: 'a', name: 'x.kml', size: 'big', addedAt: null }])
  assert.equal(out[0].size, 0)
  assert.equal(out[0].addedAt, 0)
})

test('보관소가 없으면 목록은 빈 배열', () => {
  assert.deepEqual(listMyMapFiles(), [])
})

test('보관소가 없으면 저장은 실패를 돌려주되 던지지 않는다', async () => {
  const r = await saveMyMapFile({ name: 'x.kmz', size: 10, arrayBuffer: async () => new ArrayBuffer(10) })
  assert.equal(r.ok, false)
  assert.ok(r.error)
})

test('보관소가 없으면 읽기·지우기도 조용히 실패한다', async () => {
  const read = await loadMyMapFile('a')
  assert.equal(read.ok, false)
  assert.equal(read.buffer, null)
  assert.equal((await deleteMyMapFile('a')).ok, false)
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/my-map/lib/myMapStore.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/my-map/lib/myMapStore.js`:

```js
// 이용자가 올린 지도 파일을 브라우저에 보관한다.
//
// 원본 바이트를 그대로 둔다. 맥케이 파일은 원본 1.8MB인데 풀면 15.8MB고 지도용으로
// 바꾸면 더 커진다. 원본만 두고 켤 때마다 다시 푸는 편이 낫다 — 그 비용이 0.8초다.
//
// 큰 파일은 IndexedDB에, 목록은 localStorage에 둔다. 패널을 열 때 목록만 바로 읽으면
// 되기 때문이다. 같은 구조를 features/monitoring/lib/monitoringSlideshow.js가 이미 쓴다.
const LIST_KEY = 'my_map_files'
const DB_NAME = 'projectamo-my-map'
const STORE = 'files'

const hasLocalStorage = () => {
  try { return typeof window !== 'undefined' && !!window.localStorage } catch { return false }
}
const hasIndexedDb = () => typeof indexedDB !== 'undefined'

export function normalizeFileList(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object' && x.id && x.name)
    .map((x) => ({
      id: String(x.id),
      name: String(x.name),
      size: Number.isFinite(x.size) ? x.size : 0,
      addedAt: Number.isFinite(x.addedAt) ? x.addedAt : 0,
    }))
}

export function listMyMapFiles() {
  if (!hasLocalStorage()) return []
  try {
    const raw = JSON.parse(window.localStorage.getItem(LIST_KEY) ?? 'null')
    return normalizeFileList(raw?.files)
  } catch { return [] }
}

function writeList(files) {
  if (!hasLocalStorage()) return false
  try {
    window.localStorage.setItem(LIST_KEY, JSON.stringify({ version: 1, files }))
    return true
  } catch { return false }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runTransaction(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(result?.result)
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveMyMapFile(file) {
  if (!file) return { ok: false, error: new Error('파일이 없습니다.') }
  if (!hasIndexedDb()) return { ok: false, error: new Error('이 브라우저에서는 파일을 보관할 수 없습니다.') }
  const id = (globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}`)
  try {
    const buffer = await file.arrayBuffer()
    const db = await openDb()
    await runTransaction(db, 'readwrite', (store) => store.put(buffer, id))
    db.close()
    const entry = { id, name: String(file.name ?? ''), size: Number(file.size ?? 0), addedAt: Date.now() }
    writeList([...listMyMapFiles(), entry])
    return { ok: true, entry }
  } catch (error) {
    // 자리가 부족한 것이 가장 흔한 실패다. 호출부는 이걸 받아도 이번에 연 파일은
    // 계속 보여준다 — 보관 실패가 표시 실패가 되면 안 된다.
    return { ok: false, error }
  }
}

export async function loadMyMapFile(id) {
  if (!hasIndexedDb()) return { ok: false, buffer: null }
  try {
    const db = await openDb()
    const buffer = await runTransaction(db, 'readonly', (store) => store.get(id))
    db.close()
    return buffer ? { ok: true, buffer } : { ok: false, buffer: null }
  } catch { return { ok: false, buffer: null } }
}

export async function deleteMyMapFile(id) {
  if (!hasIndexedDb()) return { ok: false }
  try {
    const db = await openDb()
    await runTransaction(db, 'readwrite', (store) => store.delete(id))
    db.close()
    writeList(listMyMapFiles().filter((f) => f.id !== id))
    return { ok: true }
  } catch { return { ok: false } }
}
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/my-map/lib/myMapStore.test.js
```
Expected: PASS — 6개.

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/lib/myMapStore.js frontend/src/features/my-map/lib/myMapStore.test.js
git commit -m "feat(my-map): keep uploaded files in the browser"
```

---

### Task 5: 바이트에서 폴더 목록까지

압축 해제 → 해석 → 도형 변환 → 폴더 목록을 한 함수로 묶는다. 어느 단계에서 실패했는지 한국어로 알려주는 것이 이 함수의 절반이다 — 측정 도구가 빈 화면으로 죽으면 아무것도 알 수 없다.

**Files:**
- Create: `frontend/src/features/my-map/lib/parseMyMapFile.js`
- Test: `frontend/src/features/my-map/lib/parseMyMapFile.test.js`

**Interfaces:**
- Consumes: Task 1의 `readKmlFromBuffer`, `buildLayerList`; `kmlWithFolders` (`@tmcw/togeojson`)
- Produces: `parseMyMapFile(arrayBuffer, fileName)` → `Promise<{ list, stats }>`
  - `list` = `buildLayerList` 결과
  - `stats` = `{ folders, features, polygons, lines, points }`
  - 실패 시 `Error`를 던지며 `error.stage`에 한국어 단계 이름이 들어 있다

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/my-map/lib/parseMyMapFile.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import { parseMyMapFile } from './parseMyMapFile.js'

// 브라우저에는 DOMParser가 내장이지만 node에는 없다. routeImport.test.js와 같은 방식으로
// 전역에 심어준다 — 그래야 구현이 브라우저 전용 코드를 그대로 쓸 수 있다.
globalThis.DOMParser = DOMParser

const KMZ = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/my-map/tiny.kmz', import.meta.url)))
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Folder><name>RKTA</name>
  <Placemark><name>공항</name><Point><coordinates>126.4,36.7,0</coordinates></Point></Placemark>
  <Folder><name>출항절차</name>
    <Placemark><name>WP1</name><LineString><coordinates>126.4,36.7,0 126.5,36.8,0</coordinates></LineString></Placemark>
  </Folder>
</Folder>
<Folder><name>공역</name>
  <Placemark><name>R77</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    127,37,0 127.1,37,0 127.1,37.1,0 127,37,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder>
</Document></kml>`

test('KMZ를 폴더 목록으로 바꾼다', async () => {
  const { list, stats } = await parseMyMapFile(toArrayBuffer(KMZ), 'tiny.kmz')
  assert.ok(Array.isArray(list))
  assert.equal(typeof stats.folders, 'number')
})

test('폴더 계층과 도형 수를 함께 준다', async () => {
  const buf = new TextEncoder().encode(KML).buffer
  const { list, stats } = await parseMyMapFile(buf, 'test.kml')
  assert.deepEqual(list.map((l) => l.name), ['RKTA', '출항절차', '공역'])
  assert.equal(stats.folders, 3)
  assert.equal(stats.features, 3)
  assert.equal(stats.points, 1)
  assert.equal(stats.lines, 1)
  assert.equal(stats.polygons, 1)
})

test('깨진 XML은 조용히 통과하지 않는다', async () => {
  // 해석기는 깨진 문서에도 예외를 던지지 않고 오류 요소를 심는다. 검사하지 않으면
  // "폴더 0개"만 뜨고 실패인 줄 모른다.
  const buf = new TextEncoder().encode('<kml><Document><name>안 닫힘').buffer
  await assert.rejects(() => parseMyMapFile(buf, 'broken.kml'), (e) => {
    assert.equal(e.stage, '지도 내용 해석')
    return true
  })
})

test('압축이 아닌 바이트는 압축 해제 단계에서 실패한다', async () => {
  const buf = new TextEncoder().encode('이건 zip이 아님').buffer
  await assert.rejects(() => parseMyMapFile(buf, 'bad.kmz'), (e) => {
    assert.equal(e.stage, '압축 해제')
    return true
  })
})

test('(폴더 없음)은 폴더 수에서 뺀다', async () => {
  // 최상위에 그냥 놓인 도형을 담으려고 우리가 만든 가상 폴더다. 파일의 폴더가 아니다.
  const loose = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name>혼자</name><Point><coordinates>127,37,0</coordinates></Point></Placemark>
  </Document></kml>`
  const { list, stats } = await parseMyMapFile(new TextEncoder().encode(loose).buffer, 'loose.kml')
  assert.equal(list.length, 1)
  assert.equal(stats.folders, 0)
  assert.equal(stats.features, 1)
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/my-map/lib/parseMyMapFile.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/my-map/lib/parseMyMapFile.js`:

```js
import { kmlWithFolders } from '@tmcw/togeojson'
import { readKmlFromBuffer } from './kmzUnzip.js'
import { buildLayerList } from './kmlFolderTree.js'

// 올린 바이트를 화면이 쓸 수 있는 폴더 목록으로 바꾼다.
//
// 어느 단계에서 실패했는지 남기는 것이 이 함수의 절반이다. 빈 화면으로 죽으면
// 조종사는 자기 파일이 잘못된 건지 우리가 못 읽는 건지 알 수 없다.
//
// 전역 DOMParser만 쓴다. 브라우저는 내장이라 항상 있고, node --test에는 없으므로
// 시험 파일이 xmldom을 globalThis에 심어준다. 여기서 xmldom을 직접 import하면
// 브라우저에서 한 줄도 실행되지 않는 268KB가 번들에 실린다(routeImport.js와 같은 이유).

function fail(stage, message) {
  const error = new Error(message)
  error.stage = stage
  return error
}

function countGeometry(g, out) {
  if (!g) return
  if (g.type === 'GeometryCollection') {
    for (const x of g.geometries ?? []) countGeometry(x, out)
    return
  }
  if (g.type === 'Polygon') out.polygons += 1
  else if (g.type === 'MultiPolygon') out.polygons += (g.coordinates?.length ?? 0)
  else if (g.type === 'LineString') out.lines += 1
  else if (g.type === 'MultiLineString') out.lines += (g.coordinates?.length ?? 0)
  else if (g.type === 'Point') out.points += 1
  else if (g.type === 'MultiPoint') out.points += (g.coordinates?.length ?? 0)
}

export async function parseMyMapFile(arrayBuffer, fileName = '') {
  let text
  try {
    text = await readKmlFromBuffer(arrayBuffer, fileName)
  } catch (e) {
    throw fail('압축 해제', e?.message ?? '압축 파일을 열 수 없습니다.')
  }

  const doc = new DOMParser().parseFromString(text, 'text/xml')
  // 해석기는 깨진 문서에 예외를 던지지 않고 <parsererror>를 심는다.
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.getElementsByTagName('kml').length) {
    throw fail('지도 내용 해석', '지도 내용을 해석하지 못했습니다. 파일이 손상되었을 수 있습니다.')
  }

  let list
  try {
    list = buildLayerList(kmlWithFolders(doc))
  } catch (e) {
    throw fail('도형 변환', e?.message ?? '도형을 변환하지 못했습니다.')
  }

  const stats = { folders: 0, features: 0, polygons: 0, lines: 0, points: 0 }
  for (const layer of list) {
    // 최상위 도형을 담으려고 우리가 만든 가상 폴더는 파일의 폴더가 아니다.
    if (layer.name !== '(폴더 없음)') stats.folders += 1
    stats.features += layer.features.length
    for (const f of layer.features) countGeometry(f.geometry, stats)
  }
  return { list, stats }
}
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/my-map/lib/parseMyMapFile.test.js
```
Expected: PASS — 5개.

- [ ] **Step 5: 실제 파일로 확인**

맥케이 파일이 있으면 함께 확인한다(없으면 건너뛴다):

```bash
cd frontend && node --input-type=module -e '
import { DOMParser } from "@xmldom/xmldom"
globalThis.DOMParser = DOMParser
import { readFileSync } from "node:fs"
import { parseMyMapFile } from "./src/features/my-map/lib/parseMyMapFile.js"
const b = readFileSync("/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz")
const t = Date.now()
const { list, stats } = await parseMyMapFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "m.kmz")
console.log(Date.now() - t, "ms |", JSON.stringify(stats), "| 목록", list.length, "줄")
'
```
Expected: `folders: 175, features: 2135, polygons: 16170, lines: 39319, points: 1491`, 목록 176줄.

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/lib/parseMyMapFile.js frontend/src/features/my-map/lib/parseMyMapFile.test.js
git commit -m "feat(my-map): turn uploaded bytes into a folder list"
```

---

### Task 6: 지도 배선

파일 상태와 지도 레이어를 묶는 훅. 이 태스크는 지도 SDK에 직접 붙는 배선이라 단위 시험을 붙이지 않는다 — Task 9의 브라우저 계약이 검증한다. 순수 로직은 Task 1~5에 이미 분리해 두었다.

**소스를 하나만 쓰는 이유:** 파일마다 소스를 만들면 파일 3개에 소스 3개·레이어 12개가 되고, 폴더까지 나누면 수백 개가 된다. 그러면 느려지는 원인이 파일 탓인지 배선 탓인지 알 수 없다. feature마다 `__file`·`__folder`를 심고 필터로 켜고 끈다.

**슬롯:** KML은 `middle`에 넣는다(기상 위험기상·낙뢰는 `top`, 기상 래스터 일부와 **지형 근접도 `middle`**). 같은 슬롯 안에서는 나중에 추가된 것이 위로 가므로, 지형을 나중에 켜면 이용자 지도를 덮는다. 그래서 `styledata`가 올 때마다 지형이 KML 위에 있으면 아래로 내린다.

**Files:**
- Create: `frontend/src/features/my-map/useMyMap.js`

**Interfaces:**
- Consumes: `parseMyMapFile` (Task 5), `isLayerVisible` (Task 1), `LINE_PAINT`·`FILL_PAINT`·`CIRCLE_PAINT`·`LABEL_LAYOUT`·`LABEL_PAINT` (Task 1), `listMyMapFiles`·`saveMyMapFile`·`loadMyMapFile`·`deleteMyMapFile` (Task 4)
- Produces: `useMyMap(mapRef, isStyleReady)` → 아래 객체

```
{
  files,            // [{ id, name, size, addedAt }]
  activeFileIds,    // Set<string> — 지금 켜진 파일
  layersByFile,     // Map<fileId, list>  (buildLayerList 결과)
  hidden,           // Set<folderId>
  busy,             // string | null  진행 중 단계
  error,            // string | null
  addFile(file),        // 파일 올리기 (보관 + 켜기 + 화면 맞추기)
  toggleFile(id),       // 파일 켜고 끄기
  removeFile(id),       // 목록·보관에서 지우기
  toggleFolder(folderId),
  flyToFolder(folderId),
}
```

- [ ] **Step 1: 구현**

`frontend/src/features/my-map/useMyMap.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT } from './lib/kmlPaint.js'
import { parseMyMapFile } from './lib/parseMyMapFile.js'
import { listMyMapFiles, saveMyMapFile, loadMyMapFile, deleteMyMapFile } from './lib/myMapStore.js'

const SRC = 'my-map-src'
// 기상 위험기상·낙뢰는 'top'에 있다. 이용자 지도는 그 아래여야 한다 — 조종사는
// 기상을 보러 왔고, 자기 지도는 그 기상을 어디에 놓고 볼지 알려주는 바탕이다.
const SLOT = 'middle'
const TERRAIN_LAYER = 'terrain-hazard-shade'

// 면 → 선 → 점 → 이름표. 전역으로 이 순서를 지켜야 점이 면에 가리지 않는다.
// 이름표는 Point에만 붙인다 — 도형 묶음은 하위 도형마다 쪼개지면서 속성이 복제되므로,
// 필터가 없으면 지점 하나가 이름표 수백 개가 된다.
const LAYER_DEFS = [
  { kind: 'fill', type: 'fill', geom: ['==', ['geometry-type'], 'Polygon'], paint: FILL_PAINT },
  { kind: 'line', type: 'line', geom: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: LINE_PAINT },
  { kind: 'circle', type: 'circle', geom: ['==', ['geometry-type'], 'Point'], paint: CIRCLE_PAINT },
  { kind: 'label', type: 'symbol', geom: ['==', ['geometry-type'], 'Point'], paint: LABEL_PAINT, layout: LABEL_LAYOUT },
]
const LYR = (kind) => `my-map-${kind}`

function boundsOf(features) {
  const bounds = new mapboxgl.LngLatBounds()
  let any = false
  const walk = (c) => { if (typeof c[0] === 'number') { bounds.extend([c[0], c[1]]); any = true } else c.forEach(walk) }
  const geom = (g) => {
    if (!g) return
    if (g.type === 'GeometryCollection') g.geometries?.forEach(geom)
    else if (g.coordinates) walk(g.coordinates)
  }
  for (const f of features) geom(f.geometry)
  return any ? bounds : null
}

export default function useMyMap(mapRef, isStyleReady) {
  const [files, setFiles] = useState(() => listMyMapFiles())
  const [activeFileIds, setActiveFileIds] = useState(() => new Set())
  const [layersByFile, setLayersByFile] = useState(() => new Map())
  const [hidden, setHidden] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const stateRef = useRef({ activeFileIds, layersByFile, hidden })
  stateRef.current = { activeFileIds, layersByFile, hidden }

  // 켜진 파일의 도형을 모아 소스와 레이어를 다시 만든다.
  const rebuild = useCallback(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const { activeFileIds: active, layersByFile: byFile, hidden: hiddenSet } = stateRef.current

    const features = []
    const visibleFolderIds = []
    for (const fileId of active) {
      const list = byFile.get(fileId)
      if (!list) continue
      for (const layer of list) {
        if (isLayerVisible(list, layer.id, hiddenSet)) visibleFolderIds.push(layer.id)
        for (const f of layer.features) {
          features.push({ ...f, properties: { ...f.properties, __file: fileId, __folder: layer.id } })
        }
      }
    }

    const data = { type: 'FeatureCollection', features }
    if (map.getSource(SRC)) {
      map.getSource(SRC).setData(data)
    } else {
      map.addSource(SRC, { type: 'geojson', data })
    }
    for (const def of LAYER_DEFS) {
      const id = LYR(def.kind)
      const filter = ['all', def.geom, ['in', ['get', '__folder'], ['literal', visibleFolderIds]]]
      if (map.getLayer(id)) { map.setFilter(id, filter); continue }
      map.addLayer({
        id, type: def.type, source: SRC, slot: SLOT, filter, paint: def.paint,
        ...(def.layout ? { layout: def.layout } : {}),
      })
    }
  }, [mapRef, isStyleReady])

  useEffect(() => { rebuild() }, [rebuild, activeFileIds, layersByFile, hidden])

  // 지형 근접도 'middle'이라, 나중에 켜면 이용자 지도를 덮는다. 스타일이 바뀔 때마다
  // 순서를 다시 잡는다 — 기상 > 내 지도 > 지형 근접.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    const restack = () => {
      if (!map.getLayer(TERRAIN_LAYER) || !map.getLayer(LYR('fill'))) return
      const ids = map.getStyle()?.layers?.map((l) => l.id) ?? []
      if (ids.indexOf(TERRAIN_LAYER) > ids.indexOf(LYR('fill'))) {
        map.moveLayer(TERRAIN_LAYER, LYR('fill'))
      }
    }
    map.on('styledata', restack)
    return () => { map.off('styledata', restack) }
  }, [mapRef])

  const fitTo = useCallback((features) => {
    const map = mapRef.current
    const bounds = boundsOf(features)
    if (map && bounds) map.fitBounds(bounds, { padding: 60, duration: 0 })
  }, [mapRef])

  const openFile = useCallback(async (fileId, arrayBuffer, fileName) => {
    setError(null)
    let parsed
    try {
      setBusy('지도 내용 해석 중… 파일이 크면 시간이 걸릴 수 있습니다')
      parsed = await parseMyMapFile(arrayBuffer, fileName)
    } catch (e) {
      setBusy(null)
      setError(`${e?.stage ?? '파일 읽기'} 단계에서 실패: ${e?.message ?? e}`)
      return null
    }
    setBusy('지도에 올리는 중…')
    setLayersByFile((prev) => new Map(prev).set(fileId, parsed.list))
    setActiveFileIds((prev) => new Set(prev).add(fileId))
    setBusy(null)
    return parsed
  }, [])

  const addFile = useCallback(async (file) => {
    if (!file) return
    setError(null)
    setBusy('파일 읽는 중…')
    let buffer
    try {
      buffer = await file.arrayBuffer()
    } catch (e) {
      setBusy(null)
      setError(`파일 읽기 단계에서 실패: ${e?.message ?? e}`)
      return
    }
    const saved = await saveMyMapFile(file)
    // 보관에 실패해도 이번에 연 파일은 보여준다. 보관 실패가 표시 실패가 되면 안 된다.
    const entry = saved.ok
      ? saved.entry
      : { id: `tmp-${file.name}-${file.size}`, name: file.name, size: file.size, addedAt: 0 }
    if (!saved.ok) setError('파일을 보관하지 못했습니다. 이번에는 볼 수 있지만 다음에 다시 올려야 합니다.')
    setFiles((prev) => (prev.some((f) => f.id === entry.id) ? prev : [...prev, entry]))
    const parsed = await openFile(entry.id, buffer, file.name)
    if (parsed) fitTo(parsed.list.flatMap((l) => l.features))
  }, [openFile, fitTo])

  const toggleFile = useCallback(async (id) => {
    const { activeFileIds: active, layersByFile: byFile } = stateRef.current
    if (active.has(id)) {
      setActiveFileIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      return
    }
    if (byFile.has(id)) {
      setActiveFileIds((prev) => new Set(prev).add(id))
      return
    }
    setBusy('보관한 파일 여는 중…')
    const loaded = await loadMyMapFile(id)
    if (!loaded.ok) {
      setBusy(null)
      setError('보관한 파일을 찾지 못했습니다. 다시 올려주세요.')
      return
    }
    const entry = files.find((f) => f.id === id)
    const parsed = await openFile(id, loaded.buffer, entry?.name ?? '')
    if (parsed) fitTo(parsed.list.flatMap((l) => l.features))
  }, [files, openFile, fitTo])

  const removeFile = useCallback(async (id) => {
    await deleteMyMapFile(id)
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setActiveFileIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    setLayersByFile((prev) => { const next = new Map(prev); next.delete(id); return next })
  }, [])

  const toggleFolder = useCallback((folderId) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  // 꺼져 있던 폴더면 켜면서 옮긴다 — 옮겨갔는데 아무것도 없으면 뜻이 없다.
  const flyToFolder = useCallback((folderId) => {
    const { layersByFile: byFile } = stateRef.current
    for (const list of byFile.values()) {
      const layer = list.find((l) => l.id === folderId)
      if (!layer) continue
      setHidden((prev) => {
        const next = new Set(prev)
        next.delete(folderId)
        let p = layer.parentId
        const byId = new Map(list.map((l) => [l.id, l]))
        while (p) { next.delete(p); p = byId.get(p)?.parentId ?? null }
        return next
      })
      const own = list.filter((l) => l.id === folderId || l.path.join('/').startsWith(`${layer.path.join('/')}/`))
      fitTo(own.flatMap((l) => l.features))
      return
    }
  }, [fitTo])

  return { files, activeFileIds, layersByFile, hidden, busy, error, addFile, toggleFile, removeFile, toggleFolder, flyToFolder }
}
```

- [ ] **Step 2: 문법 확인**

이 시점에 이 파일을 import하는 곳이 없어 빌드가 파싱조차 하지 않는다. 구문만이라도 확인한다:

```bash
cd frontend && npx vite build --mode development 2>&1 | tail -3 && node --input-type=module -e "import('./src/features/my-map/useMyMap.js').then(() => console.log('구문 OK')).catch((e) => { console.error(e.message); process.exit(1) })"
```
Expected: 구문 오류(SyntaxError)가 없어야 한다. 실제 동작 확인은 Task 9다.

- [ ] **Step 3: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/useMyMap.js
git commit -m "feat(my-map): wire uploaded files onto the main map"
```

---

### Task 7: 패널 화면

**Files:**
- Create: `frontend/src/features/my-map/MyMapPanel.jsx`, `frontend/src/features/my-map/MyMapPanel.css`

**Interfaces:**
- Consumes: `useMyMap` 반환값(Task 6), `visibleRows`·`hasChildren`·`toggleExpanded` (Task 2), `isLayerVisible` (Task 1)
- Produces: `<MyMapPanel myMap={...} onClose={...} />`

- [ ] **Step 1: 패널 작성**

`frontend/src/features/my-map/MyMapPanel.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { visibleRows, hasChildren, toggleExpanded } from './lib/folderView.js'
import './MyMapPanel.css'

const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function MyMapPanel({ myMap, onClose }) {
  const fileInputRef = useRef(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [query, setQuery] = useState('')

  const { files, activeFileIds, layersByFile, hidden, busy, error } = myMap

  // 켜진 파일들의 폴더를 파일 순서대로 이어 붙인다.
  const rows = useMemo(() => {
    const out = []
    for (const file of files) {
      if (!activeFileIds.has(file.id)) continue
      const list = layersByFile.get(file.id)
      if (!list) continue
      out.push({ kind: 'file', file, list })
      for (const layer of visibleRows(list, { expanded, query })) {
        out.push({ kind: 'folder', file, list, layer })
      }
    }
    return out
  }, [files, activeFileIds, layersByFile, expanded, query])

  return (
    <div className="dev-layer-panel layer-drawer my-map-panel" aria-label="내 지도">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">내 지도</div>
          <div className="layer-drawer-title">내가 만든 지도</div>
        </div>
        <button type="button" className="layer-sheet-clear" onClick={onClose}>닫기</button>
      </div>

      <div className="layer-drawer-body">
        <p className="my-map-intro">
          구글어스에서 직접 만든 지도를 불러와 우리 지도 위에 겹쳐 봅니다.
          훈련공역, 절차, 즐겨찾는 지점 같은 직접 그린 요소를 그대로 볼 수 있습니다.
        </p>
        <p className="my-map-hint">비행경로를 불러오려면 ‘비행 전 브리핑’을 쓰세요.</p>

        <input
          ref={fileInputRef}
          data-testid="my-map-file"
          type="file"
          accept=".kml,.kmz"
          className="my-map-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; myMap.addFile(f) }}
        />

        {busy && <p className="my-map-note">{busy}</p>}
        {error && <p className="my-map-error">{error}</p>}

        {files.length > 0 && (
          <ul className="my-map-files" data-testid="my-map-files">
            {files.map((f) => (
              <li key={f.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={activeFileIds.has(f.id)}
                    onChange={() => myMap.toggleFile(f.id)}
                  />
                  {' '}<span className="my-map-file-name">{f.name}</span>
                  <span className="my-map-file-size">{mb(f.size)}</span>
                </label>
                <button type="button" className="my-map-remove" aria-label={`${f.name} 지우기`}
                  onClick={() => myMap.removeFile(f.id)}>×</button>
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && (
          <>
            <div className="my-map-search">
              <input
                data-testid="my-map-search"
                type="search"
                placeholder="폴더 이름으로 찾기"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="my-map-tree" data-testid="my-map-tree">
              {rows.map((row) => {
                if (row.kind === 'file') {
                  return <li key={`h-${row.file.id}`} className="my-map-tree-file">{row.file.name}</li>
                }
                const { layer, list, file } = row
                const effective = isLayerVisible(list, layer.id, hidden)
                const openable = hasChildren(list, layer.id)
                return (
                  <li key={`${file.id}-${layer.id}`} style={{ paddingLeft: `${layer.depth * 14}px` }}>
                    <button
                      type="button"
                      className={`my-map-caret${openable ? '' : ' is-hidden'}`}
                      aria-label={expanded.has(layer.id) ? '접기' : '펼치기'}
                      onClick={() => setExpanded((prev) => toggleExpanded(prev, layer.id))}
                    >
                      {expanded.has(layer.id) ? '▾' : '▸'}
                    </button>
                    <label className={effective ? '' : 'my-map-off'}>
                      <input type="checkbox" checked={effective} onChange={() => myMap.toggleFolder(layer.id)} />
                      {' '}{layer.name}
                    </label>
                    <span className="my-map-count">{layer.features.length > 0 ? layer.features.length.toLocaleString() : ''}</span>
                    {layer.features.length > 0 && (
                      <button type="button" className="my-map-goto" onClick={() => myMap.flyToFolder(layer.id)}>여기로</button>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CSS 작성**

`frontend/src/features/my-map/MyMapPanel.css`:

```css
.my-map-intro { margin: 0 0 6px; font-size: 12px; line-height: 1.55; }
.my-map-hint { margin: 0 0 10px; font-size: 11px; opacity: 0.75; }
.my-map-file { display: block; margin-bottom: 8px; font-size: 12px; }
.my-map-note { margin: 6px 0; font-size: 12px; opacity: 0.8; }
.my-map-error { margin: 6px 0; padding: 8px; border-radius: 4px; background: #fef2f2; color: #b91c1c; font-size: 12px; white-space: pre-wrap; }
.my-map-files { list-style: none; margin: 8px 0; padding: 0; font-size: 12px; }
.my-map-files li { display: flex; align-items: center; gap: 6px; }
.my-map-files label { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.my-map-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.my-map-file-size { margin-left: auto; opacity: 0.6; font-variant-numeric: tabular-nums; }
.my-map-remove { border: 0; background: none; cursor: pointer; opacity: 0.6; font-size: 14px; line-height: 1; }
/* 찾기 상자는 목록 위에 고정한다 — 접기로는 101줄이 안 줄어서 이게 주된 도구다. */
.my-map-search { position: sticky; top: 0; z-index: 1; padding: 6px 0; background: inherit; }
.my-map-search input { width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; }
.my-map-tree { list-style: none; margin: 0; padding: 0; font-size: 12px; }
.my-map-tree li { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.my-map-tree-file { font-weight: 600; opacity: 0.7; margin-top: 6px; }
.my-map-tree label { display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; }
.my-map-caret { width: 14px; border: 0; background: none; cursor: pointer; padding: 0; opacity: 0.7; }
.my-map-caret.is-hidden { visibility: hidden; }
.my-map-count { margin-left: auto; opacity: 0.55; font-variant-numeric: tabular-nums; }
.my-map-goto { border: 0; background: none; cursor: pointer; opacity: 0.7; font-size: 11px; text-decoration: underline; }
.my-map-off { opacity: 0.45; }
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -2
```
Expected: 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/features/my-map/MyMapPanel.jsx frontend/src/features/my-map/MyMapPanel.css
git commit -m "feat(my-map): add the my-map panel"
```

---

### Task 8: 사이드바와 지도에 연결

**Files:**
- Modify: `frontend/src/app/layout/Sidebar.jsx` (`topItems`, `PANEL_MAP`, 아이콘 import)
- Modify: `frontend/src/features/map/MapView.jsx` (import, 훅 호출, 패널 표시)

**Interfaces:**
- Consumes: `useMyMap` (Task 6), `MyMapPanel` (Task 7)
- Produces: `activePanel === 'my-map'`일 때 열리는 패널

- [ ] **Step 1: 사이드바에 항목 추가**

`frontend/src/app/layout/Sidebar.jsx` — 아이콘 import 줄에 `Map`을 더한다:

```js
import {
  Cloud, FileText, Layers, Settings,
  Menu, Monitor, HelpCircle, History, Search, FileWarning, User, Radio, Map
} from 'lucide-react'
```

`topItems`에서 `항공정보` 바로 아래에 넣는다 — 우리 공역 바로 다음이 이용자 공역이다:

```js
const topItems = [
  { label: '항공정보',         icon: Layers, active: true },
  { label: '내 지도',          icon: Map },
  { label: '기상정보',         icon: Cloud },
  { label: 'ADS-B',           icon: Radio },
  { label: 'NOTAM',            icon: FileWarning },
  { label: '상황판',           icon: Monitor, href: '/monitoring', pointerOnly: true }, // 벽걸이 전용 — 터치 기기에서는 감춘다
  { label: '비행 전 브리핑',   icon: FileText },
]
```

`PANEL_MAP`에 한 줄:

```js
const PANEL_MAP = {
  항공정보:        'aviation',
  '내 지도':        'my-map',
  기상정보:        'met',
  'ADS-B':         'traffic',
  NOTAM:           'notam',
  '비행 전 브리핑': 'route-check',
  업데이트:        'updates',
  설정:            'settings',
}
```

- [ ] **Step 2: 지도에 훅과 패널 연결**

`frontend/src/features/map/MapView.jsx` — import 두 줄을 `WeatherOverlayPanel` import 근처에 더한다:

```js
import useMyMap from '../my-map/useMyMap.js'
import MyMapPanel from '../my-map/MyMapPanel.jsx'
```

훅 호출은 다른 오버레이 훅들과 같은 자리(컴포넌트 본문, `useWeatherFieldOverlay` 호출들 근처)에 한 줄:

```js
  const myMap = useMyMap(mapRef, isStyleReady)
```

패널은 `activePanel === 'aviation'` 블록 바로 위에 넣는다:

```jsx
      {activePanel === 'my-map' && (
        <MyMapPanel myMap={myMap} onClose={onClosePanel} />
      )}
```

지도를 만든 직후(`new mapboxgl.Map(...)`의 결과를 `mapRef.current`에 넣는 줄 옆)에 한 줄 더한다. Task 9의 계약이 레이어 순서와 소스 내용을 확인할 때 쓴다:

```js
    // 브라우저 계약이 레이어 순서·소스 내용을 확인할 때 쓰는 손잡이.
    window.__projectamoMap = map
```

- [ ] **Step 3: 빌드와 전체 시험**

```bash
cd frontend && npm run build 2>&1 | tail -2 && npm test 2>&1 | tail -5
```
Expected: 빌드 성공, 시험 전부 통과.

- [ ] **Step 4: 연결이 실제로 걸렸는지 확인**

```bash
cd frontend && grep -n "'my-map'" src/app/layout/Sidebar.jsx src/features/map/MapView.jsx
```
Expected: `Sidebar.jsx`에 `PANEL_MAP` 한 줄, `MapView.jsx`에 분기 한 줄.

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/src/app/layout/Sidebar.jsx frontend/src/features/map/MapView.jsx
git commit -m "feat(my-map): open my-map from the sidebar"
```

---

### Task 9: 브라우저 계약

**Files:**
- Create: `frontend/verification/contracts/my-map.spec.mjs`
- Create: `frontend/test/fixtures/my-map/folders.kmz`
- Modify: `docs/policies/verification/contracts.md` (Active 표에 한 줄)

**Interfaces:**
- Consumes: Task 1~8 전부
- Produces: 없음 (종단)

- [ ] **Step 1: 계약용 시험 파일 만들기**

폴더 계층·면·선·점이 모두 든 작은 KMZ를 만든다. 이 명령을 그대로 실행한다:

```bash
cd /home/john_doe/ProjectAMO/frontend && node -e '
const { deflateRawSync, crc32 } = require("node:zlib")
const fs = require("node:fs")
const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>계약용</name>
<Folder><name>RKTA TAEAN</name>
  <Placemark><name>공항</name><Point><coordinates>126.42,36.72,0</coordinates></Point></Placemark>
  <Folder><name>출항절차</name>
    <Placemark><name>WP1</name><LineString><coordinates>126.42,36.72,0 126.55,36.85,0</coordinates></LineString></Placemark>
  </Folder>
</Folder>
<Folder><name>공역</name>
  <Placemark><name>R77</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    127.0,37.0,0 127.4,37.0,0 127.4,37.4,0 127.0,37.4,0 127.0,37.0,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder>
</Document></kml>`
const name = Buffer.from("doc.kml")
const body = Buffer.from(kml, "utf8")
const comp = deflateRawSync(body)
const crc = crc32(body)
const loc = Buffer.alloc(30)
loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8)
loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(body.length, 22)
loc.writeUInt16LE(name.length, 26)
const cen = Buffer.alloc(46)
cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10)
cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(body.length, 24)
cen.writeUInt16LE(name.length, 28)
const cenOffset = loc.length + name.length + comp.length
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10)
eocd.writeUInt32LE(cen.length + name.length, 12); eocd.writeUInt32LE(cenOffset, 16)
fs.writeFileSync("test/fixtures/my-map/folders.kmz", Buffer.concat([loc, name, comp, cen, name, eocd]))
// 브리핑 거부 계약은 압축하지 않은 .kml을 올린다 — 브리핑은 .kmz를 아예 안 받는다.
fs.writeFileSync("test/fixtures/my-map/folders.kml", body)
console.log("wrote", fs.statSync("test/fixtures/my-map/folders.kmz").size, "bytes (kmz) /",
  fs.statSync("test/fixtures/my-map/folders.kml").size, "bytes (kml)")
'
```
Expected: `wrote <700 내외> bytes (kmz) / <900 내외> bytes (kml)`

두 파일이 필요한 이유: 내 지도는 `.kmz`를 받고, 브리핑 거부 계약은 브리핑이 받는 형식(`.kml`)으로 올려야 판정이 걸리는지 확인할 수 있다. 이 `.kml`은 면 1개·선 1개·지점 1개인데, `mapFileGuard`의 "면이 하나라도 있으면 지도"에 걸린다.

- [ ] **Step 2: 계약 작성**

`frontend/verification/contracts/my-map.spec.mjs`:

```js
import { test, expect } from '../fixtures.mjs'
import { fileURLToPath } from 'node:url'

const KMZ = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kmz', import.meta.url))
const KML = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kml', import.meta.url))

// 지도 소스의 데이터를 단언할 때 querySourceFeatures를 쓰지 않는다. 그것은 이미 그려진
// 타일을 읽어 setData 직후를 반영하지 못한다(계약 등록부의 규칙).
const sourceCount = (page) => page.evaluate(() => {
  const map = window.__projectamoMap
  const src = map?.getSource('my-map-src')
  return src ? (src.serialize().data.features?.length ?? 0) : -1
})

async function openMyMap(page) {
  await page.getByRole('button', { name: '내 지도' }).click()
  await expect(page.getByLabel('내 지도')).toBeVisible()
}

test.describe('my-map', () => {
  test('파일을 올리면 도형이 지도에 올라가고 폴더 목록이 뜬다', async ({ page }) => {
    await page.goto('/')
    await openMyMap(page)
    await page.getByTestId('my-map-file').setInputFiles(KMZ)
    await expect(page.getByTestId('my-map-tree')).toBeVisible()
    // 접힌 상태 — 최상위 두 개만
    await expect(page.getByTestId('my-map-tree').getByText('RKTA TAEAN')).toBeVisible()
    await expect(page.getByTestId('my-map-tree').getByText('공역')).toBeVisible()
    await expect(page.getByTestId('my-map-tree').getByText('출항절차')).toHaveCount(0)
    expect(await sourceCount(page)).toBe(3)
  })

  test('폴더를 끄면 그 도형이 지도에서 빠진다', async ({ page }) => {
    await page.goto('/')
    await openMyMap(page)
    await page.getByTestId('my-map-file').setInputFiles(KMZ)
    await expect(page.getByTestId('my-map-tree')).toBeVisible()
    const before = await sourceCount(page)
    await page.getByTestId('my-map-tree').getByRole('checkbox').first().uncheck()
    await expect.poll(() => sourceCount(page)).toBeLessThan(before)
  })

  test('찾기는 맞는 폴더와 그 조상만 남긴다', async ({ page }) => {
    await page.goto('/')
    await openMyMap(page)
    await page.getByTestId('my-map-file').setInputFiles(KMZ)
    await expect(page.getByTestId('my-map-tree')).toBeVisible()
    await page.getByTestId('my-map-search').fill('출항')
    const tree = page.getByTestId('my-map-tree')
    await expect(tree.getByText('출항절차')).toBeVisible()
    await expect(tree.getByText('RKTA TAEAN')).toBeVisible()   // 조상은 따라온다
    await expect(tree.getByText('공역')).toHaveCount(0)
  })

  test('다시 열면 파일 목록은 남고 체크는 꺼져 있다', async ({ page }) => {
    await page.goto('/')
    await openMyMap(page)
    await page.getByTestId('my-map-file').setInputFiles(KMZ)
    await expect(page.getByTestId('my-map-tree')).toBeVisible()
    await page.reload()
    await openMyMap(page)
    await expect(page.getByTestId('my-map-files')).toContainText('folders.kmz')
    await expect(page.getByTestId('my-map-files').getByRole('checkbox').first()).not.toBeChecked()
    await expect(page.getByTestId('my-map-tree')).toHaveCount(0)
  })

  test('브리핑 경로 불러오기는 지도 파일을 거부하고 내 지도로 안내한다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '비행 전 브리핑' }).click()
    await page.getByTestId('route-import-file').setInputFiles(KML)
    await expect(page.getByText(/내 지도/)).toBeVisible()
  })

  test('레이더를 켜면 기상 그림이 내 지도 위에 그려진다', async ({ page }) => {
    await page.goto('/')
    await openMyMap(page)
    await page.getByTestId('my-map-file').setInputFiles(KMZ)
    await expect(page.getByTestId('my-map-tree')).toBeVisible()
    await page.getByRole('button', { name: '기상정보' }).click()
    await page.getByRole('button', { name: '레이더', exact: true }).click()
    await expect.poll(() => page.evaluate(() => {
      const ids = window.__projectamoMap?.getStyle()?.layers?.map((l) => l.id) ?? []
      const radar = ids.indexOf('kma-radar-overlay')
      const mine = ids.indexOf('my-map-fill')
      return radar >= 0 && mine >= 0 ? radar > mine : null
    })).toBe(true)
  })

  test('기존 경로가 그대로 동작한다', async ({ page }) => {
    for (const path of ['/', '/monitoring', '/test']) {
      const response = await page.goto(path)
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator('#root')).not.toBeEmpty()
    }
  })
})
```

- [ ] **Step 3: 계약 실행**

[dev-server 절차](../../operations/dev-server-and-capture.md)를 따른다.

```bash
cd /home/john_doe/ProjectAMO && npm run dev:contract -- --grep my-map
```
Expected: 7건 통과. 실패하면 `superpowers:systematic-debugging` 스킬로 원인을 찾고, 증상이 아니라 원인을 고친다.

- [ ] **Step 4: 계약 등록부에 올린다**

`docs/policies/verification/contracts.md`의 `## Active` 표 맨 아래에 한 줄 더한다:

```markdown
| `my-map` | `MyMapPanel.jsx`, `useMyMap.js`, `Sidebar.jsx`, `useRouteBriefing.js` 지도파일 거부 | desktop, iPad landscape, mobile | committed `folders.kmz` / `folders.kml` fixture; no weather fixture (레이더 순서 검사는 레이어 존재 시에만) | `frontend/verification/contracts/my-map.spec.mjs` | frontend | active — passed 2026-08-14 |
```

날짜는 실제로 통과시킨 날로 적는다.

- [ ] **Step 6: 전체 확인**

```bash
cd frontend && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -2
cd /home/john_doe/ProjectAMO && graphify update .
```
Expected: 시험 전부 통과, 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
cd /home/john_doe/ProjectAMO && git branch --show-current && git status --short
git add frontend/verification/contracts/my-map.spec.mjs frontend/test/fixtures/my-map docs/policies/verification/contracts.md frontend/src/features/map/MapView.jsx
git commit -m "test(my-map): register the browser contract"
```

---

## 완료 기준

- `cd frontend && npm test` 전부 통과 (옮겨온 22개 + 신규 31개)
- `cd frontend && npm run build` 성공
- `npm run dev:contract -- --grep my-map` 7건 통과
- 맥케이 파일(`/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz`)을 실제로 올려 확인:
  - 폴더 목록이 접힌 상태로 101줄
  - 폴더를 끄면 지도에서 사라진다
  - 찾기에 `RKTA`를 치면 맞는 폴더만 남는다
  - 브라우저를 닫았다 열어도 파일 목록이 남는다
  - 레이더를 켜면 기상이 이용자 지도 위에 그려진다
