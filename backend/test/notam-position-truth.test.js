import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parsePositionText } from '../src/notam/notam-position-text.js'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const truth = JSON.parse(readFileSync(here('./fixtures/notam-geometry-truth-2026-07-26.json'), 'utf8'))
const kml = readFileSync(here('./fixtures/notam-2026-07-26.kml'), 'utf8').replace(/\r/g, '\n')

// 원문만 뽑는다 — 파서를 거치지 않는다(정답표가 만들어진 방식과 동일한 입력).
const rawById = new Map()
for (const chunk of kml.split('<Placemark').slice(1)) {
  const pm = chunk.split('</Placemark>')[0]
  const cdata = (pm.match(/<!\[CDATA\[([\s\S]*?)\]\]>/) || [, ''])[1]
    .replace(/<br\s*\/?>/gi, '\n').replace(/<h3>[\s\S]*?<\/h3>/i, '').trim()
  const id = (cdata.match(/\(([A-Z]\d{4}\/\d{2})/) || [])[1]
  if (id) rawById.set(id, cdata)
}

// 정답표의 여섯 분류 → 파서가 내야 할 kind.
// point/named_area/none은 "본문에서 도형을 만들 수 없음" = null. KML 도형으로 내려간다.
const expectedKind = (shape) => (['circle', 'polygon', 'corridor'].includes(shape) ? shape : null)

test('정답표: 스냅샷과 정답표 건수가 맞는다', () => {
  assert.equal(truth.items.length, 415)
  assert.equal(rawById.size, 415)
})

// 정답표는 "본문이 무엇이라고 말하는가"를 기록한다. 파서는 거기에 더해 "그 말을 믿을 수 있는가"를
// 판단한다. 두 곳에서만 갈리며, 그 목록은 정답표의 knownHard에 근거와 함께 박혀 있다.
const DEFECT = new Set(truth.knownHard.sourceDefect.ids)   // 본문은 polygon이라 하나 원본이 깨졌다
const MULTI = new Set(truth.knownHard.psnRadius.ids)        // 정답표는 중심 1개만 기록, 파서는 전부

test('정답표 전수: 문형 판정이 일치한다 (원본 결함 건 제외)', () => {
  const wrong = []
  for (const t of truth.items) {
    if (DEFECT.has(t.id)) continue
    const got = parsePositionText(rawById.get(t.id) || '').kind
    if (got !== expectedKind(t.shape)) wrong.push(`${t.id}: 정답 ${t.shape} → ${expectedKind(t.shape)}, 파서 ${got}`)
  }
  assert.deepEqual(wrong, [], `문형 불일치 ${wrong.length}건\n${wrong.join('\n')}`)
})

test('정답표 전수: 좌표 개수가 일치한다 (호·반원 9건, 다중 중심 3건 제외)', () => {
  const skip = new Set([...truth.knownHard.arcOrExclusion.ids, ...MULTI, ...DEFECT])
  const wrong = []
  for (const t of truth.items) {
    if (skip.has(t.id) || !expectedKind(t.shape)) continue
    const got = parsePositionText(rawById.get(t.id) || '')
    if (got.coords.length !== t.coordTokens.length) {
      wrong.push(`${t.id} (${t.shape}): 정답 ${t.coordTokens.length}개, 파서 ${got.coords.length}개`)
    }
  }
  assert.deepEqual(wrong, [], `좌표 개수 불일치 ${wrong.length}건\n${wrong.join('\n')}`)
})

test('다중 중심 NOTAM은 정답표보다 많이 잡는다 — 적으면 구역을 놓친 것이다', () => {
  for (const id of MULTI) {
    const got = parsePositionText(rawById.get(id) || '')
    assert.ok(got.coords.length >= t_count(id), `${id}: 파서 ${got.coords.length}개`)
  }
  function t_count(id) { return (truth.items.find((x) => x.id === id).coordTokens || []).length }
})

test('정답표 전수: 반경·폭이 일치한다 (호·반원·제외구역 9건 제외)', () => {
  const skip = new Set(truth.knownHard.arcOrExclusion.ids)
  const M = { M: 1, KM: 1000, NM: 1852 }
  const wrong = []
  for (const t of truth.items) {
    if (skip.has(t.id)) continue
    const want = t.radius || t.corridorWidth
    if (!want) continue
    const got = parsePositionText(rawById.get(t.id) || '')
    const gotM = got.kind === 'corridor' ? (got.bufferNm == null ? null : got.bufferNm * 1852) : got.radiusM
    const wantM = Number(want.value) * (M[String(want.unit).toUpperCase()] ?? 1)
    if (gotM == null || Math.abs(gotM - wantM) > 1) {
      wrong.push(`${t.id}: 정답 ${wantM}m, 파서 ${gotM}m`)
    }
  }
  assert.deepEqual(wrong, [], `반경·폭 불일치 ${wrong.length}건\n${wrong.join('\n')}`)
})

test('알려진 어려운 건은 안전한 쪽으로 간다', () => {
  // 좌표가 있어도 위치가 아닌 건 — 본문에서 도형을 만들지 않는다
  for (const id of truth.knownHard.coordinateIsNotPosition.ids) {
    assert.equal(parsePositionText(rawById.get(id)).kind, null, id)
  }
  // 원본 결함(꼭짓점 중복) — 도형을 만들지 않고 결함으로 표시한다
  for (const id of DEFECT) {
    const got = parsePositionText(rawById.get(id))
    assert.equal(got.kind, null, id)
    assert.equal(got.defective, true, id)
  }
  // 호·반원·제외구역 — 근사 표시가 붙는다
  for (const id of truth.knownHard.arcOrExclusion.ids) {
    assert.equal(parsePositionText(rawById.get(id)).approximated, true, id)
  }
})
