import { test as base, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

export const test = base.extend({
  // 첫 방문 소개 화면(/)을 건너뛰고 기존 계약처럼 대시보드에서 시작한다.
  context: async ({ context }, use) => {
    await context.addInitScript(() => { try { localStorage.setItem('projectamo:skip-intro', '1') } catch { /* storage disabled */ } })
    // 첫 방문 사용 안내(투어)는 2026-10-22부터 자동으로 뜬다 — 다른 계약을 가리지 않게 본 것으로 둔다(onboarding 계약만 지운다).
    await context.addInitScript(() => { try { if (!localStorage.getItem('amo.tour.v1.done')) localStorage.setItem('amo.tour.v1.done', '1') } catch { /* storage disabled */ } })
    await use(context)
  },
  consoleMessages: [async ({ page }, use) => {
    const consoleMessages = []
    page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }))
    page.on('pageerror', (error) => consoleMessages.push({ type: 'pageerror', text: error.message }))
    await use(consoleMessages)
  }, { auto: true }],
})

test.afterEach(async ({ consoleMessages }, testInfo) => {
  await writeFile(testInfo.outputPath('console.json'), JSON.stringify(consoleMessages, null, 2))
})

export { expect }
