// Focused verification of the offline comparison, without weather collection or servers.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '../frontend/node_modules/playwright/index.mjs'
await import('./preview-cloud-icing-variants.mjs')
const browser = await chromium.launch({ headless: true })
const errors = [], requests = [], checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 })
  page.on('pageerror', e => errors.push(e.message))
  await page.route(/^https?:/, r => { requests.push(r.request().url()); return r.abort() })
  await page.goto('file://' + path.resolve('docs/design/mockups/cloud-icing-variants.html'))
  await page.locator('#cards .card[data-plan="A"] .figure svg').first().waitFor()
  await page.evaluate(() => { window.__initialData = JSON.stringify(window.CLOUD_ICING_DESIGN_DATA) })
  assert.equal(await page.getByRole('combobox', { name: '시험 자료', exact: true }).inputValue(), 'real')
  assert.equal(await page.getByRole('combobox', { name: '기압층', exact: true }).inputValue(), '500hPa')
  assert.equal(await page.locator('#cards .card').count(), 1)
  const patterns = await page.locator('#cards .figure svg').evaluateAll(svgs => svgs.map(svg => [...svg.querySelectorAll('pattern')].map(p => ({
    size: p.getAttribute('width'), radius: p.querySelector('circle')?.getAttribute('r'),
    dot: p.querySelector('circle')?.getAttribute('fill'), fill: p.querySelector('rect')?.getAttribute('fill'),
    alpha: p.querySelector('rect')?.getAttribute('fill-opacity'),
  }))))
  for (const group of patterns) {
    assert.equal(new Set(group.map(p => p.size)).size, 1)
    assert.equal(new Set(group.map(p => p.radius)).size, 1)
    assert.deepEqual(group.map(p => p.fill), ['#ACC7FF', '#6B88CD', '#383D6F'])
    assert.ok(group.every(p => p.dot === '#ffffff' && p.alpha === null))
  }
  await page.screenshot({ path: 'artifacts/cloud-icing-a-real-kim.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'artifacts/cloud-icing-a-real-kim-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1600, height: 1200 })
  await page.waitForTimeout(250)
  checks.push('default opens stored KIM 500hPa in A only, opaque grade faces and uniform white dots, mobile layout')
  await page.getByRole('button', { name: '기존 6안 비교', exact: true }).click()
  await page.locator('#cards .card[data-plan="F"]').waitFor()
  await page.getByRole('combobox', { name: '시험 자료', exact: true }).selectOption('synthetic')

  async function sameFields() {
    const fields = await page.locator('#cards .card').evaluateAll(cards => cards.map(card => ({
      plan: card.dataset.plan,
      cloud: [...card.querySelectorAll('[data-layer="cloud"]')].map(g => g.tagName === 'image' ? [g.getAttribute('href'), g.getAttribute('opacity')] : [...g.querySelectorAll('rect')].map(r => ['x','y','width','height','fill'].map(a => r.getAttribute(a)))),
      outlines: [...card.querySelectorAll('[data-outline="union"]')].map(p => p.getAttribute('d')),
      masks: [...card.querySelectorAll('[data-mask]')].map(p => p.getAttribute('data-mask')),
    })))
    assert.equal(fields.length, 6)
    assert.ok(fields[0].outlines.length > 0)
    for (const f of fields.slice(1)) {
      assert.deepEqual(f.cloud, fields[0].cloud, f.plan + ' cloud must stay identical')
      assert.deepEqual(f.outlines, fields[0].outlines, f.plan + ' union exterior must stay identical')
      if (f.plan !== 'F') assert.deepEqual(f.masks, fields[0].masks, f.plan + ' grade masks must stay identical')
    }
  }
  await sameFields(); checks.push('same cloud, grade masks and union exteriors across six variants')
  assert.ok(await page.evaluate(() => window.__cloudIcingVariants.currentMap().counts.slice(1).every(n => n > 0)))
  await page.screenshot({ path: 'artifacts/cloud-icing-variants-overview.png', fullPage: true })
  await page.getByRole('button', { name: '지도', exact: true }).click()
  assert.equal(await page.locator('#cards .figure').count(), 6)
  await page.screenshot({ path: 'artifacts/cloud-icing-variants-maps.png', fullPage: true })
  await page.getByRole('button', { name: '단면', exact: true }).click()
  assert.equal(await page.locator('#cards .figure').count(), 6)
  await page.getByRole('button', { name: '지도 + 단면', exact: true }).click()
  assert.equal(await page.locator('#cards .figure').count(), 12)
  checks.push('map, profile and paired views')

  for (const name of ['구름', '착빙', '등온선']) {
    const control = page.getByRole('checkbox', { name, exact: true })
    await control.uncheck()
    if (name !== '등온선') assert.equal(await page.locator(`[data-layer="${name === '구름' ? 'cloud' : 'icing'}"]`).count(), 0)
    await control.check()
  }
  await page.getByRole('checkbox', { name: '−10°C 추가', exact: true }).check()
  await page.getByRole('button', { name: '어두운 배경', exact: true }).click()
  await sameFields()
  await page.screenshot({ path: 'artifacts/cloud-icing-variants-dark.png', fullPage: true })
  await page.getByRole('button', { name: '어두운 배경', exact: true }).click()
  checks.push('independent layers, optional -10 and dark background')

  for (const id of ['B', 'C']) await page.locator(`[data-select="${id}"]`).check()
  assert.equal(await page.locator('[data-select]:disabled').count(), 4)
  await page.getByRole('button', { name: '선택 2개 크게 비교 (2/2)', exact: true }).click()
  assert.deepEqual(await page.locator('#cards .card').evaluateAll(cs => cs.map(c => c.dataset.plan)), ['B', 'C'])
  await page.screenshot({ path: 'artifacts/cloud-icing-variants-pair.png', fullPage: true })
  await page.getByRole('button', { name: 'B안 확대', exact: true }).click()
  await page.locator('#zoom-dialog').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#zoom-content .figure').count(), 2)
  await page.keyboard.press('Escape')
  await page.locator('#zoom-dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '전체 6개 보기', exact: true }).click()
  await page.getByRole('button', { name: 'A안만 보기', exact: true }).click()
  assert.equal(await page.locator('#cards .card').count(), 1)
  await page.getByRole('button', { name: '기존 6안 비교', exact: true }).click()
  checks.push('two selections, side by side enlargement, modal and Escape')

  await page.getByRole('combobox', { name: '시험 자료', exact: true }).selectOption('real')
  await sameFields()
  await page.getByRole('combobox', { name: '기압층', exact: true }).selectOption('500hPa')
  await page.getByRole('combobox', { name: '예보시간', exact: true }).selectOption(await page.evaluate(() => String(window.CLOUD_ICING_DESIGN_DATA.times[1].hf)))
  await sameFields()
  await page.screenshot({ path: 'artifacts/cloud-icing-variants-real-kim.png', fullPage: true })
  assert.equal(await page.evaluate(() => JSON.stringify(window.CLOUD_ICING_DESIGN_DATA) === window.__initialData), true)
  checks.push('stored KIM fields, pressure and time changes, source data stays immutable')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  const width = await page.evaluate(() => ({ document: document.body.scrollWidth, viewport: innerWidth }))
  assert.ok(width.document <= width.viewport)
  const croppedLabels = await page.locator('#cards .figure svg[aria-label$="연직단면"] text').evaluateAll(labels => labels.filter(t => {
    const b=t.getBoundingClientRect(), svg=t.ownerSVGElement.getBoundingClientRect()
    return b.left<svg.left-.5||b.right>svg.right+.5||b.top<svg.top-.5||b.bottom>svg.bottom+.5
  }).map(t=>t.textContent))
  assert.deepEqual(croppedLabels, [], 'mobile profile labels must remain inside their SVG')
  await page.getByRole('button', { name: '선택 2개 크게 비교 (2/2)', exact: true }).click()
  await page.screenshot({ path: 'artifacts/cloud-icing-variants-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'B안 확대', exact: true }).click()
  assert.equal(await page.locator('#zoom-dialog').isVisible(), true)
  await page.getByRole('button', { name: '확대 보기 닫기', exact: true }).click()
  checks.push('390px document has no horizontal overflow, selection and modal work')
  assert.deepEqual(errors, [])
  assert.deepEqual(requests, [])
  const result = { passed: true, checks, errors, requests, width }
  await fs.writeFile('artifacts/cloud-icing-variants-verification.json', JSON.stringify(result, null, 2))
  console.log(result)
} finally {
  await browser.close()
}
