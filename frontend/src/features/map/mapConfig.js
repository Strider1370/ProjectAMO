import { OUTLINE_BASEMAP_PALETTES, createOutlineBasemapStyle } from './lib/outlineBasemapStyle.js'

export const MAP_CONFIG = {
  center: [127.5, 36.5],
  zoom: 6,
  minZoom: 2,
  maxZoom: 16,
  // Double the previous [90,-5]..[155,50] extent in Mercator space (one zoom
  // step), keeping its center and a finite navigation limit across the date line.
  maxBounds: [
    [57.5, -34.225309],
    [187.5, 66.2589],
  ],
}

export const BASEMAP_OPTIONS = [
  {
    id: 'standard',
    label: '기본',
    thumbnail: '/basemap-thumbs/standard.png',
    style: 'mapbox://styles/mapbox/standard',
    config: {
      showPlaceLabels: false,
      showPedestrianRoads: false,
      showPointOfInterestLabels: false,
      showRoadLabels: false,
      show3dObjects: false,
      show3dBuildings: false,
      show3dTrees: false,
      show3dLandmarks: false,
      showIndoorLabels: false,
      theme: 'faded',
      font: 'Noto Sans CJK JP',
      colorWater: '#88bedd',
      colorGreenspace: '#c5dcb8',
      colorRoads: 'hsla(0, 0%, 88%, 0.2)',
    },
  },
  {
    // 어두운 바탕에 해안선·경계선만 — Standard가 아니라 basemap config가 없다.
    id: 'outline',
    label: '남색',
    thumbnail: '/basemap-thumbs/outline.png',
    style: createOutlineBasemapStyle(OUTLINE_BASEMAP_PALETTES.outline),
    config: null,
  },
  {
    // 남색과 같은 구성의 어두운 초록 계열.
    id: 'outline-green',
    label: '녹색',
    thumbnail: '/basemap-thumbs/outline-green.png',
    style: createOutlineBasemapStyle(OUTLINE_BASEMAP_PALETTES['outline-green']),
    config: null,
  },
  {
    // 남색과 같은 구성의 회청색(채도 약 20%).
    id: 'outline-slate',
    label: '회청',
    thumbnail: '/basemap-thumbs/outline-slate.png',
    style: createOutlineBasemapStyle(OUTLINE_BASEMAP_PALETTES['outline-slate']),
    config: null,
  },
  {
    id: 'satellite',
    label: '위성',
    thumbnail: '/basemap-thumbs/satellite.png',
    style: 'mapbox://styles/mapbox/standard-satellite',
    config: {
      showPlaceLabels: false,
      showPedestrianRoads: false,
      showPointOfInterestLabels: false,
      showRoadLabels: false,
      font: 'Noto Sans CJK JP',
      colorRoads: 'hsla(0, 0%, 88%, 0.2)',
      colorMotorways: 'hsla(0, 0%, 88%, 0.2)',
      colorTrunks: 'hsla(0, 0%, 88%, 0.2)',
    },
  },
]

// 저장된 배경지도 id가 지금 목록에 없으면(예: 없앤 '단색' dark) 기본으로 돌린다.
export function knownBasemapId(id) {
  return BASEMAP_OPTIONS.some((option) => option.id === id) ? id : BASEMAP_OPTIONS[0].id
}
