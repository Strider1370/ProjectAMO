import test from 'node:test'
import assert from 'node:assert/strict'
import { routeBriefSections } from './routeBrief.js'

test('brief rows keep 출발 → 항로 → 도착 order and carry stretch highlights', () => {
  const sections = routeBriefSections({
    speak: [
      { section: '항로', level: '주의', text: 'STAR 착빙 MODERATE', highlight: { from: 'DOTOL', to: 'DUKAL', startNm: 213, endNm: 296 } },
      { section: '항로', level: '바람', text: '순항 FL240 평균 정풍 9kt' },
    ],
    cardOnly: [{ section: '항로', level: '참고', text: '접근 착빙 LIGHT', highlight: { startNm: 296, endNm: 310 } }],
    quiet: { 출발: 'VFR, 특이사항 없음', 항로: null, 도착: 'VFR, 특이사항 없음' },
  })
  assert.deepEqual(sections.map((s) => s.section), ['출발', '항로', '도착'])
  assert.equal(sections[0].quiet, 'VFR, 특이사항 없음')
  assert.deepEqual(sections[1].items.map((i) => i.level), ['주의', '바람', '참고'])
  assert.equal(sections[1].items[0].highlight.to, 'DUKAL')
  assert.equal(sections[1].items[1].highlight, null)
  assert.deepEqual(routeBriefSections(null), [])
})
