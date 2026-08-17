import assert from 'node:assert/strict'
import test from 'node:test'

import { loadChangedWeatherData, loadDeferredWeatherData, loadWeatherData } from './weatherApi.js'

function installFetchRecorder() {
  const calls = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => {
        if (String(url) === '/api/airports') return [{ icao: 'RKSI', name: 'Incheon' }]
        return { content_hash: `${url}-hash` }
      },
    }
  }
  return {
    calls,
    restore: () => { globalThis.fetch = previousFetch },
  }
}

test('loadWeatherData skips deferred panel-only datasets on first entry', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadWeatherData()
    assert.equal(data.airports.length, 1)
    assert.equal(data.airports[0].elevation_ft, 23)
    assert.equal(recorder.calls.includes('/api/sigwx-low-history'), false)
    assert.equal(recorder.calls.includes('/data/radar/echo_meta.json'), false)
    assert.equal(recorder.calls.includes('/api/ground-overview'), false)
    assert.equal(recorder.calls.includes('/api/environment'), false)
    assert.equal(recorder.calls.includes('/api/airport-info'), false)
    assert.equal(recorder.calls.includes('/api/adsb'), false)
    assert.equal(recorder.calls.includes('/data/satellite/convective/convective_meta.json'), true)
    assert.equal(recorder.calls.some((url) => url.startsWith('/data/kim_')), false)
  } finally {
    recorder.restore()
  }
})

test('loadChangedWeatherData refreshes HSR/HCI from their own metadata changes', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadChangedWeatherData({ hsrMeta: true, hciMeta: true })
    assert.ok(data.hsrMeta)
    assert.ok(data.hciMeta)
    assert.deepEqual(recorder.calls, [
      '/data/radar/hsr/hsr_meta.json',
      '/data/radar/hci/hci_meta.json',
    ])
  } finally {
    recorder.restore()
  }
})

test('loadChangedWeatherData refreshes other independently published timeline metadata', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadChangedWeatherData({ echoTopMeta: true, satVisibleMeta: true })
    assert.ok(data.echoTopMeta)
    assert.ok(data.satVisibleMeta)
    assert.deepEqual(recorder.calls, [
      '/data/radar/echotop/echotop_meta.json',
      '/data/satellite/visible/visible_meta.json',
    ])
  } finally {
    recorder.restore()
  }
})

test('loadDeferredWeatherData fetches panel-only datasets when requested', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadDeferredWeatherData(['sigwxLowHistory', 'groundOverview', 'environment', 'airportInfo', 'adsb'])
    assert.ok(data.sigwxLowHistory)
    assert.ok(data.groundOverview)
    assert.ok(data.environment)
    assert.ok(data.airportInfo)
    assert.ok(data.adsb)
    assert.deepEqual(
      recorder.calls,
      ['/api/sigwx-low-history', '/api/ground-overview', '/api/environment', '/api/airport-info', '/api/adsb'],
    )
  } finally {
    recorder.restore()
  }
})

test('loadChangedWeatherData does not fetch deferred datasets until they are loaded', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadChangedWeatherData(
      { sigwxLow: true, adsb: true, groundOverview: true, environment: true, airportInfo: true },
      { deferredKeys: new Set() },
    )

    assert.ok(data.sigwxLow)
    assert.equal(data.sigwxLowHistory, undefined)
    assert.equal(data.adsb, undefined)
    assert.equal(data.groundOverview, undefined)
    assert.equal(data.environment, undefined)
    assert.equal(data.airportInfo, undefined)
    assert.equal(recorder.calls.includes('/api/sigwx-low-history'), false)
    assert.equal(recorder.calls.includes('/api/adsb'), false)
    assert.equal(recorder.calls.includes('/api/ground-overview'), false)
    assert.equal(recorder.calls.includes('/api/environment'), false)
    assert.equal(recorder.calls.includes('/api/airport-info'), false)
  } finally {
    recorder.restore()
  }
})

test('loadChangedWeatherData fetches overseas datasets independently from domestic changes', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadChangedWeatherData({
      metar: false,
      metarOverseas: true,
      taf: false,
      tafOverseas: true,
      sigmet: false,
      sigmetOverseas: true,
    })

    assert.ok(data.metarOverseas)
    assert.ok(data.tafOverseas)
    assert.ok(data.sigmetOverseas)
    assert.equal(data.metar, undefined)
    assert.equal(data.taf, undefined)
    assert.equal(data.sigmet, undefined)
    assert.deepEqual(
      recorder.calls,
      ['/api/metar-overseas', '/api/taf-overseas', '/api/sigmet-overseas'],
    )
  } finally {
    recorder.restore()
  }
})

test('loadChangedWeatherData refreshes convective metadata independently', async () => {
  const recorder = installFetchRecorder()
  try {
    const data = await loadChangedWeatherData({ convectiveMeta: true })
    assert.ok(data.convectiveMeta)
    assert.deepEqual(recorder.calls, ['/data/satellite/convective/convective_meta.json'])
  } finally {
    recorder.restore()
  }
})
