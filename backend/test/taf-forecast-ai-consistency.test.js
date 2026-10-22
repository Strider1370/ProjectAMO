import test from 'node:test'
import assert from 'node:assert/strict'
import { parse as parseNoaaTaf } from '../src/parsers/noaa-taf-parser.js'
import { buildAirportDigest } from '../src/ai/digests/airport-weather.js'
import { airportBriefing } from '../src/ai/digests/airport-briefing.js'

// 공항패널이 쓸 파서 해석(taf.forecast)과 AI 공항 브리핑(ai/digests)은 TAF를 각자 계산한다.
// 같은 실제 TAF에서 주 예보가 같은 변화 시간대에 같은 바람으로 바뀌는지 묶어 둔다.
// 2026-10-17 AWC 실제 응답(RJCC: 유효시작과 함께 시작한 BECMG, RJTT: CAVOK + 바람만 바뀌는 BECMG).
const RJCC = {
  icaoId: 'RJCC', issueTime: '2026-10-17T11:06:00.000Z', validTimeFrom: 1792238400, validTimeTo: 1792346400, name: 'Sapporo/Chitose Arpt',
  rawTAF: 'TAF RJCC 171106Z 1712/1818 32006KT 9999 FEW020 BKN040 BECMG 1712/1714 15004KT BECMG 1815/1818 15014KT',
  fcsts: [
    { timeFrom: 1792238400, timeTo: 1792346400, timeBec: null, fcstChange: null, probability: null, wdir: 320, wspd: 6, wgst: null, visib: '6+', wxString: null, clouds: [{ cover: 'FEW', base: 2000, type: null }, { cover: 'BKN', base: 4000, type: null }] },
    { timeFrom: 1792238400, timeTo: 1792335600, timeBec: 1792245600, fcstChange: 'BECMG', probability: null, wdir: 150, wspd: 4, wgst: null, visib: '6+', wxString: null, clouds: [{ cover: 'FEW', base: 2000, type: null }, { cover: 'BKN', base: 4000, type: null }] },
    { timeFrom: 1792335600, timeTo: 1792346400, timeBec: 1792346400, fcstChange: 'BECMG', probability: null, wdir: 150, wspd: 14, wgst: null, visib: '6+', wxString: null, clouds: [{ cover: 'FEW', base: 2000, type: null }, { cover: 'BKN', base: 4000, type: null }] },
  ],
}
const RJTT = {
  icaoId: 'RJTT', issueTime: '2026-10-17T11:05:00.000Z', validTimeFrom: 1792238400, validTimeTo: 1792346400, name: 'Tokyo/Haneda Intl',
  rawTAF: 'TAF RJTT 171105Z 1712/1818 10006KT CAVOK BECMG 1714/1716 02006KT BECMG 1800/1803 09006KT BECMG 1806/1809 18014KT',
  fcsts: [
    { timeFrom: 1792238400, timeTo: 1792245600, timeBec: null, fcstChange: null, probability: null, wdir: 100, wspd: 6, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
    { timeFrom: 1792245600, timeTo: 1792281600, timeBec: 1792252800, fcstChange: 'BECMG', probability: null, wdir: 20, wspd: 6, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
    { timeFrom: 1792281600, timeTo: 1792303200, timeBec: 1792292400, fcstChange: 'BECMG', probability: null, wdir: 90, wspd: 6, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
    { timeFrom: 1792303200, timeTo: 1792346400, timeBec: 1792314000, fcstChange: 'BECMG', probability: null, wdir: 180, wspd: 14, wgst: null, visib: '6+', wxString: 'NSW', clouds: [{ cover: 'NSC', base: null, type: null }] },
  ],
}

const hh = (iso) => iso.slice(11, 13)
const aiWind = (raw) => {
  const m = /^(\d{3})(\d{2})KT$/.exec(raw)
  return `${Number(m[1])}° ${Number(m[2])}kt`
}

for (const entry of [RJCC, RJTT]) {
  test(`${entry.icaoId}: AI 브리핑과 파서 해석이 같은 변화 시간대·바람으로 주 예보를 바꾼다`, () => {
    const taf = parseNoaaTaf(entry)
    const validity = { start: taf.header.valid_start, end: taf.header.valid_end }
    const digest = buildAirportDigest({ icao: entry.icaoId, nameKo: entry.icaoId, metar: null, taf, warnings: null, window: validity, includeRaw: true })
    const changed = taf.forecast.prevailing.filter((p) => p.change?.type === 'BECMG')
    assert.ok(changed.length > 0)
    for (const period of changed) {
      const start = Date.parse(period.start)
      const window = { start: period.start, end: new Date(start + 3600e3).toISOString() }
      const brief = airportBriefing(digest, window, { nowMs: Date.parse(entry.issueTime) })
      const now = brief.forecast.inQuestionTime.at(-1)
      assert.match(now.when, new RegExp(`\\(${hh(period.change.start)}Z–${hh(period.change.end)}Z\\) 사이에 바뀌어`))
      assert.equal(now.wind, aiWind(period.display.wind))
    }
  })
}
