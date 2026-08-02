import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import {
  TERRAIN_HAZARD_LAYER,
  TERRAIN_HAZARD_SOURCE,
  terrainHazardPaint,
} from '../../src/features/weather-overlays/lib/terrainHazardLayer.js'

// 지형 근접 색칠(Hazard Advisor 방식) 계약.
// 화면 증거는 "칠해진 픽셀"로 잡는다 — 기준 이미지 비교는 지형 타일 로딩 순서에 흔들리지만,
// "기준 고도 3,000ft에서는 지리산이 칠해지고 8,000ft에서는 한 점도 안 칠해진다"와
// "대마도(후쿠오카 FIR)는 어느 고도에서도 칠해지지 않는다"는 자료가 바뀌지 않는 한 참이다.

// 지리산(국내)과 대마도(FIR 밖)가 한 화면에 들어오는 카메라.
const KOREA_STRAIT = { center: [128.4, 35.0], zoom: 7.2 }
const JIRISAN = [127.73, 35.34]
const TSUSHIMA = [129.33, 34.32]

async function openTerrainLayer(page, testInfo) {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__map?.isStyleLoaded?.())
  await page.evaluate((view) => window.__map.jumpTo(view), KOREA_STRAIT)
  const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  await page.locator(`[aria-label="${weatherEntry}"]`).first().click()
  await page.getByRole('button', { name: '지형 근접' }).click()
}

// 지도 캔버스 픽셀 읽기 — mapbox는 preserveDrawingBuffer가 꺼져 있어 render 콜백 안에서만
// 버퍼가 살아 있다. 그 순간에 dataURL로 떠서 2D 캔버스로 옮겨 픽셀을 센다.
// 함께 넘긴 좌표들의 캔버스 픽셀 위치도 같이 돌려준다(CSS 픽셀이 아니라 버퍼 기준).
async function grabPixels(page, points) {
  return page.evaluate((coords) => new Promise((resolve) => {
    const map = window.__map
    map.once('render', () => {
      const canvas = map.getCanvas()
      const scale = canvas.width / canvas.clientWidth
      const spots = coords.map((lngLat) => {
        const point = map.project(lngLat)
        return { x: Math.round(point.x * scale), y: Math.round(point.y * scale) }
      })
      const url = canvas.toDataURL()
      const image = new Image()
      image.onload = () => {
        const readback = document.createElement('canvas')
        readback.width = image.width
        readback.height = image.height
        const ctx = readback.getContext('2d')
        ctx.drawImage(image, 0, 0)
        resolve({
          width: image.width,
          data: Array.from(ctx.getImageData(0, 0, image.width, image.height).data),
          spots,
        })
      }
      image.src = url
    })
    map.triggerRepaint()
  }), points)
}

function differs(before, after, index) {
  return Math.abs(before.data[index] - after.data[index]) > 16
    || Math.abs(before.data[index + 1] - after.data[index + 1]) > 16
    || Math.abs(before.data[index + 2] - after.data[index + 2]) > 16
}

function changedFraction(before, after) {
  let changed = 0
  for (let i = 0; i < before.data.length; i += 4) if (differs(before, after, i)) changed += 1
  return changed / (before.data.length / 4)
}

// 좌표 하나가 두 화면 사이에서 색이 달라졌는가. 안티에일리어싱을 피하려고 3x3을 본다.
function spotChanged(before, after, spotIndex) {
  const { x, y } = before.spots[spotIndex]
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (differs(before, after, ((y + dy) * before.width + (x + dx)) * 4)) return true
    }
  }
  return false
}

async function capture(page, testInfo, name) {
  const file = testInfo.outputPath(name)
  await page.screenshot({ path: file })
  await testInfo.attach(name, { path: file, contentType: 'image/png' })
}

// 공용 고도 레일에서 기준 고도를 맨 위(8,000ft — 한라산 6,388ft + 여유)로 올린다.
async function raiseAltitudeToTop(page) {
  const rail = page.getByRole('slider', { name: '지형 근접 기준 고도' })
  await rail.focus()
  for (let i = 0; i < 15; i += 1) await rail.press('ArrowUp')
  await page.waitForFunction(() => {
    const color = window.__map.getPaintProperty('terrain-hazard-shade', 'raster-color')
    return color?.some?.((part) => Math.abs(part - (8000 * 0.3048 - 100 * 0.3048)) < 0.01)
  })
  await page.waitForTimeout(600)
}

test.describe('terrain-hazard', () => {
  test.setTimeout(150_000)
  test('기준 고도에 따라 FIR 안쪽 지형만 칠해진다', async ({ page }, testInfo) => {
    const tileStatuses = []
    const mapboxTerrainRequests = []
    page.on('response', (response) => {
      if (response.url().includes('/api/terrain/rgb/')) tileStatuses.push(response.status())
      // 베이스맵이 쓰는 mapbox-terrain-v3/dem은 우리와 무관하다. 예전 구현이 쓰던
      // terrain-rgb 표고 타일만 없어야 한다.
      if (response.url().includes('terrain-rgb')) mapboxTerrainRequests.push(response.url())
    })

    await openTerrainLayer(page, testInfo)
    await page.waitForFunction(() => !!window.__map.getLayer('terrain-hazard-shade'))
    await page.waitForFunction(() => window.__map.areTilesLoaded())
    await page.waitForTimeout(1200)

    // 표고 타일은 우리 백엔드에서만 받는다.
    expect(tileStatuses.length).toBeGreaterThan(0)
    expect(tileStatuses.every((status) => status === 200)).toBe(true)
    expect(mapboxTerrainRequests).toEqual([])

    // 색 규칙이 화면의 레이어에 그대로 들어가 있는가.
    const paint = await page.evaluate(
      (layerId) => window.__map.getPaintProperty(layerId, 'raster-color'),
      TERRAIN_HAZARD_LAYER,
    )
    expect(paint).toEqual(terrainHazardPaint(3000)['raster-color'])

    const spots = [JIRISAN, TSUSHIMA]
    const at3000 = await grabPixels(page, spots)
    await capture(page, testInfo, 'terrain-3000ft.png')

    // 8,000ft — 한라산(6,388ft)조차 1,000ft보다 더 아래라 한 점도 칠하지 않는다.
    await raiseAltitudeToTop(page)
    const at8000 = await grabPixels(page, spots)
    await capture(page, testInfo, 'terrain-8000ft.png')

    // 이 카메라에서 3,000ft에 걸리는 지형은 소백·지리산 능선뿐이라 면적 자체는 작다.
    expect(changedFraction(at8000, at3000)).toBeGreaterThan(0.003)
    expect(spotChanged(at8000, at3000, 0)).toBe(true)   // 지리산 — 3,000ft에서 칠해짐
    expect(spotChanged(at8000, at3000, 1)).toBe(false)  // 대마도 — 어느 고도에서도 그대로

    // 레이어를 끄면 소스까지 사라진다 (꺼둔 상태에서 타일 요청이 나가지 않도록).
    await page.getByRole('button', { name: '지형 근접' }).click()
    await expect.poll(() => page.evaluate(
      (sourceId) => !!window.__map.getSource(sourceId),
      TERRAIN_HAZARD_SOURCE,
    )).toBe(false)

    const off = await grabPixels(page, spots)
    expect(changedFraction(off, at8000)).toBeLessThan(0.01)
  })
})
