// Read-only reference download. Does not publish or clean up operational KTG runs.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { NetCDFReader } from '../../backend/node_modules/netcdfjs/lib/index.js'
import config from '../../backend/src/config.js'
import { requestObservedApi } from '../../backend/src/lib/request-observability.js'
import { buildKtgUrl, selectKtgRunCredential } from '../../backend/src/processors/ktg-processor.js'
import { addForecastHoursKtg } from '../../backend/src/processors/ktg-model.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { values: args } = parseArgs({ options: {
  tmfc: { type: 'string', default: '2026091006' },
  hours: { type: 'string', default: '6,9' },
  credential: { type: 'string', default: 'existing' },
  output: { type: 'string', default: path.join(repo, 'artifacts/kim-turbulence-comparison') },
} })
const hours = [...new Set(args.hours.split(',').map(Number))]
if (!/^\d{10}$/.test(args.tmfc) || !hours.length || hours.some(h => !Number.isInteger(h) || h < 0 || h > 30)
  || !['existing', 'radar'].includes(args.credential)) throw new Error('Invalid comparison download arguments')
const credential = args.credential === 'radar' ? process.env.KMA_RADAR_SATELLITE_AUTH_KEY : selectKtgRunCredential(args.tmfc)
if (!credential || (args.credential === 'radar' && process.env.KMA_RADAR_SATELLITE_ENABLED === '0')) throw new Error('Requested credential unavailable')
fs.mkdirSync(args.output, { recursive: true })
for (const hf of hours) {
  const file = path.join(args.output, `ktg-${args.tmfc}-hf${hf}.nc`)
  if (fs.existsSync(`${file}.json`) && JSON.parse(fs.readFileSync(`${file}.json`)).metadata.contentDisposition) {
    console.log(`KTG ${args.tmfc} +${hf}h: cached`)
    continue
  }
  const response = await requestObservedApi({ operation: 'ktg',
    url: buildKtgUrl({ tmfc: args.tmfc, ef: hf, credential }),
    validate: r => { if (!r.ok) throw new Error(`KTG HTTP ${r.status}`) },
  })
  const disposition = response.headers.get('content-disposition') || ''
  const expectedName = `amo_kimg_ktgm_low_f${String(hf).padStart(2, '0')}_${args.tmfc}.nc`
  if (!disposition.includes(expectedName)) throw new Error('KTG response filename does not match requested KIM run/hour')
  const buffer = Buffer.from(await response.arrayBuffer())
  const nc = new NetCDFReader(buffer)
  const dim = name => nc.dimensions.find(d => d.name === name)?.size
  const size = dim('ny') * dim('nx')
  const alt = nc.getDataVariable('alt'), lat = nc.getDataVariable('lat'), lon = nc.getDataVariable('lon'), ktg = nc.getDataVariable('KTG')
  if (!Number.isSafeInteger(size) || size < 1 || alt.length !== dim('nz') || lat.length !== size || lon.length !== size || ktg.length !== size * alt.length
    || !lat.every(Number.isFinite) || !lon.every(Number.isFinite)) throw new Error('Invalid KTG dimensions/coordinates')
  const metadata = { dimensions: nc.dimensions, attributes: nc.globalAttributes,
    variables: nc.variables.map(v => ({ name: v.name, dimensions: v.dimensions, attributes: v.attributes })), contentDisposition: disposition }
  const payload = { tmfc: args.tmfc, hf, validTime: addForecastHoursKtg(args.tmfc, hf),
    fetchedAt: new Date().toISOString(), credential: args.credential, sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    metadata, alt, lat, lon, ktg }
  fs.writeFileSync(file, buffer)
  fs.writeFileSync(`${file}.json`, JSON.stringify(payload))
  console.log(`KTG ${args.tmfc} +${hf}h: ${buffer.length} bytes, ${alt.length} heights, ${expectedName}`)
}
