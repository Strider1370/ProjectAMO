import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const KMZ = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kmz', import.meta.url))
const KML = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kml', import.meta.url))

// 계약 등록부의 규칙: 이름만으로 찾지 말고 소유 패널·클래스로 좁힌다.
// 사이드바 버튼과 패널이 같은 aria-label('내 지도')을 쓰므로 반드시 클래스로 잡는다.
const PANEL = '.my-map-panel'

// 지도 소스의 데이터를 단언할 때 querySourceFeatures를 쓰지 않는다. 그것은 이미 그려진
// 타일을 읽어 setData 직후를 반영하지 못한다. getSource(id).serialize().data를 본다.
const sourceCount = (page) => page.evaluate(() => {
  const src = window.__map?.getSource('my-map-src')
  return src ? (src.serialize().data.features?.length ?? 0) : -1
})

// 폴더를 끄면 소스에서 도형이 빠지는 게 아니라 레이어 필터에서 그 폴더가 빠진다.
// 그래서 "지금 실제로 그려지는 도형 수"는 소스 × 필터로 구해야 한다.
const drawnCount = (page) => page.evaluate(() => {
  const map = window.__map
  const src = map?.getSource('my-map-src')
  if (!src) return -1
  const filter = map.getFilter('my-map-fill')          // ['all', geom, ['in', ['get','__folder'], ['literal', ids]]]
  const visible = new Set(filter?.[2]?.[2]?.[1] ?? [])
  const features = src.serialize().data.features ?? []
  return features.filter((f) => visible.has(f.properties?.__folder)).length
})

async function openApp(page) {
  // lastSeenVersion이 CURRENT_VERSION과 같아야 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 투어까지 껐다 — 둘 다 사이드바를 덮어 클릭을 가로챈다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

async function openMyMap(page) {
  await openApp(page)
  await page.getByRole('button', { name: '내 지도', exact: true }).click()
  await expect(page.locator(PANEL)).toBeVisible()
}

async function loadFixture(page) {
  await page.getByTestId('my-map-file').setInputFiles(KMZ)
  await expect(page.getByTestId('my-map-tree')).toBeVisible()
}

test.describe('my-map', () => {
  // 모바일에는 아직 '내 지도' 진입점이 없다(MobileMapOverlay에 항공정보·기상정보·ADS-B만).
  // 비행 전 계획 작업이라 큰 화면을 전제한다 — 1판 범위 밖임을 여기 남긴다.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '모바일에는 내 지도 진입점이 없다 (1판 범위 밖)')
  })

  test('파일을 올리면 도형이 지도에 올라가고 폴더 목록이 뜬다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)

    const tree = page.getByTestId('my-map-tree')
    // 접힌 상태 — 최상위 둘만 보인다
    await expect(tree.getByText('RKTA TAEAN', { exact: true })).toBeVisible()
    await expect(tree.getByText('공역', { exact: true })).toBeVisible()
    await expect(tree.getByText('출항절차', { exact: true })).toHaveCount(0)
    // 지점 1 + 선 1 + 면 1
    await expect.poll(() => sourceCount(page)).toBe(3)
    await expect.poll(() => drawnCount(page)).toBe(3)
  })

  test('폴더를 끄면 그 도형이 지도에서 빠진다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)
    await expect.poll(() => drawnCount(page)).toBe(3)

    const tree = page.getByTestId('my-map-tree')
    // '공역' 폴더를 끈다 — 면 하나가 빠져야 한다.
    await tree.getByRole('button', { name: '공역', exact: true }).click()
    await expect.poll(() => drawnCount(page)).toBe(2)
  })

  test('상위 폴더를 끄면 하위 도형도 함께 빠진다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)
    await expect.poll(() => drawnCount(page)).toBe(3)

    const tree = page.getByTestId('my-map-tree')
    // RKTA TAEAN은 직접 가진 지점 1개 + 하위 '출항절차'의 선 1개를 갖는다.
    await tree.getByRole('button', { name: 'RKTA TAEAN', exact: true }).click()
    await expect.poll(() => drawnCount(page)).toBe(1)
  })

  test('찾기에 이름을 치면 맞는 폴더와 조상만 남는다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)

    await page.getByTestId('my-map-search').fill('출항')
    const tree = page.getByTestId('my-map-tree')
    await expect(tree.getByText('출항절차', { exact: true })).toBeVisible()
    // 조상은 따라온다 — 안 그러면 결과가 화면에 들어갈 자리가 없다.
    await expect(tree.getByText('RKTA TAEAN', { exact: true })).toBeVisible()
    await expect(tree.getByText('공역', { exact: true })).toHaveCount(0)
    // 찾기는 켜고 끈 상태를 바꾸지 않는다.
    await expect.poll(() => drawnCount(page)).toBe(3)
  })

  test('다시 열면 파일 목록은 남고 체크는 꺼져 있다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '내 지도', exact: true }).click()
    await expect(page.locator(PANEL)).toBeVisible()

    await expect(page.getByTestId('my-map-files')).toContainText('folders.kmz')
    // 파일 줄에는 켜기 토글과 지우기 버튼이 둘 다 있다. 클래스로 토글만 집는다.
    await expect(page.locator('.my-map-file-toggle')).toHaveAttribute('aria-pressed', 'false')
    // 켜지 않았으므로 폴더 목록도, 지도 도형도 없다.
    await expect(page.getByTestId('my-map-tree')).toHaveCount(0)
  })

  test('브리핑 경로 불러오기는 지도 파일을 거부하고 내 지도로 안내한다', async ({ page }, testInfo) => {
    await openApp(page)
    await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
    if (testInfo.project.name !== 'mobile') {
      await page.getByRole('tab', { name: 'VFR', exact: true }).click()
    }
    await page.getByTestId('route-import-file').setInputFiles(KML)
    await expect(page.getByText(/지도로 보입니다/)).toBeVisible()
    await expect(page.getByText(/내 지도/)).toBeVisible()
  })

  test('내 지도는 기상보다 아래 슬롯에 놓인다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)

    // 기상 위험기상·낙뢰는 'top' 슬롯을 쓰고 이용자 지도는 'middle'을 쓴다. 조종사는
    // 기상을 보러 왔고 자기 지도는 그 바탕이다. 실제 자료(레이더)를 켜서 확인하려면
    // 시험 환경에 레이더 자료가 있어야 하는데 없으면 타일이 비활성이라 못 누른다.
    // 그래서 자료 유무와 무관한 슬롯 배정을 단언한다 — 순서를 만드는 것이 이것이다.
    const slots = await page.evaluate(() => {
      const layers = window.__map?.getStyle()?.layers ?? []
      const of = (id) => layers.find((l) => l.id === id)?.slot ?? null
      return { fill: of('my-map-fill'), line: of('my-map-line'), circle: of('my-map-circle'), label: of('my-map-label') }
    })
    expect(slots).toEqual({ fill: 'middle', line: 'middle', circle: 'middle', label: 'middle' })

    // 슬롯이 다르면 getStyle().layers의 배열 순서로는 위아래를 가릴 수 없다 —
    // Mapbox가 bottom < middle < top으로 정하지 배열 순서로 정하지 않는다. 실제로
    // 'top' 레이어가 배열에서 먼저 나오는데도 화면에서는 위에 그려진다(사람 눈으로 확인).
    // 그래서 여기서는 슬롯 배정만 단언한다. 순서를 만드는 것이 그것이기 때문이다.
  })

  test('기존 경로가 그대로 동작한다', async ({ page }, testInfo) => {
    // 사이드바와 MapView를 건드렸으므로 기존 진입점이 멀쩡한지 확인한다.
    const paths = testInfo.project.name === 'mobile' ? ['/'] : ['/', '/monitoring', '/test']
    for (const path of paths) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      expect(response?.status()).toBeLessThan(400)
      // 화면들이 지연 로딩(lazy)이라 첫 진입에서 청크를 받아오는 시간이 걸린다.
      await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0,
        null, { timeout: 30000 })
    }
  })
})
