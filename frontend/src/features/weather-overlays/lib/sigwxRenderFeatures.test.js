import test from 'node:test'
import assert from 'node:assert/strict'
import { phenomenaToSigwxRenderFeatures } from './sigwxRenderFeatures.js'

test('converts phenomena into SIGWX render feature collections', () => {
  const result = phenomenaToSigwxRenderFeatures({
    phenomena: [
      {
        id: 'wind-area',
        semanticRole: 'strong-surface-wind-area',
        renderRole: 'blue-wind-area-boundary',
        filterKey: 'wind',
        sourceItem: {
          id: 'wind-area',
          is_close: true,
          color_line: '#0000ff',
          lat_lngs: [[33, 126], [34, 126], [34, 127]],
        },
        children: [{
          id: 'wind-speed',
          renderRole: 'wind-diamond-label',
          visibleLabel: '30',
          sourceItem: {
            id: 'wind-speed',
            lat_lngs: [[33.5, 126.5]],
          },
        }],
      },
    ],
  })

  assert.equal(result.polygons.features.length, 1)
  assert.equal(result.windDiamonds.features.length, 1)
  assert.equal(result.windDiamonds.features[0].properties.label, '30')
})

test('keeps cloud multiline labels as labelLines properties', () => {
  const result = phenomenaToSigwxRenderFeatures({
    phenomena: [{
      id: 'cloud',
      semanticRole: 'cb-cloud-area',
      renderRole: 'cloud-scallop-boundary',
      filterKey: 'cloud',
      sourceItem: {
        id: 'cloud',
        is_close: true,
        lat_lngs: [[33, 126], [34, 126], [34, 127]],
      },
      render: { labelLines: ['ISOL', 'EMBD', 'CB', 'XXX', '010'] },
    }],
  })

  assert.equal(result.specialLineLabels.features.length, 1)
  assert.deepEqual(result.specialLineLabels.features[0].properties.labelLines, ['ISOL', 'EMBD', 'CB', 'XXX', '010'])
})

test('does not duplicate cloud labels already supplied by special line features', () => {
  const result = phenomenaToSigwxRenderFeatures({
    specialLineFeatures: {
      labels: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { id: 'cloud-1-cloud-label', sourceItemId: 'cloud-1' },
          geometry: { type: 'Point', coordinates: [126, 33] },
        }],
      },
    },
    phenomena: [{
      id: 'cloud',
      semanticRole: 'cb-cloud-area',
      renderRole: 'cloud-scallop-boundary',
      filterKey: 'cloud',
      sourceItem: {
        id: 'cloud-1',
        is_close: true,
        lat_lngs: [[33, 126], [34, 126], [34, 127]],
      },
      render: { labelLines: ['ISOL', 'EMBD', 'CB', 'XXX', '010'] },
    }],
  })

  assert.equal(result.specialLineLabels.features.length, 1)
})

test('renders icon markers without leaking internal fallback labels', () => {
  const result = phenomenaToSigwxRenderFeatures({
    phenomena: [{
      id: 'fog',
      semanticRole: 'surface-visibility',
      renderRole: 'icon-marker',
      filterKey: 'visibility',
      visibleLabel: '',
      sourceItem: {
        id: 'fog',
        icon_name: 'widespread_fog.png',
        lat_lngs: [[33, 126]],
      },
    }],
  })

  assert.equal(result.icons.features.length, 1)
  assert.equal(result.labels.features.length, 0)
  assert.equal(result.icons.features[0].properties.iconKey, 'sigwx-widespread_fog.png')
  assert.equal(result.iconImages[0].url.endsWith('/widespread_fog.png'), true)
})

test('phenomena icon markers apply per-symbol scale rules', () => {
  const result = phenomenaToSigwxRenderFeatures({
    phenomena: [{
      id: 'mountain',
      semanticRole: 'mountain-obscuration',
      renderRole: 'icon-marker',
      filterKey: 'visibility',
      visibleLabel: '',
      sourceItem: {
        id: 'mountain',
        icon_name: 'mountain_obscuration.png',
        lat_lngs: [[34, 127]],
      },
    }],
  })

  assert.equal(result.icons.features[0].properties.iconScale, 0.24)
})

test('wind diamond features carry compact chart scale metadata', () => {
  const result = phenomenaToSigwxRenderFeatures({
    phenomena: [{
      id: 'wind-area',
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
        sourceItem: {
          id: 'wind-speed',
          lat_lngs: [[33.5, 126.5]],
        },
      }],
    }],
  })

  assert.equal(result.windDiamonds.features[0].properties.iconScale, 0.46)
  assert.equal(result.windDiamonds.features[0].properties.textSize, 8)
})
