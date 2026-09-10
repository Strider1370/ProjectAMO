import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')

test('organization map delegates the real map lifecycle to MapView', () => {
  const source = read('./OrganizationMap.jsx')
  assert.match(source, /import MapView from '\.\.\/map\/MapView\.jsx'/)
  assert.match(source, /onMapLifecycle=\{handleMapLifecycle\}/)
  assert.match(source, /mapDataSelection=\{pinnedSelection\}/)
  const adapter = read('./hooks/useOrganizationMapAdapter.js')
  assert.match(adapter, /map\.on\('style\.load', reinstall\)/)
  assert.match(adapter, /map\.on\('idle', syncLatest\)/)
  assert.match(adapter, /onMapClick\?\.\(\{ lon: event\.lngLat\.lng, lat: event\.lngLat\.lat \}\)/)
  assert.doesNotMatch(source, /<svg/)
})

test('presentation starts in B map layout and opens immutable material viewers', () => {
  const source = read('./OrganizationPresentation.jsx')
  assert.match(source, /useState\('map'\)/)
  assert.match(source, /B 지도 중심/)
  assert.match(source, /<PdfViewer url=\{url\}/)
  assert.match(source, /versions\/\$\{encodeURIComponent\(version\)\}\/original/)
})

test('presentation applies only a prepared server bundle with run version control', () => {
  const source = read('./hooks/useOrganizationPresentation.js')
  assert.match(source, /\/candidates/)
  assert.match(source, /refreshOrganization = true/)
  assert.match(source, /refreshOrganization: false/)
  assert.match(source, /body: \{ expectedRunVersion: targetRun\.version, flightId, bundleId: bundle\.bundleId \}/)
  assert.match(source, /String\(runRef\.current\?\.id\) !== String\(targetRun\.id\)/)
  assert.match(source, /Number\(runRef\.current\?\.version\) !== Number\(targetRun\.version\)/)
  assert.match(source, /requestEpochRef\.current \+= 1/)
  assert.match(source, /setCandidates\(\{\}\)/)
  assert.match(source, /setCurrentIndex\(appliedIndex\)/)
  assert.match(source, /if \(loading \|\| !run\?\.id/)
  assert.doesNotMatch(source, /\/api\/route-briefing/)
})
