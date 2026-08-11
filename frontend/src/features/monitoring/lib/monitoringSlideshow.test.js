import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_MONITORING_SLIDESHOW_CONFIG,
  MONITORING_SLIDE_IDS,
  normalizeMonitoringSlideshowConfig,
  validateMonitoringSlideshowConfig,
  getMonitoringSlideshowStatus,
  nextMonitoringSlide,
  resolveMonitoringSlides,
  loadMonitoringSlideshowConfig,
  saveMonitoringSlideshowConfig,
  saveMonitoringSlideImage,
} from './monitoringSlideshow.js'

function slideById(config, id) {
  return config.slides.find((slide) => slide.id === id)
}

function at(hh, mm) {
  const now = new Date()
  now.setHours(hh, mm, 0, 0)
  return now
}

describe('monitoring slideshow config', () => {
  it('defaults to disabled whole-screen with a valid daily range', () => {
    assert.equal(DEFAULT_MONITORING_SLIDESHOW_CONFIG.enabled, false)
    assert.equal(DEFAULT_MONITORING_SLIDESHOW_CONFIG.target, 'whole-screen')
    assert.equal(DEFAULT_MONITORING_SLIDESHOW_CONFIG.transitionDurationMs, 1000)
    assert.equal(validateMonitoringSlideshowConfig(DEFAULT_MONITORING_SLIDESHOW_CONFIG).valid, true)
  })

  it('normalizes partial/invalid input back to defaults per field', () => {
    const normalized = normalizeMonitoringSlideshowConfig({ target: 'bogus', transitionEffect: 'zoom' })
    assert.equal(normalized.target, 'whole-screen')
    assert.equal(normalized.transitionEffect, 'fade')
  })

  it('defaults to the live map plus the weather bulletin, image off', () => {
    const { slides } = DEFAULT_MONITORING_SLIDESHOW_CONFIG
    assert.deepEqual(slides.map((slide) => slide.id), MONITORING_SLIDE_IDS)
    assert.equal(slideById(DEFAULT_MONITORING_SLIDESHOW_CONFIG, 'live').enabled, true)
    assert.equal(slideById(DEFAULT_MONITORING_SLIDESHOW_CONFIG, 'wxinfo').enabled, true)
    assert.equal(slideById(DEFAULT_MONITORING_SLIDESHOW_CONFIG, 'image').enabled, false)
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

  it('accepts the 5-3600 second dwell boundary and rejects outside it', () => {
    const withLiveDwell = (durationSec) => ({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      slides: DEFAULT_MONITORING_SLIDESHOW_CONFIG.slides.map((slide) => (
        slide.id === 'live' ? { ...slide, durationSec } : slide
      )),
    })

    assert.equal(validateMonitoringSlideshowConfig(withLiveDwell(5)).valid, true)
    assert.equal(validateMonitoringSlideshowConfig(withLiveDwell(3600)).valid, true)
    assert.equal(validateMonitoringSlideshowConfig(withLiveDwell(4)).valid, false)
    assert.equal(validateMonitoringSlideshowConfig(withLiveDwell(3601)).valid, false)
  })

  it('clamps out-of-range dwell times when normalizing', () => {
    const normalized = normalizeMonitoringSlideshowConfig({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      slides: [{ id: 'live', enabled: true, durationSec: 99999 }, { id: 'wxinfo', enabled: true, durationSec: 1 }],
    })
    assert.equal(slideById(normalized, 'live').durationSec, 3600)
    assert.equal(slideById(normalized, 'wxinfo').durationSec, 5)
  })

  it('drops unknown slide ids and restores missing ones in canonical order', () => {
    const normalized = normalizeMonitoringSlideshowConfig({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      slides: [{ id: 'bogus', enabled: true, durationSec: 30 }, { id: 'image', enabled: true, durationSec: 45 }],
    })
    assert.deepEqual(normalized.slides.map((slide) => slide.id), MONITORING_SLIDE_IDS)
    assert.equal(slideById(normalized, 'image').durationSec, 45)
    assert.equal(slideById(normalized, 'image').enabled, true)
  })

  it('rejects a configuration with every slide switched off', () => {
    const result = validateMonitoringSlideshowConfig({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      slides: DEFAULT_MONITORING_SLIDESHOW_CONFIG.slides.map((slide) => ({ ...slide, enabled: false })),
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.slides)
  })

  it('ignores the dwell time of slides that are switched off', () => {
    const result = validateMonitoringSlideshowConfig({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      slides: [
        { id: 'live', enabled: true, durationSec: 180 },
        { id: 'wxinfo', enabled: false, durationSec: 99999 },
        { id: 'image', enabled: false, durationSec: 30 },
      ],
    })
    assert.equal(result.valid, true)
  })
})

describe('monitoring slideshow legacy config migration', () => {
  it('carries a saved intervalSeconds onto every slide and keeps the old live/image pair', () => {
    const migrated = normalizeMonitoringSlideshowConfig({
      enabled: true,
      target: 'map-panel',
      transitionEffect: 'slide',
      transitionDurationMs: 500,
      intervalSeconds: 45,
      startTime: '08:00',
      endTime: '20:00',
    })

    assert.equal(migrated.enabled, true)
    assert.equal(migrated.target, 'map-panel')
    assert.equal(migrated.transitionEffect, 'slide')
    assert.equal(migrated.transitionDurationMs, 500)
    assert.equal(migrated.startTime, '08:00')
    assert.equal(migrated.endTime, '20:00')

    // The old behaviour was live <-> image at one shared interval; wxinfo is new, so it stays off
    // until the user opts in rather than silently changing what an existing screen shows.
    assert.equal(slideById(migrated, 'live').enabled, true)
    assert.equal(slideById(migrated, 'image').enabled, true)
    assert.equal(slideById(migrated, 'wxinfo').enabled, false)
    migrated.slides.forEach((slide) => assert.equal(slide.durationSec, 45))
  })

  it('clamps a nonsense legacy interval instead of dropping the rest of the config', () => {
    const migrated = normalizeMonitoringSlideshowConfig({ target: 'map-panel', intervalSeconds: 'nope' })
    assert.equal(migrated.target, 'map-panel')
    migrated.slides.forEach((slide) => assert.equal(slide.durationSec, 30))
  })

  it('leaves a config that already has slides untouched by the migration path', () => {
    const migrated = normalizeMonitoringSlideshowConfig({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      intervalSeconds: 45,
      slides: [{ id: 'live', enabled: true, durationSec: 180 }],
    })
    assert.equal(slideById(migrated, 'live').durationSec, 180)
    assert.equal(slideById(migrated, 'wxinfo').enabled, DEFAULT_MONITORING_SLIDESHOW_CONFIG.slides[1].enabled)
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

describe('monitoring slideshow rotation', () => {
  const cfg = (...enabled) => ({
    ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
    slides: MONITORING_SLIDE_IDS.map((id) => ({ id, enabled: enabled.includes(id), durationSec: 30 })),
  })

  it('keeps only enabled slides whose content is actually there', () => {
    const slides = resolveMonitoringSlides(cfg('live', 'wxinfo', 'image'), { wxinfo: false, image: true })
    assert.deepEqual(slides.map((slide) => slide.id), ['live', 'image'])
  })

  it('treats the live map as always available', () => {
    const slides = resolveMonitoringSlides(cfg('live'), {})
    assert.deepEqual(slides.map((slide) => slide.id), ['live'])
  })

  it('returns nothing when every enabled slide is missing its content', () => {
    assert.deepEqual(resolveMonitoringSlides(cfg('wxinfo', 'image'), { wxinfo: false, image: false }), [])
  })

  it('carries the dwell time through so the caller does not re-read the config', () => {
    const slides = resolveMonitoringSlides({
      ...DEFAULT_MONITORING_SLIDESHOW_CONFIG,
      slides: [{ id: 'live', enabled: true, durationSec: 180 }, { id: 'wxinfo', enabled: true, durationSec: 30 }],
    }, { wxinfo: true })
    assert.deepEqual(slides, [
      { id: 'live', durationSec: 180 },
      { id: 'wxinfo', durationSec: 30 },
    ])
  })

  it('cycles forward through the resolved slides and wraps around', () => {
    const slides = [{ id: 'live' }, { id: 'wxinfo' }, { id: 'image' }]
    assert.equal(nextMonitoringSlide('live', slides), 'wxinfo')
    assert.equal(nextMonitoringSlide('wxinfo', slides), 'image')
    assert.equal(nextMonitoringSlide('image', slides), 'live')
  })

  it('restarts from the first slide when the current one is no longer available', () => {
    // Happens when the selected airport changes to one with no bulletin while wxinfo is on screen.
    assert.equal(nextMonitoringSlide('wxinfo', [{ id: 'live' }, { id: 'image' }]), 'live')
  })

  it('stays put when only one slide is available', () => {
    assert.equal(nextMonitoringSlide('live', [{ id: 'live' }]), 'live')
  })

  it('returns null when there is nothing to show', () => {
    assert.equal(nextMonitoringSlide('live', []), null)
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
