import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRainviewerMeta } from '../src/processors/rainviewer-processor.js'

// RainViewer weather-maps.json은 원자료가 아니라 "몇 시 프레임이 어느 경로에 있는지"의 목차다.
// 프레임을 ms 단위 + 시간 오름차순으로 정규화하고 tm(스냅샷 diff 키)을 뽑는 것이 파서의 전부.
const PAYLOAD = {
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1784019000, path: '/v2/radar/0f22040fc7a5' },
      { time: 1784018400, path: '/v2/radar/0a88d010d25f' }, // 일부러 역순
      { time: 1784019600, path: '/v2/radar/90f3cee0fcb4' },
    ],
  },
}

test('buildRainviewerMeta normalizes frames to ms and sorts ascending', () => {
  const meta = buildRainviewerMeta(PAYLOAD)

  assert.equal(meta.type, 'RAINVIEWER')
  assert.equal(meta.host, 'https://tilecache.rainviewer.com')
  assert.deepEqual(
    meta.frames.map((f) => f.timeMs),
    [1784018400000, 1784019000000, 1784019600000],
  )
  assert.equal(meta.frames[0].path, '/v2/radar/0a88d010d25f')
  assert.match(meta.tileTemplate, /\{z\}\/\{x\}\/\{y\}/)
  assert.match(meta.coverageTemplate, /\{z\}\/\{x\}\/\{y\}/)
})

// ★ 회귀 방지: server.js buildFrameEntry는 payload.tm이 없으면 null을 반환한다.
// tm이 빠지면 스냅샷 diff가 갱신을 영영 감지 못 해 프론트 레이더가 초기 1회 후 멈춘다.
test('buildRainviewerMeta exposes tm from the latest frame (snapshot diff key)', () => {
  const meta = buildRainviewerMeta(PAYLOAD)
  assert.ok(meta.tm, 'tm must be truthy — buildFrameEntry drops the entry otherwise')
  assert.equal(meta.tm, '1784019600000')
})

test('buildRainviewerMeta tm changes only when the latest frame advances', () => {
  const before = buildRainviewerMeta(PAYLOAD)
  const same = buildRainviewerMeta(PAYLOAD)
  assert.equal(same.tm, before.tm) // 같은 목차 재수집 → 프론트 불필요 리페치 없음

  const advanced = buildRainviewerMeta({
    ...PAYLOAD,
    radar: { past: [...PAYLOAD.radar.past, { time: 1784020200, path: '/v2/radar/next' }] },
  })
  assert.notEqual(advanced.tm, before.tm)
})

test('buildRainviewerMeta drops malformed frames', () => {
  const meta = buildRainviewerMeta({
    host: 'https://h',
    radar: { past: [{ time: 1, path: '/a' }, { time: null, path: '/b' }, { time: 2 }] },
  })
  assert.equal(meta.frames.length, 1)
})

test('buildRainviewerMeta throws on unexpected shape (existing file is kept)', () => {
  assert.throws(() => buildRainviewerMeta({}), /unexpected/)
  assert.throws(() => buildRainviewerMeta({ host: 'h', radar: { past: [] } }), /no past frames/)
})
