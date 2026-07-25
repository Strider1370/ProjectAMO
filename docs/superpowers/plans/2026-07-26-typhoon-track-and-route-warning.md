# 태풍 경로 표시 및 경로/공항 노출 판정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KMA API Hub 태풍정보를 30분 주기로 수집해 지도에 경로·오차 부채꼴·강풍/폭풍 영역을 그리고, 비행경로와 출발·도착·교체공항이 태풍 영향권에 드는지 시각과 함께 보고한다.

**Architecture:** 기존 KMA 수집기와 동일한 파이프라인(파서 → 프로세서 → `store` 스냅샷 → `server.js` 라우트 → 프론트 fetch)을 따른다. 도형 생성은 백엔드 순수 모듈로 두어 지도와 브리핑이 같은 폴리곤을 쓴다. 경로 판정은 기존 `hazard-exposure.js`/`hazard-section.js`에 어댑터로 얹고 새 판정 로직을 만들지 않는다.

**Tech Stack:** Node 22 (ESM, `node:test`), Express, `@turf/turf` 7.3.5, React, Mapbox GL, Playwright.

**Spec:** [2026-07-26-typhoon-track-and-route-warning-design.md](../specs/2026-07-26-typhoon-track-and-route-warning-design.md)

## Global Constraints

- 리눅스 전용. `npm`/`node`/`bash`만 사용한다. Playwright 스냅샷 기준선은 `*-linux.png`.
- 루트·`backend`·`frontend` 각각 `package.json`이 있다. 테스트 전 셋 다 `npm ci` 되어 있어야 한다.
- 응답은 EUC-KR이다. `backend/src/api-client.js:17`의 기존 디코딩 경로를 쓴다. 새 디코더를 만들지 않는다.
- `-999`(숫자) 및 `-`(방위)는 결측이다. `null`로 바꾸고, 결측 값에 의존하는 도형은 생성하지 않는다.
- 결측·실패·만료를 `clear`/`matched`로 바꾸지 않는다. 해당 상태와 사유를 그대로 반환한다.
- 브리핑은 노출 사실과 자료 상태만 반환한다. 안전점수·경로추천·고도추천을 만들지 않는다.
- 고도는 판정하지 않는다. 태풍 항목은 항상 `verticalKnown: false`, `bandFt: null`.
- `typ_now.php`에는 `tm`을 반드시 넣는다. 없으면 태풍이 있어도 빈 응답이 온다.
- `mode=1`을 쓴다. `mode=2`는 과거 경로 없이 최신 분석 1개만 준다.
- 태풍 이름은 경로 응답에 없다. `typ_lst.php?disp=1`에서 받아 태풍번호로 잇는다. 이름을 못 받으면 번호만 표시하고 태풍을 빠뜨리지 않는다.
- 예보 간격은 태풍마다 다르다(6시간 또는 12시간). 유효구간 반폭을 상수로 고정하지 않는다.
- `EFF`(한반도영향)는 진행 중 갱신 여부가 미확인이다. 판정에도 표시에도 쓰지 않는다.
- `MapView.jsx`에는 컴포넌트 합성만 추가한다. 새 상태나 `useEffect`를 넣지 않는다.
- 인증키는 `config.api.auth_key`(기존 `KMA_AVIATION_AUTH_KEY`)를 쓴다. 새 환경변수를 만들지 않는다.
- 커밋 메시지는 한국어 본문 + 영어 제목의 기존 관례를 따른다.

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `backend/src/parsers/typhoon-parser.js` | 고정폭 텍스트 → `TyphoonRow[]`. 순수 함수, I/O 없음 |
| `backend/src/briefing/typhoon-geometry.js` | `TyphoonRow` → GeoJSON 폴리곤. 순수 함수 |
| `backend/src/processors/typhoon-processor.js` | 수집·중복 발표 생략·저장 |
| `backend/src/briefing/typhoon-briefing.js` | 태풍 → 브리핑 hazard 항목 어댑터 |
| `frontend/src/features/weather-overlays/lib/typhoonColors.js` | 태풍번호 → 색 |
| `frontend/src/features/weather-overlays/lib/typhoonLayers.js` | Mapbox 소스·레이어 설치/제거 |
| `frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js` | 데이터·가시성 동기화 |
| `frontend/src/features/weather-overlays/TyphoonPanel.jsx` | 활성 태풍 목록 패널 |

---

## Task 1: 태풍 텍스트 파서

**Files:**
- Create: `backend/src/parsers/typhoon-parser.js`
- Create: `backend/test/typhoon-parser.test.js`
- Create: `backend/test/fixtures/typhoon-hinnamnor.txt`
- Create: `backend/test/fixtures/typhoon-multi-2018.txt`
- Create: `backend/test/fixtures/typhoon-list-2018.csv`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `parseTyphoonText(text: string): TyphoonRow[]`
  - `parseTyphoonList(text: string): TyphoonListEntry[]`
  - `TyphoonListEntry = { year: number, number: number, active: boolean, name: string|null, nameEn: string|null }`
  - `groupByTyphoonNumber(rows: TyphoonRow[]): Map<number, TyphoonRow[]>`
  - `TyphoonRow = { forecast: boolean, year: number, number: number, seq: number, leadHours: number, analyzedAt: string, validAt: string, lat: number, lon: number, dir: string|null, speedKmh: number|null, pressureHpa: number|null, maxWindMs: number|null, errorRadiusKm: number|null, gale: Ring|null, storm: Ring|null, location: string }`
  - `Ring = { radiusKm: number, exceptionDir: string|null, exceptionRadiusKm: number|null }`

- [ ] **Step 1: 실제 응답을 픽스처로 저장**

`.env`가 워크트리에 링크되어 있어야 한다. 다음을 프로젝트 루트에서 실행한다.

```bash
K=$(grep -m1 '^KMA_AVIATION_AUTH_KEY=' .env | cut -d= -f2 | tr -d '\r')
mkdir -p backend/test/fixtures
# 단일 태풍 — 6시간 간격 예보
curl -s -m 25 "https://apihub.kma.go.kr/api/typ01/url/typ_data.php?YY=2022&typ=11&seq=32&mode=1&disp=0&help=0&authKey=$K" \
  | iconv -f EUC-KR -t UTF-8 > backend/test/fixtures/typhoon-hinnamnor.txt
# 복수 태풍 동시 활성 — 수집기가 실제로 부르는 형태(tm + mode=1)
curl -s -m 25 "https://apihub.kma.go.kr/api/typ01/url/typ_now.php?tm=201808220000&mode=1&disp=0&help=0&authKey=$K" \
  | iconv -f EUC-KR -t UTF-8 > backend/test/fixtures/typhoon-multi-2018.txt
# 태풍 목록 — 이름
curl -s -m 25 "https://apihub.kma.go.kr/api/typ01/url/typ_lst.php?YY=2018&disp=1&help=0&authKey=$K" \
  | iconv -f EUC-KR -t UTF-8 > backend/test/fixtures/typhoon-list-2018.csv
```

확인:

```bash
grep -vc '^#' backend/test/fixtures/typhoon-hinnamnor.txt   # 39 (11호: 분석 32 + 예보 7)
grep -vc '^#' backend/test/fixtures/typhoon-multi-2018.txt  # 50 (19호: 25+6, 20호: 15+4)
grep -c '솔릭\|시마론' backend/test/fixtures/typhoon-list-2018.csv  # 2
```

숫자가 다르면 그대로 쓰고 테스트 기대값을 실제 값에 맞춘다. 기상청이 과거 자료를 보정할 수 있다. **픽스처를 기대값에 맞추지 말고 기대값을 픽스처에 맞춘다.**

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/test/typhoon-parser.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseTyphoonText, parseTyphoonList, groupByTyphoonNumber } from '../src/parsers/typhoon-parser.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(dir, 'fixtures', name), 'utf8')

test('mode=1은 과거 분석 경로와 최신 예보를 모두 준다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  assert.equal(rows.length, 39)
  assert.equal(rows.filter((r) => !r.forecast).length, 32)
  assert.equal(rows.filter((r) => r.forecast).length, 7)
})

test('첫 분석 행은 경로의 시작이다', () => {
  const [row] = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  assert.equal(row.year, 2022)
  assert.equal(row.number, 11)
  assert.equal(row.seq, 1)
  assert.equal(row.forecast, false)
  assert.equal(row.analyzedAt, '2022-08-28T12:00:00.000Z')
  assert.equal(row.lat, 26.9)
  assert.equal(row.lon, 148.5)
  assert.equal(row.pressureHpa, 998)
  assert.equal(row.gale.radiusKm, 220)
  // RAD25 = -999 → 폭풍 링이 통째로 없다
  assert.equal(row.storm, null)
})

test('마지막 분석 행이 현재 위치다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  const current = rows.filter((r) => !r.forecast).at(-1)
  assert.equal(current.seq, 32)
  assert.equal(current.analyzedAt, '2022-09-05T00:00:00.000Z')
  assert.equal(current.lat, 29.8)
  assert.equal(current.lon, 124.9)
  assert.equal(current.dir, 'N')
  assert.equal(current.pressureHpa, 930)
  assert.equal(current.maxWindMs, 50)
  assert.equal(current.gale.radiusKm, 430)
  assert.equal(current.gale.exceptionDir, 'SW')
  assert.equal(current.gale.exceptionRadiusKm, 340)
  assert.equal(current.storm.radiusKm, 180)
  assert.equal(current.errorRadiusKm, 0)
  assert.equal(current.location, '서귀포 남남서쪽 약 410 km 부근 해상')
})

test('공백이 든 위치설명이 컬럼을 밀지 않는다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  for (const row of rows) {
    assert.ok(Number.isFinite(row.lat), '위도가 숫자여야 한다')
    assert.ok(!/^[A-Z-]+,/.test(row.location), '위치설명에 ED25 토큰이 섞이면 안 된다')
  }
})

test('-999와 -는 결측이므로 null이 된다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  const last = rows.at(-1)
  assert.equal(last.forecast, true)
  assert.equal(last.leadHours, 42)
  assert.equal(last.validAt, '2022-09-06T18:00:00.000Z')
  assert.equal(last.gale, null)
  assert.equal(last.storm, null)
  assert.equal(last.errorRadiusKm, 160)
})

test('복수 태풍을 번호로 나눈다', () => {
  const rows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const grouped = groupByTyphoonNumber(rows)
  assert.deepEqual([...grouped.keys()].sort((a, b) => a - b), [19, 20])
  assert.equal(grouped.get(19).length, 31)  // 분석 25 + 예보 6
  assert.equal(grouped.get(20).length, 19)  // 분석 15 + 예보 4
  for (const [number, group] of grouped) {
    assert.ok(group.some((r) => r.forecast), `${number}호에 예보가 있어야 한다`)
  }
})

test('태풍 목록에서 이름을 읽는다', () => {
  const list = parseTyphoonList(read('typhoon-list-2018.csv'))
  const soulik = list.find((t) => t.number === 19)
  assert.equal(soulik.name, '솔릭')
  assert.equal(soulik.nameEn, 'SOULIK')
  assert.equal(soulik.year, 2018)
  assert.equal(soulik.active, false)   // NOW=2(종료)
  const cimaron = list.find((t) => t.number === 20)
  assert.equal(cimaron.name, '시마론')
})

test('목록의 REM에 쉼표가 있어도 앞 8개 필드만 취해 안전하다', () => {
  const list = parseTyphoonList('2026,12,1,4,202607231800,210012310000,노을,NOUL,설명에,쉼표가,있다,=\n')
  assert.equal(list.length, 1)
  assert.equal(list[0].number, 12)
  assert.equal(list[0].name, '노을')
  assert.equal(list[0].nameEn, 'NOUL')
  assert.equal(list[0].active, true)   // NOW=1(진행중)
})

test('목록 머리글과 빈 줄은 무시한다', () => {
  assert.deepEqual(parseTyphoonList('#START7777\n# YY SEQ\n#7777END\n'), [])
  assert.deepEqual(parseTyphoonList(''), [])
})

test('머리글과 빈 줄은 무시한다', () => {
  assert.deepEqual(parseTyphoonText('#START7777\n# FT YY\n#7777END\n'), [])
  assert.deepEqual(parseTyphoonText(''), [])
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `node --test backend/test/typhoon-parser.test.js`
Expected: FAIL — `Cannot find module '../src/parsers/typhoon-parser.js'`

- [ ] **Step 4: 파서를 구현한다**

`backend/src/parsers/typhoon-parser.js`:

```js
// KMA API Hub 태풍정보(typ_now.php / typ_data.php) 고정폭 텍스트 파서.
// 컬럼: FT YY TYP SEQ TMD TYP_TM FT_TM LAT LON DIR SP PS WS RAD15 RAD25 RAD ED15 ER15 LOC ED25 ER25
// LOC에만 공백이 들어가므로 앞 18개와 마지막 1개를 고정으로 떼고 가운데를 LOC로 되짚는다.

const HEAD_FIELDS = 18
const TAIL_PATTERN = /^[A-Z-]+,-?\d+,?$/
const MISSING_NUMBER = -999

function num(token) {
  const value = Number(token)
  if (!Number.isFinite(value) || value === MISSING_NUMBER) return null
  return value
}

function dir(token) {
  return !token || token === '-' ? null : token
}

// "202209050000"(UTC) -> ISO
function toIso(stamp) {
  if (!/^\d{12}$/.test(stamp)) return null
  const [y, mo, d, h, mi] = [stamp.slice(0, 4), stamp.slice(4, 6), stamp.slice(6, 8), stamp.slice(8, 10), stamp.slice(10, 12)]
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toISOString()
}

// 반경이 없으면 링 자체가 없다. 예외 방향/반경은 있을 때만 채운다.
function ring(radius, exceptionDir, exceptionRadius) {
  const radiusKm = num(radius)
  if (radiusKm === null) return null
  return { radiusKm, exceptionDir: dir(exceptionDir), exceptionRadiusKm: num(exceptionRadius) }
}

export function parseTyphoonText(text) {
  const rows = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const tokens = line.split(/\s+/)
    if (tokens.length < HEAD_FIELDS + 1) continue

    const head = tokens.slice(0, HEAD_FIELDS)
    const hasTail = TAIL_PATTERN.test(tokens[tokens.length - 1])
    const tail = hasTail ? tokens[tokens.length - 1].split(',') : []
    const location = (hasTail ? tokens.slice(HEAD_FIELDS, -1) : tokens.slice(HEAD_FIELDS)).join(' ')

    const lat = num(head[7])
    const lon = num(head[8])
    if (lat === null || lon === null) continue

    rows.push({
      forecast: head[0] === '1',
      year: Number(head[1]),
      number: Number(head[2]),
      seq: Number(head[3]),
      leadHours: Number(head[4]),
      analyzedAt: toIso(head[5]),
      validAt: toIso(head[6]),
      lat,
      lon,
      dir: dir(head[9]),
      speedKmh: num(head[10]),
      pressureHpa: num(head[11]),
      maxWindMs: num(head[12]),
      errorRadiusKm: num(head[15]),
      gale: ring(head[13], head[16], head[17]),
      storm: ring(head[14], tail[0], tail[1]),
      location,
    })
  }
  return rows
}

export function groupByTyphoonNumber(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.number)) grouped.set(row.number, [])
    grouped.get(row.number).push(row)
  }
  return grouped
}

// typ_lst.php?disp=1 — 쉼표 구분. 이름과 진행여부만 쓴다.
// 9번째 REM(설명문)에 쉼표가 들어갈 수 있으므로 앞 8개만 취하고 나머지는 버린다.
// 목록의 SEQ는 발표번호가 아니라 태풍번호다 — 경로 응답의 TYP와 잇는 열쇠.
export function parseTyphoonList(text) {
  const list = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const f = line.split(',')
    if (f.length < 8) continue
    const number = Number(f[1])
    if (!Number.isFinite(number)) continue
    list.push({
      year: Number(f[0]),
      number,
      active: f[2] === '1',       // NOW: 1(진행중), 2(종료)
      name: f[6] || null,
      nameEn: f[7] || null,
    })
  }
  return list
}

export default { parseTyphoonText, parseTyphoonList, groupByTyphoonNumber }
```

- [ ] **Step 5: 통과를 확인한다**

Run: `node --test backend/test/typhoon-parser.test.js`
Expected: PASS — 10 tests

- [ ] **Step 6: 커밋**

```bash
git add backend/src/parsers/typhoon-parser.js backend/test/typhoon-parser.test.js backend/test/fixtures/
git commit -m "feat(typhoon): parse the fixed-width bulletin without column drift"
```

---

## Task 2: 태풍 도형 생성

**Files:**
- Create: `backend/src/briefing/typhoon-geometry.js`
- Create: `backend/test/typhoon-geometry.test.js`

**Interfaces:**
- Consumes: Task 1의 `TyphoonRow`, `Ring`
- Produces:
  - `BEARING_BY_POINT: Record<string, number>` — 16방위 → 도
  - `asymmetricPolygon({ lat, lon, radiusKm, exceptionDir, exceptionRadiusKm, steps }): GeoJSON.Polygon | null`
  - `galePolygon(row): Polygon | null`
  - `stormPolygon(row): Polygon | null`
  - `judgementPolygon(row): Polygon | null` — 강풍반경 + 오차반경
  - `errorConePolygon(rows): Polygon | MultiPolygon | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/typhoon-geometry.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as turf from '@turf/turf'
import {
  BEARING_BY_POINT, asymmetricPolygon, galePolygon, stormPolygon, judgementPolygon, errorConePolygon,
} from '../src/briefing/typhoon-geometry.js'

const CENTER = { lat: 30, lon: 125 }
// 중심에서 bearing 방향으로 정확히 distanceKm 떨어진 점.
const at = (bearing, distanceKm) => turf.destination([CENTER.lon, CENTER.lat], distanceKm, bearing, { units: 'kilometers' })
const inside = (poly, point) => turf.booleanPointInPolygon(point, poly)

test('16방위 표가 정북 0도에서 시작해 22.5도씩 돈다', () => {
  assert.equal(BEARING_BY_POINT.N, 0)
  assert.equal(BEARING_BY_POINT.NNE, 22.5)
  assert.equal(BEARING_BY_POINT.SW, 225)
  assert.equal(BEARING_BY_POINT.WNW, 292.5)
  assert.equal(Object.keys(BEARING_BY_POINT).length, 16)
})

test('예외 방향이 없으면 온전한 원이다', () => {
  const poly = asymmetricPolygon({ ...CENTER, radiusKm: 100, exceptionDir: null, exceptionRadiusKm: null })
  assert.ok(inside(poly, at(0, 90)))
  assert.ok(inside(poly, at(225, 90)))
  assert.ok(!inside(poly, at(225, 110)))
})

test('예외 방향에서만 반경이 줄어든다', () => {
  const poly = asymmetricPolygon({ ...CENTER, radiusKm: 400, exceptionDir: 'SW', exceptionRadiusKm: 300 })
  // 축소 방향(SW=225): 300km 안쪽은 들고 350km는 빠진다.
  assert.ok(inside(poly, at(225, 280)))
  assert.ok(!inside(poly, at(225, 350)))
  // 반대 방향(NE=45): 온전한 400km가 유지된다.
  assert.ok(inside(poly, at(45, 380)))
})

test('축소 방향에서 90도 이상 벗어나면 원래 반경이다', () => {
  const poly = asymmetricPolygon({ ...CENTER, radiusKm: 400, exceptionDir: 'SW', exceptionRadiusKm: 300 })
  // SW(225)에서 정확히 90도 떨어진 SE(135)와 NW(315).
  assert.ok(inside(poly, at(135, 390)))
  assert.ok(inside(poly, at(315, 390)))
})

test('반경이 결측이면 도형을 만들지 않는다', () => {
  assert.equal(asymmetricPolygon({ ...CENTER, radiusKm: null }), null)
  assert.equal(galePolygon({ ...CENTER, gale: null }), null)
  assert.equal(stormPolygon({ ...CENTER, storm: null }), null)
  assert.equal(judgementPolygon({ ...CENTER, gale: null, errorRadiusKm: 100 }), null)
})

test('판정 도형은 강풍반경에 오차반경을 더한다', () => {
  const row = { ...CENTER, gale: { radiusKm: 380, exceptionDir: 'WNW', exceptionRadiusKm: 230 }, errorRadiusKm: 110 }
  const poly = judgementPolygon(row)
  // 온전한 방향: 380 + 110 = 490km 안쪽은 들고 그 밖은 빠진다.
  assert.ok(inside(poly, at(112.5, 470)))
  assert.ok(!inside(poly, at(112.5, 510)))
  // 축소 방향(WNW=292.5): 230 + 110 = 340km.
  assert.ok(inside(poly, at(292.5, 320)))
  assert.ok(!inside(poly, at(292.5, 360)))
})

test('오차반경이 없으면 판정 도형은 강풍반경만 쓴다', () => {
  const poly = judgementPolygon({ ...CENTER, gale: { radiusKm: 200, exceptionDir: null, exceptionRadiusKm: null }, errorRadiusKm: null })
  assert.ok(inside(poly, at(0, 180)))
  assert.ok(!inside(poly, at(0, 220)))
})

test('부채꼴은 예보 시점 오차원을 모두 감싼다', () => {
  const rows = [
    { lat: 30, lon: 125, errorRadiusKm: 0 },   // 분석 시점: 오차 0이라 원이 없다
    { lat: 32, lon: 126, errorRadiusKm: 60 },
    { lat: 34, lon: 127, errorRadiusKm: 140 },
  ]
  const cone = errorConePolygon(rows)
  assert.ok(cone)
  assert.ok(turf.booleanPointInPolygon(turf.point([126, 32]), cone))
  assert.ok(turf.booleanPointInPolygon(turf.point([127, 34]), cone))
  // 오차반경 0인 분석 지점은 원이 만들어지지 않으므로 부채꼴에 들지 않는다.
  assert.ok(!turf.booleanPointInPolygon(turf.point([125, 30]), cone))
  // 마지막 지점 주변 100km는 오차원(140km) 안이다.
  assert.ok(turf.booleanPointInPolygon(turf.destination([127, 34], 100, 90, { units: 'kilometers' }), cone))
})

test('예보 원들이 떨어져 있으면 MultiPolygon이 된다', () => {
  const cone = errorConePolygon([
    { lat: 30, lon: 125, errorRadiusKm: 60 },
    { lat: 34, lon: 127, errorRadiusKm: 140 },
  ])
  // 부채꼴은 Polygon일 수도 MultiPolygon일 수도 있다. 소비자는 둘 다 처리해야 한다.
  assert.ok(['Polygon', 'MultiPolygon'].includes(cone.type))
})

test('오차반경이 전부 결측이면 부채꼴이 없다', () => {
  assert.equal(errorConePolygon([{ lat: 30, lon: 125, errorRadiusKm: null }]), null)
  assert.equal(errorConePolygon([]), null)
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test backend/test/typhoon-geometry.test.js`
Expected: FAIL — `Cannot find module '../src/briefing/typhoon-geometry.js'`

- [ ] **Step 3: 도형 모듈을 구현한다**

`backend/src/briefing/typhoon-geometry.js`:

```js
// 태풍 반경을 GeoJSON 폴리곤으로 만든다.
// 강풍/폭풍 반경은 원이 아니다. 기상청이 방위 하나(ED)와 그 방향의 줄어든 반경(ER)을 준다.
// 진행방향에서 위험반원/안전반원을 유도하지 않는다 — 표본에서 항상 성립하지 않았다(스펙 §2).
import * as turf from '@turf/turf'

export const BEARING_BY_POINT = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

const DEFAULT_STEPS = 72

// 두 방위 사이의 최소 각차(0~180).
function angularDelta(a, b) {
  const diff = Math.abs(((a - b) % 360 + 360) % 360)
  return diff > 180 ? 360 - diff : diff
}

// 축소 방향에서 정확히 ER, 90도 이상 벗어나면 RAD, 그 사이는 코사인 보간.
function radiusAt(bearing, radiusKm, exceptionBearing, exceptionRadiusKm) {
  if (exceptionBearing === null || exceptionRadiusKm === null) return radiusKm
  const delta = angularDelta(bearing, exceptionBearing)
  if (delta >= 90) return radiusKm
  return radiusKm - (radiusKm - exceptionRadiusKm) * Math.cos((delta * Math.PI) / 180)
}

export function asymmetricPolygon({ lat, lon, radiusKm, exceptionDir = null, exceptionRadiusKm = null, steps = DEFAULT_STEPS }) {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const exceptionBearing = exceptionDir ? BEARING_BY_POINT[exceptionDir] ?? null : null
  const exception = Number.isFinite(exceptionRadiusKm) ? exceptionRadiusKm : null

  const coordinates = []
  for (let i = 0; i < steps; i++) {
    const bearing = (360 / steps) * i
    const distance = radiusAt(bearing, radiusKm, exceptionBearing, exception)
    coordinates.push(turf.destination([lon, lat], distance, bearing, { units: 'kilometers' }).geometry.coordinates)
  }
  coordinates.push(coordinates[0])
  return { type: 'Polygon', coordinates: [coordinates] }
}

function ringPolygon(row, ring, extraKm = 0) {
  if (!ring) return null
  return asymmetricPolygon({
    lat: row.lat,
    lon: row.lon,
    radiusKm: ring.radiusKm + extraKm,
    exceptionDir: ring.exceptionDir,
    exceptionRadiusKm: ring.exceptionRadiusKm === null ? null : ring.exceptionRadiusKm + extraKm,
  })
}

export function galePolygon(row) {
  return ringPolygon(row, row.gale)
}

export function stormPolygon(row) {
  return ringPolygon(row, row.storm)
}

// 판정용 = 강풍반경 + 중심 오차반경. 예보 위치가 빗나가도 강풍을 만날 수 있는 범위.
export function judgementPolygon(row) {
  const errorKm = Number.isFinite(row.errorRadiusKm) ? row.errorRadiusKm : 0
  return ringPolygon(row, row.gale, errorKm)
}

// 예보 시점별 오차원의 합집합 = 화면의 예상경로 부채꼴.
export function errorConePolygon(rows = []) {
  let cone = null
  for (const row of rows) {
    if (!Number.isFinite(row?.errorRadiusKm) || row.errorRadiusKm <= 0) continue
    const circle = turf.circle([row.lon, row.lat], row.errorRadiusKm, { steps: DEFAULT_STEPS, units: 'kilometers' })
    cone = cone ? turf.union(turf.featureCollection([cone, circle])) : circle
  }
  return cone ? cone.geometry : null
}

export default { BEARING_BY_POINT, asymmetricPolygon, galePolygon, stormPolygon, judgementPolygon, errorConePolygon }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test backend/test/typhoon-geometry.test.js`
Expected: PASS — 10 tests

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/typhoon-geometry.js backend/test/typhoon-geometry.test.js
git commit -m "feat(typhoon): build asymmetric wind rings from the bureau's own exception values"
```

---

## Task 3: 수집기와 서빙

**Files:**
- Modify: `backend/src/config.js` — `api` 블록에 `typhoon_now_url`/`typhoon_list_url`, `schedule` 블록에 `typhoon_interval`
- Create: `backend/src/processors/typhoon-processor.js`
- Modify: `backend/src/index.js` — cron 등록
- Modify: `backend/server.js` — `/api/typhoon` 라우트
- Create: `backend/test/typhoon-processor.test.js`

**Interfaces:**
- Consumes: Task 1의 `parseTyphoonText`, `groupByTyphoonNumber`, Task 2의 `errorConePolygon`/`galePolygon`/`stormPolygon`
- Produces:
  - `process(): Promise<TyphoonSnapshot>`
  - `buildSnapshot({ activeRows, names, fetchedAt }): TyphoonSnapshot`
  - `currentTm(now?): string` — `YYYYMMDDHH00` (UTC 정시)
  - `TyphoonSnapshot = { fetchedAt: string, status: 'ok'|'unavailable', typhoons: Typhoon[] }`
  - `Typhoon = { number: number, year: number, seq: number, analyzedAt: string, current: TyphoonRow, rows: TyphoonRow[], geometry: { cone: Polygon|MultiPolygon|null, gale: Polygon|null, storm: Polygon|null } }`

**도형은 백엔드가 만들어 스냅샷에 담는다.** 지도와 브리핑이 같은 폴리곤을 쓰고, 프론트가 좌표 계산을 다시 하지 않는다.

- [ ] **Step 1: 설정을 추가한다**

`backend/src/config.js`의 `api` 객체에 `kim_grid_url` 다음 줄로 추가:

```js
  typhoon_now_url: process.env.TYPHOON_NOW_API_URL || 'https://apihub.kma.go.kr/api/typ01/url/typ_now.php',
  typhoon_list_url: process.env.TYPHOON_LIST_API_URL || 'https://apihub.kma.go.kr/api/typ01/url/typ_lst.php',
```

`schedule` 객체에 `sigwx_low_interval` 다음 줄로 추가:

```js
  // 30분 — 발표는 최단 3시간 간격(실측: 2022년 11호, 2020년 9호). 발표시각 대비 게시 지연은
  // 미측정이므로 창을 노리지 않고 고정 주기로 둔다. 실제 태풍 발생 시 로그로 지연을 재고 조정한다.
  typhoon_interval: '*/30 * * * *',
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/test/typhoon-processor.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseTyphoonText, parseTyphoonList } from '../src/parsers/typhoon-parser.js'
import { buildSnapshot, currentTm } from '../src/processors/typhoon-processor.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(dir, 'fixtures', name), 'utf8')
const FETCHED = '2022-09-05T00:30:00.000Z'

test('활성 태풍이 없으면 빈 목록이지만 상태는 정상이다', () => {
  const snapshot = buildSnapshot({ activeRows: [], names: [], fetchedAt: FETCHED })
  assert.equal(snapshot.status, 'ok')
  assert.deepEqual(snapshot.typhoons, [])
  assert.equal(snapshot.fetchedAt, FETCHED)
})

test('한 응답의 복수 태풍을 번호별로 나눠 담는다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetchedAt: FETCHED })
  assert.deepEqual(snapshot.typhoons.map((t) => t.number), [19, 20])
  // mode=1이므로 태풍마다 과거 경로와 예보가 함께 들어 있어야 한다.
  for (const typhoon of snapshot.typhoons) {
    assert.ok(typhoon.rows.some((r) => !r.forecast), '과거 경로가 있어야 한다')
    assert.ok(typhoon.rows.some((r) => r.forecast), '예보가 있어야 한다')
  }
})

test('현재 위치는 분석 행 중 가장 최근이다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetchedAt: FETCHED })
  const soulik = snapshot.typhoons.find((t) => t.number === 19)
  assert.equal(soulik.current.analyzedAt, '2018-08-22T00:00:00.000Z')
  assert.equal(soulik.current.forecast, false)
})

test('이름을 태풍번호로 이어 붙인다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const names = parseTyphoonList(read('typhoon-list-2018.csv'))
  const snapshot = buildSnapshot({ activeRows, names, fetchedAt: FETCHED })
  assert.equal(snapshot.typhoons.find((t) => t.number === 19).name, '솔릭')
  assert.equal(snapshot.typhoons.find((t) => t.number === 20).name, '시마론')
})

test('이름을 못 받아도 태풍을 빠뜨리지 않는다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetchedAt: FETCHED })
  assert.equal(snapshot.typhoons.length, 2)
  assert.equal(snapshot.typhoons[0].name, null)
})

test('발표번호는 그 태풍의 최대 SEQ다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetchedAt: FETCHED })
  const soulik = snapshot.typhoons.find((t) => t.number === 19)
  assert.equal(soulik.seq, Math.max(...activeRows.filter((r) => r.number === 19).map((r) => r.seq)))
})

test('스냅샷에 현재 시점 도형과 부채꼴이 담긴다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetchedAt: FETCHED })
  const soulik = snapshot.typhoons.find((t) => t.number === 19)
  assert.equal(soulik.geometry.gale.type, 'Polygon')
  assert.ok(soulik.geometry.cone, '예보 오차원 합집합이 있어야 한다')
})

test('tm은 현재 UTC 정시 12자리다', () => {
  assert.equal(currentTm(new Date('2026-07-25T18:42:13.000Z')), '202607251800')
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `node --test backend/test/typhoon-processor.test.js`
Expected: FAIL — `Cannot find module '../src/processors/typhoon-processor.js'`

- [ ] **Step 4: 프로세서를 구현한다**

`backend/src/processors/typhoon-processor.js`:

```js
// KMA 태풍정보 수집.
//  ① typ_now?tm=<현재 UTC 정시>&mode=1 — 활성 태풍 전부의 과거 경로 + 최신 예보를 한 번에.
//  ② typ_lst?disp=1 — 이름을 태풍번호로 이어 붙인다.
// tm을 빼면 태풍이 있어도 빈 응답이 온다. mode=2를 쓰면 과거 경로가 빠진다. 둘 다 조용히 망가진다.
// 활성 태풍이 없으면 ①이 빈 응답이다 — 정상이며 실패가 아니다.
import path from 'path'
import config from '../config.js'
import store from '../store.js'
import { parseTyphoonText, parseTyphoonList, groupByTyphoonNumber } from '../parsers/typhoon-parser.js'
import { errorConePolygon, galePolygon, stormPolygon } from '../briefing/typhoon-geometry.js'

const TIMEOUT_MS = 15000
const TYPE = 'typhoon'

function decode(buffer) {
  try {
    return new TextDecoder('euc-kr').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`typhoon_http_${response.status}`)
    return decode(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

// tm은 현재 UTC 정시. 빠지면 활동 중인 태풍이 있어도 빈 응답이 온다.
export function currentTm(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}00`
}

function tracksUrl(tm) {
  return `${config.api.typhoon_now_url}?tm=${tm}&mode=1&disp=0&help=0&authKey=${config.api.auth_key}`
}

function listUrl() {
  return `${config.api.typhoon_list_url}?disp=1&help=0&authKey=${config.api.auth_key}`
}

// 분석 행 중 분석시각이 가장 늦은 것이 현재 위치다.
function latestAnalysis(rows) {
  const analysis = rows.filter((row) => !row.forecast)
  const pool = analysis.length > 0 ? analysis : rows
  return pool.reduce((latest, row) => (latest === null || row.analyzedAt > latest.analyzedAt ? row : latest), null)
}

export function buildSnapshot({ activeRows, names = [], fetchedAt }) {
  const nameByNumber = new Map(names.map((entry) => [entry.number, entry]))
  const grouped = groupByTyphoonNumber(activeRows)
  const typhoons = []
  for (const [number, rows] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const current = latestAnalysis(rows)
    if (!current) continue
    const named = nameByNumber.get(number)
    // 부채꼴은 예보 시점만 감싼다. 분석 시점의 오차반경은 0이라 어차피 원이 없다.
    const forecast = rows.filter((row) => row.forecast)
    typhoons.push({
      number,
      year: current.year,
      seq: Math.max(...rows.map((row) => row.seq)),
      analyzedAt: current.analyzedAt,
      // 이름을 못 받아도 태풍을 빠뜨리지 않는다. 화면이 번호만으로 표시한다.
      name: named?.name ?? null,
      nameEn: named?.nameEn ?? null,
      current,
      rows,
      // 강풍/폭풍은 현재 시점만(스펙 §9).
      geometry: {
        cone: errorConePolygon(forecast),
        gale: galePolygon(current),
        storm: stormPolygon(current),
      },
    })
  }
  return { fetchedAt, status: 'ok', typhoons }
}

export async function process() {
  const dir = path.join(config.storage.base_path, TYPE)
  const fetchedAt = new Date().toISOString()
  let activeRows
  try {
    activeRows = parseTyphoonText(await fetchText(tracksUrl(currentTm())))
  } catch (error) {
    // 수집 실패는 "태풍 없음"이 아니다. 직전 스냅샷을 유지하고 상태만 바꾼다.
    const previous = store.loadLatest(dir)
    const snapshot = { ...(previous ?? { typhoons: [] }), fetchedAt, status: 'unavailable', reason: error.message }
    store.saveSnapshot(TYPE, snapshot)
    return snapshot
  }

  // 이름은 있으면 좋은 것이다. 목록 조회가 실패해도 경로 표시는 계속된다.
  let names = []
  if (activeRows.length > 0) {
    try {
      names = parseTyphoonList(await fetchText(listUrl()))
    } catch {
      names = []
    }
  }

  const snapshot = buildSnapshot({ activeRows, names, fetchedAt })
  store.saveSnapshot(TYPE, snapshot)
  return snapshot
}

export default { process, buildSnapshot, currentTm }
```

- [ ] **Step 5: `store.saveSnapshot`이 있는지 확인하고 없으면 기존 저장 함수로 맞춘다**

Run: `grep -n "^export" backend/src/store.js`

`saveSnapshot`이 없으면 `backend/src/processors/lightning-processor.js`가 저장에 쓰는 함수와 인자를 그대로 확인해 같은 호출로 바꾼다.

Run: `grep -n "store\." backend/src/processors/lightning-processor.js | tail -5`

- [ ] **Step 6: 통과를 확인한다**

Run: `node --test backend/test/typhoon-processor.test.js`
Expected: PASS — 8 tests

- [ ] **Step 7: cron과 라우트를 붙인다**

`backend/src/index.js` — 다른 프로세서 import 옆에:

```js
import typhoonProcessor from "./processors/typhoon-processor.js";
```

`cron.schedule(config.schedule.lightning_interval, ...)` 근처에:

```js
  cron.schedule(config.schedule.typhoon_interval, () => runWithLock("typhoon", typhoonProcessor.process));
```

`backend/server.js` — `app.get('/api/lightning', ...)` 옆에:

```js
app.get('/api/typhoon', (_, res) => sendLatest(res, 'typhoon'))
```

같은 파일의 캐시 경로 정규식(`/^\/(?:metar|taf|...|airport-info)$/i`)에 `typhoon`을 추가하고, `{ keys: ['lightning'], ... }` 목록 옆에 다음을 추가한다.

```js
  { keys: ['typhoon'], files: [snapshotMetaLatest('typhoon')], build: () => buildHashEntry('typhoon') },
```

- [ ] **Step 8: 실제로 한 번 수집해 본다**

```bash
node -e "import('./backend/src/processors/typhoon-processor.js').then(async (m) => {
  const s = await m.process()
  console.log('status =', s.status, '/ 태풍 수 =', s.typhoons.length)
})"
```

Expected: `status = ok / 태풍 수 = 0` — 현재 활동 중인 태풍이 없으므로 0이 정상이다. `unavailable`이 나오면 네트워크나 인증키를 확인한다.

- [ ] **Step 9: 전체 테스트와 커밋**

```bash
npm test
git add backend/src/config.js backend/src/processors/typhoon-processor.js backend/src/index.js backend/server.js backend/test/typhoon-processor.test.js
git commit -m "feat(typhoon): collect active storms every 30 minutes and skip unchanged bulletins"
```

---

## Task 4: 경로·공항 노출 판정

**Files:**
- Create: `backend/src/briefing/typhoon-briefing.js`
- Modify: `backend/src/briefing/hazard-section.js:56` — `typhoons` 인자 추가
- Modify: `backend/src/briefing/briefing-composer.js:91-100` — 태풍 전달
- Create: `backend/test/typhoon-briefing.test.js`

**Interfaces:**
- Consumes: Task 2의 `judgementPolygon`, Task 3의 `Typhoon`, 기존 `evaluateHorizontalExposure`/`evaluateTimeStatus`/`exposureConfidence`, 기존 `buildRouteAxis`
- Produces:
  - `matchTyphoonHazards({ typhoons, axis, etd, eta, enRouteRange, airports }): TyphoonHazard[]`
  - `stepHoursOf(rows): number` — 그 태풍의 예보 간격(시간). 예보가 1개 이하면 6
  - `TyphoonHazard = { source: 'TYPHOON', sourceId: string, code: string, label: string, typhoonNumber: number, seq: number, analyzedAt: string, validFrom: string, validTo: string, onRoute: boolean, encounter: 'on'|'nearby', verticalKnown: false, bandFt: null, routeIntervalNm: {startNm,endNm}|null, airports: string[], horizontalExposure, timeStatus, confidence }`

**유효구간:** 예보 시점마다 `validAt ± (그 태풍의 예보 간격)/2`. 간격을 상수로 고정하지 않는다 — 힌남노는 6시간, 2026년 12호 노을은 12시간이다.

`label`은 이름이 있으면 `12호 태풍 노을`, 없으면 `12호 태풍`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/typhoon-briefing.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRouteAxis } from '../src/briefing/route-axis.js'
import { matchTyphoonHazards, stepHoursOf } from '../src/briefing/typhoon-briefing.js'

// 제주(126.5E, 33.5N) → 부산(129.0E, 35.2N) 근처를 지나는 단순 항로.
const ROUTE = { type: 'LineString', coordinates: [[126.5, 33.5], [129.0, 35.2]] }
const axis = buildRouteAxis(ROUTE, 2000)

function typhoonAt({ lat, lon, validAt, radiusKm = 400, errorKm = 100 }) {
  const row = {
    forecast: true, year: 2022, number: 11, seq: 32, leadHours: 0,
    analyzedAt: '2022-09-05T00:00:00.000Z', validAt,
    lat, lon, dir: 'N', speedKmh: 24, pressureHpa: 930, maxWindMs: 50,
    errorRadiusKm: errorKm,
    gale: { radiusKm, exceptionDir: null, exceptionRadiusKm: null },
    storm: { radiusKm: 150, exceptionDir: null, exceptionRadiusKm: null },
    location: '서귀포 남남서쪽 약 410 km 부근 해상',
  }
  return { number: 11, year: 2022, seq: 32, name: '힌남노', analyzedAt: row.analyzedAt, current: row, rows: [row] }
}

test('예보 간격을 데이터에서 계산한다', () => {
  const rows6 = [0, 6, 12, 18].map((leadHours) => ({ forecast: true, leadHours }))
  const rows12 = [0, 12, 24, 36].map((leadHours) => ({ forecast: true, leadHours }))
  assert.equal(stepHoursOf(rows6), 6)
  assert.equal(stepHoursOf(rows12), 12)
  // 예보가 하나뿐이면 간격을 알 수 없다 — 6시간으로 둔다.
  assert.equal(stepHoursOf([{ forecast: true, leadHours: 0 }]), 6)
  assert.equal(stepHoursOf([]), 6)
})

test('12시간 간격 태풍은 유효구간도 12시간 폭이다', () => {
  const base = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T00:00:00.000Z' })
  base.rows = [0, 12, 24].map((leadHours) => ({
    ...base.rows[0], leadHours,
    validAt: new Date(Date.parse('2022-09-05T00:00:00.000Z') + leadHours * 3600e3).toISOString(),
  }))
  // 6시간으로 고정했다면 00:00 시점의 창은 21:00~03:00이라 04:00 출발이 안 걸린다.
  const hazards = matchTyphoonHazards({
    typhoons: [base], axis, etd: '2022-09-05T04:00:00.000Z', eta: '2022-09-05T05:00:00.000Z', airports: [],
  })
  assert.equal(hazards.length, 1)
  assert.equal(hazards[0].validFrom, '2022-09-04T18:00:00.000Z')
})

test('이름이 있으면 라벨에 붙고 없으면 번호만 쓴다', () => {
  const named = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  const call = (typhoon) => matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })[0]
  assert.equal(call(named).label, '11호 태풍 힌남노')
  assert.equal(call({ ...named, name: null }).label, '11호 태풍')
})

test('항로 위에 있으면 걸린다', () => {
  const typhoon = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  const hazards = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.equal(hazards.length, 1)
  assert.equal(hazards[0].source, 'TYPHOON')
  assert.equal(hazards[0].typhoonNumber, 11)
  assert.equal(hazards[0].onRoute, true)
  assert.ok(hazards[0].routeIntervalNm.endNm > hazards[0].routeIntervalNm.startNm)
})

test('고도는 판정하지 않는다', () => {
  const typhoon = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  const [hazard] = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.equal(hazard.verticalKnown, false)
  assert.equal(hazard.bandFt, null)
})

test('비행 시간과 겹치지 않으면 제외한다', () => {
  const typhoon = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-06T12:00:00.000Z' })
  const hazards = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.deepEqual(hazards, [])
})

test('멀리 있으면 걸리지 않는다', () => {
  const typhoon = typhoonAt({ lat: 20.0, lon: 140.0, validAt: '2022-09-05T03:00:00.000Z' })
  const hazards = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.deepEqual(hazards, [])
})

test('한 태풍의 여러 예보 시점이 하나로 묶인다', () => {
  const base = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  base.rows = [
    { ...base.rows[0], validAt: '2022-09-05T03:00:00.000Z', leadHours: 6 },
    { ...base.rows[0], validAt: '2022-09-05T09:00:00.000Z', leadHours: 12 },
  ]
  const hazards = matchTyphoonHazards({
    typhoons: [base], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T10:00:00.000Z', airports: [],
  })
  assert.equal(hazards.length, 1, '태풍당 한 항목이어야 한다')
  assert.equal(hazards[0].validFrom, '2022-09-05T00:00:00.000Z')
  assert.equal(hazards[0].validTo, '2022-09-05T12:00:00.000Z')
})

test('공항이 영향권에 들면 공항 코드가 담긴다', () => {
  const typhoon = typhoonAt({ lat: 33.5, lon: 126.5, validAt: '2022-09-05T03:00:00.000Z' })
  const [hazard] = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z',
    airports: [{ icao: 'RKPC', lat: 33.51, lon: 126.49, role: 'destination' }],
  })
  assert.deepEqual(hazard.airports, ['RKPC'])
})

test('활성 태풍이 없으면 빈 배열이다', () => {
  assert.deepEqual(matchTyphoonHazards({ typhoons: [], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [] }), [])
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test backend/test/typhoon-briefing.test.js`
Expected: FAIL — `Cannot find module '../src/briefing/typhoon-briefing.js'`

- [ ] **Step 3: 어댑터를 구현한다**

`backend/src/briefing/typhoon-briefing.js`:

```js
// 태풍을 브리핑 hazard 항목으로 바꾸는 어댑터.
// 경로 판정 자체는 기존 hazard-exposure를 그대로 쓴다 — 새 판정 로직을 만들지 않는다.
// 고도는 판정하지 않는다: 기상청 반경은 지상풍 기준이라 순항고도에 적용하면 틀린다(스펙 §3).
import * as turf from '@turf/turf'
import { judgementPolygon } from './typhoon-geometry.js'
import { evaluateHorizontalExposure, evaluateTimeStatus, exposureConfidence } from './hazard-exposure.js'
import { HORIZONTAL_EXPOSURE, TIME_STATUS, CONFIDENCE } from '../../../shared/briefing-status.js'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_STEP_HOURS = 6

// 예보 간격은 태풍마다 다르다 — 힌남노 6시간, 2026년 12호 노을 12시간(스펙 §2).
// 상수로 박으면 12시간 간격 태풍에서 시점 사이에 구멍이 생겨 그 시간대 항공기가 안 걸린다.
export function stepHoursOf(rows = []) {
  const leads = [...new Set(rows.filter((r) => r.forecast).map((r) => r.leadHours))].sort((a, b) => a - b)
  let step = Infinity
  for (let i = 1; i < leads.length; i++) step = Math.min(step, leads[i] - leads[i - 1])
  return Number.isFinite(step) && step > 0 ? step : DEFAULT_STEP_HOURS
}

function windowOf(validAt, stepHours) {
  const ms = Date.parse(validAt)
  if (!Number.isFinite(ms)) return null
  const half = (stepHours / 2) * HOUR_MS
  return { from: new Date(ms - half).toISOString(), to: new Date(ms + half).toISOString() }
}

function airportsInside(geometry, airports) {
  const hit = []
  for (const airport of airports ?? []) {
    if (!Number.isFinite(airport?.lat) || !Number.isFinite(airport?.lon)) continue
    if (turf.booleanPointInPolygon(turf.point([airport.lon, airport.lat]), geometry)) hit.push(airport.icao)
  }
  return hit
}

export function matchTyphoonHazards({ typhoons = [], axis, etd, eta, enRouteRange = null, airports = [] }) {
  const hazards = []
  for (const typhoon of typhoons) {
    let startNm = Infinity
    let endNm = -Infinity
    let from = null
    let to = null
    let timeStatus = null
    let horizontalExposure = null
    const airportHits = new Set()
    const stepHours = stepHoursOf(typhoon.rows)

    for (const row of typhoon.rows ?? []) {
      const geometry = judgementPolygon(row)
      if (!geometry) continue
      const window = windowOf(row.validAt, stepHours)
      if (!window) continue

      const exposure = evaluateHorizontalExposure({ axis, geometry, enRouteRange })
      const hitAirports = airportsInside(geometry, airports)
      const routeHit = exposure.status === HORIZONTAL_EXPOSURE.INTERSECTS
      if (!routeHit && hitAirports.length === 0) continue

      // 시간이 확실히 어긋나면(null) 그 시점은 채택하지 않는다.
      const status = evaluateTimeStatus({ etd, eta, validFrom: window.from, validTo: window.to })
      if (status === null) continue

      if (routeHit) {
        horizontalExposure = exposure
        startNm = Math.min(startNm, exposure.intervals[0].startNm)
        endNm = Math.max(endNm, exposure.intervals[0].endNm)
      }
      hitAirports.forEach((icao) => airportHits.add(icao))
      from = from === null || window.from < from ? window.from : from
      to = to === null || window.to > to ? window.to : to
      timeStatus = status === TIME_STATUS.MATCHED ? TIME_STATUS.MATCHED : (timeStatus ?? status)
    }

    if (from === null) continue

    const onRoute = Number.isFinite(startNm) && Number.isFinite(endNm) && endNm >= startNm
    hazards.push({
      source: 'TYPHOON',
      sourceId: `${typhoon.year}-${typhoon.number}-${typhoon.seq}`,
      code: 'TC',
      // 이름은 typ_lst에서 온다. 못 받았으면 번호만으로 표시한다.
      label: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
      typhoonNumber: typhoon.number,
      seq: typhoon.seq,
      analyzedAt: typhoon.analyzedAt,
      validFrom: from,
      validTo: to,
      onRoute,
      encounter: onRoute ? 'on' : 'nearby',
      // 지상풍 기준 반경이므로 고도 비교를 하지 않는다. 임의 밴드를 부여하지 않는다.
      verticalKnown: false,
      bandFt: null,
      routeIntervalNm: onRoute ? { startNm, endNm } : null,
      airports: [...airportHits],
      horizontalExposure: horizontalExposure ?? { status: HORIZONTAL_EXPOSURE.CLEAR, intervals: [] },
      timeStatus,
      // 고도를 모르므로 확신도는 항상 부분 확인이다.
      confidence: CONFIDENCE.PARTIAL,
    })
  }
  return hazards
}

export default { matchTyphoonHazards }
```

- [ ] **Step 4: `shared/briefing-status.js`의 상수 이름을 확인한다**

Run: `grep -n "HORIZONTAL_EXPOSURE\|TIME_STATUS\|CONFIDENCE" shared/briefing-status.js`

`INTERSECTS`/`CLEAR`/`MATCHED`/`PARTIAL` 키 이름이 다르면 import한 상수 사용부를 실제 이름으로 맞춘다. 문자열 리터럴을 새로 만들지 않는다.

- [ ] **Step 5: 통과를 확인한다**

Run: `node --test backend/test/typhoon-briefing.test.js`
Expected: PASS — 10 tests

- [ ] **Step 6: hazard-section에 편입한다**

`backend/src/briefing/hazard-section.js:56`의 시그니처에 `typhoons = []`를 추가하고, `airportWarnings`를 펼치는 곳(`...airportWarnings,` 61행 근처)에 태풍 항목을 함께 넣는다.

```js
export function buildHazardSection({ sigmet, airmet, axis, etd, eta, cruiseAltitudeFt, enRouteRange = null, airportWarnings = [], typhoons = [] }) {
```

`hazardLevel(h)`에 태풍 분기를 추가한다. 등급을 만들지 않는다는 원칙에 따라 SIGMET과 같은 red/amber 체계에 억지로 끼우지 말고, 태풍은 `amber` 고정으로 둔다(기본 분기가 이미 `amber`를 반환하므로 별도 코드가 필요 없다 — `h.source === 'SIGMET'`이 아니면 `amber`).

`briefing-composer.js:91` 호출에 다음 줄을 추가한다.

```js
    typhoons: matchTyphoonHazards({
      typhoons: data?.typhoon?.typhoons ?? [],
      axis,
      etd: request.etd,
      eta: request.eta,
      enRouteRange: request.routeModel?.enRouteRange ?? null,
      airports: airportRoles(request),
    }),
```

`airportRoles(request)`가 `{ icao, lat, lon, role }` 형태를 반환하는지 확인하고, 아니라면 좌표를 붙여 넘긴다.

Run: `grep -n -A10 "function airportRoles" backend/src/briefing/briefing-composer.js`

- [ ] **Step 7: 전체 테스트와 커밋**

```bash
npm test
git add backend/src/briefing/typhoon-briefing.js backend/src/briefing/hazard-section.js backend/src/briefing/briefing-composer.js backend/test/typhoon-briefing.test.js
git commit -m "feat(typhoon): report route and airport exposure without inventing an altitude band"
```

---

## Task 5: 태풍 색 배정

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/typhoonColors.js`
- Create: `frontend/src/features/weather-overlays/lib/typhoonColors.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `TYPHOON_PALETTE: string[]`
  - `assignTyphoonColors(numbers: number[]): Record<number, string>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/weather-overlays/lib/typhoonColors.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { TYPHOON_PALETTE, assignTyphoonColors } from './typhoonColors.js'

test('같은 태풍번호는 항상 같은 색이다', () => {
  assert.equal(assignTyphoonColors([11])[11], assignTyphoonColors([11])[11])
})

test('다른 태풍이 사라져도 남은 태풍 색이 바뀌지 않는다', () => {
  const both = assignTyphoonColors([19, 20])
  const only = assignTyphoonColors([20])
  assert.equal(both[20], only[20])
})

test('동시 활성 태풍은 서로 다른 색을 받는다', () => {
  const numbers = [1, 7, 13, 19]
  const colors = assignTyphoonColors(numbers)
  assert.equal(new Set(Object.values(colors)).size, numbers.length)
})

test('팔레트 길이만큼 차이 나 충돌해도 색이 겹치지 않는다', () => {
  const n = TYPHOON_PALETTE.length
  const colors = assignTyphoonColors([1, 1 + n])
  assert.notEqual(colors[1], colors[1 + n])
})

test('활성 태풍이 팔레트보다 많으면 색을 재사용한다', () => {
  const numbers = Array.from({ length: TYPHOON_PALETTE.length + 2 }, (_, i) => i + 1)
  const colors = assignTyphoonColors(numbers)
  assert.equal(Object.keys(colors).length, numbers.length)
  for (const color of Object.values(colors)) assert.ok(TYPHOON_PALETTE.includes(color))
})

test('빈 목록은 빈 객체다', () => {
  assert.deepEqual(assignTyphoonColors([]), {})
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && node --test src/features/weather-overlays/lib/typhoonColors.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`frontend/src/features/weather-overlays/lib/typhoonColors.js`:

```js
// 태풍 색은 목록 순서가 아니라 태풍번호로 정한다.
// 순서 기준이면 태풍 하나가 소멸했을 때 남은 태풍의 색이 바뀌어 사용자가 헷갈린다.
// 색은 유일한 구분 수단이 아니다 — 지도 라벨과 패널에 태풍번호가 함께 표시된다.
export const TYPHOON_PALETTE = [
  '#dc2626', // red
  '#2563eb', // blue
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#65a30d', // lime
]

export function assignTyphoonColors(numbers = []) {
  const assigned = {}
  const taken = new Set()
  for (const number of [...numbers].sort((a, b) => a - b)) {
    const start = ((number % TYPHOON_PALETTE.length) + TYPHOON_PALETTE.length) % TYPHOON_PALETTE.length
    let index = start
    // 이미 쓰인 색이면 다음 빈 색으로 민다. 한 바퀴 다 찼으면 원래 색을 그대로 쓴다.
    for (let step = 0; step < TYPHOON_PALETTE.length; step++) {
      const candidate = (start + step) % TYPHOON_PALETTE.length
      if (!taken.has(candidate)) { index = candidate; break }
    }
    taken.add(index)
    assigned[number] = TYPHOON_PALETTE[index]
  }
  return assigned
}

export default { TYPHOON_PALETTE, assignTyphoonColors }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && node --test src/features/weather-overlays/lib/typhoonColors.test.js`
Expected: PASS — 6 tests

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/typhoonColors.js frontend/src/features/weather-overlays/lib/typhoonColors.test.js
git commit -m "feat(typhoon): key colours to the storm number so they survive dissipation"
```

---

## Task 6: 지도 레이어

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/typhoonLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js`
- Create: `frontend/src/features/weather-overlays/lib/typhoonLayers.test.js`

**Interfaces:**
- Consumes: Task 5의 `assignTyphoonColors`
- Produces:
  - `TYPHOON_SOURCE_IDS: string[]`, `TYPHOON_LAYER_IDS: string[]`
  - `buildTyphoonGeoJson(typhoons): { track, forecastTrack, points, cone, gale, storm }` — 각각 FeatureCollection
  - `addTyphoonLayers(map)`, `removeTyphoonLayers(map)`
  - `setTyphoonVisibility(map, visible)`
  - `syncTyphoonLayers(map, { typhoons, visible })`

**주의:** 부채꼴·강풍·폭풍 폴리곤은 Task 3의 스냅샷에 이미 담겨 백엔드가 GeoJSON으로 내려준다. 프론트에서 좌표를 다시 계산하지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/weather-overlays/lib/typhoonLayers.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTyphoonGeoJson, TYPHOON_LAYER_IDS, TYPHOON_SOURCE_IDS } from './typhoonLayers.js'

const row = (leadHours, forecast, lat, lon) => ({
  forecast, leadHours, lat, lon, validAt: `2022-09-05T${String(leadHours).padStart(2, '0')}:00:00.000Z`,
  pressureHpa: 930, maxWindMs: 50, location: '서귀포 남남서쪽 약 410 km 부근 해상',
})

const TYPHOONS = [{
  number: 11, year: 2022, seq: 32, analyzedAt: '2022-09-05T00:00:00.000Z',
  current: row(0, false, 29.8, 124.9),
  rows: [row(0, false, 29.8, 124.9), row(6, true, 31.0, 125.3), row(12, true, 32.4, 126.2)],
  geometry: {
    cone: { type: 'Polygon', coordinates: [[[124, 29], [126, 29], [126, 33], [124, 33], [124, 29]]] },
    gale: { type: 'Polygon', coordinates: [[[124, 29], [126, 29], [126, 31], [124, 31], [124, 29]]] },
    storm: null,
  },
}]

test('분석 구간과 예보 구간을 서로 다른 선으로 만든다', () => {
  const { track, forecastTrack } = buildTyphoonGeoJson(TYPHOONS)
  assert.equal(track.features.length, 1)
  assert.equal(forecastTrack.features.length, 1)
  assert.equal(forecastTrack.features[0].geometry.coordinates.length, 3, '예보선은 분석 마지막 점에서 이어져야 한다')
})

test('모든 지점에 태풍번호와 색이 붙는다', () => {
  const { points } = buildTyphoonGeoJson(TYPHOONS)
  assert.equal(points.features.length, 3)
  for (const feature of points.features) {
    assert.equal(feature.properties.number, 11)
    assert.match(feature.properties.color, /^#[0-9a-f]{6}$/i)
    assert.equal(feature.properties.label, '11호')
  }
})

test('폭풍 도형이 없으면 그 피처를 만들지 않는다', () => {
  const { storm, gale } = buildTyphoonGeoJson(TYPHOONS)
  assert.equal(storm.features.length, 0)
  assert.equal(gale.features.length, 1)
})

test('복수 태풍은 서로 다른 색을 받는다', () => {
  const second = { ...TYPHOONS[0], number: 12 }
  const { points } = buildTyphoonGeoJson([TYPHOONS[0], second])
  const colors = new Set(points.features.map((f) => f.properties.color))
  assert.equal(colors.size, 2)
})

test('빈 목록은 빈 FeatureCollection이다', () => {
  const result = buildTyphoonGeoJson([])
  for (const key of ['track', 'forecastTrack', 'points', 'cone', 'gale', 'storm']) {
    assert.equal(result[key].type, 'FeatureCollection')
    assert.deepEqual(result[key].features, [])
  }
})

test('소스와 레이어 ID가 중복 없이 정의된다', () => {
  assert.equal(new Set(TYPHOON_SOURCE_IDS).size, TYPHOON_SOURCE_IDS.length)
  assert.equal(new Set(TYPHOON_LAYER_IDS).size, TYPHOON_LAYER_IDS.length)
  assert.ok(TYPHOON_LAYER_IDS.length >= TYPHOON_SOURCE_IDS.length)
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && node --test src/features/weather-overlays/lib/typhoonLayers.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 레이어 모듈을 구현한다**

`frontend/src/features/weather-overlays/lib/typhoonLayers.js`:

```js
// 태풍 지도 레이어. 도형은 백엔드가 계산해 내려준다 — 여기서 다시 만들지 않는다.
// 색만으로 구분하지 않는다: 각 지점에 태풍번호 라벨이 함께 붙는다.
import { assignTyphoonColors } from './typhoonColors.js'

export const TYPHOON_SOURCE_IDS = [
  'typhoon-cone', 'typhoon-gale', 'typhoon-storm', 'typhoon-track', 'typhoon-forecast-track', 'typhoon-points',
]

export const TYPHOON_LAYER_IDS = [
  'typhoon-cone-fill',
  'typhoon-gale-fill',
  'typhoon-storm-fill',
  'typhoon-track-line',
  'typhoon-forecast-track-line',
  'typhoon-points-circle',
  'typhoon-points-label',
]

const empty = () => ({ type: 'FeatureCollection', features: [] })

export function buildTyphoonGeoJson(typhoons = []) {
  const colors = assignTyphoonColors(typhoons.map((t) => t.number))
  const result = {
    track: empty(), forecastTrack: empty(), points: empty(), cone: empty(), gale: empty(), storm: empty(),
  }

  for (const typhoon of typhoons) {
    const color = colors[typhoon.number]
    const props = { number: typhoon.number, color, label: `${typhoon.number}호` }
    const rows = typhoon.rows ?? []
    const analysis = rows.filter((row) => !row.forecast)
    const forecast = rows.filter((row) => row.forecast)
    const coord = (row) => [row.lon, row.lat]

    if (analysis.length >= 2) {
      result.track.features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: analysis.map(coord) } })
    }
    // 예보선은 분석 마지막 점에서 이어 붙여야 선이 끊기지 않는다.
    const forecastCoords = [...analysis.slice(-1), ...forecast].map(coord)
    if (forecastCoords.length >= 2) {
      result.forecastTrack.features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: forecastCoords } })
    }

    for (const row of rows) {
      result.points.features.push({
        type: 'Feature',
        properties: { ...props, forecast: Boolean(row.forecast), leadHours: row.leadHours, pressureHpa: row.pressureHpa, validAt: row.validAt },
        geometry: { type: 'Point', coordinates: coord(row) },
      })
    }

    for (const [key, geometry] of [['cone', typhoon.geometry?.cone], ['gale', typhoon.geometry?.gale], ['storm', typhoon.geometry?.storm]]) {
      if (!geometry) continue
      result[key].features.push({ type: 'Feature', properties: props, geometry })
    }
  }
  return result
}

const SOURCE_BY_KEY = {
  cone: 'typhoon-cone', gale: 'typhoon-gale', storm: 'typhoon-storm',
  track: 'typhoon-track', forecastTrack: 'typhoon-forecast-track', points: 'typhoon-points',
}

export function addTyphoonLayers(map) {
  if (!map) return
  for (const id of TYPHOON_SOURCE_IDS) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() })
  }
  const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer) }

  add({ id: 'typhoon-cone-fill', type: 'fill', source: 'typhoon-cone', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } })
  add({ id: 'typhoon-gale-fill', type: 'fill', source: 'typhoon-gale', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } })
  add({ id: 'typhoon-storm-fill', type: 'fill', source: 'typhoon-storm', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.38 } })
  add({ id: 'typhoon-track-line', type: 'line', source: 'typhoon-track', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } })
  add({ id: 'typhoon-forecast-track-line', type: 'line', source: 'typhoon-forecast-track', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 2] } })
  add({ id: 'typhoon-points-circle', type: 'circle', source: 'typhoon-points', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['case', ['get', 'forecast'], 4, 6], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } })
  add({
    id: 'typhoon-points-label', type: 'symbol', source: 'typhoon-points',
    filter: ['==', ['get', 'leadHours'], 0],
    // 스펙 §9: 라벨은 태풍번호와 중심기압. 색만으로 구분하지 않기 위한 것이므로 번호는 반드시 남는다.
    layout: {
      'text-field': ['case',
        ['has', 'pressureHpa'], ['concat', ['get', 'label'], ' · ', ['to-string', ['get', 'pressureHpa']], ' hPa'],
        ['get', 'label'],
      ],
      'text-size': 12, 'text-offset': [0, 1.2], 'text-allow-overlap': false,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })
}

export function removeTyphoonLayers(map) {
  if (!map) return
  for (const id of TYPHOON_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of TYPHOON_SOURCE_IDS) if (map.getSource(id)) map.removeSource(id)
}

export function setTyphoonVisibility(map, visible) {
  if (!map) return
  for (const id of TYPHOON_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}

export function syncTyphoonLayers(map, { typhoons = [], visible = false } = {}) {
  if (!map?.getSource) return
  addTyphoonLayers(map)
  const data = buildTyphoonGeoJson(typhoons)
  for (const [key, sourceId] of Object.entries(SOURCE_BY_KEY)) {
    map.getSource(sourceId)?.setData(data[key])
  }
  setTyphoonVisibility(map, visible)
}

export default { TYPHOON_SOURCE_IDS, TYPHOON_LAYER_IDS, buildTyphoonGeoJson, addTyphoonLayers, removeTyphoonLayers, setTyphoonVisibility, syncTyphoonLayers }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && node --test src/features/weather-overlays/lib/typhoonLayers.test.js`
Expected: PASS — 6 tests

- [ ] **Step 5: 동기화 훅을 만든다**

`frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js`:

```js
// MET 오버레이 규약: 데이터 fetch와 sync는 weather-overlays가 소유한다.
// MapView는 styleRevision 변화 때 이 훅의 sync를 다시 부르기만 한다.
import { useCallback, useEffect, useState } from 'react'
import { syncTyphoonLayers } from './typhoonLayers.js'

export function useTyphoonOverlay({ map, visible, styleRevision }) {
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    if (!visible) return undefined
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/typhoon')
        if (!response.ok) throw new Error(`typhoon_${response.status}`)
        const data = await response.json()
        if (!cancelled) setSnapshot(data)
      } catch {
        // 수집 실패를 "태풍 없음"으로 바꾸지 않는다. 상태를 알 수 없음으로 남긴다.
        if (!cancelled) setSnapshot((previous) => previous ?? { status: 'unavailable', typhoons: [] })
      }
    }
    load()
    return () => { cancelled = true }
  }, [visible])

  const sync = useCallback(() => {
    syncTyphoonLayers(map, { typhoons: snapshot?.typhoons ?? [], visible })
  }, [map, snapshot, visible])

  useEffect(() => { sync() }, [sync, styleRevision])

  return { snapshot, typhoons: snapshot?.typhoons ?? [], status: snapshot?.status ?? 'unknown', sync }
}

export default { useTyphoonOverlay }
```

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/typhoonLayers.js frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js frontend/src/features/weather-overlays/lib/typhoonLayers.test.js
git commit -m "feat(typhoon): draw tracks, cone and wind rings as one toggled layer set"
```

---

## Task 7: 레이어 타일과 목록 패널

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/typhoonListModel.js`
- Create: `frontend/src/features/weather-overlays/lib/typhoonListModel.test.js`
- Create: `frontend/src/features/weather-overlays/TyphoonPanel.jsx`
- Create: `frontend/src/features/weather-overlays/TyphoonPanel.css`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` — `MET_LAYERS`에 `typhoon` 추가
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` — `layerLabels`, `groups.hazards`, `WEATHER_TILE_ICON`
- Modify: `frontend/src/features/map/layerActions.js` — `MET_META`에 `typhoon`
- Modify: `frontend/src/features/map/MapView.jsx` — `TyphoonPanel` 합성

**Interfaces:**
- Consumes: Task 5의 `assignTyphoonColors`, Task 6의 `useTyphoonOverlay`
- Produces:
  - `buildTyphoonListItems(typhoons): ListItem[]` — `ListItem = { number, color, title, pressureHpa, maxWindMs, location, analyzedAt, center: { lat, lon } }`
  - `TyphoonPanel({ typhoons, status, onFocus })` — `onFocus(item)`는 지도 카메라만 옮긴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**중요:** `frontend`의 테스트는 `node --test`를 JSX 변환 없이 돌린다(`frontend/package.json:13`). `.jsx`를 import하는 테스트는 실행되지 않는다. 기존 선례(`AdvisoryBadges.mobile-popover.test.js`)는 JSX 파일을 문자열로 읽어 검사한다.

따라서 목록 모델은 순수 `.js`로 분리하고 그것만 import해 검증한다.

`frontend/src/features/weather-overlays/lib/typhoonListModel.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTyphoonListItems } from './typhoonListModel.js'

const typhoon = (number, name = '힌남노') => ({
  number, name, year: 2022, seq: 32, analyzedAt: '2022-09-05T00:00:00.000Z',
  current: { lat: 29.8, lon: 124.9, pressureHpa: 930, maxWindMs: 50, location: '서귀포 남남서쪽 약 410 km 부근 해상' },
  rows: [],
})

test('항목마다 번호와 이름이 붙은 제목과 색이 생긴다', () => {
  const items = buildTyphoonListItems([typhoon(11)])
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '11호 태풍 힌남노')
  assert.match(items[0].color, /^#[0-9a-f]{6}$/i)
})

test('이름을 못 받았으면 번호만 쓰고 태풍을 빠뜨리지 않는다', () => {
  const [item] = buildTyphoonListItems([typhoon(11, null)])
  assert.equal(item.title, '11호 태풍')
  assert.equal(item.name, null)
})

test('강도와 위치를 그대로 전달한다', () => {
  const [item] = buildTyphoonListItems([typhoon(11)])
  assert.equal(item.pressureHpa, 930)
  assert.equal(item.maxWindMs, 50)
  assert.equal(item.location, '서귀포 남남서쪽 약 410 km 부근 해상')
  assert.deepEqual(item.center, { lat: 29.8, lon: 124.9 })
})

test('복수 태풍은 지도와 같은 색 배정을 쓴다', () => {
  const items = buildTyphoonListItems([typhoon(19), typhoon(20)])
  assert.equal(new Set(items.map((i) => i.color)).size, 2)
})

test('빈 목록은 빈 배열이다', () => {
  assert.deepEqual(buildTyphoonListItems([]), [])
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && node --test src/features/weather-overlays/lib/typhoonListModel.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 목록 모델을 구현한다**

`frontend/src/features/weather-overlays/lib/typhoonListModel.js`:

```js
import { assignTyphoonColors } from './typhoonColors.js'

// 목록 모델. 렌더와 분리해 두어야 JSX 변환 없이 테스트할 수 있다.
export function buildTyphoonListItems(typhoons = []) {
  const colors = assignTyphoonColors(typhoons.map((t) => t.number))
  return typhoons.map((typhoon) => ({
    number: typhoon.number,
    color: colors[typhoon.number],
    // 이름은 typ_lst에서 온다. 못 받았으면 번호만 쓴다.
    title: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
    name: typhoon.name ?? null,
    pressureHpa: typhoon.current?.pressureHpa ?? null,
    maxWindMs: typhoon.current?.maxWindMs ?? null,
    location: typhoon.current?.location ?? '',
    analyzedAt: typhoon.analyzedAt,
    center: { lat: typhoon.current?.lat, lon: typhoon.current?.lon },
  }))
}

export default { buildTyphoonListItems }
```

- [ ] **Step 4: 모델 테스트 통과를 확인한다**

Run: `cd frontend && node --test src/features/weather-overlays/lib/typhoonListModel.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: 패널 컴포넌트를 구현한다**

`frontend/src/features/weather-overlays/TyphoonPanel.jsx`:

```jsx
import { buildTyphoonListItems } from './lib/typhoonListModel.js'
import './TyphoonPanel.css'

function formatAnalyzedAt(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'UTC', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

export default function TyphoonPanel({ typhoons = [], status = 'ok', onFocus }) {
  const items = buildTyphoonListItems(typhoons)
  return (
    <div className="dev-layer-panel layer-drawer typhoon-panel" aria-label="활성 태풍 목록">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">기상정보</div>
          <div className="layer-drawer-title">태풍</div>
        </div>
        <span className="layer-drawer-status">{items.length}개</span>
      </div>
      <div className="layer-drawer-body">
        {status === 'unavailable' && (
          <p className="typhoon-panel__empty">자료 없음 — 수집에 실패했습니다. 태풍이 없다는 뜻이 아닙니다.</p>
        )}
        {status !== 'unavailable' && items.length === 0 && (
          <p className="typhoon-panel__empty">현재 활동 중인 태풍 없음</p>
        )}
        {items.map((item) => (
          <section key={item.number} className="typhoon-panel__item">
            <span className="typhoon-panel__swatch" style={{ background: item.color }} aria-hidden="true" />
            <div className="typhoon-panel__body">
              <strong>{item.title}</strong>
              <div className="typhoon-panel__metrics">
                {item.pressureHpa !== null && <span>{item.pressureHpa} hPa</span>}
                {item.maxWindMs !== null && <span>{item.maxWindMs} m/s</span>}
              </div>
              <div className="typhoon-panel__location">{item.location}</div>
              <div className="typhoon-panel__time">{formatAnalyzedAt(item.analyzedAt)} UTC 분석</div>
            </div>
            <button type="button" className="typhoon-panel__focus" onClick={() => onFocus?.(item)}>
              바로가기
            </button>
          </section>
        ))}
      </div>
    </div>
  )
}
```

`frontend/src/features/weather-overlays/TyphoonPanel.css`:

```css
/* 레이어 드로어 오른쪽에 나란히 배치. layer-drawer 셸을 재사용하되 위치만 민다.
   .map-view-wrapper .layer-drawer 규칙을 이기려 동일 접두 + .typhoon-panel 로 특이도 확보. */
.map-view-wrapper .layer-drawer.typhoon-panel {
  left: calc(12px + var(--panel-overlay-sm) + 8px);
  width: min(300px, 92vw);
}

.typhoon-panel__empty {
  margin: 0;
  padding: 12px;
  font-size: 13px;
  color: rgba(71, 85, 105, 0.9);
}

.typhoon-panel__item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.28);
}

.typhoon-panel__swatch {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 50%;
}

.typhoon-panel__body { flex: 1 1 auto; min-width: 0; }

.typhoon-panel__metrics { display: flex; gap: 8px; font-size: 12px; }

.typhoon-panel__location,
.typhoon-panel__time { font-size: 12px; color: rgba(71, 85, 105, 0.9); }

.typhoon-panel__focus {
  flex: 0 0 auto;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
```

- [ ] **Step 6: 타일을 등록한다**

`frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`의 `MET_LAYERS` 배열에서 `{ id: 'sigwx', ... }` 다음 줄에 추가:

```js
  { id: 'typhoon', label: '태풍', color: '#dc2626' },
```

`frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`:
- `layerLabels`에 `typhoon: '태풍',` 추가
- `groups`의 `hazards` 항목 `ids`를 `['sigmet', 'sigmet_intl', 'airmet', 'sigwx', 'typhoon']`로 바꾼다
- `WEATHER_TILE_ICON`에 `typhoon:` 항목을 추가한다. `lucide-react`에서 `Tornado`를 import해 쓴다

`frontend/src/features/map/layerActions.js`의 `MET_META`에 추가:

```js
  typhoon: { label: '태풍', aliases: ['태풍', 'typhoon', '타이푼'] },
```

- [ ] **Step 7: MapView에 합성한다**

`MapView.jsx`에서 `EchoTopCard` import 옆에 추가:

```js
import TyphoonPanel from '../weather-overlays/TyphoonPanel.jsx'
import { useTyphoonOverlay } from '../weather-overlays/lib/typhoonOverlaySync.js'
```

다른 오버레이 훅 호출부 근처(`useNwpOverlays({...})` 부근)에 추가:

```js
  const typhoonOverlay = useTyphoonOverlay({ map: mapRef.current, visible: metVisibility.typhoon, styleRevision })
```

`<EchoTopCard ... />` 합성 지점(1728행 근처) 옆에 추가:

```jsx
      {metVisibility.typhoon && (
        <TyphoonPanel
          typhoons={typhoonOverlay.typhoons}
          status={typhoonOverlay.status}
          onFocus={(item) => mapRef.current?.flyTo({ center: [item.center.lon, item.center.lat], zoom: 5 })}
        />
      )}
```

`mapRef`와 `styleRevision`의 실제 이름을 파일에서 확인해 맞춘다.

Run: `grep -n "styleRevision\|const mapRef" frontend/src/features/map/MapView.jsx | head -5`

- [ ] **Step 8: 배지를 붙인다**

`metLayerBadge` 함수를 찾아 `typhoon`일 때 활성 태풍 수를 반환하게 한다.

Run: `grep -n -A8 "metLayerBadge" frontend/src/features/map/MapView.jsx | head -15`

- [ ] **Step 9: 빌드와 커밋**

```bash
cd frontend && npm run build
cd .. && npm test
git add frontend/src/features/weather-overlays/TyphoonPanel.jsx frontend/src/features/weather-overlays/TyphoonPanel.css frontend/src/features/weather-overlays/lib/typhoonListModel.js frontend/src/features/weather-overlays/lib/typhoonListModel.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/map/layerActions.js frontend/src/features/map/MapView.jsx
git commit -m "feat(typhoon): add the layer tile and the active storm list panel"
```

---

## Task 8: 브라우저 계약

**Files:**
- Create: `frontend/verification/contracts/typhoon.spec.mjs`
- Create: `frontend/verification/contracts/fixtures/typhoon-snapshot.json`
- Modify: `docs/policies/verification/contracts.md` — 계약 등록

**Interfaces:**
- Consumes: Task 3의 `/api/typhoon` 응답 형태, Task 7의 패널 DOM

**현재 활동 중인 태풍이 없다.** 계약은 `/api/typhoon`을 픽스처로 가로채 검증한다.

- [ ] **Step 1: 기존 계약의 서버 기동·라우트 가로채기 방식을 읽는다**

Run: `sed -n '1,60p' frontend/verification/contracts/echo-top.spec.mjs`

`panelToggle()` 헬퍼(118행 근처)와 픽스처 주입 방식을 그대로 따른다. 새 패턴을 만들지 않는다.

- [ ] **Step 2: 픽스처를 만든다**

`frontend/verification/contracts/fixtures/typhoon-snapshot.json` — 힌남노와 2018년 19·20호를 합친 2개 태풍 스냅샷. Task 1의 픽스처에서 다음으로 생성한다.

```bash
node -e "
const fs=require('fs');
const {parseTyphoonText,parseTyphoonList}=await import('./backend/src/parsers/typhoon-parser.js');
const {buildSnapshot}=await import('./backend/src/processors/typhoon-processor.js');
const active=parseTyphoonText(fs.readFileSync('backend/test/fixtures/typhoon-multi-2018.txt','utf8'));
const names=parseTyphoonList(fs.readFileSync('backend/test/fixtures/typhoon-list-2018.csv','utf8'));
const snap=buildSnapshot({activeRows:active,names,fetchedAt:'2018-08-22T00:30:00.000Z'});
fs.writeFileSync('frontend/verification/contracts/fixtures/typhoon-snapshot.json',JSON.stringify(snap,null,2));
console.log('태풍 수 =',snap.typhoons.length);
" --input-type=module
```

Expected: `태풍 수 = 2`

- [ ] **Step 3: 계약을 쓴다**

`frontend/verification/contracts/typhoon.spec.mjs`:

```js
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', 'typhoon-snapshot.json'), 'utf8'))
const empty = { fetchedAt: '2026-07-26T00:00:00.000Z', status: 'ok', typhoons: [] }

async function openTyphoon(page, payload) {
  await page.route('**/api/typhoon', (route) => route.fulfill({ json: payload }))
  await page.goto('/')
  await page.getByRole('button', { name: '기상 레이어' }).click()
  await page.getByRole('button', { name: '태풍' }).click()
}

test('태풍 타일이 지도 레이어와 목록 패널을 함께 켠다', async ({ page }) => {
  await openTyphoon(page, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('19호 태풍')).toBeVisible()
  await expect(panel.getByText('20호 태풍')).toBeVisible()

  const layers = await page.evaluate(() => window.__mapHandle?.getStyle().layers.filter((l) => l.id.startsWith('typhoon-')).map((l) => l.id) ?? [])
  expect(layers).toContain('typhoon-track-line')
  expect(layers).toContain('typhoon-forecast-track-line')
  expect(layers).toContain('typhoon-cone-fill')
  expect(layers).toContain('typhoon-gale-fill')

  await page.getByRole('button', { name: '태풍' }).click()
  await expect(panel).toBeHidden()
})

test('복수 태풍의 패널 색과 지도 색이 일치한다', async ({ page }) => {
  await openTyphoon(page, snapshot)
  const swatches = await page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__swatch').evaluateAll(
    (nodes) => nodes.map((n) => getComputedStyle(n).backgroundColor),
  )
  expect(new Set(swatches).size).toBe(2)

  const mapColors = await page.evaluate(() => {
    const source = window.__mapHandle?.getSource('typhoon-points')
    return [...new Set((source?._data?.features ?? []).map((f) => f.properties.color))]
  })
  expect(mapColors.length).toBe(2)
})

test('바로가기 버튼이 지도를 해당 태풍으로 옮긴다', async ({ page }) => {
  await openTyphoon(page, snapshot)
  const before = await page.evaluate(() => window.__mapHandle?.getCenter())
  await page.getByLabel('활성 태풍 목록').locator('.typhoon-panel__focus').first().click()
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => window.__mapHandle?.getCenter())
  expect(after.lng).not.toBeCloseTo(before.lng, 1)
})

test('활성 태풍이 없으면 그렇게 표시한다', async ({ page }) => {
  await openTyphoon(page, empty)
  await expect(page.getByText('현재 활동 중인 태풍 없음')).toBeVisible()
})

test('수집 실패는 태풍 없음과 구분해 표시한다', async ({ page }) => {
  await openTyphoon(page, { ...empty, status: 'unavailable' })
  await expect(page.getByText(/자료 없음/)).toBeVisible()
})

test('베이스맵을 두 번 바꿔도 레이어가 남는다', async ({ page }) => {
  await openTyphoon(page, snapshot)
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /베이스맵|지도 스타일/ }).click()
    await page.waitForTimeout(1500)
  }
  const layers = await page.evaluate(() => window.__mapHandle?.getStyle().layers.filter((l) => l.id.startsWith('typhoon-')).map((l) => l.id) ?? [])
  expect(layers).toContain('typhoon-track-line')
})
```

`window.__mapHandle`과 버튼 접근 이름은 기존 계약에서 쓰는 실제 값으로 맞춘다.

Run: `grep -n "__mapHandle\|getByRole" frontend/verification/contracts/echo-top.spec.mjs | head -10`

- [ ] **Step 4: 개발 서버를 띄우고 계약을 돌린다**

[dev-server 절차](../../operations/dev-server-and-capture.md)를 따른다.

Run: `npx playwright test frontend/verification/contracts/typhoon.spec.mjs --reporter=list`
Expected: 6 passed

실패하면 `superpowers:systematic-debugging`으로 근본 원인을 찾는다. 계약을 느슨하게 고쳐 통과시키지 않는다.

- [ ] **Step 5: 계약을 등록하고 커밋한다**

`docs/policies/verification/contracts.md`에 태풍 계약 행을 추가한다. 기존 행의 형식을 그대로 따른다.

```bash
git add frontend/verification/contracts/typhoon.spec.mjs frontend/verification/contracts/fixtures/typhoon-snapshot.json docs/policies/verification/contracts.md
git commit -m "test(typhoon): pin the layer toggle, colour parity and focus button"
```

---

## Task 9: 마무리 검증

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: Task 1~7이 추가한 테스트가 모두 통과하고, 기존 실패는 `cross-section-route.test.js` 1건만 남는다(이 작업 이전부터 있던 실패).

- [ ] **Step 2: 구조 검사**

```bash
npx depcruise backend/src frontend/src --output-type err
npx madge --circular backend/src frontend/src
```
Expected: 순환 의존 없음

- [ ] **Step 3: 미사용 코드 검사**

Run: `npx knip`
Expected: 이 작업이 추가한 export 중 미사용으로 잡히는 것이 없을 것. 잡히면 지운다.

- [ ] **Step 4: 그래프 갱신**

Run: `graphify update .`

- [ ] **Step 5: 상태 문서를 쓴다**

`docs/superpowers/status/typhoon-track-and-route-warning.status.md`에 한 페이지 이내로 남긴다: 완료 범위, 미측정으로 남긴 것(발표 게시 지연, 비대칭 방향 규칙 표본 3개), 실제 태풍 발생 시 할 일.

- [ ] **Step 6: 커밋**

```bash
git add docs/superpowers/status/typhoon-track-and-route-warning.status.md
git commit -m "docs(typhoon): record what stayed unmeasured until a real storm arrives"
```

---

## 실제 태풍이 오기 전까지 확인할 수 없는 것

이 계획의 모든 검증은 2018·2022년 과거 태풍 픽스처로 이루어진다. 다음은 실제 태풍이 발생해야 확인된다.

- 발표시각 대비 게시 지연 — 30분 주기가 적절한지
- 소멸 시점에 `typ_now`에서 해당 태풍이 실제로 빠지는지
- `EFF`(한반도영향)가 진행 중에도 갱신되는지 — 확인 전까지 판정·표시 어디에도 쓰지 않는다
- 비대칭 축소 방향이 안전반원과 어긋나는 빈도

상태 문서에 기록하고, 실제 태풍 발생 시 로그로 확인한다.
