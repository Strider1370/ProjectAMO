// Read-only, offline design comparison. Does not start servers or call weather APIs.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { readKimNwpIndex, readKimNwpGrid } from '../backend/src/processors/kim-nwp-store.js'
import { buildKimIcingFieldFromGrid, buildKimTemperatureFieldFromGrid, buildKimCloudPotentialFieldFromGrid } from '../backend/src/processors/kim-nwp-model.js'
import { loadRouteCrossSection } from '../backend/src/briefing/enroute-cross-section.js'
import { buildIcingGeometry, buildTemperatureContours } from '../frontend/src/features/weather-overlays/lib/cloudIcingModel.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(process.argv[2] || path.join(repo, 'backend/data'))
const index = readKimNwpIndex(root)
if (!index?.latestRun) throw new Error('Stored KIM data is required')
const route = [[126.45, 37.46], [126.49, 33.51]]
const levels = ['600hPa', '500hPa', '450hPa']
const times = index.times.slice(0, 2)
const maps = {}, profiles = {}
for (const { hf } of times) {
  const profile = loadRouteCrossSection({ root, routeGeometry: { type: 'LineString', coordinates: route }, body: { tmfc: index.latestRun, hf, sampleSpacingMeters: 5000 } })
  profiles[hf] = { totalDistanceNm: profile.totalDistanceNm, levels: profile.crossSection.levels.map(level => ({ pressure: level.pressure, altFt: level.altFt, values: level.values.map(v => ({ distanceNm: v.distanceNm, spread: v.spread, icing: v.icing, t: v.t })) })) }
  for (const levelId of levels) {
    const grid = readKimNwpGrid({ root, model: index.model, tmfc: index.latestRun, hf, levelId })
    const icing = buildKimIcingFieldFromGrid(grid)
    const fullCloud = buildKimCloudPotentialFieldFromGrid(grid)
    const cloud = Object.fromEntries(['grid', 'level', 'encoding', 'scale', 'offset', 'spread'].map(key => [key, fullCloud[key]]))
    maps[`${hf}:${levelId}`] = { cloud, icing: buildIcingGeometry(icing), contours: buildTemperatureContours(buildKimTemperatureFieldFromGrid(grid), true), counts: icing.icingGrade.reduce((a, grade) => { if (grade >= 0 && grade <= 3) a[grade]++; return a }, [0, 0, 0, 0]) }
  }
}
const data = { tmfc: index.latestRun, times, levels, route, maps, profiles, provinces: JSON.parse(await fs.readFile(path.join(repo, 'frontend/public/Geo/sido.json'), 'utf8')) }
const dir = path.join(repo, 'docs/design/mockups/cloud-icing-variants')
const bundle = await build({ entryPoints: [path.join(dir, 'preview.js')], bundle: true, write: false, format: 'iife', minify: true, logLevel: 'warning' })
const css = await fs.readFile(path.join(dir, 'preview.css'), 'utf8')
const tokens = await fs.readFile(path.join(repo, 'frontend/src/shared/theme/tokens.css'), 'utf8')
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A안 · 실제 KIM 구름·착빙 · ProjectAMO</title><style>${tokens}\n${css}</style></head><body><main id="app"></main><dialog id="zoom-dialog"><button id="close-dialog" type="button" aria-label="확대 보기 닫기">닫기 ✕</button><div id="zoom-content"></div></dialog><script>window.CLOUD_ICING_DESIGN_DATA=${JSON.stringify(data).replaceAll('<', '\\u003c')};</script><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
const out = path.join(repo, 'docs/design/mockups/cloud-icing-variants.html')
await fs.writeFile(out, html)
await fs.mkdir(path.join(repo, 'artifacts'), { recursive: true })
await fs.writeFile(path.join(repo, 'artifacts/cloud-icing-variants.html'), html)
console.log(out)
