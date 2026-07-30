// 필터를 지도에 거는 곳. 항공기는 아이콘·로고·궤적 세 겹으로 그려지므로 세 겹 모두에 걸어야
// 한다(아이콘만 숨기면 숨긴 기체의 로고와 궤적이 지도에 남는다). 수신 범위 원은 항공기가
// 아니므로 건드리지 않는다.
import {
  ADSB_LAYER_ID, ADSB_LOGO_LAYER_ID, ADSB_TRAIL_LAYER_ID,
} from '../aviation-layers/addAdsbLayer.js'
import { adsbIdFilter } from './trafficFilter.js'

// addAdsbLayer.js가 로고 레이어에 원래 걸어둔 조건 — 로고 이미지가 있는 기체만 그린다.
const LOGO_BASE_FILTER = ['!=', ['get', 'operator'], '']

export function applyAdsbFilter(map, { ids = [], filtered = false } = {}) {
  if (!map?.getLayer?.(ADSB_LAYER_ID)) return
  const idFilter = adsbIdFilter(ids)
  map.setFilter(ADSB_LAYER_ID, filtered ? idFilter : null)
  map.setFilter(ADSB_LOGO_LAYER_ID, filtered ? ['all', LOGO_BASE_FILTER, idFilter] : LOGO_BASE_FILTER)
  // 궤적 데이터에는 icao24만 있다 — 같은 규칙이 그대로 통한다.
  map.setFilter(ADSB_TRAIL_LAYER_ID, filtered ? idFilter : null)
}
