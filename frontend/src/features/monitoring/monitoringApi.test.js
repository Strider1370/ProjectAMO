import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMonitoringSnapshot,
  detectMonitoringSnapshotChanges,
  loadChangedMonitoringData,
  loadMonitoringInitialData,
} from './monitoringApi.js'

const REQUIRED_INITIAL_URLS = [
  '/api/airports', '/api/metar', '/api/taf', '/api/amos', '/api/warning', '/api/kma-special-warning',
  '/api/sigmet', '/api/airmet', '/api/lightning', '/api/ground-forecast', '/api/ground-overview',
  '/api/environment', '/api/airport-info', '/api/warning-types', '/api/alert-defaults',
  '/data/radar/hsr/hsr_meta.json', '/data/radar/hci/hci_meta.json', '/data/satellite/sat_meta.json',
  '/data/satellite/visible/visible_meta.json',
]

const EXCLUDED_INITIAL_URLS = [
  '/api/notam', '/api/metar-overseas', '/api/taf-overseas', '/api/sigmet-overseas',
  '/api/sigwx-low', '/api/adsb', '/api/typhoon', '/api/weather/flight-category-overlay',
  '/data/navdata/airports-overseas.json', '/data/radar/wissdom/wissdom_meta.json',
  '/data/radar/qpf/qpf_meta.json', '/data/radar/echotop/echotop_meta.json',
  '/data/radar/rainviewer_meta.json', '/data/radar/echo_meta.json',
  '/data/satellite/convective/convective_meta.json',
]

test('monitoring initial load requests only owned card and map data once', async (t) => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    return { ok: true, json: async () => ({ content_hash: String(url), airports: [] }) }
  }
  t.after(() => { globalThis.fetch = originalFetch })

  await loadMonitoringInitialData()

  for (const url of REQUIRED_INITIAL_URLS) {
    assert.equal(requested.filter((requestedUrl) => requestedUrl === url).length, 1, `${url} should be requested once`)
  }
  for (const url of EXCLUDED_INITIAL_URLS) {
    assert.equal(requested.includes(url), false, `${url} must not be requested by monitoring`)
  }
})

test('monitoring polling tracks only its retained weather graphics', () => {
  const saved = buildMonitoringSnapshot({
    hsrMeta: { tm: '202608120000', content_hash: 'hsr-old' },
    hciMeta: { tm: '202608120000', content_hash: 'hci-old' },
    satMeta: { tm: '202608120000' },
    satVisibleMeta: { tm: '202608120000' },
  })
  const changes = detectMonitoringSnapshotChanges({
    hsrMeta: { tm: '202608120000', hash: 'hsr-new' },
    hciMeta: { tm: '202608120000', hash: 'hci-new' },
    satMeta: { tm: '202608120100' },
    satVisibleMeta: { tm: '202608120100' },
  }, saved)

  assert.equal(changes.hsrMeta, true)
  assert.equal(changes.hciMeta, true)
  assert.equal(changes.satMeta, true)
  assert.equal(changes.satVisibleMeta, true)
  assert.equal('wissdomMeta' in changes, false)
  assert.equal('convectiveMeta' in changes, false)
})

test('monitoring polling preserves an optional payload after a transient fetch failure', async (t) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 503 })
  t.after(() => { globalThis.fetch = originalFetch })

  const changed = await loadChangedMonitoringData({ lightning: true })

  assert.equal(changed.lightning, undefined)
})
