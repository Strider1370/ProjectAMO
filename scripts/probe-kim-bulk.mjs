// Manual single-request probe; does not start collectors or touch production snapshots.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import dotenv from '../backend/node_modules/dotenv/lib/main.js'
import { parseKimGridText } from '../backend/src/parsers/kim-grid-parser.js'

const repo = fileURLToPath(new URL('../', import.meta.url))
const endpoint = 'https://apihub-org.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std'
const regions = {
  small: { lonMin: 126, lonMax: 127, latMin: 36, latMax: 37 },
  current: { lonMin: 119, lonMax: 136, latMin: 30, latMax: 44 },
  southeast: { lonMin: 100, lonMax: 145, latMin: 6, latMax: 50 },
}

export function planProbe({ tmfc, hf = 0, region = 'small', now = new Date() } = {}) {
  const bounds = regions[region]
  if (!bounds) throw new Error('--region: small, current, southeast 중 하나를 지정하세요.')
  if (!Number.isInteger(hf) || hf < 0 || hf > 12) throw new Error('--hf: 0~12 정수를 지정하세요.')
  const released = new Date(now.getTime() - 6 * 3600000)
  released.setUTCHours(Math.floor(released.getUTCHours() / 6) * 6, 0, 0, 0)
  tmfc ??= released.toISOString().replace(/[-:T]/g, '').slice(0, 10)
  const runAt = /^\d{10}$/.test(tmfc)
    ? new Date(`${tmfc.slice(0, 4)}-${tmfc.slice(4, 6)}-${tmfc.slice(6, 8)}T${tmfc.slice(8, 10)}:00:00Z`)
    : new Date(NaN)
  if (!Number.isFinite(runAt.getTime()) || runAt.toISOString().replace(/[-:T]/g, '').slice(0, 10) !== tmfc
    || ![0, 6, 12, 18].includes(runAt.getUTCHours()) || runAt > now) {
    throw new Error('--tmfc: UTC YYYYMMDDHH 형식의 과거 00/06/12/18 회차를 지정하세요.')
  }
  const sub = [bounds.lonMin * 12 + 1, (bounds.latMin + 90) * 12 + 1,
    bounds.lonMax * 12 + 1, (bounds.latMax + 90) * 12 + 1].join(',')
  return { endpoint, model: 'KIMG/NE57', tmfc, hf, variable: 'T', level: 850, region,
    bounds, sub, nx: (bounds.lonMax - bounds.lonMin) * 12 + 1,
    ny: (bounds.latMax - bounds.latMin) * 12 + 1 }
}

export function assertServiceWindow(now) {
  // The approval email does not name a timezone; this manual probe interprets it as KST.
  const kst = new Date(now.getTime() + 9 * 3600000)
  const date = kst.toISOString().slice(0, 10)
  if (date < '2026-10-07' || date > '2026-11-06' || kst.getUTCHours() < 15) {
    throw new Error('승인 기간/시간 밖입니다: 2026-10-07~11-06, KST 15:00~24:00.')
  }
}

export function redact(value, key) {
  return String(value).replaceAll(key, '[redacted]').replaceAll(encodeURIComponent(key), '[redacted]')
    .replace(/(authKey|serviceKey)\s*[=:]\s*[^\s&<>"']+/gi, '$1=[redacted]')
}

export function validateGrid(text, plan) {
  const grid = parseKimGridText(text, { variable: plan.variable, level: plan.level, bounds: plan.bounds })
  const stamp = `.ft${String(plan.hf).padStart(3, '0')}.${plan.tmfc}.nc`
  const identity = text.includes(stamp) && /\/NE57\//.test(text)
    && /=\s*T,\s*unit\s*=\s*K\s*,\s*level\s*=\s*850\s*,/.test(text)
  const headerKeys = { lon1: 'lonMin', lat1: 'latMin', lon2: 'lonMax', lat2: 'latMax' }
  const areaMatches = Object.entries(headerKeys).every(([name, bound]) => {
    const match = text.match(new RegExp(`\\b${name}\\s*=\\s*([-+\\d.]+)`))
    return match && Number(match[1]) === plan.bounds[bound]
  })
  if (!identity || !areaMatches || grid.nx !== plan.nx || grid.ny !== plan.ny) {
    throw new Error('응답의 모델·시각·변수·기압면·영역·격자 크기가 요청과 일치하지 않습니다.')
  }
  const valid = grid.values.filter(value => value > 100 && value < 400)
  if (!valid.length) throw new Error('유효한 기온 데이터가 없습니다.')
  let min = Infinity, max = -Infinity
  for (const value of valid) { min = Math.min(min, value); max = Math.max(max, value) }
  return { nx: grid.nx, ny: grid.ny, points: grid.values.length, validPoints: valid.length,
    missingPoints: grid.values.length - valid.length, unit: 'K', min, max }
}

async function main() {
  const { values } = parseArgs({ options: { tmfc: { type: 'string' }, hf: { type: 'string' },
    region: { type: 'string' }, 'dry-run': { type: 'boolean' } } })
  const now = new Date()
  const plan = planProbe({ tmfc: values.tmfc, hf: Number(values.hf ?? 0), region: values.region, now })
  if (values['dry-run']) { console.log(JSON.stringify({ ...plan, networkRequests: 0 }, null, 2)); return }
  assertServiceWindow(now)
  // Same dotenv precedence as the backend: nearest .env wins; shell values take priority.
  for (const envPath of [path.join(repo, 'backend/.env'), path.join(repo, '.env')]) {
    try { await fs.access(envPath); dotenv.config({ path: envPath }); break } catch { /* try root */ }
  }
  const key = process.env.KMA_BULK_AUTH_KEY?.trim()
  if (!key || /발급받은|실제|YOUR_|인증키/.test(key)) throw new Error('.env에 KMA_BULK_AUTH_KEY를 등록하세요.')
  const url = new URL(endpoint)
  url.search = new URLSearchParams({ group: 'KIMG', nwp: 'NE57', data: 'P', name: 'T', level: '850',
    tmfc: plan.tmfc, hf: String(plan.hf), map: 'S', sub: plan.sub, disp: 'A', help: '1', authKey: key }).toString()
  const out = path.join(repo, 'artifacts/kim-bulk-probe', now.toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(out, { recursive: true })
  const report = { testedAt: now.toISOString(), ...plan, credentialCategory: 'bulk', maxAttempts: 1,
    serviceTimezoneAssumption: 'Asia/Seoul', requests: 0, receivedBytes: 0, outcome: 'failed' }
  const started = performance.now()
  try {
    report.requests = 1
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' })
    report.httpStatus = response.status
    report.contentType = response.headers.get('content-type')
    const chunks = []
    for await (const chunk of response.body) {
      report.receivedBytes += chunk.byteLength
      if (report.receivedBytes > 16 * 1024 * 1024) throw new Error('단건 진단 응답이 16MiB 상한을 초과했습니다.')
      chunks.push(Buffer.from(chunk))
    }
    const bytes = Buffer.concat(chunks)
    let text = new TextDecoder(/euc-kr|ks_c_5601|cp949/i.test(report.contentType || '') ? 'euc-kr' : 'utf-8').decode(bytes)
    if (text.includes('\uFFFD')) text = new TextDecoder('euc-kr').decode(bytes)
    const safeText = redact(text, key)
    await fs.writeFile(path.join(out, 'response.txt'), safeText)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${safeText.slice(0, 500)}`)
    report.grid = validateGrid(text, plan)
    report.outcome = 'success'
  } catch (error) {
    report.error = redact(error.message, key)
    if (error.cause?.code) report.networkErrorCode = String(error.cause.code)
    process.exitCode = 1
  }
  report.durationMs = Math.round(performance.now() - started)
  report.output = path.relative(repo, out)
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
