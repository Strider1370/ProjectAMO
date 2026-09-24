import { createProcedureLoader } from './procedureData.js'

// Instantiate for a publication snapshot; never clear graph/files/IAP independently.
// A replacement publication gets a new provider; in-flight users retain the old one.
export function createNavdataProvider({ readJson, publicationId = null }) {
  if (typeof readJson !== 'function') throw new TypeError('readJson is required')
  const loads = new Map()
  function loadOnce(key, load) {
    if (loads.has(key)) return loads.get(key)
    const pending = Promise.resolve().then(load)
    loads.set(key, pending)
    pending.catch(() => { if (loads.get(key) === pending) loads.delete(key) })
    return pending
  }
  const fetchJson = (path) => loadOnce('file:' + path, () => readJson(path))
  async function fetchJsonOptional(path) {
    try { return await fetchJson(path) } catch { return null }
  }
  function mergeRouteGraph(base, overseas) {
    const merged = { ...base }
    for (const [nodeId, links] of Object.entries(overseas || {})) {
      const list = merged[nodeId] ? [...merged[nodeId]] : []
      const seen = new Set(list.map((link) => `${link.to}|${link.segmentId}`))
      for (const link of links) {
        const key = `${link.to}|${link.segmentId}`
        if (!seen.has(key)) {
          list.push(link)
          seen.add(key)
        }
      }
      merged[nodeId] = list
    }
    return merged
  }

  function buildRouteGraph(segments) {
    const graph = {}
    for (const segment of segments) {
      for (const [from, to] of [[segment.from, segment.to], [segment.to, segment.from]]) {
        ;(graph[from] ??= []).push({
          to,
          routeId: segment.routeId,
          routeType: segment.routeType,
          segmentId: segment.id,
          distanceNm: segment.distanceNm,
        })
      }
    }
    return graph
  }

  function loadNavdata() {
    return loadOnce('navdata', async () => {
      const [airports, enroute] = await Promise.all([
        fetchJson('airports.json'),
        fetchJson('enroute.json'),
      ])

      // 해외(선택) — 해외 확장 데이터가 있으면 국내와 병합.
      const [airportsO, navpointsO, routeGraphO, routeSegmentsO, routesO] = await Promise.all([
        fetchJsonOptional('airports-overseas.json'),
        fetchJsonOptional('navpoints-overseas.json'),
        fetchJsonOptional('route-graph-overseas.json'),
        fetchJsonOptional('route-segments-overseas.json'),
        fetchJsonOptional('routes-overseas.json'),
      ])

      if (publicationId !== null && enroute.publicationId !== publicationId) {
        throw Object.assign(new Error('NAVDATA_PUBLICATION_MISMATCH'), { code: 'NAVDATA_PUBLICATION_MISMATCH' })
      }
      const allSegments = [...enroute.segments, ...(routeSegmentsO || [])]

      return {
        // AIRAC 주기 — 저장 경로에 기록해 나중에 "이 경로는 어느 주기 기준인가"를 말할 수 있게 한다.
        publicationId: enroute.publicationId ?? null,
        // 공항: 겹침 없음(국내 RK / 해외 그 외)
        airports: { ...airports, ...(airportsO || {}) },
        // 지점·항로: 공유 ident/routeId는 국내 정의 우선(방향 메타데이터 보존)
        navpoints: { ...(navpointsO || {}), ...enroute.points },
        routeGraph: mergeRouteGraph(buildRouteGraph(enroute.segments), routeGraphO),
        routeSegmentsById: Object.fromEntries(allSegments.map((segment) => [segment.id, segment])),
        routes: { ...(routesO || {}), ...enroute.routes },
        routeDirectionMetadata: { routes: enroute.routes },
      }
    })
  }

  async function loadRouteDirectionMetadata() {
    const navdata = await loadNavdata()
    return navdata.routeDirectionMetadata
  }

  async function loadNavpoints() {
    const navdata = await loadNavdata()
    return navdata.navpoints
  }

  // ponytail: load overseas airports + links map; returns {} if file missing or network error.
  // Used by RouteBriefingPanel to populate arrival airport options.
  //
  // 안쪽은 실패 시 throw해야 loadOnce가 캐시를 지우고 다음 호출이 다시 시도한다.
  // 바깥에서 {}로 바꿔주므로 부르는 쪽 계약("실패하면 빈 객체")은 그대로다.
  // 예전에는 네트워크 오류일 때만 {}를 영구 캐시하고 HTTP 오류일 땐 재시도해서
  // 같은 실패인데 결과가 달랐다 — 재시도하는 쪽으로 통일한다.
  // fetchJson을 쓴다 — loadNavdata도 같은 파일을 받으므로, 각자 자기 이름표로 캐시하면
  // 같은 것을 두 번 내려받는다. 파일 경로를 이름표로 삼으면 어느 통로로 부르든 한 번이다.
  async function loadOverseasAirports() {
    try {
      return await fetchJson('airports-overseas.json')
    } catch {
      return {}
    }
  }

  // Load airport-route-links-overseas.json: { ICAO: { nearestFix, nearbyFixes }, ... }
  async function loadOverseasLinks() {
    try {
      return await fetchJson('airport-route-links-overseas.json')
    } catch {
      return {}
    }
  }


  const iapDataCache = {}
  async function loadIapData(icao) {
    if (!icao) return null
    const key = icao.toUpperCase()
    if (!iapDataCache[key]) {
      try {
        iapDataCache[key] = await fetchJson(`procedures/${key.toLowerCase()}-representative-iap-routes.json`)
      } catch (e) {
        console.warn(`Failed to load IAP data for ${key}`, e)
        return null
      }
    }
    return iapDataCache[key]
  }

  return { loadNavdata, loadNavpoints, loadRouteDirectionMetadata, loadOverseasAirports, loadOverseasLinks, loadIapData, getProcedures: createProcedureLoader(fetchJson) }
}
