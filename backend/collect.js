import store from './src/store.js'
import config from './src/config.js'

const TYPE_MAP = {
  airport_info:    () => import('./src/processors/airport-info-processor.js'),
  metar:           () => import('./src/processors/metar-processor.js'),
  taf:             () => import('./src/processors/taf-processor.js'),
  warning:         () => import('./src/processors/warning-processor.js'),
  amos:            () => import('./src/processors/amos-processor.js'),
  sigmet:          () => import('./src/processors/sigmet-processor.js'),
  airmet:          () => import('./src/processors/airmet-processor.js'),
  lightning:       () => import('./src/processors/lightning-processor.js'),
  ground_forecast: () => import('./src/processors/ground-forecast-processor.js'),
  environment:     () => import('./src/processors/environment-processor.js'),
}

const type = process.argv[2]

if (!type || !TYPE_MAP[type]) {
  console.log('Usage: node collect.js <type>')
  console.log('Available:', Object.keys(TYPE_MAP).join(', '))
  process.exit(1)
}

store.ensureDirectories(config.storage.base_path)
store.initFromFiles(config.storage.base_path)

console.log(`Collecting ${type}...`)
const mod = await TYPE_MAP[type]()
const result = await mod.default.process()
console.log('Result:', JSON.stringify(result, null, 2))
