import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  grep: /organization-/,
  projects: ['chromium', 'webkit'].flatMap(browserName => [
    { name: `organization-${browserName}-desktop`, use: { browserName, viewport: { width: 1920, height: 1080 } } },
    { name: `organization-${browserName}-ipad`, use: { browserName, viewport: { width: 1180, height: 820 }, hasTouch: true } },
    { name: `organization-${browserName}-compact`, use: { browserName, viewport: { width: 1024, height: 768 }, hasTouch: true } },
  ]),
})
