// Verify the floating prototype against running frontend and backend servers.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const origin = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const output = fileURLToPath(new URL('../../artifacts/vertical-profile-concept/', import.meta.url))
await mkdir(output, { recursive: true })
const report = { errors: [], cases: [], accessibility: [] }
async function open(browser, viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch })
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push(e.message))
  await page.goto(`${origin}/concepts/vertical-profile?demo=1&route=short`)
  await page.getByRole('dialog', { name: '연직단면도' }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => document.querySelector('.mapboxgl-canvas'))
  return page
}
async function drag(page, locator, dx, dy) {
  const b = await locator.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 }); await page.mouse.up()
}
async function checkContained(page) {
  const b = await page.locator('.vpc-window').boundingBox(), viewport = page.viewportSize()
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height)
  const chart = await page.locator('.vpc-chart').evaluate(e => ({ container: e.clientHeight, svg: e.querySelector('svg').getBoundingClientRect().height }))
  assert.ok(chart.container >= chart.svg - 1, JSON.stringify(chart))
}
const browser = await chromium.launch()
try {
  const page = await open(browser, { width: 1600, height: 1000 })
  const win = page.locator('.vpc-window')
  assert.equal(await page.getByText('항로 인사이트').count(), 0)
  assert.equal(await page.locator('.vpc-route-map, .vpc-header, .vpc-flight-overview').count(), 0)
  await drag(page, page.locator('.vpc-resize.is-se'), -240, 0)
  const original = await win.boundingBox()
  const chartHeight = await page.locator('.vpc-chart').evaluate(e => e.clientHeight)
  await drag(page, page.locator('.vpc-window-title'), 60, 40)
  let b = await win.boundingBox()
  assert.ok(Math.abs(b.x - original.x - 60) < 2 && Math.abs(b.y - original.y - 40) < 2)
  await drag(page, page.locator('.vpc-resize.is-se'), 90, 70)
  b = await win.boundingBox()
  assert.ok(Math.abs(b.width - original.width - 90) < 2 && Math.abs(b.height - original.height - 70) < 2)
  assert.ok(await page.locator('.vpc-chart').evaluate(e => e.clientHeight) > chartHeight + 60)
  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'sw']) {
    const before = await win.boundingBox()
    await drag(page, page.locator(`.vpc-resize.is-${edge}`), edge.includes('w') ? 10 : edge.includes('e') ? -10 : 0, edge.includes('n') ? 10 : edge.includes('s') ? -10 : 0)
    const after = await win.boundingBox()
    assert.notDeepEqual(before, after, `${edge} resize`)
  }
  await page.locator('.vpc-window-title').focus(); const keyStart = await win.boundingBox(); await page.keyboard.press('ArrowLeft')
  assert.equal((await win.boundingBox()).x, keyStart.x - 10)
  await page.locator('.vpc-resize.is-se').focus(); const resizeStart = await win.boundingBox(); await page.keyboard.press('ArrowRight')
  assert.equal((await win.boundingBox()).width, resizeStart.width + 10)
  report.cases.push('제목줄 드래그·키보드 이동, 8방향 크기 조절, 차트 높이 자동 반영')

  await drag(page, page.locator('.vpc-window-title'), -2000, -2000); await checkContained(page)
  const restoreRect = await win.boundingBox()
  await page.getByRole('button', { name: '창 최대화', exact: true }).click(); await checkContained(page)
  await page.getByRole('button', { name: '창 크기 복원', exact: true }).click()
  assert.deepEqual(await win.boundingBox(), restoreRect)
  await page.getByRole('button', { name: '연직단면도 닫기', exact: true }).click()
  assert.equal(await win.count(), 0)
  await page.locator('.vpc-reopen').click()
  assert.deepEqual(await win.boundingBox(), restoreRect)
  report.cases.push('화면 밖 이동 방지, 최대화·복원, 닫기·다시 열기와 크기 유지')

  await page.getByRole('button', { name: '표시 시간대 변경' }).click()
  assert.match(await page.getByTestId('valid-time').textContent(), /10\/11 15:00/)
  await page.getByRole('button', { name: '표시 시간대 변경' }).click()
  await page.getByRole('button', { name: '다음 예보시간' }).click()
  assert.match(await page.getByTestId('valid-time').textContent(), /10\/12 01:00/)
  await page.getByRole('button', { name: '이전 예보시간' }).click()
  assert.equal(await page.getByRole('button', { name: '이전 예보시간' }).isDisabled(), true)
  await page.getByRole('combobox', { name: '계획 순항고도' }).selectOption('43000')
  assert.match(await page.locator('.vpc-readout').textContent(), /자료 없음/)
  await page.getByRole('combobox', { name: '계획 순항고도' }).selectOption('35000')
  const cloud = page.getByRole('button', { name: '구름', exact: true }); await cloud.click(); assert.equal(await cloud.getAttribute('aria-pressed'), 'false'); await cloud.click()
  await page.getByRole('button', { name: '차트 확대', exact: true }).click()
  await page.getByRole('slider', { name: '확대 구간 이동' }).focus(); await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '전체 항로 맞춤' }).click()
  assert.equal(await page.getByRole('slider', { name: '확대 구간 이동' }).getAttribute('aria-disabled'), 'true')
  report.cases.push('시간·UTC/KST 날짜 경계, 고도 변경·결측, 레이어, 차트 확대·전체 복귀')
  const a11y = await new AxeBuilder({ page }).include('.vpc-overlay').analyze()
  report.accessibility = a11y.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }))
  await page.reload(); await page.getByRole('dialog', { name: '연직단면도' }).waitFor()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${output}floating-desktop.png` })
  await page.setViewportSize({ width: 900, height: 700 }); await checkContained(page)
  report.cases.push('직접 진입·새로고침, 브라우저 크기 변경 시 화면 안 유지')
  await page.close()

  for (const [name, width, height] of [['ipad', 1180, 820], ['ipad-small', 1024, 768], ['mobile', 390, 844]]) {
    const p = await open(browser, { width, height }, true)
    await checkContained(p)
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await p.getByRole('button', { name: '창 최대화', exact: true }).click(); await checkContained(p)
    await p.getByRole('button', { name: '창 크기 복원', exact: true }).click()
    await p.screenshot({ path: `${output}floating-${name}.png` })
    report.cases.push(`${name} ${width}×${height}: 터치 레이아웃·차트 잘림·최대화/복원 확인`)
    await p.close()
  }
} finally { await browser.close() }
let safari
try { safari = await webkit.launch() } catch (e) { report.webkit = `실행 불가: ${e.message.split('\n')[0]}` }
if (safari) {
  try {
    const p = await open(safari, { width: 1180, height: 820 })
    await drag(p, p.locator('.vpc-resize.is-se'), -80, -50)
    await checkContained(p)
    await p.getByRole('button', { name: '창 최대화', exact: true }).click(); await checkContained(p)
    await p.getByRole('button', { name: '창 크기 복원', exact: true }).click()
    report.webkit = 'Linux WebKit: 크기 조절·최대화·복원 확인 (실제 iPad 검증 아님)'
  } finally { await safari.close() }
}
await writeFile(`${output}verification.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
assert.equal(report.errors.length, 0, '브라우저 오류')
assert.equal(report.accessibility.filter(v => ['serious', 'critical'].includes(v.impact)).length, 0, '접근성 오류')
