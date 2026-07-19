import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(frontendDir, '..')
const artifactDir = path.join(rootDir, 'artifacts', 'verification')

export default defineConfig({
  testDir: './verification/contracts',
  outputDir: path.join(artifactDir, 'test-results'),
  workers: 1,
  fullyParallel: false,
  retries: 1,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: true,
  reporter: [['html', { outputFolder: path.join(artifactDir, 'html-report'), open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'node server.js',
      cwd: path.join(rootDir, 'backend'),
      env: { ...process.env, DISABLE_COLLECTION: '1' },
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
      cwd: frontendDir,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
