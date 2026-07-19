import { test as base, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

export const test = base.extend({
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
