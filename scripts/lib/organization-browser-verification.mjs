import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, webkit } from '../../frontend/node_modules/playwright/index.mjs'
import { expect } from '../../frontend/node_modules/@playwright/test/index.mjs'

export async function verifyOrganizationBrowser({ root, instance, origin, admin, pilot, password, orgId, flightId, jointId, pdfId, kmlId }) {
  const frontendOrigin = 'http://127.0.0.1:5189'
  const log = fs.openSync(path.join(instance, 'vite.log'), 'w')
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], {
    cwd: path.join(root, 'frontend'), env: { ...process.env, PROJECTAMO_BACKEND_TARGET: origin }, stdio: ['ignore', log, log],
  })
  const captures = []
  let browser
  let currentPage
  let adminStorage
  let pilotStorage
  try {
    for (let attempt = 0; ; attempt++) {
      try { if (!(await fetch(frontendOrigin)).ok) throw new Error('Vite not ready'); break }
      catch (error) { if (attempt >= 100 || child.exitCode != null) throw error; await delay(100) }
    }
    for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
      browser = await launcher.launch()
      for (const [size, viewport] of [['desktop', { width: 1920, height: 1080 }], ['ipad', { width: 1180, height: 820 }], ['compact', { width: 1024, height: 768 }]]) {
        const context = await browser.newContext({ viewport, hasTouch: size !== 'desktop', ...(adminStorage ? { storageState: adminStorage } : {}) })
        if (!adminStorage) {
        const login = await context.request.post(`${frontendOrigin}/api/auth/login`, { data: { username: admin.username, password }, headers: { Origin: frontendOrigin } })
        assert.equal(login.status(), 200, 'Browser session login failed')
        adminStorage = await context.storageState()
        }
        const page = await context.newPage()
        currentPage = page
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        const capture = async (name) => {
          await page.locator('.ol-progress').waitFor({ state: 'hidden', timeout: 20000 })
          await page.waitForTimeout(500)
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
          assert.equal(overflow, false, `${engine}/${size}/${name}: horizontal overflow`)
          const filename = `${engine}-${size}-${name}.png`
          await page.screenshot({ path: path.join(instance, filename), fullPage: true })
          captures.push(filename)
          assert.deepEqual(errors, [], `${name}: uncaught browser error`)
        }
        await page.goto(`${frontendOrigin}/lounge/${orgId}`)
        await expect(page.getByRole('navigation', { name: '기관 라운지 내부 메뉴' })).toBeVisible({ timeout: 30000 })
        await expect.poll(() => page.locator('.ol-map canvas.mapboxgl-canvas').first().evaluate(el => el.getBoundingClientRect().height), { timeout: 20000 }).toBeGreaterThan(250)
        await page.waitForTimeout(1500)
        await capture('home')
        await page.getByRole('button', { name: /기관 소식/ }).click()
        await capture('news-drawer')
        await page.getByRole('dialog', { name: '기관 소식' }).getByRole('button', { name: '닫기', exact: true }).click()
        await page.getByRole('navigation', { name: '기관 라운지 내부 메뉴' }).getByRole('button', { name: '예정비행', exact: true }).click()
        await expect(page.getByRole('heading', { name: '예정비행', exact: true })).toBeVisible()
        if (engine === 'chromium' && size === 'desktop') {
          await page.getByRole('button', { name: '비행 등록', exact: true }).click()
          const dialog = page.getByRole('dialog')
          await dialog.getByLabel('비행명', { exact: true }).fill('화면에서 저장한 기관 비행')
          await dialog.locator('[name=routeId]').selectOption({ label: '광주–여수 저장 경로' })
          await dialog.locator('[name=etd]').fill('2026-09-10T21:00')
          await dialog.locator('[name=eta]').fill('2026-09-10T21:30')
          await dialog.locator('[name=altitude]').fill('3500')
          await dialog.locator('[name=assignedUserId]').selectOption(String(pilot.id))
          await dialog.getByRole('button', { name: '예정비행 저장', exact: true }).click()
          await expect(page.getByRole('heading', { name: '화면에서 저장한 기관 비행', exact: true })).toBeVisible()
          await capture('administrator-saved-flight')
        }
        await page.goto(`${frontendOrigin}/lounge/${orgId}/flights/${flightId}`)
        await expect(page.getByRole('link', { name: '기상 브리핑 보기', exact: true })).toBeVisible()
        await capture('flight-detail')
        await page.getByRole('button', { name: '작성', exact: true }).click()
        await page.getByRole('button', { name: '구역', exact: true }).click()
        const drawingCanvas = page.getByRole('dialog').locator('canvas.mapboxgl-canvas')
        await expect(drawingCanvas).toBeVisible()
        await page.waitForFunction(() => window.__map?.getLayer('organization-route-line'), { timeout: 20000 })
        await drawingCanvas.click({ position: { x: 150, y: 100 } })
        await drawingCanvas.click({ position: { x: 260, y: 160 } })
        await drawingCanvas.click({ position: { x: 180, y: 220 } })
        await page.getByRole('dialog').getByLabel('제목', { exact: true }).fill('기관 지도 확인 구역')
        await capture('annotation-editor')
        if (engine === 'chromium' && size === 'desktop') {
          await page.getByRole('button', { name: '참고사항 저장', exact: true }).click()
          await expect(page.getByRole('dialog')).toBeHidden()
          await expect(page.getByText('기관 지도 확인 구역', { exact: true })).toBeVisible()
        } else await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click()
        await page.getByRole('navigation', { name: '기관 라운지 내부 메뉴' }).getByRole('button', { name: '공유자료', exact: true }).click()
        await capture('materials')
        await page.goto(`${frontendOrigin}/lounge/${orgId}/materials/${pdfId}`)
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByRole('button', { name: '다음 쪽', exact: true })).toBeEnabled({ timeout: 20000 })
        await page.getByRole('button', { name: '다음 쪽', exact: true }).click()
        await page.getByRole('button', { name: '확대', exact: true }).click()
        await capture('pdf-page-two')
        await page.getByLabel('자료 버전').selectOption('1')
        await expect(page.getByRole('button', { name: '다음 쪽', exact: true })).toBeEnabled()
        await capture('pdf-immutable-version')
        await page.goto(`${frontendOrigin}/lounge/${orgId}/materials/${kmlId}`)
        await expect(page.getByRole('dialog').locator('.ol-material-map')).toBeVisible({ timeout: 20000 })
        await capture('kml-map')
        await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click()
        await page.getByRole('navigation', { name: '기관 라운지 내부 메뉴' }).getByRole('button', { name: '알림', exact: false }).click()
        await capture('alerts')
        await page.getByRole('navigation', { name: '기관 라운지 내부 메뉴' }).getByRole('button', { name: '기관 설정', exact: true }).click()
        await capture('settings-notices')
        await page.goto(`${frontendOrigin}/lounge/${orgId}/briefings/${jointId}`)
        await expect(page.getByRole('button', { name: '발표 시작', exact: true })).toBeEnabled()
        await capture('briefing-prepare')
        await page.getByRole('button', { name: '발표 시작', exact: true }).click()
        await expect(page.locator('.op-grid')).toBeVisible({ timeout: 45000 })
        await expect(page.getByRole('button', { name: 'B 지도 중심', exact: true })).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByText('고도와 유효시각을 확인하고 자료 누락 구간은 별도로 판단합니다.', { exact: true })).toBeVisible()
        await capture('presentation-b')
        await page.getByRole('button', { name: 'A 기존 배치', exact: true }).click()
        await capture('presentation-a')
        await page.getByRole('button', { name: '연직단면도 확대', exact: true }).click()
        await capture('presentation-profile-expanded')
        await page.keyboard.press('Escape')
        await page.locator('.op-notes').getByRole('button', { name: '확대', exact: true }).click()
        await expect(page.locator('.op-expanded canvas').first()).toBeVisible({ timeout: 20000 })
        await capture('presentation-fixed-material')
        await page.keyboard.press('Escape')
        const before = await page.locator('.op-footer').innerText()
        await page.getByRole('button', { name: '새 자료 확인', exact: true }).click()
        await expect(page.getByRole('button', { name: /준비된 새 자료 적용/ })).toBeEnabled({ timeout: 45000 })
        assert.equal(await page.locator('.op-footer').innerText(), before, 'candidate must not change displayed bundle')
        await page.getByRole('button', { name: /준비된 새 자료 적용/ }).click()
        await expect.poll(() => page.locator('.op-footer').innerText()).not.toBe(before)
        await capture('presentation-applied')
        await page.getByRole('button', { name: '발표 종료', exact: true }).click()
        await expect(page.getByRole('navigation', { name: '기관 라운지 내부 메뉴' })).toBeVisible()
        const pilotContext = await browser.newContext({ viewport, hasTouch: size !== 'desktop', ...(pilotStorage ? { storageState: pilotStorage } : {}) })
        if (!pilotStorage) {
        const pilotLogin = await pilotContext.request.post(`${frontendOrigin}/api/auth/login`, { data: { username: pilot.username, password }, headers: { Origin: frontendOrigin } })
        assert.equal(pilotLogin.status(), 200)
        pilotStorage = await pilotContext.storageState()
        }
        const pilotPage = await pilotContext.newPage()
        await pilotPage.goto(`${frontendOrigin}/?orgId=${orgId}&orgFlightId=${flightId}`)
        await expect(pilotPage.locator('.briefing-view')).toBeVisible({ timeout: 30000 })
        await expect(pilotPage.getByRole('button', { name: '기관 브리핑 재조회', exact: true })).toBeEnabled({ timeout: 30000 })
        const name = `${engine}-${size}-pilot-real-weather.png`
        await pilotPage.screenshot({ path: path.join(instance, name), fullPage: true })
        captures.push(name)
        await pilotContext.close()
        await context.close()
      }
      await browser.close(); browser = null
    }
    return { captures }
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({ path: path.join(instance, 'browser-failure.png'), fullPage: true }).catch(() => {})
      fs.writeFileSync(path.join(instance, 'browser-failure.html'), await currentPage.content().catch(() => ''))
    }
    throw error
  } finally {
    await browser?.close()
    child.kill('SIGTERM')
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)])
    if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL')
    fs.closeSync(log)
  }
}
