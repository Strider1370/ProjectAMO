// 운영 사이트 게이트 — 어떤 stn 코드가 실제로 최신 QCD HDF5를 주는지 실측한다.
// 키는 어떤 출력에도 남기지 않는다(스펙 Gate 1).
import config from '../src/config.js'

const CANDIDATE_SITES = (process.env.RADAR_QCD_PROBE_SITES
  || 'BRI,GDK,KWK,KSN,MYN,PSN,GSN,SSP,JNI,IIA,GNG,PMK,SBS,YIT,CHY,MUJ,SDG,ODS')
  .split(',').map((s) => s.trim()).filter(Boolean)

function kstTm(offsetMinutes) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 - offsetMinutes * 60 * 1000)
  kst.setUTCMinutes(Math.floor(kst.getUTCMinutes() / 5) * 5, 0, 0)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
}

async function probe(stn, tm) {
  const url = `${config.radar_echo_top.url}?tm=${tm}&data=qcd&stn=${stn}&authKey=${config.api.radar_satellite_auth_key}`
  const startedAt = Date.now()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    const buffer = Buffer.from(await response.arrayBuffer())
    const isHdf5 = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x48 && buffer[2] === 0x44 && buffer[3] === 0x46
    return { stn, ok: response.ok && isHdf5, status: response.status, bytes: buffer.length, ms: Date.now() - startedAt, buffer: isHdf5 ? buffer : null }
  } catch (error) {
    return { stn, ok: false, status: 0, bytes: 0, ms: Date.now() - startedAt, error: error.message, buffer: null }
  }
}

const tm = kstTm(Number(process.env.RADAR_QCD_PROBE_DELAY_MIN || 15))
const results = []
for (const stn of CANDIDATE_SITES) results.push(await probe(stn, tm))

const ok = results.filter((r) => r.ok)
console.log(`tm=${tm} candidates=${results.length} ok=${ok.length}`)
for (const r of results) console.log(`${r.stn}\t${r.ok ? 'OK' : 'FAIL'}\tstatus=${r.status}\tbytes=${r.bytes}\tms=${r.ms}${r.error ? `\t${r.error}` : ''}`)
console.log(`\nCONFIRMED_SITES=${ok.map((r) => r.stn).join(',')}`)

if (process.env.RADAR_QCD_SAVE_FIXTURE && ok.length) {
  const fs = await import('node:fs')
  fs.mkdirSync('artifacts/radar-qcd', { recursive: true })
  for (const r of ok.slice(0, 2)) fs.writeFileSync(`artifacts/radar-qcd/${r.stn}_${tm}.h5`, r.buffer)
  console.log(`saved ${Math.min(2, ok.length)} fixture(s) to artifacts/radar-qcd/`)
}
