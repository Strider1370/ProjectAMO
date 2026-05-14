import test from 'node:test'
import assert from 'node:assert/strict'
import { sigwxLowToMapboxData } from './sigwxData.js'

test('phenomena payload keeps item fallback groups and overlays', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'front',
      item_type: 4,
      contour_name: 'font_line',
      item_name: 'fl_cold',
      lat_lngs: [[33, 126], [34, 127]],
    }],
    phenomena: [],
  })

  assert.equal(result.lines.features.length, 0)
  assert.equal(result.groups[0].overlayRole, 'front')
})

test('phenomena payload augments item fallback with wind diamonds', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'wind-area',
      item_type: 4,
      contour_name: 'sfc_wind',
      item_name: 'l_wind',
      is_close: true,
      lat_lngs: [[33, 126], [34, 126], [34, 127]],
    }],
    phenomena: [{
      id: 'wind-area-phenomenon',
      semanticRole: 'strong-surface-wind-area',
      renderRole: 'blue-wind-area-boundary',
      filterKey: 'wind',
      sourceItem: {
        id: 'wind-area',
        is_close: true,
        lat_lngs: [[33, 126], [34, 126], [34, 127]],
      },
      children: [{
        id: 'wind-speed',
        renderRole: 'wind-diamond-label',
        visibleLabel: '30',
        sourceItem: { id: 'wind-speed', lat_lngs: [[33.5, 126.5]] },
      }],
    }],
  })

  assert.equal(result.polygons.features.length, 1)
  assert.equal(result.windDiamonds.features.length, 1)
})

test('item fallback does not render internal icon names as map labels', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'fog-icon',
      item_type: 7,
      contour_name: 'sfc_vis',
      item_name: 'widespread_fog',
      text_label: 'widespread_fog',
      icon_name: 'widespread_fog.png',
      lat_lngs: [[33, 126]],
    }, {
      id: 'mountain-icon',
      item_type: 7,
      contour_name: 'mountain_obscu',
      item_name: 'mountain_obscuration',
      text_label: 'mountain_obscuration',
      icon_name: 'mountain_obscuration.png',
      lat_lngs: [[34, 127]],
    }],
  })

  assert.equal(result.icons.features.length, 2)
  assert.equal(result.labels.features.length, 0)
  assert.deepEqual(result.groups.map((group) => group.label), ['Visibility', 'Mountain obscuration'])
})

test('item fallback blocks merged internal visibility labels', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'merged-visibility',
      item_type: 7,
      contour_name: 'sfc_vis',
      item_name: 'rain',
      label: 'rain / widespread_fog / widespread_mist',
      icon_name: 'rain.png',
      lat_lngs: [[33, 126]],
    }],
  })

  assert.equal(result.icons.features.length, 1)
  assert.equal(result.labels.features.length, 0)
  assert.equal(result.icons.features[0].properties.label, '')
  assert.equal(result.groups[0].label, 'Visibility')
})

test('item fallback blocks internal pressure labels', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'pressure-label',
      item_type: 8,
      contour_name: 'pressure',
      item_name: 'pressure15',
      label: 'pressure15',
      lat_lngs: [[33, 126]],
    }],
  })

  assert.equal(result.labels.features.length, 0)
  assert.equal(result.groups[0].label, 'Pressure / Front')
})


test('item fallback emits plain chart label metadata for visibility and freezing callouts', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'visibility-label',
      item_type: 8,
      contour_name: 'sfc_vis',
      item_name: 'low_visibility',
      label: 'LCA 5000M',
      lat_lngs: [[33, 126]],
    }, {
      id: 'freezing-label',
      item_type: 10,
      contour_name: 'freezing_level',
      item_name: 'freez',
      text_label: 'freez',
      lat_lngs: [[34, 127]],
    }],
  })

  assert.equal(result.textChips.features.length, 2)
  assert.deepEqual(
    result.textChips.features.map((feature) => feature.properties.chipText),
    ['LCA 5000M', '0C:100'],
  )
  assert.deepEqual(
    result.textChips.features.map((feature) => feature.properties.chipTone),
    ['chart', 'chart'],
  )
})

test('item fallback applies smaller per-symbol scales to chart-dominant icons', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'fog',
      item_type: 7,
      contour_name: 'sfc_vis',
      item_name: 'widespread_fog',
      icon_name: 'widespread_fog.png',
      lat_lngs: [[33, 126]],
    }, {
      id: 'rain',
      item_type: 7,
      contour_name: 'sfc_vis',
      item_name: 'rain',
      icon_name: 'rain.png',
      lat_lngs: [[33.5, 126.5]],
    }, {
      id: 'mountain',
      item_type: 7,
      contour_name: 'mountain_obscu',
      item_name: 'mountain_obscuration',
      icon_name: 'mountain_obscuration.png',
      lat_lngs: [[34, 127]],
    }],
  })

  assert.deepEqual(
    result.icons.features.map((feature) => feature.properties.iconScale),
    [0.25, 0.38, 0.24],
  )
})

test('turbulence and icing markers use compact altitude chips instead of descriptive labels', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'turb-marker',
      item_type: 7,
      contour_name: 'ktg',
      item_name: 'moderate_turbulence',
      label: 'XXX&#10;010',
      icon_name: 'moderate_turbulence.png',
      lat_lngs: [[33, 126]],
    }, {
      id: 'icing-marker',
      item_type: 7,
      contour_name: 'icing_area',
      item_name: 'MOD_ICE',
      label: 'XXX&#10;060',
      icon_name: 'MOD_ICE.png',
      lat_lngs: [[34, 127]],
    }],
  })

  assert.deepEqual(
    result.textChips.features.map((feature) => feature.properties.chipText),
    ['XXX/010', 'XXX/060'],
  )
  assert.deepEqual(
    result.textChips.features.map((feature) => feature.properties.label),
    ['', ''],
  )
  assert.deepEqual(
    result.icons.features.map((feature) => feature.properties.iconScale),
    [0.38, 0.36],
  )
})

test('line features normalize source stroke width to a lower density chart stroke', () => {
  const result = sigwxLowToMapboxData({
    source: { map_range_mode: 'normal' },
    items: [{
      id: 'icing-area',
      item_type: 4,
      contour_name: 'icing_area',
      item_name: 'icing',
      line_width: 2,
      line_type: '4',
      lat_lngs: [[33, 126], [34, 127]],
    }],
  })

  assert.equal(result.lines.features[0].properties.lineWidth, 1.2)
})
