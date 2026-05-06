export const MAP_CONFIG = {
  center: [127.5, 36.5],
  zoom: 6,
  minZoom: 5,
  maxZoom: 16,
  maxBounds: [
    [116, 26],
    [139, 44],
  ],
}

export const BASEMAP_OPTIONS = [
  {
    id: 'standard',
    label: 'Standard',
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
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    thumbnail: '/basemap-thumbs/dark.png',
    style: 'mapbox://styles/mapbox/dark-v11',
    config: {},
  },
  {
    id: 'satellite',
    label: 'Satellite',
    thumbnail: '/basemap-thumbs/satellite.png',
    style: 'mapbox://styles/mapbox/standard-satellite',
    config: {
      showPlaceLabels: false,
      showPointOfInterestLabels: false,
      showRoadLabels: false,
      font: 'Noto Sans CJK JP',
    },
  },
]
