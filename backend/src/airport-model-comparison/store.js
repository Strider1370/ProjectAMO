import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { MODEL_ORDER } from '../../../shared/airport-model-comparison.js'
import { assertComparisonIdentity, normalizeUtc, validateAirportRecords } from './model.js'

export function contentRevision(value) {
  const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])) : v
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0,24)
}
export function resolveComparisonModelRoot({ root, model }) {
  assertComparisonIdentity({ model })
  return path.join(root,'airport_model_comparison',model)
}
export function comparisonRunId(run_at) { return normalizeUtc(run_at).replace(/\D/g,'').slice(0,12) }
function readJson(file) { return JSON.parse(fs.readFileSync(file,'utf8')) }
function readOptional(file) { try { return readJson(file) } catch(error) { if(error.code === 'ENOENT') return null; throw error } }
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file),{recursive:true})
  const temporary=`${file}.${process.pid}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temporary,JSON.stringify(value)+'\n','utf8'); fs.renameSync(temporary,file) }
  finally { fs.rmSync(temporary,{force:true}) }
}
function payloadPath(modelRoot, pointer) {
  const pattern=/^runs\/\d{12}\/(RKSI|RKSS|RKPC|RKPU|RKJY|RKJB|RKNY|RKPK)\/\d{12}_\d{12}_[a-f0-9]{24}\.json$/
  if (!pattern.test(pointer.path)) throw new Error('invalid_comparison_pointer')
  const file=path.resolve(modelRoot,pointer.path), realRoot=fs.realpathSync(modelRoot), realFile=fs.realpathSync(file)
  if (!realFile.startsWith(realRoot+path.sep)) throw new Error('invalid_comparison_pointer')
  return file
}

function validatePayload(payload, pointer) {
  if(payload.schema_version!==1) throw new Error('invalid_comparison_payload')
  for(const key of ['model','airport_icao','run_at','window_start_at','window_end_at','revision','available_at','collected_at']) if(payload[key] !== pointer[key]) throw new Error('comparison_pointer_mismatch')
  const {model,airport_icao}=pointer
  const records=validateAirportRecords({model,airport_icao,run_at:pointer.run_at,window:{start_at:pointer.window_start_at,end_at:pointer.window_end_at,forecast_hours:payload.records.map(r=>r.forecast_hour)},records:payload.records})
  for(const key of ['available_at','collected_at']) if(records[0][key] !== pointer[key]) throw new Error('comparison_pointer_mismatch')
  const digest=contentRevision({model,airport_icao,run_at:pointer.run_at,records:records.map(({collected_at,...record})=>record)})
  if(digest!==pointer.revision) throw new Error('comparison_revision_mismatch')
  return records
}

export function publishAirportWindow({ root, model, airport_icao, run_at, window, records, metadata = {} }) {
  records=validateAirportRecords({model,airport_icao,run_at,window,records})
  run_at=normalizeUtc(run_at)
  const stableRecords=records.map(({collected_at,...record})=>record)
  const revision=contentRevision({model,airport_icao,run_at,records:stableRecords})
  const modelRoot=resolveComparisonModelRoot({root,model}), latestFile=path.join(modelRoot,'latest.json')
  const latest=readOptional(latestFile) || {schema_version:1,model,airports:{}}
  if (latest.model !== model || !latest.airports) throw new Error('invalid_latest_index')
  if (latest.airports[airport_icao]?.revision === revision && readAirportComparison({root,airport_icao}).models.some(entry=>entry.model===model && entry.revision===revision)) return {revision,published:false}
  const pointer={airport_icao,model,run_at,window_start_at:records[0].window_start_at,window_end_at:records[0].window_end_at,
    path:`runs/${comparisonRunId(run_at)}/${airport_icao}/${comparisonRunId(window.start_at)}_${comparisonRunId(window.end_at)}_${revision}.json`,revision,
    available_at:records[0].available_at,collected_at:records[0].collected_at}
  const payload={schema_version:1,...pointer,records,metadata}
  // No await in this per-model, per-airport read/modify/rename transaction.
  const file=path.join(modelRoot,pointer.path)
  let intact=false
  try {
    const previous=readJson(payloadPath(modelRoot,pointer))
    validatePayload(previous,{...pointer,collected_at:previous.collected_at})
    pointer.collected_at=previous.collected_at
    intact=true
  } catch {}
  // Preserve valid immutable evidence; repair a missing or damaged payload on retry.
  if(!intact) writeAtomic(file,payload)
  const current=readOptional(latestFile) || {schema_version:1,model,airports:{}}
  current.airports[airport_icao]=pointer
  writeAtomic(latestFile,current)
  return {revision,published:true}
}

export function readAirportComparison({ root, airport_icao }) {
  assertComparisonIdentity({model:MODEL_ORDER[0],airport_icao})
  const models=[], issues=[]
  for(const model of MODEL_ORDER) {
    try {
      const modelRoot=resolveComparisonModelRoot({root,model}), latest=readOptional(path.join(modelRoot,'latest.json'))
      if (!latest) continue
      if (latest.schema_version !== 1 || latest.model !== model || !latest.airports) throw new Error('invalid_latest_index')
      const pointer=latest.airports[airport_icao]
      if (!pointer) continue
      if (pointer.airport_icao !== airport_icao || pointer.model !== model) throw new Error('invalid_comparison_pointer')
      const payload=readJson(payloadPath(modelRoot,pointer))
      const records=validatePayload(payload,pointer)
      const {path:internalPath,...entry}=pointer
      models.push({...entry,records})
    } catch { issues.push({model,code:'comparison_read_failed'}) }
  }
  return {revision:contentRevision(models.map(m=>[m.model,m.revision])),models,issues}
}

export function writeCollectionAttempt({ root, model, report }) {
  const cleanText=value=>typeof value === 'string' ? value.replace(/https?:\/\/\S+/g,'[upstream]').replace(/(?:authKey|token|api_key|authorization)\s*[=:]\s*\S+/gi,'[credential]').slice(0,300) : value
  const clean={}
  for(const key of ['started_at','finished_at','target_run_at','run_at','next_check_at','deferred','publishedAirports','reusedAirports','failedAirports','windows','request_count','request_bytes']) if(report[key] !== undefined) clean[key]=report[key]
  clean.errors=(report.errors || []).map(e=>({airport_icao:e.airport_icao || null,code:cleanText(e.code || 'collection_failed'),message:cleanText(e.message || 'collection failed')}))
  writeAtomic(path.join(resolveComparisonModelRoot({root,model}),'last-attempt.json'),clean)
}
export function readCollectionAttempt({ root, model }) {
  try { return readOptional(path.join(resolveComparisonModelRoot({root,model}),'last-attempt.json')) } catch { return null }
}

export function cleanupComparisonRuns({ root, model, maxRuns = 4 }) {
  if (!Number.isInteger(maxRuns) || maxRuns < 1) throw new Error('invalid_max_runs')
  const modelRoot=resolveComparisonModelRoot({root,model}), runsRoot=path.join(modelRoot,'runs')
  if (!fs.existsSync(runsRoot)) return {removedRuns:[],protectedRuns:[],removedPayloads:[]}
  // A broken index must never cause retention to erase last-good payloads.
  const latest=readOptional(path.join(modelRoot,'latest.json'))
  if (!latest?.airports) return {removedRuns:[],protectedRuns:[],removedPayloads:[],issue:'missing_latest_index'}
  const runs=fs.readdirSync(runsRoot,{withFileTypes:true}).filter(e=>e.isDirectory() && /^\d{12}$/.test(e.name)).map(e=>e.name).sort().reverse()
  const pointed=new Set(Object.values(latest.airports).map(p=>comparisonRunId(p.run_at)))
  const protectedRuns=new Set([...runs.slice(0,maxRuns),...pointed]), removedRuns=[],removedPayloads=[]
  const references=new Set(Object.values(latest.airports).map(p=>p.path))
  for(const run of runs) {
    const dir=path.join(runsRoot,run)
    if (!protectedRuns.has(run)) { fs.rmSync(dir,{recursive:true}); removedRuns.push(run); continue }
    if (!runs.slice(0,2).includes(run)) fs.rmSync(path.join(dir,'raw'),{recursive:true,force:true})
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if(!entry.isDirectory() || !/^RK[A-Z]{2}$/.test(entry.name)) continue
      const airportDir=path.join(dir,entry.name)
      const files=fs.readdirSync(airportDir).filter(f=>/^\d{12}_\d{12}_[a-f0-9]{24}\.json$/.test(f)).sort().reverse()
      for(const file of files.slice(2)) {
        const relative=`runs/${run}/${entry.name}/${file}`
        if (!references.has(relative)) { fs.rmSync(path.join(airportDir,file)); removedPayloads.push(relative) }
      }
    }
  }
  return {removedRuns,protectedRuns:[...protectedRuns],removedPayloads}
}
