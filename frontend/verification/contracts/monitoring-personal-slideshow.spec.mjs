import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { installMonitoringFixture, openMonitoringState } from '../monitoring-fixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_IMAGE = path.join(__dirname, 'fixtures', 'monitoring-slideshow-sample.jpg')

async function openSlideshowTab(page) {
  await openMonitoringState(page, 'settings')
  await page.getByRole('button', { name: '화면 전환' }).click()
}

// Only the slides ticked here rotate, so every test states the set it depends on.
async function setSlides(page, enabled) {
  for (const name of ['지도', '기상정보', '이미지']) {
    await page.getByLabel(`${name} 장면 사용`).setChecked(enabled.includes(name))
  }
}

// The settings modal is a full-screen backdrop that sits above the slide overlay, so it swallows
// clicks meant for the overlay. Preview keeps running once the modal is gone.
async function startPreview(page) {
  await page.getByRole('button', { name: '미리보기' }).click()
  await page.locator('.alert-popup-close').click()
  await expect(page.locator('.alert-settings-overlay')).toHaveCount(0)
}

async function stopPreview(page) {
  // The fullscreen slide intentionally swallows pointer events now that its on-screen exit
  // control is gone; let the test reach the settings-owned stop action programmatically.
  await page.locator('.monitoring-slide-overlay--whole-screen').evaluate((element) => {
    element.style.pointerEvents = 'none'
  })
  await page.getByLabel('설정').click()
  await page.getByRole('button', { name: '화면 전환', exact: true }).click()
  await page.getByRole('button', { name: '중지', exact: true }).click()
  await page.locator('.alert-popup-close').click()
}

test.describe('monitoring personal slideshow', () => {
  test.beforeEach(async ({ page }) => {
    await installMonitoringFixture(page)
  })

  test('whole-screen preview overlays the image above the still-mounted dashboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '이미지'])
    await page.getByLabel('표시할 이미지 (PNG/JPEG/WebP)').setInputFiles(SAMPLE_IMAGE)
    await startPreview(page)

    const overlay = page.locator('.monitoring-slide-overlay--whole-screen')
    await expect(overlay).toHaveClass(/is-visible/)
    await expect(overlay.locator('.monitoring-slide-overlay-image')).toBeVisible()
    await expect(page.locator('.dashboard-root')).toBeAttached()

    await expect(overlay).not.toHaveRole('button', { name: '화면 전환 종료' })
  })

  test('fades the outgoing slide away before revealing the live map', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '이미지'])
    await page.getByLabel('표시할 이미지 (PNG/JPEG/WebP)').setInputFiles(SAMPLE_IMAGE)
    await startPreview(page)

    const overlay = page.locator('.monitoring-slide-overlay--whole-screen')
    await expect(overlay.locator('.monitoring-slide-overlay-image')).toBeVisible()
    await stopPreview(page)

    // Returning to live must keep the outgoing layer mounted while it fades, so the map underneath
    // is revealed continuously instead of flashing off with the overlay.
    await expect(overlay).toHaveClass(/is-visible/)
    await expect(overlay.locator('.monitoring-slide-layer.is-leaving')).toHaveCount(1)
    await expect(overlay.locator('.monitoring-slide-layer.is-leaving')).toHaveCSS('animation-duration', '1s')
    await expect(overlay).not.toHaveClass(/is-visible/, { timeout: 1500 })
  })

  test('map-panel preview overlays only the map panel and keeps MapView mounted', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '이미지'])
    await page.getByLabel('전환 대상').selectOption('map-panel')
    await page.getByLabel('표시할 이미지 (PNG/JPEG/WebP)').setInputFiles(SAMPLE_IMAGE)
    await startPreview(page)

    const overlay = page.locator('.monitoring-mapbox-panel .monitoring-slide-overlay--map-panel')
    await expect(overlay).toHaveClass(/is-visible/)
    await expect(page.locator('.monitoring-mapbox-panel canvas').first()).toBeAttached()
    await expect(page.locator('.left-panel-body')).toBeVisible()

    await expect(overlay).not.toHaveRole('button', { name: '화면 전환 종료' })
  })

  test('weather bulletin slide shows the selected airport document over the map panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '기상정보'])
    await page.getByLabel('전환 대상').selectOption('map-panel')
    await startPreview(page)

    const overlay = page.locator('.monitoring-mapbox-panel .monitoring-slide-overlay--map-panel')
    await expect(overlay).toHaveClass(/is-visible/)

    const slide = overlay.locator('.monitoring-wxinfo-slide')
    await expect(slide).toBeVisible()
    // Default selection is RKSI, and the bulletin must carry its own issue time — the document can
    // be hours old and the reader has to be able to tell.
    await expect(slide.getByText('인천공항 기상정보(제07-51호)')).toBeVisible()
    await expect(slide.getByText('[ 2026년 07월 26일 06시 발표 ]')).toBeVisible()
    await expect(slide.getByText('▶ 위험 기상예보')).toBeVisible()
    await expect(page.locator('.monitoring-mapbox-panel canvas').first()).toBeAttached()
  })

  test('the bulletin is scaled to fit the panel instead of overflowing it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    // RKSI (~370 chars) and RKSS (~680) bracket the real range; both must fit, and the longer one
    // must land at a smaller scale.
    const measure = async (icao) => {
      await page.addInitScript((value) => {
        localStorage.setItem('selected_airport_monitoring', value)
      }, icao)
      await openSlideshowTab(page)
      await setSlides(page, ['지도', '기상정보'])
      await page.getByLabel('전환 대상').selectOption('map-panel')
      await startPreview(page)

      const slide = page.locator('.monitoring-wxinfo-slide')
      await expect(slide).toBeVisible()
      return slide.evaluate((box) => {
        const content = box.querySelector('.monitoring-wxinfo-slide-content')
        const scale = new DOMMatrixReadOnly(getComputedStyle(content).transform).a
        return {
          scale,
          scaledHeight: content.scrollHeight * scale,
          scaledWidth: content.scrollWidth * scale,
          panelHeight: box.clientHeight,
          panelWidth: box.clientWidth,
        }
      })
    }

    const short = await measure('RKSI')
    expect(short.scaledHeight).toBeLessThanOrEqual(short.panelHeight + 1)
    expect(short.scaledWidth).toBeLessThanOrEqual(short.panelWidth + 1)
    // Filling the panel is the whole point — a bulletin shrunk into a corner would be unreadable
    // from across the room.
    expect(short.scaledHeight).toBeGreaterThan(short.panelHeight * 0.5)

    const long = await measure('RKSS')
    expect(long.scaledHeight).toBeLessThanOrEqual(long.panelHeight + 1)
    expect(long.scaledWidth).toBeLessThanOrEqual(long.panelWidth + 1)
    expect(long.scale).toBeLessThan(short.scale)
  })

  test('an airport with no bulletin is skipped rather than shown blank', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await page.route('**/api/airport-info', (route) => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ content_hash: 'empty', airports: {} }) })
    })

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '기상정보'])
    await page.getByLabel('전환 대상').selectOption('map-panel')
    await startPreview(page)

    const overlay = page.locator('.monitoring-mapbox-panel .monitoring-slide-overlay--map-panel')
    await expect(overlay).not.toHaveClass(/is-visible/)
    await expect(page.locator('.monitoring-wxinfo-slide')).toHaveCount(0)
  })

  test('the slide effect moves the outgoing and incoming slides together, one direction', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '기상정보', '이미지'])
    await page.getByLabel('기상정보 머무는 시간(초)').fill('5')
    await page.getByLabel('전환 대상').selectOption('map-panel')
    await page.getByLabel('전환 효과').selectOption('slide')
    await page.getByLabel('전환 애니메이션 속도(ms)').fill('2000')
    await page.getByLabel('표시할 이미지 (PNG/JPEG/WebP)').setInputFiles(SAMPLE_IMAGE)
    await startPreview(page)

    const overlay = page.locator('.monitoring-mapbox-panel .monitoring-slide-overlay--map-panel')
    await expect(overlay.locator('.monitoring-wxinfo-slide')).toBeVisible()

    // The overlay-to-overlay step is the one a single sliding panel cannot animate at all: both
    // slides sit in the same overlay, so without a second layer the content just swaps.
    await expect(overlay.locator('.monitoring-slide-layer.is-leaving')).toHaveCount(1, { timeout: 15000 })

    const pair = await overlay.evaluate((el) => {
      const read = (node) => {
        const style = getComputedStyle(node)
        return {
          x: new DOMMatrixReadOnly(style.transform).e,
          durationMs: style.animationDuration,
          easing: style.animationTimingFunction,
        }
      }
      return {
        leaving: read(el.querySelector('.monitoring-slide-layer.is-leaving')),
        entering: read(el.querySelector('.monitoring-slide-layer.is-entering')),
        width: el.clientWidth,
      }
    })

    // Both on screen at once, travelling the same way: outgoing already left of centre, incoming
    // still right of it.
    expect(pair.leaving.x).toBeLessThanOrEqual(0)
    expect(pair.entering.x).toBeGreaterThan(pair.leaving.x)
    expect(pair.entering.x).toBeGreaterThanOrEqual(0)
    // A rigid strip: identical duration and curve, or the two frames tear apart mid-move.
    expect(pair.entering.durationMs).toBe(pair.leaving.durationMs)
    expect(pair.entering.easing).toBe(pair.leaving.easing)

    // Settles flush, and the outgoing layer is dropped rather than left stacked on the panel.
    await expect(overlay.locator('.monitoring-slide-layer.is-leaving')).toHaveCount(0, { timeout: 15000 })
    await expect
      .poll(() => overlay.locator('.monitoring-slide-layer.is-entering')
        .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).e))
      .toBe(0)
  })

  test('an idle stage lets the map underneath take clicks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, ['지도', '기상정보'])
    await page.getByLabel('전환 대상').selectOption('map-panel')
    await page.locator('.alert-popup-close').click()

    const overlay = page.locator('.monitoring-mapbox-panel .monitoring-slide-overlay--map-panel')
    await expect(overlay).not.toHaveClass(/is-visible/)
    await expect(overlay.locator('.monitoring-slide-layer')).toHaveCount(0)
    await expect(overlay).toHaveCSS('pointer-events', 'none')
  })

  test('every slide switched off is rejected instead of leaving a blank rotation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'slideshow is unavailable on the mobile layout (FR-014)')

    await openSlideshowTab(page)
    await setSlides(page, [])
    await expect(page.getByText('보여줄 장면을 최소 한 개 선택하세요.')).toBeVisible()
  })

  test('mobile: slideshow tab is unavailable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test (FR-014)')

    await openSlideshowTab(page)
    await expect(page.getByLabel('화면 전환 사용')).toBeDisabled()
  })
})
