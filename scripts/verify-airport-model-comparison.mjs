#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactRoot = path.join(projectRoot, 'artifacts', 'airport-model-comparison')
const supportedAirports = ['RKSI', 'RKSS', 'RKPC', 'RKPU', 'RKJY', 'RKJB', 'RKNY', 'RKPK']
const supportedModels = ['kim', 'ecmwf', 'gfs', 'icon']

function usage() {
  return `Usage: node scripts/verify-airport-model-comparison.mjs --airport <RKSI|RKPU|fullsupport> --output artifacts/airport-model-comparison/<task> [--model <kim|ecmwf|gfs|icon|all>] [--kim-run <YYYYMMDDHH>]

Runs production collectors against current provider data in an isolated temporary DATA_PATH.
External calls have bounded timeouts; unavailable providers are recorded as failures without retries or wait loops.`
}

function parseArgs(argv) {
  const options = { model: 'all' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--help' || key === '-h') return { help: true }
    if (!['--airport', '--output', '--model', '--kim-run', '--run'].includes(key) || !argv[i + 1]) throw new Error(`invalid_argument:${key}`)
    options[key === '--run' ? 'kim-run' : key.slice(2)] = argv[++i]
  }
  if (!['RKSI', 'RKPU', 'fullsupport'].includes(options.airport)) throw new Error('invalid_airport')
  const models = options.model === 'all' ? supportedModels : options.model.split(',')
  if (!models.length || models.some((model) => !supportedModels.includes(model))) throw new Error('invalid_model')
  if (!options.output) throw new Error('output_required')
  if (options['kim-run'] && !/^\d{10}$/.test(options['kim-run'])) throw new Error('invalid_kim_run')
  const output = path.resolve(projectRoot, options.output)
  const relative = path.relative(artifactRoot, output)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('output_must_be_task_directory_under_artifacts_airport_model_comparison')
  return { airports: options.airport === 'fullsupport' ? supportedAirports : [options.airport], models: [...new Set(models)], output, kimRun: options['kim-run'] || null }
}

function safeText(value) {
  return String(value || 'collection failed')
    .replace(/https?:\/\/\S+/g, '[upstream]')
    .replace(/(?:authKey|token|api_key|authorization)\s*[=:]\s*\S+/gi, '[credential]')
    .slice(0, 300)
}

function kimBox(airport) {
  const x = airport.lon * 12 + 1
  const y = (airport.lat + 90) * 12 + 1
  const x0 = Math.floor(x), x1 = Math.ceil(x), y0 = Math.floor(y), y1 = Math.ceil(y)
  return {
    sub: `${x0},${y0},${x1},${y1}`,
    bounds: { lonMin: (x0 - 1) / 12, lonMax: (x1 - 1) / 12, latMin: (y0 - 1) / 12 - 90, latMax: (y1 - 1) / 12 - 90, dx: 1 / 12, dy: 1 / 12 },
  }
}

function modelSummary({ model, collector, records, requests, expectedAirportCount }) {
  const allowedReasons = new Set(['structural_f000', 'not_provided', 'not_detected_below_limit', 'no_ceiling', 'outside_run'])
  const allowedNull = [], providerNull = [], missingFields = []
  for (const entry of records) for (const record of entry.records) {
    for (const [field, provenance] of Object.entries(record.field_provenance || {})) {
      if (record[field] !== null) continue
      const item = { airport: entry.airport_icao, validAt: record.valid_at, field, reason: provenance?.missing_reason || record.ceiling_status || 'missing_reason_absent' }
      if (allowedReasons.has(item.reason)) allowedNull.push(item)
      else if (item.reason === 'provider_missing' || item.reason === 'missing_input') providerNull.push(item)
      else missingFields.push(item)
    }
  }
  const windows = Object.fromEntries(records.map((entry) => [entry.airport_icao, {
    runAt: entry.run_at, startAt: entry.window_start_at, endAt: entry.window_end_at,
    forecastHours: entry.records.map((record) => record.forecast_hour), recordCount: entry.records.length,
  }]))
  return {
    model,
    success: records.length === expectedAirportCount && collector.failedAirports?.length === 0 && missingFields.length === 0,
    requestedRunAt: collector.requestedRunAt || collector.run_at || null,
    requestedWindows: collector.windows || {},
    actualRunAt: [...new Set(records.map((entry) => entry.run_at))],
    windows,
    fieldCount: records.reduce((count, entry) => count + entry.records.reduce((n, record) => n + Object.keys(record.field_provenance || {}).length, 0), 0),
    allowedNull,
    providerNull,
    missingFields,
    publishedAirports: collector.publishedAirports || [],
    reusedAirports: collector.reusedAirports || [],
    failedAirports: collector.failedAirports || [],
    deferred: Boolean(collector.deferred),
    requests: { count: requests.length, bytes: requests.reduce((sum, request) => sum + (request.bytes || 0), 0), items: requests },
    errors: (collector.errors || []).map((error) => ({ airport: error.airport_icao || null, code: safeText(error.code), message: safeText(error.message) })),
  }
}

async function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`${safeText(error.message)}\n\n${usage()}`); process.exitCode = 2; return }
  if (args.help) { console.log(usage()); return }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-model-verification-'))
  process.env.DATA_PATH = temporaryRoot
  fs.mkdirSync(args.output, { recursive: true })

  const [{ default: config }, comparison, kimModule, gfsModule, openMeteoModule, lifecycle, modelModule, apiClient, credentialModule, processorModule, observability] = await Promise.all([
    import('../backend/src/config.js'), import('../backend/src/airport-model-comparison/store.js'),
    import('../backend/src/airport-model-comparison/kim.js'), import('../backend/src/airport-model-comparison/gfs.js'),
    import('../backend/src/airport-model-comparison/open-meteo.js'), import('../backend/src/airport-model-comparison/lifecycle.js'), import('../backend/src/airport-model-comparison/model.js'),
    import('../backend/src/api-client.js'), import('../backend/src/processors/kim-run-credential.js'),
    import('../backend/src/processors/kim-surface-wind-processor.js'), import('../backend/src/lib/request-observability.js'),
  ])
  const airports = config.airports.filter((airport) => args.airports.includes(airport.icao))
  if (airports.length !== args.airports.length) throw new Error('configured_airport_missing')
  const nowMs = Date.now()
  const requests = Object.fromEntries(supportedModels.map((model) => [model, []]))

  const observedRequest = (model) => async (input) => {
    const startedAt = new Date().toISOString()
    try {
      const response = await observability.requestObservedApi(input)
      const bytes = (await response.clone().arrayBuffer()).byteLength
      requests[model].push({ operation: input.operation, startedAt, finishedAt: new Date().toISOString(), status: response.status, bytes })
      return response
    } catch (error) {
      requests[model].push({ operation: input.operation, startedAt, finishedAt: new Date().toISOString(), bytes: 0, error: safeText(error.message) })
      throw error
    }
  }
  const metaRun = async (model, directory) => {
    const response = await observedRequest(model)({ operation: `open_meteo_${model}_meta`, url: new URL(`https://api.open-meteo.com/data/${directory}/static/meta.json`), options: {} })
    if (!response.ok) throw new Error(`open_meteo_http_${response.status}`)
    const meta = await response.json()
    if (!Number.isInteger(meta.last_run_initialisation_time)) throw new Error('invalid_open_meteo_meta_run')
    return new Date(meta.last_run_initialisation_time * 1000).toISOString()
  }

  const kimCandidates = args.kimRun ? [{ tmfc: args.kimRun }] : processorModule.resolveKimSurfaceWindCandidates(new Date(nowMs))
  const runHints = {
    kim: kimCandidates[0].tmfc,
    gfs: lifecycle.expectedNwpRun({ model: 'gfs', nowMs }),
    ecmwf: null,
    icon: null,
  }
  for (const [model, directory] of [['ecmwf', 'ecmwf_ifs025'], ['icon', 'dwd_icon']]) {
    if (!args.models.includes(model) && !(model === 'icon' && args.models.includes('ecmwf'))) continue
    try { runHints[model] = await metaRun(model, directory) } catch (error) { requests[model].push({ error: safeText(error.message) }) }
  }
  const results = []
  const executionOrder = ['kim', 'gfs', 'icon', 'ecmwf'].filter((model) => args.models.includes(model))
  for (const model of executionOrder) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error(`${model}_verification_timeout`)), 5 * 60_000)
    const requestedRunAt = model === 'kim' ? runHints.kim : runHints[model]
    const requestedWindow = requestedRunAt
      ? modelModule.selectForecastWindow({ model, run_at: model === 'kim' ? new Date(Date.UTC(+requestedRunAt.slice(0, 4), +requestedRunAt.slice(4, 6) - 1, +requestedRunAt.slice(6, 8), +requestedRunAt.slice(8, 10))).toISOString() : requestedRunAt })
      : null
    let collector = { model, requestedRunAt, publishedAirports: [], reusedAirports: [], failedAirports: airports.map((airport) => airport.icao), windows: requestedWindow ? Object.fromEntries(airports.map((airport) => [airport.icao, requestedWindow])) : {}, errors: [] }
    try {
      if (model === 'kim') {
        let selectedReport = null
        for (const candidate of kimCandidates) {
          const candidateCollector = { model: 'kim', run_at: candidate.tmfc, publishedAirports: [], reusedAirports: [], failedAirports: [], errors: [], windows: {} }
          try {
            const credential = credentialModule.selectKimRunCredential({ tmfc: candidate.tmfc, kimCredential: config.api.kim_nwp_auth_key, aviationCredential: config.api.auth_key })
            for (const airport of airports) {
              const box = kimBox(airport)
              const cacheRoot = path.join(args.output, 'raw', 'kim', airport.icao)
              const fetchGrid = async (input) => {
                for(let attempt=1;attempt<=3;attempt++) {
                  const startedAt=new Date().toISOString()
                  try {
                    const text=await apiClient.fetchKimGrid({...input,sub:box.sub,signal:controller.signal})
                    requests.kim.push({operation:'kim_grid',run:candidate.tmfc,airport:airport.icao,forecastHour:input.hf,variable:input.name,attempt,startedAt,finishedAt:new Date().toISOString(),bytes:Buffer.byteLength(text)})
                    return text
                  } catch(error) {
                    requests.kim.push({operation:'kim_grid',run:candidate.tmfc,airport:airport.icao,forecastHour:input.hf,variable:input.name,attempt,startedAt,finishedAt:new Date().toISOString(),bytes:0,error:safeText(error.message)})
                    // Only a transient transport failure is retried in this bounded
                    // verification; HTTP/provider failures retain their actual result.
                    if(controller.signal.aborted || error.message!=='fetch failed' || attempt===3) throw error
                  }
                }
              }
              const loadHour = kimModule.createKimComparisonHourLoader({ root: cacheRoot, credential, signal: controller.signal, fetchGrid, bounds: box.bounds })
              const report = await kimModule.collectKimAirportComparison({ tmfc: candidate.tmfc, forecastHours: Array.from({ length: 13 }, (_, hour) => hour), credential, signal: controller.signal, root: temporaryRoot, airports: [airport], loadHour })
              for (const key of ['publishedAirports', 'reusedAirports', 'failedAirports', 'errors']) candidateCollector[key].push(...(report[key] || []))
              Object.assign(candidateCollector.windows, report.windows || {})
            }
            if (candidateCollector.failedAirports.length) throw new Error('kim_candidate_incomplete')
            selectedReport = candidateCollector
            runHints.kim = candidate.tmfc
            break
          } catch (error) {
            candidateCollector.errors.push({ code: error.code || error.message, message: safeText(error.message) })
            candidateCollector.failedAirports.push(...airports.filter((airport) => !candidateCollector.publishedAirports.includes(airport.icao) && !candidateCollector.reusedAirports.includes(airport.icao)).map((airport) => airport.icao))
            selectedReport = candidateCollector
            if (args.kimRun || controller.signal.aborted) break
          }
        }
        collector = selectedReport || collector
      } else if (model === 'gfs') {
        collector = await gfsModule.collectGfs({ signal: controller.signal, root: temporaryRoot, airports, requestObservedApi: observedRequest('gfs'), clock: () => nowMs, run_at: runHints.gfs })
      } else {
        if (!runHints[model]) throw new Error(`${model}_metadata_unavailable`)
        const verifiedRuns = Object.fromEntries(airports.map((airport) => [airport.icao, comparison.readAirportComparison({ root: temporaryRoot, airport_icao: airport.icao }).models.map(({ model: verifiedModel, run_at }) => ({ model: verifiedModel, run_at }))]))
        const selectedRuns = Object.fromEntries(airports.map((airport) => [airport.icao, [...verifiedRuns[airport.icao], { model, run_at: runHints[model] }]]))
        collector.windows = Object.fromEntries(airports.map((airport) => [airport.icao, modelModule.selectForecastWindow({ model, run_at: runHints[model], selectedRuns: selectedRuns[airport.icao] })]))
        collector = await openMeteoModule.collectOpenMeteo({ model, selectedRuns, signal: controller.signal, root: temporaryRoot, airports, request: observedRequest(model), nowMs })
      }
    } catch (error) {
      collector.errors.push({ code: error.code || error.message, message: safeText(error.message) })
    } finally { clearTimeout(timeout) }
    if (model === 'gfs') {
      const runId = runHints.gfs?.replace(/\D/g, '').slice(0, 12)
      const rawSource = runId && path.join(temporaryRoot, 'airport_model_comparison', 'gfs', 'runs', runId, 'raw')
      if (rawSource && fs.existsSync(rawSource)) fs.cpSync(rawSource, path.join(args.output, 'raw', 'gfs', runId), { recursive: true })
    }
    const records = airports.map((airport) => comparison.readAirportComparison({ root: temporaryRoot, airport_icao: airport.icao }).models.find((entry) => entry.model === model)).filter(Boolean)
    results.push(modelSummary({ model, collector: { ...collector, requestedRunAt: runHints[model] }, records, requests: requests[model], expectedAirportCount: airports.length }))
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    displayReferenceAt: new Date(nowMs).toISOString(),
    actualData: true,
    fixtureSuccessUsed: false,
    isolatedDataPath: path.basename(temporaryRoot),
    airports: args.airports,
    models: results,
    complete: results.length > 0 && results.every((result) => result.success),
  }
  fs.writeFileSync(path.join(args.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  for (const airport of airports) fs.writeFileSync(path.join(args.output, `${airport.icao}.json`), `${JSON.stringify(comparison.readAirportComparison({ root: temporaryRoot, airport_icao: airport.icao }), null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ output: path.relative(projectRoot, args.output), complete: report.complete, models: results.map(({ model, success, publishedAirports, failedAirports }) => ({ model, success, publishedAirports, failedAirports })) }, null, 2))
  fs.rmSync(temporaryRoot, { recursive: true, force: true })
  if (!report.complete) process.exitCode = 1
}

await main()
