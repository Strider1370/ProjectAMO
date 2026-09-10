import { organizationBundleFixture, organizationFlightFixture } from './organization-fixture.mjs'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

export async function installPresentationFixture(page) {
  const state = { generation: 1, models: [], candidates: [], applies: [], expireFrame: false, holdModel: false, releaseModel: null, deliveredModels: [], frameRequests: 0 }
  const flight = structuredClone(organizationFlightFixture)
  const session = { id: 81, orgId: 11, name: '발표 고정 계약', version: 1, flightIds: [71], blocks: [], materialRefs: [] }
  const snapshot = { briefing: session, flights: [flight], materialRefs: [] }
  let run = { id: 91, orgId: 11, briefingId: 81, version: 1, status: 'active', startedBy: 2, startedAt: flight.etd, flightRefs: [{ id: 71, version: 1 }], pinnedSnapshot: snapshot }
  const saved = new Map()
  function bundle(generation) {
    const result = organizationBundleFixture(flight, {}, `pinned-${generation}`)
    const kim = { status: 'available', tmfc: generation === 1 ? '2026090906' : '2026091006', hf: 6, validTime: generation === 1 ? '2026-09-09T12:00:00Z' : '2026-09-10T12:00:00Z', levelIds: ['850hPa', '700hPa'],
      resources: { wind: ['850hPa', '700hPa'].map(level => ({ level, revision: `kim-${generation}-${level}` })) } }
    const ktg = { status: 'available', tmfc: generation === 1 ? '2026090900' : '2026091000', hf: 9, validTime: generation === 1 ? '2026-09-09T09:00:00Z' : '2026-09-10T09:00:00Z', altLevelsFt: [3000, 6000], resources: [3000, 6000].map(altFt => ({ altFt, revision: `ktg-${generation}-${altFt}` })) }
    result.organizationSnapshot = snapshot
    result.mapDataSelection = { bundleId: result.bundleId, models: { kim, ktg }, frames: {
      satellite: { status: 'available', frameId: `satellite-${generation}`, revision: `frame-${generation}`, validTime: kim.validTime, url: `/api/weather/frame/fixture/${generation}.png?revision=frame-${generation}`, bounds: [[34, 126], [36, 128]] }, radar: { status: 'unavailable' },
    } }
    result.componentStatus = { nwp: 'partial', terrain: 'available', models: { kim: 'available', ktg: 'available' } }
    result.provenance = { fixture: true, generatedAt: kim.validTime }
    return result
  }
  await page.exposeFunction('__presentationFixtureResponse', async ({ pathname, search, body }) => {
    if (pathname === '/api/auth/me') return { id: 2, username: 'fixture_presenter', role: 'pilot' }
    if (pathname === '/api/me/organizations') return { organizations: [{ id: 11, name: '고정 검증 기관', role: 'admin' }] }
    if (pathname.startsWith('/api/kim/') || pathname.startsWith('/api/ktg/')) {
      state.models.push(pathname + search)
      if (state.holdModel) { state.holdModel = false; await new Promise(resolve => { state.releaseModel = resolve }) }
      const params = new URLSearchParams(search)
      return { grid: { nx: 2, ny: 2, lonMin: 126, lonMax: 128, latMin: 34, latMax: 36, dx: 2, dy: 2 }, u: [5, 5, 5, 5], v: [0, 0, 0, 0], scale_factor: 1, add_offset: 0, missing_value: -9999,
        time: { tmfc: params.get('tmfc'), hf: Number(params.get('hf')) }, revision: params.get('revision') }
    }
    if (pathname.endsWith('/candidates')) { const candidate = bundle(state.generation); saved.set(candidate.bundleId, candidate); state.candidates.push(candidate.bundleId); return { bundle: candidate } }
    if (pathname.endsWith('/apply')) { const applied = saved.get(body.bundleId); state.applies.push(body.bundleId); run = { ...run, version: run.version + 1, activeFlightId: 71, appliedSnapshot: applied, appliedBundles: { 71: applied } }; return { run } }
    if (pathname.endsWith('/runs') || pathname.endsWith('/runs/91')) return { run }
    if (pathname.endsWith('/end')) { run = { ...run, status: 'ended' }; return { run } }
    if (pathname.endsWith('/briefings/81')) return { briefing: session }
    if (pathname === '/api/organizations/11') return { organization: { id: 11, name: '고정 검증 기관', role: 'admin' } }
    const key = pathname.split('/').at(-1)
    return { [key]: key === 'flights' ? [flight] : key === 'briefings' ? [session] : key === 'situation' ? {} : [] }
  })
  await page.addInitScript(version => {
    localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version)
    const original = window.fetch.bind(window)
    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href)
      if (url.origin === location.origin && (url.pathname.startsWith('/api/organizations/') || ['/api/auth/me', '/api/me/organizations'].includes(url.pathname) || url.pathname.startsWith('/api/kim/') || url.pathname.startsWith('/api/ktg/'))) {
        const value = await window.__presentationFixtureResponse({ pathname: url.pathname, search: url.search, body: options.body ? JSON.parse(options.body) : null })
        if (url.pathname.startsWith('/api/kim/') || url.pathname.startsWith('/api/ktg/')) { window.__deliveredPresentationModels ??= []; window.__deliveredPresentationModels.push(url.search) }
        return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
      }
      return original(input, options)
    }
  }, CURRENT_VERSION)
  await page.route('**/api/weather/frame/fixture/**', route => { state.frameRequests += 1; return state.expireFrame ? route.fulfill({ status: 410, body: 'expired' }) : route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }) })
  return state
}
