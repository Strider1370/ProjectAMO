import assert from 'node:assert/strict'
import test from 'node:test'
import {
  pinnedFrameDescriptors,
  pinnedFrameStatus,
  pinnedKimSelection,
  pinnedKtgSelection,
  pinnedModelStatus,
} from './pinnedMapDataSelection.js'

const selection = {
  schemaVersion: 1,
  bundleId: 'bundle-a',
  models: {
    kim: { status: 'available', tmfc: '2026091006', hf: 6, validTime: '2026-09-10T12:00:00Z', levelIds: ['850hPa'], resources: { '850hPa': { revision: 'kim-grid' } } },
    ktg: { status: 'available', tmfc: '2026091000', hf: 12, validTime: '2026-09-10T12:00:00Z', altLevelsFt: [3000, 5000], resources: { 3000: { revision: 'ktg-3' }, 5000: { revision: 'ktg-5' } } },
  },
  frames: { radar: { status: 'available', revision: 'bytes', url: '/api/weather/frame/radar/a?revision=bytes', bounds: [[32, 124], [39, 132]] } },
}

test('KIM and KTG preserve independent run and forecast hour selections', () => {
  assert.deepEqual(pinnedKimSelection(selection), {
    mode: 'pinned', bundleId: 'bundle-a', tmfc: '2026091006', hf: 6, level: '850hPa',
    validTime: '2026-09-10T12:00:00Z', revision: 'kim-grid', resourceId: null,
  })
  assert.equal(pinnedKtgSelection(selection, { altFt: 5000 }).tmfc, '2026091000')
  assert.equal(pinnedKtgSelection(selection, { altFt: 5000 }).revision, 'ktg-5')
})

test('KIM variable resources keep their own immutable revisions', () => {
  const selection = {
    bundleId: 'bundle-variable',
    kim: {
      status: 'available', tmfc: '2026091006', hf: 3, levelIds: ['850hPa'],
      resources: {
        wind: [{ level: '850hPa', revision: 'wind-revision' }],
        temp: [{ level: '850hPa', revision: 'temperature-revision' }],
      },
    },
  }
  assert.equal(pinnedKimSelection(selection, { variable: 'wind' }).revision, 'wind-revision')
  assert.equal(pinnedKimSelection(selection, { variable: 'temperature' }).revision, 'temperature-revision')
})

test('pinned model without immutable resource revision is unsupported', () => {
  const unsafe = { bundleId: 'bundle', models: { kim: { status: 'available', tmfc: '2026091006', hf: 6, levelIds: ['850hPa'] } } }
  assert.equal(pinnedKimSelection(unsafe), null)
  assert.equal(pinnedModelStatus(unsafe, 'kim').status, 'unsupported')
})

test('out-of-range pinned models remain selectable when their immutable revision exists', () => {
  const selection = { bundleId: 'bundle-a', kim: { status: 'out_of_range', tmfc: '2026091006', hf: 3, levelIds: ['850hPa'], resources: { wind: [{ levelId: '850hPa', revision: 'wind-revision' }] } } }
  assert.equal(pinnedKimSelection(selection).revision, 'wind-revision')
})

test('only exact byte-addressed frames are returned', () => {
  assert.equal(pinnedFrameDescriptors(selection).length, 1)
  assert.equal(pinnedFrameDescriptors({ frames: { radar: { status: 'available', url: '/latest.png' } } }).length, 0)
  assert.equal(pinnedFrameStatus(selection, 'radar').status, 'available')
  assert.equal(pinnedFrameStatus(selection, 'satellite').status, 'unsupported')
  assert.equal(pinnedFrameStatus({ frames: { satellite: { status: 'unavailable', reason: 'frame_stale' } } }, 'satellite').status, 'unavailable')
})
