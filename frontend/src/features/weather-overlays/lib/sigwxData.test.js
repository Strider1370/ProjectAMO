import assert from 'node:assert/strict'
import test from 'node:test'
import { sigwxLowToMapboxData } from './sigwxData.js'

const source = { map_range_mode: 'normal', fpv_safe_bound_width: 630, fpv_safe_bound_height: 620 }
const area = { item_type: 4, is_close: true, lat_lngs: [[32, 126], [33, 127], [32, 128]] }
const payload = {
  source,
  items: [
    { ...area, id: 'wind-area', contour_name: 'sfc_wind', item_name: 'l_wind', label: '', text_label: 'l_wind' },
    { id: 'wind', item_type: 8, contour_name: 'sfc_wind', item_name: 'wind_strong', label: '30', lat_lngs: [[34, 129], [34.2, 129.2]] },
    { ...area, id: 'rain-area', contour_name: 'sfc_vis', item_name: 'rain', label: '', text_label: 'rain' },
    { id: 'rain', item_type: 7, contour_name: 'sfc_vis', item_name: 'rain', label: '', text_label: 'rain', icon_name: 'rain.png', lat_lngs: [[31, 129]] },
    { ...area, id: 'cb', contour_name: 'cld', item_name: 'cloud', label: 'ISOL&#10;EMBD&#10;CB&#10;XXX&#10;010', rect_label: { left: 310, top: 380, width: 26, height: 65 } },
  ],
}

test('turbulence keeps only the boundary and coupled symbol/altitudes at the symbol anchor', () => {
  const items = [
    { ...area, contour_name: 'ktg', item_name: 'tabul', label: '', text_label: 'tabul', line_type: '3' },
    { item_type: 7, contour_name: 'ktg', item_name: 'moderate_turbulence', icon_name: 'moderate_turbulence.png',
      label: '050&#10;010', fpv_points: [{ x: 269, y: 219 }], rect_label: { left: 282, top: 209, width: 10, height: 20 } },
    { item_type: 7, contour_name: 'ktg', item_name: 'severe_turbulence', icon_name: 'severe_turbulence.png',
      label: 'XXX\r\n020', lat_lngs: [[37, 122]] },
  ]
  const data = sigwxLowToMapboxData({ source, items })
  assert.equal(data.polygons.features.length, 1)
  assert.equal(data.labels.features.length, 0)
  assert.equal(data.textChips.features.length, 0)
  assert.deepEqual(data.iconImages.map(i => [i.kind, i.text]), [
    ['turbulence-moderate', '050\n010'], ['turbulence-severe', 'XXX\n020'],
  ])
  assert.deepEqual(data.icons.features[0].geometry.coordinates, [121 + 269 / 630 * 14, 39 - 219 / 620 * 11.5])
  assert.deepEqual(data.icons.features[1].geometry.coordinates, [122, 37])
  const hidden = sigwxLowToMapboxData({ source, items }, { filters: { turbulence: false } })
  assert.equal(hidden.polygons.features.length + hidden.icons.features.length + hidden.iconImages.length, 0)
  const noAltitude = sigwxLowToMapboxData({ source, items: [{ ...items[1], label: '' }] })
  assert.equal(noAltitude.icons.features.length, 1)
  assert.equal(noAltitude.iconImages[0].text, '')
})

test('chart output keeps one wind number, a rain symbol and the complete multiline CB label', () => {
  const data = sigwxLowToMapboxData(payload)
  assert.equal(data.polygons.features.length, 2)
  assert.ok(data.polygons.features.every(f => f.properties.isFill === false))
  assert.equal(data.labels.features.length, 0, 'source object names must not become chart labels')
  assert.equal(data.textChips.features.length, 0, 'unlabelled precipitation has no invented rain box')
  assert.equal(data.icons.features.length, 3)
  assert.deepEqual(data.iconImages.find(i => i.kind === 'wind'), { id: 'sigwx-wind-30', kind: 'wind', text: '30' })
  assert.equal(data.iconImages.find(i => i.kind === 'cloud-label').text, 'ISOL\nEMBD\nCB\nXXX\n010')
  assert.ok(data.iconImages.some(i => i.url?.endsWith('/rain.png')))
  assert.ok(!data.iconImages.some(i => i.url?.endsWith('/box_wind.png')))
  assert.deepEqual(data.icons.features.find(f => f.properties.id === 'wind').geometry.coordinates, [129, 34])
  assert.deepEqual(data.icons.features.find(f => f.properties.id === 'cb').geometry.coordinates, [121 + 323 / 630 * 14, 39 - 412.5 / 620 * 11.5])
})

test('point symbols use the first FPV anchor while closed outlines handle an explicit endpoint identically', () => {
  const item = { ...payload.items[1], fpv_points: [{ x: 340, y: 255 }, { x: 400, y: 285 }] }
  const data = sigwxLowToMapboxData({ source, items: [item] })
  assert.deepEqual(data.icons.features[0].geometry.coordinates, [121 + 340 / 630 * 14, 39 - 255 / 620 * 11.5])
  const open = { ...payload.items[0], curve_tension: 0.5 }
  const closed = { ...open, lat_lngs: [...open.lat_lngs, open.lat_lngs[0]] }
  assert.deepEqual(sigwxLowToMapboxData({ items: [open] }).polygons, sigwxLowToMapboxData({ items: [closed] }).polygons)
})

test('wind marker uses the current source value instead of a fixed 30 bitmap', () => {
  const data = sigwxLowToMapboxData({ source, items: [{ ...payload.items[1], label: '45' }] })
  assert.equal(data.icons.features[0].properties.iconKey, 'sigwx-wind-45')
  assert.equal(data.iconImages[0].text, '45')
})

test('cloud and wind filters hide their coupled markers without changing rain', () => {
  const data = sigwxLowToMapboxData(payload, { filters: { cloud: false, wind: false } })
  assert.deepEqual(data.icons.features.map(f => f.properties.id), ['rain'])
  assert.equal(data.iconImages.length, 1)
})

test('authored visibility text is retained while CB actual newlines and leading zeroes survive', () => {
  const data = sigwxLowToMapboxData({ source, items: [
    { ...payload.items[2], label: 'LCA 5000M' },
    { ...payload.items[4], label: 'OCNL\r\nEMBD\r\nCB\r\nXXX\r\n010' },
  ] })
  assert.equal(data.textChips.features[0].properties.chipText, 'LCA 5000M')
  assert.equal(data.iconImages[0].text, 'OCNL\nEMBD\nCB\nXXX\n010')
})

const visibilityArea = { ...area, id: 'visibility-area', contour_name: 'sfc_vis', item_name: 'fog', label: 'LCA 5000M',
  rect_label: { left: 130, top: 70, width: 20, height: 10 } }
const visibilityRow = ['rain', 'widespread_fog', 'widespread_mist'].map((name, i) => ({
  id: `row-${i}`, item_type: 7, contour_name: 'sfc_vis', item_name: name, icon_name: `${name}.png`, label: '',
  fpv_points: [{ x: 120 + i * 20, y: 100 }, { x: 134 + i * 20, y: 114 }],
}))

test('a visibility symbol row becomes one anchored set without consuming other rain symbols', () => {
  const items = [visibilityArea, ...visibilityRow, payload.items[3]]
  const original = structuredClone(items)
  const data = sigwxLowToMapboxData({ source, items })
  assert.deepEqual(items, original, 'input records remain untouched')
  assert.equal(data.icons.features.length, 2)
  const marker = data.icons.features.find(f => f.properties.markerKind === 'visibility-set')
  assert.deepEqual(marker.properties.symbolMembers, ['row-0', 'row-1', 'row-2'])
  assert.deepEqual(marker.geometry.coordinates, [121 + 140 / 630 * 14, 39 - 100 / 620 * 11.5])
  assert.equal(marker.properties.iconScale, 1)
  assert.equal(data.textChips.features[0].properties.chipText, 'LCA 5000M')
  assert.equal(data.polygons.features.length, 1)
  assert.equal(data.groups.find(g => g.mapKey === marker.properties.groupKey).memberCount, 4)
  assert.ok(data.iconImages.some(i => i.kind === 'visibility-set'))
  assert.ok(!data.iconImages.some(i => i.url?.includes('widespread_')))
  const hidden = sigwxLowToMapboxData({ source, items }, { hiddenGroupKeys: [marker.properties.groupKey] })
  assert.deepEqual(hidden.icons.features.map(f => f.properties.id), ['rain'])
  assert.equal(hidden.textChips.features.length + hidden.polygons.features.length, 0)
  const filtered = sigwxLowToMapboxData({ source, items }, { filters: { visibility: false } })
  assert.equal(filtered.icons.features.length + filtered.iconImages.length, 0)
})

test('symbols are not grouped without a clear labelled, adjacent chart row', () => {
  for (const items of [
    visibilityRow,
    [{ ...visibilityArea, rect_label: null }, ...visibilityRow],
    [{ ...visibilityArea, label: '' }, ...visibilityRow],
    [visibilityArea, visibilityRow[0], { ...visibilityRow[1], fpv_points: [{ x: 140, y: 200 }, { x: 154, y: 214 }] }, visibilityRow[2]],
    [visibilityArea, visibilityRow[0], visibilityRow[1], { ...visibilityRow[2], fpv_points: [{ x: 260, y: 100 }, { x: 274, y: 114 }] }],
    [visibilityArea, visibilityRow[0], { ...visibilityRow[1], label: 'LCA' }, visibilityRow[2]],
  ]) {
    const data = sigwxLowToMapboxData({ source, items })
    assert.equal(data.icons.features.length, 3)
    assert.ok(!data.iconImages.some(i => i.kind === 'visibility-set'))
  }
})

// 운영 2026-09-21 11UTC 차트의 화산 항목 — 줄바꿈이 "&#13;&#10;" 문자 참조로 온다.
test('volcanic eruption label keeps its two chart lines in a box without leaking character references', () => {
  const data = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal', fpv_safe_bound_width: 704.4, fpv_safe_bound_height: 694.06 },
    items: [{
      id: 'va', item_type: 7, contour_name: 'volcanic_ash', item_name: 'volcanic_ash',
      label: 'SAKURAJIMA&#13;&#10;31.6N,130.7E', icon_name: 'volcanic_ash.png', icon_tokens: ['volcanic_ash'],
      rect_label: { left: 446.8, top: 470.0, width: 77.4, height: 28.5 },
      fpv_points: [{ x: 485.5, y: 457.8 }, { x: 485.5, y: 457.8 }],
      lat_lngs: [[31.414, 130.65], [31.414, 130.65]],
    }],
  })
  const label = data.labels.features[0].properties
  assert.equal(label.label, 'SAKURAJIMA\n31.6N,130.7E')
  assert.equal(label.labelBoxed, true)
  assert.equal(label.labelOffsetY, 0)
  assert.doesNotMatch(data.icons.features[0].properties.label, /&#/)
  // 기호는 제 좌표(31.4N)에, 글상자는 그 아래에 — 상자가 기호를 덮지 않는다.
  assert.deepEqual(data.icons.features[0].geometry.coordinates, [130.65, 31.414])
  assert.ok(data.labels.features[0].geometry.coordinates[1] < 31.414)
})
