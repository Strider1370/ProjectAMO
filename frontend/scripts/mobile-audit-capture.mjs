// 모바일 UI/UX 정비 audit — 상태별 스크린샷 + axe 접근성 스캔.
// 스펙: docs/superpowers/specs/2026-07-01-mobile-design-audit-design.md §7.1
// 절차: docs/dev-server-and-capture.md (서버 먼저 기동, networkidle 금지)
// 실행: (dev:serve 기동 후) PROJECTAMO_URL=http://127.0.0.1:5173 node frontend/scripts/mobile-audit-capture.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { execSync } from 'node:child_process'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const LABEL = process.env.PROJECTAMO_SCREENSHOT_LABEL || 'before'
const OUT = new URL('../../artifacts/responsive-screenshots/mobile-audit-2026-07-01/', import.meta.url)

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1536, height: 864 }

const settle = (p, ms = 2200) => p.waitForTimeout(ms)
async function dismissUpdates(p) {
  const c = await p.$('.updates-modal__close')
  if (c) { await c.click().catch(() => {}); await p.waitForTimeout(300) }
}
async function base(p) {
  await p.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await p.waitForSelector('.map-shell', { timeout: 20000 }); await settle(p); await dismissUpdates(p)
}
async function airport(p) {
  await p.goto(`${APP_URL}/?airport=RKSI`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await p.waitForSelector('.airport-panel', { timeout: 20000 }); await settle(p); await dismissUpdates(p)
}
const tab = (p, name) => p.locator('.airport-panel-tab', { hasText: name }).first().click()
async function openBriefing(p) { await base(p); await p.getByRole('button', { name: '브리핑' }).click(); await p.waitForSelector('.route-check-form', { timeout: 10000 }); await settle(p, 1200) }
async function pickAirport(p, rowIndex, icao) {
  await p.locator('.apf-row').nth(rowIndex).click(); await p.waitForTimeout(500)
  await p.locator('.apf-chip', { hasText: icao }).first().click(); await p.waitForTimeout(600)
}

// desktop:true → 데스크톱 패리티도 캡처
const STATES = [
  { surface: 'map', name: 'base', desktop: true, setup: base },
  { surface: 'map', name: 'aviation-sheet', setup: async (p) => { await base(p); await p.getByRole('button', { name: '항공정보 레이어' }).click(); await p.waitForSelector('.mobile-sheet'); await p.waitForTimeout(800) } },
  { surface: 'map', name: 'met-sheet', setup: async (p) => { await base(p); await p.getByRole('button', { name: '기상정보 레이어' }).click(); await p.waitForSelector('.mobile-sheet'); await p.waitForTimeout(800) } },
  { surface: 'map', name: 'airmet-list', setup: async (p) => { await base(p); await p.locator('.advisory-chip', { hasText: 'AIRMET' }).first().click(); await p.waitForTimeout(700) } },
  { surface: 'map', name: 'warning-list', setup: async (p) => { await base(p); await p.locator('.advisory-chip', { hasText: '공항경보' }).first().click(); await p.waitForTimeout(700) } },

  { surface: 'airport', name: 'current', desktop: true, setup: airport },
  { surface: 'airport', name: 'metar', setup: async (p) => { await airport(p); await tab(p, 'METAR'); await p.waitForTimeout(500) } },
  { surface: 'airport', name: 'taf', setup: async (p) => { await airport(p); await tab(p, 'TAF'); await p.waitForTimeout(500) } },
  { surface: 'airport', name: 'amos', setup: async (p) => { await airport(p); await tab(p, 'AMOS'); await p.waitForTimeout(500) } },
  { surface: 'airport', name: 'warning', setup: async (p) => { await airport(p); await tab(p, '공항경보'); await p.waitForTimeout(500) } },
  { surface: 'airport', name: 'weather-info', setup: async (p) => { await airport(p); await tab(p, '기상정보'); await p.waitForTimeout(500) } },

  { surface: 'briefing', name: 'input', setup: openBriefing },
  { surface: 'briefing', name: 'perf-step', setup: async (p) => { await openBriefing(p); await p.getByRole('button', { name: '성능·시간' }).click().catch(() => {}); await p.waitForTimeout(600) } },
  { surface: 'briefing', name: 'vfr', setup: async (p) => { await openBriefing(p); await p.locator('.route-type-seg', { hasText: 'VFR' }).click().catch(() => {}); await p.waitForTimeout(600) } },
  { surface: 'briefing', name: 'result', setup: async (p) => {
      await openBriefing(p)
      await pickAirport(p, 0, 'RKSI'); await pickAirport(p, 1, 'RKPK')
      await p.getByRole('button', { name: '경로 검색' }).click().catch(() => {})
      await p.waitForTimeout(4000) // 경로 검색 결과 렌더 대기
    } },
]

let commit = 'unknown'
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch {}

await mkdir(fileURLToPath(OUT), { recursive: true })
const browser = await chromium.launch()
const manifest = { capturedAt: new Date().toISOString(), commit, label: LABEL, viewports: { mobile: MOBILE, desktop: DESKTOP }, states: [] }

async function capture(vpName, vp, st) {
  const context = await browser.newContext({ viewport: vp })
  const page = await context.newPage()
  const rec = { surface: st.surface, name: st.name, viewport: vpName }
  try {
    await st.setup(page)
    const dir = new URL(`${st.surface}/${st.name}/`, OUT)
    await mkdir(fileURLToPath(dir), { recursive: true })
    const png = fileURLToPath(new URL(`${vpName}-${LABEL}.png`, dir))
    await page.screenshot({ path: png, fullPage: false })
    let violations = null
    try {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))
    } catch (e) { violations = { error: String(e) } }
    await writeFile(fileURLToPath(new URL(`${vpName}-${LABEL}.axe.json`, dir)), JSON.stringify(violations, null, 2), 'utf8')
    rec.ok = true; rec.png = png; rec.axeViolations = Array.isArray(violations) ? violations.length : 'error'
    console.log(`OK  ${st.surface}/${st.name} [${vpName}]  axe=${rec.axeViolations}`)
  } catch (e) {
    rec.ok = false; rec.error = String(e).split('\n')[0]
    console.log(`FAIL ${st.surface}/${st.name} [${vpName}]  ${rec.error}`)
  } finally { await context.close(); manifest.states.push(rec) }
}

try {
  for (const st of STATES) {
    await capture('mobile', MOBILE, st)
    if (st.desktop) await capture('desktop', DESKTOP, st)
  }
} finally {
  await browser.close()
  await writeFile(fileURLToPath(new URL('manifest.json', OUT)), JSON.stringify(manifest, null, 2), 'utf8')
  const okc = manifest.states.filter((s) => s.ok).length
  console.log(`\n${okc}/${manifest.states.length} captured · manifest.json written`)
  if (manifest.states.some((state) => state.ok === false)) process.exitCode = 1
}
