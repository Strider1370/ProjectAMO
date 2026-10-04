import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../frontend/node_modules/esbuild/lib/main.js'
import { loadAcimReference, seasonForTmfc } from './lib/acim-reference.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const dir = path.join(repo, 'docs/design/mockups/acim-reference-preview')
const argument = process.argv[2]
const probeDir = argument ? path.resolve(argument) : path.join(repo, 'artifacts/acim-probe', (await fs.readdir(path.join(repo, 'artifacts/acim-probe'))).sort().at(-1))
const probe = JSON.parse(await fs.readFile(path.join(probeDir, 'report.json'), 'utf8'))
let live = null
if (probe.outcome === 'success') live = JSON.parse(await fs.readFile(path.join(probeDir, 'field.json'), 'utf8'))
const tmfc = probe.tmfc
const runAt = new Date(`${tmfc.slice(0, 4)}-${tmfc.slice(4, 6)}-${tmfc.slice(6, 8)}T${tmfc.slice(8, 10)}:00:00Z`).toISOString()
const previous = await fs.readFile(path.join(repo, 'docs/design/mockups/acim-altitude-map.html'), 'utf8')
const land = JSON.parse(previous.match(/const LAND = (\[.*?\]);/s)[1])
const data = { reference: loadAcimReference(repo), runAt, season: seasonForTmfc(tmfc), land, live, probe: { tmfc, hf: probe.hf, outcome: probe.outcome, temporalSemanticsVerified: probe.temporalSemanticsVerified } }
const bundle = await build({ entryPoints: [path.join(dir, 'preview.js')], bundle: true, write: false, format: 'iife', minify: true, logLevel: 'warning' })
const tokens = await fs.readFile(path.join(repo, 'frontend/src/shared/theme/tokens.css'), 'utf8')
const css = await fs.readFile(path.join(dir, 'preview.css'), 'utf8')
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ACIM 원본 계산식 지도 예시 · ProjectAMO</title><style>${tokens}\n${css}</style></head><body><main id="app"></main><script>window.ACIM_PREVIEW=${JSON.stringify(data).replaceAll('<', '\\u003c')};</script><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
const out = path.join(repo, 'docs/design/mockups/acim-reference-map.html')
await fs.writeFile(out, html)
console.log(path.relative(repo, out))
