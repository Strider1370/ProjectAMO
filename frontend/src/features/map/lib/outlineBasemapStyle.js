// 관제 레이더 화면(비디오 맵)처럼 어두운 바탕에 해안선·경계선만 그리는 배경지도.
// 기상 레이어의 초록·파랑이 육지·바다 색에 묻히지 않게 하려는 용도다.
// Mapbox Standard가 아닌 직접 만든 스타일이라, 다른 레이어가 쓰는 slot(bottom/middle/top)을 직접 둔다.
// Mapbox가 스타일 객체를 고쳐 쓸 수 있어 얼리지(freeze) 않는다.
// 배경지도 id별 색. outline은 남색, outline-green은 옛 레이더 화면 같은 어두운 초록,
// outline-slate는 채도를 낮춘 회청색(기상 레이어 색이 가장 덜 섞인다).
export const OUTLINE_BASEMAP_PALETTES = Object.freeze({
  outline: Object.freeze({
    land: '#132033',
    water: '#0a111c',
    coast: '#7fa3c7',
    country: '#6b85a0',
    province: '#34495f',
  }),
  'outline-green': Object.freeze({
    land: '#11241a',
    water: '#08130d',
    coast: '#72c08e',
    country: '#5e9a73',
    province: '#2e4d3a',
  }),
  'outline-slate': Object.freeze({
    land: '#1b2129',
    water: '#0f1318',
    coast: '#9ba8b8',
    country: '#7d8896',
    province: '#3a434e',
  }),
})

const LAND_BORDER = ['==', ['get', 'maritime'], 'false']
// 물 데이터(streets water)는 바다·강·호수가 한 덩어리라 내륙 강이 같이 그려진다.
// 그래서 나라 영역(country-boundaries)으로 육지를 칠하고 그 테두리를 해안선으로 쓴다.
// 분쟁 지역은 나라마다 겹쳐 있으므로 한 가지 관점(US)만 남긴다.
const ONE_WORLDVIEW = ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'US', ['get', 'worldview']]]

export function createOutlineBasemapStyle(colors) {
  return {
    version: 8,
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    sources: {
      countries: { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' },
      streets: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' },
    },
    layers: [
      { id: 'outline-water', type: 'background', paint: { 'background-color': colors.water } },
      {
        id: 'outline-land', type: 'fill', source: 'countries', 'source-layer': 'country_boundaries',
        filter: ONE_WORLDVIEW, paint: { 'fill-color': colors.land },
      },
      { id: 'bottom', type: 'slot' },
      {
        id: 'outline-coast', type: 'line', source: 'countries', 'source-layer': 'country_boundaries',
        filter: ONE_WORLDVIEW, paint: { 'line-color': colors.coast, 'line-width': 0.9 },
      },
      {
        id: 'outline-province', type: 'line', source: 'streets', 'source-layer': 'admin',
        filter: ['all', ['==', ['get', 'admin_level'], 1], LAND_BORDER],
        paint: { 'line-color': colors.province, 'line-width': 0.6, 'line-dasharray': [3, 2] },
      },
      {
        // 나라 영역 테두리에는 육상 국경도 섞여 있다 — 국경색으로 덮어 해안선과 구분한다.
        id: 'outline-country', type: 'line', source: 'streets', 'source-layer': 'admin',
        filter: ['all', ['==', ['get', 'admin_level'], 0], LAND_BORDER],
        paint: { 'line-color': colors.country, 'line-width': 1.2 },
      },
      { id: 'middle', type: 'slot' },
      { id: 'top', type: 'slot' },
    ],
  }
}
