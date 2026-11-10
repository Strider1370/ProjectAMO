import assert from 'node:assert/strict'
import test from 'node:test'
import { collectConvectiveSatelliteFrame } from './convective-satellite-processor.js'

test('processor publishes CTPS without fetching CI for a legacy CI-only frame', async () => {
  const fetched = [], published = []
  const config = { satellite: { convective_enabled: true, convective_max_frames: 18, fog_url: 'https://example.test', ci_product: 'CI', region: 'KO', timeout_ms: 1 }, flight_category: { ctps_url: 'https://example.test/CTPS' }, storage: { base_path: 'ignored' }, api: { radar_satellite_auth_key: 'key' } }
  const frame = { tm: '202607230900', request_tm_utc: '202607230000' }
  const result = await collectConvectiveSatelliteFrame(frame, {
    config,
    root: 'ignored',
    readMeta: () => ({ frames: [{ ...frame, ci: { path: 'old', renderVersion: 'ci-native-lcc-v2' }, ctps: null }] }),
    fetchNc: async (url) => { fetched.push(url); return Buffer.alloc(8) },
    parseCtps: async () => ({ cth: new Uint16Array([1]), ctt: new Uint16Array([300]), flag: new Uint8Array([0]), attrs: { width: 1, height: 1, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000, cthScale: 1, cthOffset: 0, cthFill: 65535, cttScale: 1, cttOffset: 0, cttFill: 65535, flagFill: 255 } }),
    renderWebp: async () => Buffer.from('webp'),
    publishCtps: (value) => { published.push(value) },
  })
  assert.equal(result.saved, true); assert.equal(fetched.length, 1); assert.equal(published.length, 1)
  assert.ok(fetched.every((url) => !/\/CI(?:\/|\?)/.test(url))); assert.equal(new URL(fetched[0]).searchParams.get('data'), 'ctps')
})


test('CTPS-only completed frames do not trigger another download', async () => {
  const images = Object.fromEntries(['all', 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550].map(level => [level, '/image.webp']))
  const result = await collectConvectiveSatelliteFrame({ tm: '202607230900' }, {
    config: { satellite: { convective_enabled: true }, storage: { base_path: 'ignored' } },
    readMeta: () => ({ frames: [{ tm: '202607230900', ctps: { images } }] }),
    fetchNc: () => assert.fail('complete CTPS must be reused'),
  })
  assert.equal(result.reason, 'already_complete')
})

test('CTPS collection failure leaves publication untouched', async () => {
  await assert.rejects(collectConvectiveSatelliteFrame({ tm: '202607230900', request_tm_utc: '202607230000' }, {
    config: { satellite: { convective_enabled: true }, storage: { base_path: 'ignored' }, flight_category: { ctps_url: 'https://example.test/CTPS' }, api: {} },
    readMeta: () => null,
    fetchNc: async () => { throw new Error('upstream unavailable') },
    publishCtps: () => assert.fail('failed download must not be published'),
  }), /upstream unavailable/)
})
