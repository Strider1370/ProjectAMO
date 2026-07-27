import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldShowGeoBoundaries, geoLayerInZoomRange, GEO_LAYERS, GEO_SIGUNGU_MIN_ZOOM } from './baseMapLayers.js'

// 시군구(4.4MB)를 시작 화면에서 받지 않기 위한 판정. 이 규칙이 무너지면 첫 접속이
// 다시 무거워지거나(과다 로드), 확대해도 경계가 안 나온다(과소 로드).
test('geoLayerInZoomRange: 확대 단계별로 받아야 할 경계 레이어', () => {
  const byId = Object.fromEntries(GEO_LAYERS.map((l) => [l.sourceId, l]))
  const startZoom = 6 // MAP_CONFIG.zoom

  assert.equal(geoLayerInZoomRange(byId['geo-sigungu'], startZoom), false, '시작 화면에서 시군구는 안 받는다')
  assert.equal(geoLayerInZoomRange(byId['geo-sido'], startZoom), true)
  assert.equal(geoLayerInZoomRange(byId['geo-neighbors'], startZoom), true)

  // 경계값: minzoom 이상부터 그려지고, maxzoom부터는 안 그려진다(mapbox 규칙과 동일)
  assert.equal(geoLayerInZoomRange(byId['geo-sigungu'], GEO_SIGUNGU_MIN_ZOOM), true)
  assert.equal(geoLayerInZoomRange(byId['geo-sigungu'], GEO_SIGUNGU_MIN_ZOOM - 0.1), false)
  assert.equal(geoLayerInZoomRange(byId['geo-sido'], GEO_SIGUNGU_MIN_ZOOM), false)
  assert.equal(geoLayerInZoomRange(byId['geo-sido'], GEO_SIGUNGU_MIN_ZOOM - 0.1), true)
})

test('geo boundaries show on dark basemap and raster weather overlays', () => {
  assert.equal(shouldShowGeoBoundaries({ basemapId: 'dark', metVisibility: {} }), true)
  assert.equal(shouldShowGeoBoundaries({ basemapId: 'standard', metVisibility: { radar: true } }), true)
  assert.equal(shouldShowGeoBoundaries({ basemapId: 'standard', metVisibility: { satellite: true } }), true)
  // 해외 레이더도 래스터 오버레이 — 국경선이 있어야 대비가 산다
  assert.equal(shouldShowGeoBoundaries({ basemapId: 'standard', metVisibility: { radarOverseas: true } }), true)
  assert.equal(shouldShowGeoBoundaries({ basemapId: 'standard', metVisibility: {} }), false)
})

test('geo boundaries show on every basemap when NWP overlays are active', () => {
  for (const layerId of ['wind', 'temp', 'cloud', 'icing']) {
    assert.equal(
      shouldShowGeoBoundaries({ basemapId: 'standard', metVisibility: { [layerId]: true } }),
      true,
    )
    assert.equal(
      shouldShowGeoBoundaries({ basemapId: 'satellite', metVisibility: { [layerId]: true } }),
      true,
    )
  }
})

test('geo boundaries ignore NWP toggles when NWP overlays are disabled', () => {
  assert.equal(
    shouldShowGeoBoundaries({
      basemapId: 'standard',
      enableWindOverlay: false,
      metVisibility: { wind: true, temp: true, cloud: true, icing: true },
    }),
    false,
  )
})
