import { createPersonalMap, openExtraTools, openGroupForm, importMapFile, deleteCurrentMap } from './my-map-helpers.mjs'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const KMZ = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kmz', import.meta.url))
const KML = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kml', import.meta.url))

// 계약 등록부의 규칙: 이름만으로 찾지 말고 소유 패널·클래스로 좁힌다.
// 사이드바 버튼과 패널이 같은 aria-label('내 지도')을 쓰므로 반드시 클래스로 잡는다.
const PANEL = '.my-map-panel-content'
// 지도 제목은 본문이 아니라 패널 헤더(데스크톱)·시트 제목(모바일)에 있다.
// 제목까지 확인하려면 본문이 아닌 패널 전체를 잡아야 한다.
const PANEL_ROOT = '.my-map-panel, .mobile-sheet'

// 지도 소스의 데이터를 단언할 때 querySourceFeatures를 쓰지 않는다. 그것은 이미 그려진
// 타일을 읽어 setData 직후를 반영하지 못한다. getSource(id).serialize().data를 본다.
const sourceCount = (page) => page.evaluate(() => {
  const src = window.__map?.getSource('my-map-src')
  return src ? (src.serialize().data.features?.length ?? 0) : -1
})

const savedPersonalMap = (page, name) => page.evaluate(async (name) => {
  const db = await new Promise((resolve) => { const request = indexedDB.open('projectamo-my-map-account-v1'); request.onsuccess = () => resolve(request.result) })
  const rows = await new Promise((resolve) => { const request = db.transaction('completed').objectStore('completed').getAll(); request.onsuccess = () => resolve(request.result) })
  db.close()
  return rows.map((row) => row.document.document ?? row.document).find((document) => document.name === name) ?? null
}, name)

// 폴더를 끄면 소스에서 도형이 빠지는 게 아니라 레이어 필터에서 그 폴더가 빠진다.
// 그래서 "지금 실제로 그려지는 도형 수"는 소스 × 필터로 구해야 한다.
const drawnCount = (page) => page.evaluate(() => {
  const map = window.__map
  const src = map?.getSource('my-map-src')
  if (!src) return -1
  const visibility = map.getFilter('my-map-fill')?.[1]
  if (!visibility) return -1
  const evaluate = (expr, props) => {
    if (!Array.isArray(expr)) return expr
    const [op, ...args] = expr
    if (op === 'literal') return args[0]
    if (op === 'get') return props[args[0]]
    if (op === 'all') return args.every((arg) => evaluate(arg, props))
    if (op === '!') return !evaluate(args[0], props)
    if (op === 'in') return evaluate(args[1], props).includes(evaluate(args[0], props))
    throw new Error(`Unexpected visibility operator ${op}`)
  }
  return (src.serialize().data.features ?? []).filter((f) => evaluate(visibility, f.properties)).length
})

async function openApp(page) {
  page.on('pageerror', (error) => console.error(error.stack))
  // lastSeenVersion이 CURRENT_VERSION과 같아야 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 투어까지 껐다 — 둘 다 사이드바를 덮어 클릭을 가로챈다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

async function enterMyMap(page) {
  if (page.viewportSize().width < 720) {
    await page.getByRole('button', { name: '더보기', exact: true }).click()
  }
  await page.getByRole('button', { name: '내 지도', exact: true }).click()
}

async function openMyMap(page) {
  await openApp(page)
  await enterMyMap(page)
  await expect(page.locator(PANEL)).toBeVisible()
}

async function loadFixture(page) {
  await importMapFile(page, KMZ)
  await expect(page.getByTestId('my-map-tree')).toBeVisible()
}

test.describe('my-map', () => {
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
    await tree.getByRole('button', { name: '공역 숨기기', exact: true }).click()
    await expect.poll(() => drawnCount(page)).toBe(2)
  })

  test('상위 폴더를 끄면 하위 도형도 함께 빠진다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)
    await expect.poll(() => drawnCount(page)).toBe(3)

    const tree = page.getByTestId('my-map-tree')
    // RKTA TAEAN은 직접 가진 지점 1개 + 하위 '출항절차'의 선 1개를 갖는다.
    await tree.getByRole('button', { name: 'RKTA TAEAN 숨기기', exact: true }).click()
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

  test('다시 열면 원본과 조회 표시 설정이 복원된다', async ({ page }) => {
    await openMyMap(page)
    await loadFixture(page)
    await page.getByRole('button', { name: '공역 숨기기', exact: true }).click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await enterMyMap(page)
    await expect(page.getByTestId('my-map-tree')).toBeVisible()
    await expect.poll(() => sourceCount(page)).toBe(3)
    await expect.poll(() => drawnCount(page)).toBe(2)
    await page.getByRole('button', { name: '목록', exact: true }).click()
    await expect(page.getByTestId('my-map-files')).toContainText('계약용')
  })

  test('배경지도 두 번 변경 후에도 선택과 숨김이 유지된다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '배경 전환 UI 회귀는 넓은 화면에서 실행')
    await openMyMap(page)
    await loadFixture(page)
    await page.getByTestId('my-map-search').fill('R77')
    await page.getByTestId('my-map-tree').getByRole('button', { name: 'R77', exact: true }).click()
    await expect(page.locator('.my-map-detail')).toContainText('R77')
    await page.getByTestId('my-map-search').fill('')
    await page.getByRole('button', { name: 'RKTA TAEAN 숨기기', exact: true }).click()
    for (const name of [/^위성/, /^기본/]) {
      await page.getByRole('button', { name: /지도 선택$/ }).click()
      await page.getByRole('menuitemradio', { name }).click()
      await expect.poll(() => sourceCount(page)).toBe(3)
      await expect.poll(() => drawnCount(page)).toBe(1)
      await expect(page.locator('.my-map-detail')).toContainText('R77')
    }
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


// The original files remain outside the repository; opt in to local evidence runs.
test('my-map 실제 KMZ의 논리 항목·가변 공역 상세·대량 표시', async ({ page }, testInfo) => {
  test.skip(process.env.MY_MAP_REAL_FILES !== '1' || testInfo.project.name !== 'desktop', '실제 로컬 파일 검증은 명시적 실행')
  const files = [
    { path: '/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz', count: 56980, name: 'SEL' },
    { path: "/mnt/c/Users/Jond Doe/Downloads/공역정보 지도자료 및 사용방법('26년 5차 AIP 기준)/공역정보(AIRAC AIP 5_26 기준).kmz", count: 756, name: 'CHEONGJU' },
  ]
  for (const file of files) expect(existsSync(file.path), file.path).toBe(true)
  test.setTimeout(120000)
  await openMyMap(page)
  let cumulative = 0
  for (const file of files) {
    const started = Date.now()
    await importMapFile(page, file.path)
    cumulative += file.count
    await expect.poll(() => sourceCount(page), { timeout: 45000 }).toBe(cumulative)
    await page.getByTestId('my-map-search').fill(file.name)
    await page.getByTestId('my-map-tree').getByRole('button', { name: file.name, exact: true }).click()
    await expect(page.locator('.my-map-detail')).toContainText(file.name)
    if (file.name === 'CHEONGJU') {
      await expect(page.locator('.my-map-detail')).toContainText('5000 Feet Height')
      await page.getByText('전체 원본 속성', { exact: true }).click()
      await expect(page.getByRole('table', { name: '원본 메타데이터', exact: true })).toContainText('DistVertUpper_Val')
    }
    await testInfo.attach(`${file.name}-load-time`, { body: String(Date.now() - started), contentType: 'text/plain' })
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${file.name}-detail.png`) })
  }

  // 실제 공역 속성이 개인 편집본·사본까지 바이트 값(0/false/긴 문자열)을 잃지 않고 간다.
  await page.getByTestId('my-map-file-menu').click()
  await page.getByRole('menuitem', { name: '편집본으로 가져오기', exact: true }).click()
  const convert = page.getByRole('dialog', { name: '편집본으로 가져오기', exact: true })
  await convert.getByRole('textbox', { name: '편집본 이름', exact: true }).fill('실제 공역 편집본')
  await expect(convert.getByRole('button', { name: '편집본 만들기', exact: true })).toBeEnabled({ timeout: 45000 })
  await convert.getByRole('button', { name: '편집본 만들기', exact: true }).click()
  await expect(page.locator(PANEL_ROOT)).toContainText('실제 공역 편집본')
  const personal = await savedPersonalMap(page, '실제 공역 편집본')
  const cheongju = personal.items.find((item) => item.name === 'CHEONGJU')
  expect(cheongju.source.metadataEntries.find((entry) => entry.key === 'DistVertUpper_Val')?.value).toBe('5000')
  await page.getByTestId('my-map-file-menu').click()
  await page.getByRole('menuitem', { name: '지도 복제', exact: true }).click()
  const duplicate = page.getByRole('dialog', { name: '지도 복제', exact: true })
  await duplicate.getByRole('textbox', { name: '사본 이름', exact: true }).fill('실제 공역 사본')
  await duplicate.getByRole('button', { name: '복제하기', exact: true }).click()
  const copy = await savedPersonalMap(page, '실제 공역 사본')
  expect(copy.items.find((item) => item.name === 'CHEONGJU').source).toEqual(cheongju.source)
})

test('my-map 새 지도 작성·형태 취소·미완성 이탈', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '작성 기본 흐름은 데스크톱에서 검증')
  test.setTimeout(90000)
  await openMyMap(page)
  await createPersonalMap(page, '작성 검증 지도')
  await expect(page.getByRole('region', { name: '내 지도 편집', exact: true })).toBeVisible()
  await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
  await page.evaluate(() => window.__map.jumpTo({ center: [127,37], zoom: 7 }))
  const clickMap = async (x, y) => page.locator('.mapboxgl-canvas').click({ position: { x, y } })
  await page.getByRole('button', { name: '점', exact: true }).click()
  await page.getByLabel('지점 연속 추가', { exact: true }).check()
  await clickMap(740, 280)
  await clickMap(810, 320)
  await expect.poll(() => sourceCount(page)).toBe(2)
  await page.getByRole('button', { name: '추가 마침', exact: true }).click()
  await page.getByRole('button', { name: '선', exact: true }).click()
  await clickMap(800, 380)
  await page.getByRole('button', { name: '기상정보', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('계속 그리기')
  await page.getByRole('button', { name: '계속 그리기', exact: true }).click()
  await clickMap(870, 420)
  await page.getByRole('button', { name: '도형 완료', exact: true }).click()
  await expect.poll(() => sourceCount(page)).toBe(3)
  const before = await page.evaluate(() => window.__map.getSource('my-map-src').serialize().data)
  await page.getByRole('button', { name: '지도에서 위치·형태 수정', exact: true }).click()
  const canvas = page.locator('.mapboxgl-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + 800, box.y + 380)
  await page.mouse.down()
  await page.mouse.move(box.x + 830, box.y + 330, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  expect(await page.evaluate(() => window.__map.getSource('my-map-src').serialize().data)).toEqual(before)
  await page.getByRole('button', { name: '면', exact: true }).click()
  await clickMap(760, 400)
  await page.getByRole('button', { name: '기상정보', exact: true }).click()
  await page.getByRole('button', { name: '그냥 나가기', exact: true }).click()
  await expect(page.getByRole('region', { name: '내 지도 편집', exact: true })).toHaveCount(0)
  await expect.poll(() => sourceCount(page)).toBe(3)
  await page.getByRole('button', { name: '내 지도', exact: true }).click()
  await expect(page.locator('.my-map-panel')).toContainText('3개 항목')
  await expect(page.getByRole('button', { name: '기관에 공유', exact: true })).toHaveCount(0)
  await expect.poll(() => sourceCount(page)).toBe(3)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('authoring-return-to-view.png') })
})

test('my-map 그룹 삭제 뒤 그룹 없는 항목의 보기·편집 순서 유지', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 그룹 정렬 회귀')
  await openMyMap(page)
  await createPersonalMap(page, '그룹 정렬 검증')
  await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
  await page.getByRole('button', { name: '점', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 740, y: 280 } })
  await expect.poll(() => sourceCount(page)).toBe(1)
  await page.getByRole('button', { name: '← 항목 목록', exact: true }).click()
  for (const name of ['a', 'b', 'c']) {
    await openGroupForm(page)
    await page.getByRole('textbox', { name: '새 그룹 이름', exact: true }).fill(name)
    await page.getByRole('button', { name: '그룹 추가', exact: true }).click()
  }
  await page.getByRole('combobox', { name: 'a 그룹 순서', exact: true }).selectOption('__ungrouped__')
  await expect(page.locator('.my-map-editor-group-name')).toHaveText(['a 0', '그룹 없는 항목 1', 'b 0', 'c 0'])
  await page.getByRole('button', { name: 'a 그룹 삭제', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.locator('.my-map-editor-group-name')).toHaveText(['그룹 없는 항목 1', 'b 0', 'c 0'])
  await page.getByRole('button', { name: '편집 마침', exact: true }).click()
  await expect(page.locator('.my-map-group-row .my-map-tree-name > span')).toHaveText(['그룹 없는 항목', 'b', 'c'])
})

test('my-map 기기 저장·새로고침·미완성 초안 재개', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 작성 복구 흐름')
  test.setTimeout(90000)
  await openMyMap(page)
  await createPersonalMap(page, '기기 복구 지도')
  await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
  await page.evaluate(() => window.__map.jumpTo({ center: [127, 37], zoom: 7 }))
  await page.getByRole('button', { name: '점', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 750, y: 280 } })
  await expect.poll(() => sourceCount(page)).toBe(1)
  await expect(page.getByText('이 기기에 저장됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '선', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 810, y: 350 } })
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve) => { const request = indexedDB.open('projectamo-my-map-account-v1'); request.onsuccess = () => resolve(request.result) })
    const rows = await new Promise((resolve) => { const request = db.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess = () => resolve(request.result) })
    db.close()
    return rows.some((row) => row.accountKey === 'guest:browser' && row.document.draft?.coordinates.length === 1)
  })
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterMyMap(page)
  await expect.poll(() => sourceCount(page)).toBe(1)
  await page.getByRole('button', { name: '작업 재개', exact: true }).click()
  await expect(page.getByRole('button', { name: '도형 완료', exact: true })).toBeVisible()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 870, y: 450 } })
  await page.getByRole('button', { name: '도형 완료', exact: true }).click()
  await expect.poll(() => sourceCount(page)).toBe(2)
  await expect(page.getByText('이 기기에 저장됨', { exact: true })).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterMyMap(page)
  await expect.poll(() => sourceCount(page)).toBe(2)
  await expect(page.getByRole('button', { name: '작업 재개', exact: true })).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('local-recovery-view.png') })
})

test('my-map 계정 자동저장·별도 계정 격리·다시 열기', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 저장 화면 계약, HTTP 권한은 별도 API 테스트')
  test.setTimeout(90000)
  let accountId = 101
  const maps = new Map([[101, new Map()], [202, new Map()]])
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: accountId, username: `map-user-${accountId}`, role: 'pilot', display_name: '지도 검증' } }))
  await page.route(/\/api\/me\/maps(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const request = route.request(), method = request.method(), id = new URL(request.url()).pathname.split('/')[4]
    const owned = maps.get(accountId)
    if (method === 'GET' && !id) return route.fulfill({ json: { maps: [...owned.values()].map((doc) => ({ id: doc.id, name: doc.name, revision: doc.revision, itemCount: doc.items.length, groupCount: doc.groups.length })) } })
    if (method === 'GET') return route.fulfill({ status: owned.has(id) ? 200 : 404, json: { document: owned.get(id), error: owned.has(id) ? undefined : 'not_found' } })
    const { snapshot, expectedRevision } = request.postDataJSON()
    if (method === 'PUT' && owned.get(id)?.revision !== expectedRevision) return route.fulfill({ status: 409, json: { error: 'revision_conflict' } })
    const document = { ...snapshot, revision: method === 'POST' ? 1 : expectedRevision + 1 }
    owned.set(document.id, document)
    return route.fulfill({ json: { document } })
  })
  await openMyMap(page)
  await createPersonalMap(page, '첫 계정의 지도')
  await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
  await page.getByRole('button', { name: '점', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 760, y: 300 } })
  await expect.poll(() => [...maps.get(101).values()][0]?.items.length).toBe(1)
  await expect(page.getByRole('region', { name: '지도 저장 상태' })).toContainText('계정에 저장됨')
  accountId = 202
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterMyMap(page)
  await expect(page.getByRole('button', { name: /^(새 지도 그리기|새 지도)$/ })).toBeEnabled()
  await expect(page.locator(PANEL_ROOT)).not.toContainText('첫 계정의 지도')
  await expect.poll(() => sourceCount(page)).toBe(0)
  accountId = 101
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterMyMap(page)
  await expect(page.locator(PANEL_ROOT)).toContainText('첫 계정의 지도')
  await expect.poll(() => sourceCount(page)).toBe(1)
})

test('my-map 변환 미리보기·개인 편집본·KML 내보내기', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 파일 메뉴 흐름')
  test.setTimeout(90000)
  await openMyMap(page)
  await loadFixture(page)

  // 가져온 원본에서만 편집본 변환을 제공한다.
  await page.getByTestId('my-map-file-menu').click()
  await page.getByRole('menuitem', { name: '편집본으로 가져오기', exact: true }).click()
  const convert = page.getByRole('dialog')
  await expect(convert).toContainText('대상 항목')
  await expect(convert).toContainText('그대로 포함')
  await expect(convert).toContainText('제외')
  await expect(convert.getByText('중첩 폴더', { exact: false })).toBeVisible()
  await page.getByLabel('편집본 이름', { exact: true }).fill('편집본 확인')
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('convert-preview.png') })
  await page.getByRole('button', { name: '편집본 만들기', exact: true }).click()

  // 원본은 남고 개인 지도가 새로 생긴다.
  await expect(page.locator(PANEL_ROOT)).toContainText('편집본 확인')
  await page.getByRole('button', { name: '목록', exact: true }).click()
  const files = page.getByTestId('my-map-files')
  // 원본은 가져온 지도로 그대로 남고 개인 편집본이 따로 생긴다.
  await expect(files.locator('.my-map-library-section', { hasText: '가져온 지도' })).toContainText('계약용')
  await expect(files.locator('.my-map-library-section', { hasText: '개인 지도' })).toContainText('편집본 확인')

  // 개인 편집본에서 범위를 골라 내보낸다.
  await files.getByRole('button', { name: /편집본 확인/ }).first().click()
  await page.getByTestId('my-map-file-menu').click()
  await page.getByRole('menuitem', { name: 'KML로 내보내기', exact: true }).click()
  const exportDialog = page.getByRole('dialog')
  await expect(exportDialog).toContainText('숨긴 항목도 범위에 들어가면 함께 내보냅니다')
  await exportDialog.getByRole('radio', { name: '선택한 폴더', exact: false }).check()
  await expect(exportDialog.getByLabel('내보낼 폴더', { exact: true })).toBeVisible()
  await exportDialog.getByRole('combobox', { name: '내보낼 폴더', exact: true }).selectOption({ label: '공역' })
  await expect(exportDialog.locator('.my-map-preview-counts strong')).toHaveText(['1', '1', '0', '0'])
  await exportDialog.getByRole('radio', { name: '지도 전체', exact: true }).check()
  await expect(exportDialog.locator('.my-map-preview-counts strong')).toHaveText(['3', '3', '0', '0'])
  const download = page.waitForEvent('download')
  await exportDialog.getByRole('button', { name: '내보내기', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('편집본 확인.kml')
})

test('my-map 기존 그리기 자료 이전·중복 방지·원본 보존', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 이전 흐름')
  test.setTimeout(90000)
  await page.addInitScript(() => {
    localStorage.setItem('projectamo.draw-spike.v1', JSON.stringify({ folders: [], features: [
      { id: 'p1', type: 'Feature', geometry: { type: 'Point', coordinates: [127.1, 37.2] }, properties: { name: '옮긴 지점', folder: '훈련', color: '#ff0000' } },
      { id: 'c1', type: 'Feature', geometry: null, properties: { name: '옮긴 원', folder: '(폴더 없음)', gen: { type: 'circle', center: [127.3, 37.4], radiusNm: 4 } } },
      { id: 's1', type: 'Feature', geometry: null, properties: { name: '옮긴 섹터', folder: '공역', gen: { type: 'sector', center: [127.5, 37.6], radiusNm: 3, fromDeg: 0, toDeg: 90 } } },
    ] }))
  })
  await openMyMap(page)

  await page.getByRole('button', { name: '이전 자료', exact: true }).click()
  const banner = page.getByTestId('my-map-draw-migrate')
  await expect(banner).toContainText('3개')
  await banner.getByRole('button', { name: '그리기 자료 가져오기', exact: true }).click()

  // 세 도형이 모두 지도에 올라가고, 고급 도형은 보존 경고와 함께 남는다.
  await expect.poll(() => sourceCount(page)).toBe(3)
  await expect(page.locator(PANEL)).toContainText('원본은 그대로 남아 있습니다')
  await expect(page.locator(PANEL)).toContainText('섹터')
  await expect(page.getByTestId('my-map-tree')).toContainText('훈련')

  // 같은 자료를 두 번 옮기지 않는다. 안내도 사라진다.
  await expect(banner).toHaveCount(0)
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterMyMap(page)
  await expect(page.getByTestId('my-map-draw-migrate')).toHaveCount(0)
  await expect.poll(() => sourceCount(page)).toBe(3)

  // /draw 원본은 지우지 않는다.
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('projectamo.draw-spike.v1')).features.length)
  expect(kept).toBe(3)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('draw-migration.png') })
})

// 실제로 그려지는지 보려면 렌더된 타일을 읽어야 한다. 레이어가 생겼는지만으로는
// 스타일이 반영됐다고 말할 수 없다.
const renderedIn = (page, layer) => page.evaluate((id) => {
  const map = window.__map
  if (!map?.getLayer(id)) return -1
  return map.queryRenderedFeatures({ layers: [id] }).length
}, layer)

test('my-map 선 모양·아이콘·이름 항상 표시가 지도에 실제로 그려진다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 편집 스타일 반영')
  test.setTimeout(120000)
  await openMyMap(page)
  await createPersonalMap(page, '스타일 확인')
  await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
  await page.evaluate(() => window.__map.jumpTo({ center: [127, 37], zoom: 8 }))

  // 선을 하나 그리고 점선으로 바꾼다.
  await page.getByRole('button', { name: '선', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 700, y: 300 } })
  await page.locator('.mapboxgl-canvas').click({ position: { x: 900, y: 420 } })
  await page.getByRole('button', { name: '도형 완료', exact: true }).click()
  await expect.poll(() => renderedIn(page, 'my-map-line')).toBe(1)
  await page.getByRole('combobox', { name: '선 종류', exact: true }).selectOption('dotted')
  // 실선 레이어에서 빠지고 점선 레이어로 옮겨간다.
  await expect.poll(() => renderedIn(page, 'my-map-line-dotted')).toBe(1)
  await expect.poll(() => renderedIn(page, 'my-map-line')).toBe(0)
  await page.getByRole('combobox', { name: '선 종류', exact: true }).selectOption('dashed')
  await expect.poll(() => renderedIn(page, 'my-map-line-dashed')).toBe(1)
  await expect.poll(() => renderedIn(page, 'my-map-line-dotted')).toBe(0)

  // 점을 찍고 아이콘을 별로 바꾼다.
  await page.getByRole('button', { name: '← 항목 목록', exact: true }).click()
  await page.getByRole('button', { name: '점', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 780, y: 360 } })
  await expect.poll(() => renderedIn(page, 'my-map-circle')).toBe(1)
  await page.getByRole('combobox', { name: '아이콘', exact: true }).selectOption('star')
  await expect.poll(() => renderedIn(page, 'my-map-icon')).toBe(1)
  await expect.poll(() => renderedIn(page, 'my-map-circle')).toBe(0)

  // 이름 항상 표시는 겹침을 양보하지 않는 레이어로 옮긴다.
  await page.getByRole('checkbox', { name: '항상 표시', exact: true }).check()
  await expect.poll(() => renderedIn(page, 'my-map-label-always')).toBe(1)
  // 같은 자리에 있던 선 이름표가 자리를 양보한다. 둘 다 그리면 글자가 뭉친다.
  await expect.poll(() => renderedIn(page, 'my-map-label')).toBe(0)

  await page.getByRole('button', { name: '편집 마침', exact: true }).click()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('style-applied.png') })

  // 배경지도를 두 번 바꿔도 스타일 레이어가 그대로 복구된다.
  for (const name of [/^위성/, /^기본/]) {
    await page.getByRole('button', { name: /지도 선택$/ }).click()
    await page.getByRole('menuitemradio', { name }).click()
    await expect.poll(() => renderedIn(page, 'my-map-line-dashed')).toBe(1)
    await expect.poll(() => renderedIn(page, 'my-map-icon')).toBe(1)
    await expect.poll(() => renderedIn(page, 'my-map-label-always')).toBeGreaterThan(0)
  }
})

test('my-map 로그인 상태에서 그리기 이전본이 계정 저장을 통과하고 안내가 화면을 따라오지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 계정 저장 흐름')
  test.setTimeout(90000)
  const saved = new Map()
  const rejected = []
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 303, username: 'draw-user', role: 'pilot', display_name: '이전 검증' } }))
  await page.route(/\/api\/me\/maps(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const request = route.request(), method = request.method(), id = new URL(request.url()).pathname.split('/')[4]
    if (method === 'GET' && !id) return route.fulfill({ json: { maps: [...saved.values()].map((doc) => ({ id: doc.id, name: doc.name, revision: doc.revision, itemCount: doc.items.length, groupCount: doc.groups.length })) } })
    if (method === 'GET') return route.fulfill({ status: saved.has(id) ? 200 : 404, json: { document: saved.get(id), error: saved.has(id) ? undefined : 'not_found' } })
    const { snapshot, expectedRevision } = request.postDataJSON()
    // 서버(backend/src/maps/schema.js)와 같은 규칙. compound는 Multi*/GeometryCollection만 받는다.
    const bad = (snapshot.items ?? []).find((item) => item.kind === 'compound' && item.geometry
      && !['MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'].includes(item.geometry.type))
    if (bad) { rejected.push(`${bad.name}:${bad.geometry.type}`); return route.fulfill({ status: 400, json: { error: 'invalid_snapshot', field: 'snapshot.items.geometry', code: 'kind_mismatch' } }) }
    const document = { ...snapshot, revision: method === 'POST' ? 1 : expectedRevision + 1 }
    saved.set(document.id, document)
    return route.fulfill({ json: { document } })
  })
  await page.addInitScript(() => {
    localStorage.setItem('projectamo.draw-spike.v1', JSON.stringify({ folders: [], features: [
      { id: 'p1', type: 'Feature', geometry: { type: 'Point', coordinates: [127.1, 37.2] }, properties: { name: '옮긴 지점', folder: '훈련' } },
      { id: 'k1', type: 'Feature', geometry: null, properties: { name: '옮긴 회랑', folder: '공역', gen: { type: 'corridor', centerline: [[127.2, 37.3], [127.5, 37.6]], widthNm: 3 } } },
    ] }))
  })
  await openMyMap(page)
  await page.getByRole('button', { name: '이전 자료', exact: true }).click()
  await page.getByTestId('my-map-draw-migrate').getByRole('button', { name: '그리기 자료 가져오기', exact: true }).click()

  // 고급 도형이 있어도 계정 저장이 거부되지 않는다.
  await expect(page.getByRole('region', { name: '지도 저장 상태' })).toContainText('계정에 저장됨')
  await expect(page.locator(PANEL)).not.toContainText('처리하지 못했습니다')
  expect(rejected).toEqual([])
  await expect.poll(() => [...saved.values()][0]?.items.length).toBe(2)
  const stored = [...saved.values()][0]
  expect(stored.items.find((item) => item.name === '옮긴 회랑').geometry.type).toBe('MultiPolygon')

  // 이전 안내는 다음 화면으로 넘어가면 사라진다.
  await expect(page.locator(PANEL)).toContainText('개인 지도로 옮겼습니다')
  await page.getByRole('button', { name: '지도 편집', exact: true }).click()
  await expect(page.locator(PANEL)).not.toContainText('개인 지도로 옮겼습니다')
})
