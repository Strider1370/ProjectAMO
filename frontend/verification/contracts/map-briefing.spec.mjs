import { test, expect } from '../fixtures.mjs'
import { createBriefing } from '../briefing-flow.mjs'

// 지도형 브리핑(폭 1024 이상 기본): 패널·위험 막대·연직단면도 독, 문서형 전환, 따로 접기.
// 위험 막대·SIGMET이 걸린 브리핑: 픽스처 브리핑(모델 단면 없음)에 정해진 ribbon을 넣고, 같은 id의 SIGMET 둘을 지도·단면에 띄운다.
// 난류: 모델 SEV 막대(순항) + SIGMET 틀(내 고도), 착빙: SIGMET 틀(다른 고도). 착빙 영역이 난류보다 작아 겹친 곳에서 착빙이 골라진다.
const HOUR = 3600_000
function hazardScenario(page) {
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const advisory = (id, code, coords, lower, upper) => ({
    id, phenomenon_code: code, sequence_number: id.slice(-1), valid_from: iso(now - HOUR), valid_to: iso(now + 3 * HOUR),
    altitude: { lower_fl: lower, upper_fl: upper }, geometry: { type: 'Polygon', coordinates: [coords] },
  })
  page.route('**/api/sigmet', (route) => route.fulfill({ json: { items: [
    advisory('contract-turb', 'SEV_TURB', [[125, 34], [130, 34], [130, 38.5], [125, 38.5], [125, 34]], 50, 150),
    advisory('contract-ice', 'SEV_ICE', [[127.6, 34], [130, 34], [130, 36.2], [127.6, 36.2], [127.6, 34]], 20, 80),
  ] } }))
  return (briefing) => {
    const total = briefing.sections.enroute.ribbon?.totalDistanceNm ?? 150
    const at = (nm) => iso(Date.parse(briefing.meta.etd) + (Date.parse(briefing.meta.eta) - Date.parse(briefing.meta.etd)) * (nm / total))
    const place = (startNm, endNm) => ({ startNm, endNm, from: 'RKSS', to: 'RKPK', passFrom: at(startNm), passTo: at(endNm) })
    const frame = (sourceId, code, lowFt, highFt, mine, startNm, endNm) => ({
      source: 'SIGMET', sourceId, overseas: false, code, label: code, bandFt: { lowFt, highFt }, mine,
      validFrom: iso(now - HOUR), validTo: iso(now + 3 * HOUR), ...place(startNm, endNm),
    })
    const model = { level: 'SEV', ...place(Math.round(total * 0.2), Math.round(total * 0.5)), altitudeFt: { from: 9000, to: 9000 }, phase: 'cruise' }
    briefing.sections.enroute.ribbon = {
      totalDistanceNm: total, windApplied: false, runs: {},
      rows: [
        { key: 'turbulence', label: '난류', status: 'found', model: [model], missing: [], frames: [frame('contract-turb', 'SEV_TURB', 5000, 15000, true, 0, Math.round(total * 0.9))] },
        { key: 'icing', label: '착빙', status: 'none', model: [], missing: [], frames: [frame('contract-ice', 'SEV_ICE', 2000, 8000, false, Math.round(total * 0.6), total)] },
      ],
      summary: { status: 'hazard', top: { ...model, kind: 'model', row: 'turbulence', label: '난류' }, unavailable: [], partial: [] },
    }
    return briefing
  }
}

test.describe('map-briefing', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '지도형은 폭 1024 이상 데스크톱 전용')
  })

  test('opens the map briefing with panel, hazard ribbon and profile dock, and switches to the document view', async ({ page }) => {
    await createBriefing(page, { view: 'map' })
    const panel = page.getByRole('complementary', { name: '비행 전 브리핑' })
    await expect(panel).toBeVisible()
    await expect(panel.getByText('RKSS → RKPK')).toBeVisible()
    const ribbon = page.getByRole('group', { name: '경로상 위험 막대' })
    await expect(ribbon).toBeVisible()
    // 픽스처는 모델 단면이 없다: 난류·착빙은 "확인 불가"(짧게 '불가') 줄로 남고, 걸린 것이 없는 대류 줄은 빠진다.
    for (const label of ['난류', '착빙']) await expect(ribbon.getByText(label, { exact: true })).toBeVisible()
    await expect(ribbon.getByText('대류', { exact: true })).toHaveCount(0)
    await expect(ribbon.getByText('불가', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('group', { name: '연직단면도' })).toBeVisible()
    // 위험 막대 가로축이 아래 단면도 그림의 0NM~끝과 같은 세로선에 온다.
    await expect.poll(() => page.evaluate(() => {
      const track = document.querySelector('.mb-track').getBoundingClientRect()
      const svg = document.querySelector('.mb-profile-body .vertical-profile-plot-svg')
      const rect = svg.getBoundingClientRect()
      return [Math.round(track.left - (rect.left + Number(svg.dataset.plotLeft))), Math.round(track.right - (rect.left + Number(svg.dataset.plotRight)))]
    })).toEqual([0, 0])

    // 상단 버튼: 연직단면도 대신 브리핑(패널 켜기/끄기). 패널을 닫아도 독은 남는다.
    await expect(page.getByRole('button', { name: '연직단면도', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '브리핑 패널' }).click()
    await expect(panel).toHaveCount(0)
    await expect(ribbon).toBeVisible()
    await page.getByRole('button', { name: '브리핑 패널' }).click()
    await expect(panel).toBeVisible()

    // 문서형 ↔ 지도형
    await panel.getByRole('button', { name: '문서형 보기' }).click()
    await expect(page.locator('.briefing-view')).toBeVisible()
    await expect(page.locator('.feedback-launcher')).toBeHidden()
    await expect(page.getByRole('button', { name: '기본 지도 보기', exact: true })).toHaveCount(0)
    // 문서형 노선 섹션에도 같은 위험 막대가 있다 — 지도 위 독만 사라진다.
    await expect(page.locator('.mb-dock:not(.is-document)')).toHaveCount(0)
    await expect(page.locator('.briefing-view').getByRole('group', { name: '경로상 위험 막대' })).toHaveCount(1)
    await page.getByRole('button', { name: '지도형 보기' }).click()
    await expect(page.getByRole('group', { name: '경로상 위험 막대' })).toBeVisible()
  })

  // 지도형↔문서형 전환, 브리핑 종료 뒤에도 경로가 패널·독에 가리지 않은 지도 영역 안에 다시 맞춰져야 한다.
  // (2026-10-24: 문서형→지도형은 경로 절반이 독 밑에, 브리핑 종료는 경로 전체가 입력 패널 밑에 숨었다.)
  test('keeps the route in the uncovered map after switching views and closing the briefing', async ({ page }) => {
    await createBriefing(page, { view: 'map' })
    const routeShare = () => page.evaluate(() => {
      const map = window.__map
      const line = map.getSource('briefing-route-applied')?._data
      const coords = (line?.features ?? [line]).flatMap((f) => (f?.geometry?.type === 'LineString' ? f.geometry.coordinates : []))
      if (!map.isMoving() && coords.length === 0) return 0
      const box = map.getContainer().getBoundingClientRect()
      let { left, right, bottom } = box
      const top = box.top
      const leftPanel = document.querySelector('.route-check-panel, .mb-panel'); if (leftPanel) left = Math.max(left, leftPanel.getBoundingClientRect().right)
      const rightPanel = document.querySelector('.briefing-view'); if (rightPanel) right = Math.min(right, rightPanel.getBoundingClientRect().left)
      const dock = document.querySelector('.mb-dock'); if (dock) bottom = Math.min(bottom, dock.getBoundingClientRect().top)
      const inside = coords.map((c) => map.project(c)).filter((p) => p.x + box.left >= left && p.x + box.left <= right && p.y + box.top >= top && p.y + box.top <= bottom)
      return map.isMoving() ? -1 : inside.length / coords.length
    })
    await expect.poll(routeShare, { timeout: 10_000 }).toBe(1)
    await page.getByRole('button', { name: '문서형 보기' }).click()
    await expect.poll(routeShare, { timeout: 10_000 }).toBe(1)
    await page.getByRole('button', { name: '지도형 보기' }).click()
    await expect.poll(routeShare, { timeout: 10_000 }).toBe(1)
    await page.getByRole('button', { name: /브리핑 종료/ }).click()
    await expect.poll(routeShare, { timeout: 10_000 }).toBe(1)
  })

  test('folds the ribbon and the profile separately and remembers it', async ({ page }) => {
    await createBriefing(page, { view: 'map' })
    await page.getByRole('button', { name: '연직단면도 접기', exact: true }).click()
    await expect(page.getByRole('group', { name: '연직단면도' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: '경로상 위험 막대' })).toBeVisible()
    await page.getByRole('button', { name: '경로상 위험 접기', exact: true }).click()
    await expect(page.getByRole('group', { name: '경로상 위험 막대' })).toHaveCount(0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('projectamo.briefingDock')))
    expect(saved).toMatchObject({ ribbonOpen: false, profileOpen: false })
    // 독 전체 접기: 탭 하나만 남고, 누르면 원래대로.
    await page.getByRole('button', { name: '경로상 위험·연직단면도 접기' }).click()
    await expect(page.getByRole('region', { name: '경로상 위험과 연직단면도' })).toHaveCount(0)
    await page.getByRole('button', { name: '경로상 위험·연직단면도 펼치기' }).click()
    await expect(page.getByRole('region', { name: '경로상 위험과 연직단면도' })).toBeVisible()
  })

  test('pressing a ribbon bar opens its detail and turns on the related layer', async ({ page }) => {
    await createBriefing(page, { view: 'map', patchBriefing: hazardScenario(page) })
    // 막대 버튼은 마우스를 받지 않는다(줄이 위치로 고름) — 키보드로 누른다.
    const bar = page.locator('[data-ribbon-id="turbulence:model:0"]')
    await bar.focus()
    await page.keyboard.press('Enter')
    const popover = page.getByRole('dialog', { name: '난류 상세' })
    await expect(popover).toBeVisible()
    await expect(popover.getByText('SEV', { exact: true })).toBeVisible()
    await expect(popover.getByText('내 고도', { exact: true })).toBeVisible()
    await expect(popover.getByRole('button', { name: '지도·고도·시간 맞추기' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '레이어를 켰습니다' })).toContainText('난류(KIM GKTG)')
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
  })

  test('hovering a SIGMET box in the profile highlights that advisory and dims the others', async ({ page }) => {
    await createBriefing(page, { view: 'map', patchBriefing: hazardScenario(page) })
    const ice = page.locator('.mb-profile-body [data-testid="profile-advisory-boundary"][data-advisory-id="contract-ice"]').first()
    await expect(ice).toBeAttached()
    const box = await ice.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8)
    await expect(ice).toHaveAttribute('data-focus', 'focus')
    await expect(page.locator('.mb-profile-body [data-advisory-id="contract-turb"]').first()).toHaveAttribute('data-focus', 'dim')
    await expect(page.locator('.mb-frame[data-advisory-id="contract-ice"]')).toHaveClass(/is-linked/)
    await page.mouse.move(5, 5)
    await expect(ice).not.toHaveAttribute('data-focus', /./)
  })

  test('marks the flight on the level slider and the timeline', async ({ page }) => {
    await createBriefing(page, { view: 'map', patchBriefing: hazardScenario(page) })
    // KIM 레이어가 꺼져 있어도 브리핑 중에는 고도 슬라이더가 뜨고, 비행 범위·발표 고도대가 축에 표시된다.
    await expect(page.locator('.pressure-level-slider__mark.is-flight-range')).toHaveCount(1)
    await expect(page.locator('.pressure-level-slider__mark.is-frame').first()).toBeAttached()
    await expect(page.locator('.pressure-level-slider__track')).toHaveAttribute('aria-valuetext', /순항 9,000ft/)
    await expect(page.locator('.timeline-rail__flight-mark.is-etd')).toHaveText(/^ETD \d{2}:\d{2}$/)
    await expect(page.locator('.timeline-rail__flight-mark.is-eta')).toHaveText(/^ETA \d{2}:\d{2}$/)
  })

  test('airport cards open the airport panel and fold into chips', async ({ page }) => {
    await createBriefing(page, { view: 'map' })
    // 처음에는 모두 접은 칩으로 시작한다.
    await expect(page.locator('.mb-airport-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'RKPK 카드 펼치기' }).click()
    const arrival = page.getByRole('article', { name: /도착 RKPK/ })
    await expect(arrival).toBeVisible()
    // 펼친 카드는 METAR·TAF를 자르지 않는다(글이 칸 안에 다 들어간다).
    expect(await arrival.locator('.mb-ac-rows dd span').evaluateAll((spans) => spans.every((el) => el.scrollWidth <= el.clientWidth + 1))).toBe(true)
    await arrival.getByRole('button', { name: 'RKPK 카드 접기' }).click()
    await expect(page.getByRole('button', { name: 'RKPK 카드 펼치기' })).toBeVisible()
    await page.getByRole('button', { name: 'RKPK 카드 펼치기' }).click()
    await page.getByRole('button', { name: 'RKPK 상세' }).click()
    await expect(page.locator('.airport-panel')).toBeVisible()
    // 공항 패널이 열린 동안 카드는 숨고, 위쪽 버튼(브리핑 패널 켜기)은 남는다.
    await expect(page.locator('.mb-airport-card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '브리핑 패널' })).toBeVisible()
  })
})


test('map-briefing uses the map on iPad landscape and adapts when rotated', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-landscape', '아이패드 가로·세로 전환')
  await createBriefing(page, { view: 'map' })
  const panel = page.getByRole('complementary', { name: '비행 전 브리핑' })
  await expect(panel).toBeVisible()
  await expect(page.locator('.mb-dock:not(.is-document)')).toBeVisible()
  await expect(page.locator('.briefing-view')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '기본 지도 보기', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ipad-landscape-map-briefing.png') })
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.briefing-view')).toBeVisible()
  await expect(page.locator('.feedback-launcher')).toBeHidden()
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '문서형 보기' }).click()
  await expect(page.locator('.briefing-view')).toBeVisible()
  await expect(page.locator('.feedback-launcher')).toBeHidden()
  await page.getByRole('button', { name: '지도형 보기' }).click()
  await expect(panel).toBeVisible()
})
