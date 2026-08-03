import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from '../src/parsers/kma-special-warning-parser.js'

const RAW = `#기준시각:202608031712
#START7777
#REG_UP,REG_UP_NAME,REG_ID,REG_KO,TM_FC,TM_EF,WRN,LVL,CMD,ED_TM
11,인천,L1110110,인천광역시 중구 영종도,202608031000,202608031100,폭염,경보,발표,,=
11,서울,L1010700,서울특별시 강서구,202608031000,202608031100,강풍,주의,발표,,=
50,제주,L1091320,제주특별자치도 제주시,202608031000,202608031100,한파,주의,해제,,=
#7777END`

test('기상청 특보에서 폭염·한파의 발표/변경 행만 공항별로 정규화한다', () => {
  const parsed = parse(RAW)

  assert.deepEqual(parsed.airports, {
    RKSI: {
      warnings: [{
        source: 'kma',
        phenomenon: 'HEAT_WAVE',
        levelLabel: '경보',
        issuedAt: '2026-08-03T01:00:00Z',
        effectiveAt: '2026-08-03T02:00:00Z',
        regionId: 'L1110110',
      }],
    },
  })
})

test('정상 응답에 대상 특보가 없으면 빈 스냅샷을 만든다', () => {
  const parsed = parse('#기준시각:202608031712\n#START7777\n#7777END')
  assert.deepEqual(parsed.airports, {})
})
