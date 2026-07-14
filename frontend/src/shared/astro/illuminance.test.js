import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  SKY,
  sunIlluminance,
  moonIlluminance,
  nightSkyIlluminance,
  illuminanceAt,
  nightSummary,
  monthSummaries,
  grade,
} from './illuminance.js'

const RKSI = { lat: 37.4602, lon: 126.4407 }
const FULL_MOON = Math.PI // 이각 π = 보름
const HALF_MOON = Math.PI / 2 // 이각 90° = 반달

describe('태양 조도 (USNO Circular 171)', () => {
  it('천정에서 약 12만 lux', () => {
    const lx = sunIlluminance(90)
    assert.ok(lx > 123000 && lx < 125000, `천정 태양 조도 ${lx}`)
  })

  it('고도 −6°(시민박명 끝)에서 약 3 lux', () => {
    const lx = sunIlluminance(-6)
    assert.ok(lx > 2 && lx < 4, `시민박명 끝 ${lx}`)
  })

  it('고도가 낮아질수록 단조 감소', () => {
    const alts = [90, 45, 10, 0, -6, -12, -18]
    for (let i = 1; i < alts.length; i += 1) {
      assert.ok(sunIlluminance(alts[i]) < sunIlluminance(alts[i - 1]))
    }
  })
})

describe('달 조도 (USNO Circular 171)', () => {
  it('보름달 천정에서 0.35~0.45 lux (USNO 0.425)', () => {
    const lx = moonIlluminance(90, FULL_MOON)
    assert.ok(lx > 0.35 && lx < 0.45, `보름달 천정 ${lx}`)
  })

  it('반달은 보름달의 1/10 남짓 — 선형이 아니다', () => {
    const ratio = moonIlluminance(90, HALF_MOON) / moonIlluminance(90, FULL_MOON)
    assert.ok(ratio < 0.1, `반달/보름 비 ${ratio} — 0.1 미만이어야 함`)
  })

  it('달이 지평선 아래면 0', () => {
    assert.equal(moonIlluminance(0, FULL_MOON), 0)
    assert.equal(moonIlluminance(-5, FULL_MOON), 0)
  })

  it('구름(SK)은 조도를 나눈다', () => {
    const clear = moonIlluminance(90, FULL_MOON, SKY.CLEAR)
    const stratus = moonIlluminance(90, FULL_MOON, SKY.DARK_STRATUS)
    assert.ok(Math.abs(stratus - clear / 10) < 1e-9)
  })
})

describe('야간 배경광', () => {
  it('맑을 때 0.5 mlx', () => {
    assert.equal(nightSkyIlluminance(SKY.CLEAR) * 1000, 0.5)
  })
})

describe('illuminanceAt', () => {
  // ⚠️ 회귀 방지: suncalc 2.x는 고도를 도(°)로 준다. rad→deg 변환을 넣으면 여기서 터진다.
  it('고도는 항상 ±90° 안 (단위 함정 회귀 방지)', () => {
    for (let h = 0; h < 24 * 40; h += 7) {
      const d = new Date(Date.UTC(2026, 0, 1) + h * 3600 * 1000)
      const r = illuminanceAt(d, RKSI.lat, RKSI.lon)
      assert.ok(Math.abs(r.sunAlt) <= 90, `sunAlt ${r.sunAlt} @ ${d.toISOString()}`)
      assert.ok(Math.abs(r.moonAlt) <= 90, `moonAlt ${r.moonAlt} @ ${d.toISOString()}`)
    }
  })

  it('총 조도는 항상 양수이며 각 성분 이상 (배경광 하한)', () => {
    for (let h = 0; h < 24 * 40; h += 5) {
      const d = new Date(Date.UTC(2026, 0, 1) + h * 3600 * 1000)
      const r = illuminanceAt(d, RKSI.lat, RKSI.lon)
      assert.ok(r.total >= r.sun && r.total >= r.moon && r.total >= 0.0005)
      assert.ok(Number.isFinite(r.total), `total not finite @ ${d.toISOString()}`)
    }
  })

  it('한낮은 수만 lux, 한밤중(삭)은 1 lux 미만', () => {
    const noon = illuminanceAt(new Date('2026-07-15T03:00:00Z'), RKSI.lat, RKSI.lon) // 12시 KST
    assert.ok(noon.total > 10000, `한낮 ${noon.total}`)
    const newMoonNight = illuminanceAt(new Date('2026-07-14T16:00:00Z'), RKSI.lat, RKSI.lon) // 삭 근처 01시 KST
    assert.ok(newMoonNight.total < 1, `삭 야간 ${newMoonNight.total}`)
  })
})

describe('nightSummary', () => {
  const s = nightSummary(new Date(2026, 6, 29, 20, 0, 0), RKSI.lat, RKSI.lon)

  it('일몰 → 다음날 일출을 덮는다', () => {
    assert.ok(s.sunrise > s.sunset)
    assert.ok(s.samples.length > 30)
    assert.equal(s.samples[0].t, s.sunset)
  })

  it('2026-07-29(보름)은 밝음 등급', () => {
    assert.equal(s.grade, 'bright')
    assert.ok(s.peakMoonMlx > 100, `최대 ${s.peakMoonMlx} mlx`)
    assert.ok(s.fraction > 0.98)
  })

  it('박명 경계가 순서대로', () => {
    assert.ok(s.sunset < s.dusk)
    assert.ok(s.dusk < s.nauticalDusk)
    assert.ok(s.nauticalDusk < s.night)
    assert.ok(s.night < s.nightEnd)
    assert.ok(s.nightEnd < s.nauticalDawn)
    assert.ok(s.nauticalDawn < s.dawn)
    assert.ok(s.dawn < s.sunrise)
  })

  it('총 조도는 언제나 달빛 이상 (일몰 직후엔 태양이 지배)', () => {
    for (const p of s.samples) assert.ok(p.total >= p.moon)
    assert.ok(s.samples[0].total > s.samples[0].moon * 100, '일몰 시점은 태양빛이 압도해야 함')
  })
})

describe('monthSummaries — 2026년 7월 인천', () => {
  const month = monthSummaries(2026, 6, RKSI.lat, RKSI.lon)

  it('31일치', () => {
    assert.equal(month.length, 31)
  })

  it('가장 밝은 밤은 보름(7/29) ±1일 안', () => {
    const brightest = month.reduce((a, b) => (b.peakMoonMlx > a.peakMoonMlx ? b : a))
    assert.ok(Math.abs(brightest.day - 29) <= 1, `가장 밝은 밤이 ${brightest.day}일 — 보름은 29일`)
  })

  it('삭 근처(7/14)는 무월광', () => {
    const newMoon = month.find((m) => m.day === 14)
    assert.equal(newMoon.grade, 'moonless')
  })

  it('무월광 밤이 연속 덩어리로 나타난다', () => {
    const moonless = month.filter((m) => m.grade === 'moonless').map((m) => m.day)
    assert.ok(moonless.length >= 3, `무월광 ${moonless.length}일`)
    const span = Math.max(...moonless) - Math.min(...moonless)
    assert.equal(span, moonless.length - 1, `무월광이 연속이 아님: ${moonless}`)
  })

  // 브라우저 시간대가 UTC여도 날짜가 밀리면 안 된다 (KST 정오로 못박음)
  it('날짜 앵커가 시간대에 흔들리지 않는다', () => {
    const days = month.map((m) => m.day)
    assert.deepEqual(days, Array.from({ length: 31 }, (_, i) => i + 1))
    for (const m of month) {
      const kstDay = new Date(m.sunset + 9 * 3600 * 1000).getUTCDate()
      assert.equal(kstDay, m.day, `${m.day}일의 일몰이 KST로 ${kstDay}일에 있음`)
    }
  })
})

describe('grade 경계', () => {
  it('임계값', () => {
    assert.equal(grade(150), 'bright')
    assert.equal(grade(100), 'bright')
    assert.equal(grade(99), 'medium')
    assert.equal(grade(20), 'medium')
    assert.equal(grade(19), 'dim')
    assert.equal(grade(2), 'dim')
    assert.equal(grade(1.9), 'moonless')
    assert.equal(grade(0), 'moonless')
  })
})
