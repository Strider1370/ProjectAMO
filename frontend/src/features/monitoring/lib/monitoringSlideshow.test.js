import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_MONITORING_SLIDESHOW_CONFIG,
  normalizeMonitoringSlideshowConfig,
  validateMonitoringSlideshowConfig,
  getMonitoringSlideshowStatus,
  nextMonitoringSlide,
  loadMonitoringSlideshowConfig,
  saveMonitoringSlideshowConfig,
  saveMonitoringSlideImage,
} from './monitoringSlideshow.js'

function at(hh, mm) {
  const now = new Date()
  now.setHours(hh, mm, 0, 0)
  return now
}

describe('monitoring slideshow config', () => {
  it('defaults to disabled whole-screen with a valid daily range', () => {
    assert.equal(DEFAULT_MONITORING_SLIDESHOW_CONFIG.enabled, false)
    assert.equal(DEFAULT_MONITORING_SLIDESHOW_CONFIG.target, 'whole-screen')
    assert.equal(validateMonitoringSlideshowConfig(DEFAULT_MONITORING_SLIDESHOW_CONFIG).valid, true)
  })

  it('normalizes partial/invalid input back to defaults per field', () => {
    const normalized = normalizeMonitoringSlideshowConfig({ target: 'bogus', intervalSeconds: 'nope', transitionEffect: 'zoom' })
    assert.equal(normalized.target, 'whole-screen')
    assert.equal(normalized.intervalSeconds, DEFAULT_MONITORING_SLIDESHOW_CONFIG.intervalSeconds)
    assert.equal(normalized.transitionEffect, 'fade')
  })

  it('accepts fade and slide as the only transition effects', () => {
    assert.equal(normalizeMonitoringSlideshowConfig({ transitionEffect: 'slide' }).transitionEffect, 'slide')
    assert.equal(validateMonitoringSlideshowConfig({ ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, transitionEffect: 'slide' }).valid, true)
    assert.equal(validateMonitoringSlideshowConfig({ ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, transitionEffect: 'zoom' }).valid, false)
  })

  it('clamps the transition animation duration to 100-2000ms', () => {
    assert.equal(normalizeMonitoringSlideshowConfig({ transitionDurationMs: 50 }).transitionDurationMs, 100)
    assert.equal(normalizeMonitoringSlideshowConfig({ transitionDurationMs: 5000 }).transitionDurationMs, 2000)
    assert.equal(validateMonitoringSlideshowConfig({ ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, transitionDurationMs: 99 }).valid, false)
    assert.equal(validateMonitoringSlideshowConfig({ ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, transitionDurationMs: 2000 }).valid, true)
  })

  it('accepts the 5-3600 second interval boundary and rejects outside it', () => {
    const low = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, intervalSeconds: 5 }
    const high = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, intervalSeconds: 3600 }
    const tooLow = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, intervalSeconds: 4 }
    const tooHigh = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, intervalSeconds: 3601 }

    assert.equal(validateMonitoringSlideshowConfig(low).valid, true)
    assert.equal(validateMonitoringSlideshowConfig(high).valid, true)
    assert.equal(validateMonitoringSlideshowConfig(tooLow).valid, false)
    assert.equal(validateMonitoringSlideshowConfig(tooHigh).valid, false)
  })

  it('rejects equal start and end times', () => {
    const result = validateMonitoringSlideshowConfig({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      startTime: '09:00',
      endTime: '09:00',
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.time)
  })
})

describe('monitoring slideshow schedule status', () => {
  it('is off when disabled regardless of time', () => {
    const config = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, enabled: false, startTime: '09:00', endTime: '17:00' }
    assert.equal(getMonitoringSlideshowStatus(config, at(12, 0)), 'off')
  })

  it('reports waiting, active, and ended across a same-day range', () => {
    const config = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, enabled: true, startTime: '09:00', endTime: '17:00' }
    assert.equal(getMonitoringSlideshowStatus(config, at(8, 0)), 'waiting')
    assert.equal(getMonitoringSlideshowStatus(config, at(12, 0)), 'active')
    assert.equal(getMonitoringSlideshowStatus(config, at(18, 0)), 'ended')
  })

  it('reports active and waiting across an overnight range', () => {
    const config = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, enabled: true, startTime: '22:00', endTime: '06:00' }
    assert.equal(getMonitoringSlideshowStatus(config, at(23, 0)), 'active')
    assert.equal(getMonitoringSlideshowStatus(config, at(2, 0)), 'active')
    assert.equal(getMonitoringSlideshowStatus(config, at(12, 0)), 'waiting')
  })

  it('treats an invalid configuration as off even when enabled', () => {
    const config = { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG, enabled: true, startTime: '09:00', endTime: '09:00' }
    assert.equal(getMonitoringSlideshowStatus(config, at(9, 0)), 'off')
  })
})

describe('monitoring slideshow next slide', () => {
  it('alternates live and image', () => {
    assert.equal(nextMonitoringSlide('live'), 'image')
    assert.equal(nextMonitoringSlide('image'), 'live')
  })
})

describe('monitoring slideshow persistence (no browser environment)', () => {
  it('loadMonitoringSlideshowConfig falls back to defaults without throwing', () => {
    const result = loadMonitoringSlideshowConfig()
    assert.equal(result.ok, false)
    assert.deepEqual(result.config, DEFAULT_MONITORING_SLIDESHOW_CONFIG)
  })

  it('saveMonitoringSlideshowConfig reports failure without throwing', () => {
    const result = saveMonitoringSlideshowConfig(DEFAULT_MONITORING_SLIDESHOW_CONFIG)
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })

  it('saveMonitoringSlideImage rejects an unsupported MIME type before touching storage', async () => {
    const svgFile = { type: 'image/svg+xml' }
    const result = await saveMonitoringSlideImage(svgFile)
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })
})
