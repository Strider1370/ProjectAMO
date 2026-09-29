import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { HIGH_HOUR_MS as H, pickHighFrame, highTimelineEntries, highStamp, highHeight, highLegendEntries } from './sigwxHighModel.js'
import { WAFS_CHART_PALETTES, wafsChartPalette } from './wafsChartPalette.js'
import { OUTLINE_BASEMAP_PALETTES } from '../../map/lib/outlineBasemapStyle.js'
import { buildOrderedTimes, nextPlaybackTime } from './useTimelineRail.js'

const root = new URL('../../../../public/data/sigwx-high/', import.meta.url)
const index = JSON.parse(fs.readFileSync(new URL('index.json', root), 'utf8'))

test('dark legend previews use the selected ocean background and unchanged map fill colors', () => {
  for (const [id, colors] of Object.entries(OUTLINE_BASEMAP_PALETTES)) {
    const palette = wafsChartPalette(id)
    assert.equal(wafsChartPalette(id), palette)
    assert.equal(palette.hazards, WAFS_CHART_PALETTES.dark.hazards)
    for (const type of ['TURBULENCE', 'AIRFRAME_ICING']) {
      const entries = highLegendEntries(palette, type)
      assert.ok(entries.every(entry => entry.background === colors.water))
      assert.deepEqual(entries.map(entry => entry.color), highLegendEntries(WAFS_CHART_PALETTES.dark, type).map(entry => entry.color))
    }
  }
})

test('public sample contains exactly one original run, T+6 through T+48', () => {
  assert.equal(index.sample, true)
  assert.deepEqual(index.frames.map(frame => frame.forecastHour), Array.from({ length: 15 }, (_, i) => 6 + i * 3))
  assert.equal(new Set(index.frames.map(frame => frame.baseTime)).size, 1)
  for (const meta of index.frames) {
    const data = JSON.parse(fs.readFileSync(new URL(meta.file, root), 'utf8'))
    assert.equal(data.metadata.frameId, meta.frameId)
    assert.equal(data.metadata.validTime, meta.validTime)
    assert.ok(data.features.length && data.areas.length)
    assert.equal(Date.parse(meta.validTime) - Date.parse(meta.baseTime), meta.forecastHour * H)
  }
})
test('nearest sample repeats every 48h with original timestamps intact, including cycle seam', () => {
  const before = JSON.stringify(index)
  const base = Math.floor(Date.UTC(2026, 8, 29) / (48 * H)) * 48 * H
  assert.equal(pickHighFrame(index.frames, base).frame.forecastHour, 48)
  assert.equal(pickHighFrame(index.frames, base + 3 * H).frame.forecastHour, 48) // ties choose earlier
  assert.equal(pickHighFrame(index.frames, base + 3 * H + 1).frame.forecastHour, 6)
  assert.equal(pickHighFrame(index.frames, base + 7.5 * H).frame.forecastHour, 6)
  for (let hour = -55; hour <= 100; hour += 0.5) {
    const a = pickHighFrame(index.frames, base + hour * H)
    const b = pickHighFrame(index.frames, base + (hour + 48) * H)
    assert.equal(a.frame, b.frame)
    assert.equal(b.ms - a.ms, 48 * H)
  }
  assert.equal(JSON.stringify(index), before)
  assert.equal(pickHighFrame([], base), null)
  assert.equal(pickHighFrame(index.frames, NaN), null)
})
test('unified playback visits all sample frames and wraps while preserving other weather times', () => {
  const now = Date.UTC(2026, 8, 29, 3)
  const entries = highTimelineEntries(index.frames, now)
  const ticks = entries.map(entry => entry.ms)
  const ordered = buildOrderedTimes([now - 5 * 60_000], [], ticks)
  assert.ok(ordered.includes(now - 5 * 60_000))
  assert.equal(nextPlaybackTime(ordered, ordered.at(-1)), ordered[0])
  assert.equal(new Set(ticks.map(ms => pickHighFrame(index.frames, ms).frame.forecastHour)).size, 15)
  assert.ok(entries.every(entry => entry.cadenceMs === 3 * H))
})
test('source timestamps honor UTC/KST and missing heights remain explicit', () => {
  assert.match(highStamp('2026-08-02T18:00:00Z', 'UTC'), /2026-08-02 18:00 UTC/)
  assert.match(highStamp('2026-08-02T18:00:00Z', 'KST'), /2026-08-03 03:00 KST/)
  assert.equal(highHeight('? (unknown)'), '알 수 없음')
  assert.equal(highHeight('? (inapplicable)'), '해당 없음')
  for (const palette of Object.values(WAFS_CHART_PALETTES)) for (const kind of ['TURBULENCE', 'AIRFRAME_ICING']) {
    const entries = highLegendEntries(palette, kind)
    assert.match(entries[0].label, /MOD/)
    assert.match(entries[1].label, /SEV/)
    assert.notEqual(entries[0].color, entries[1].color)
  }
})
