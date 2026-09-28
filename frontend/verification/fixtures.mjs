import { test as base, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

export const test = base.extend({
  // 첫 방문 소개 화면(/)을 건너뛰고 기존 계약처럼 대시보드에서 시작한다.
  context: async ({ context }, use) => {
    await context.addInitScript(() => { try { localStorage.setItem('projectamo:skip-intro', '1') } catch { /* storage disabled */ } })
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
