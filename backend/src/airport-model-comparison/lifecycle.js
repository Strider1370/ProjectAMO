import config from '../config.js'
import { MODEL_COMPARISON_AIRPORTS } from '../../../shared/airport-model-comparison.js'
import { HOUR_MS, selectForecastWindow } from './model.js'
import { readAirportComparison, writeCollectionAttempt, cleanupComparisonRuns, contentRevision } from './store.js'

const REQUEST_DELAY_MS={ecmwf:(7*60+40)*60000,icon:(4*60+40)*60000,gfs:(6*60+10)*60000}
export function comparisonAirports(airports=config.airports) { return airports.filter(a=>MODEL_COMPARISON_AIRPORTS.includes(a.icao)) }
export function expectedNwpRun({model,nowMs}) {
  if(!Object.hasOwn(REQUEST_DELAY_MS,model)) throw new Error('invalid_overseas_model')
  return new Date(Math.floor((nowMs-REQUEST_DELAY_MS[model])/(6*HOUR_MS))*6*HOUR_MS).toISOString()
}
export function readSelectedRuns({root,airports=comparisonAirports()}) {
  return Object.fromEntries(airports.map(({icao})=>[icao,readAirportComparison({root,airport_icao:icao}).models.map(({model,run_at})=>({model,run_at}))]))
}
export function peerComparisonRevision({root=config.storage.base_path,airports=comparisonAirports()}={}) {
  return contentRevision(Object.entries(readSelectedRuns({root,airports})).map(([icao,runs])=>[icao,runs.filter(r=>r.model!=='ecmwf')]))
}
export function isNwpCollectionDue({ model, root=config.storage.base_path, nowMs=Date.now(), airports=comparisonAirports(), settings=config.overseas_nwp }) {
  if(settings?.enabled===false) return false
  const expected=expectedNwpRun({model,nowMs})
  return comparisonAirports(airports).some(({icao})=>{
    const {models}=readAirportComparison({root,airport_icao:icao}), selected=models.find(m=>m.model===model)
    if(!selected || selected.run_at<expected) return true
    const target=selectForecastWindow({model,run_at:selected.run_at,selectedRuns:models})
    return selected.window_start_at!==target.start_at || selected.window_end_at!==target.end_at
  })
}
export async function collectNwpModel({model,signal,nowMs=Date.now(),root=config.storage.base_path,airports=comparisonAirports(),settings=config.overseas_nwp,adapter,clock}={}) {
  airports=comparisonAirports(airports)
  if(!isNwpCollectionDue({model,root,nowMs,airports,settings})) return {model,skipped:'nwp_complete_or_disabled',publishedAirports:[],reusedAirports:airports.map(a=>a.icao),failedAirports:[],deferred:false,errors:[]}
  signal?.throwIfAborted()
  const started_at=new Date(nowMs).toISOString(),target_run_at=expectedNwpRun({model,nowMs})
  const wallStarted=Date.now()
  const before=new Map(airports.map(a=>[a.icao,readAirportComparison({root,airport_icao:a.icao}).models.find(m=>m.model===model)?.revision]))
  let report
  try {
    const collect=adapter || (model==='gfs' ? (await import('./gfs.js')).collectGfs : (await import('./open-meteo.js')).collectOpenMeteo)
    report=await collect({model,signal,root,airports,selectedRuns:readSelectedRuns({root,airports}),nowMs,now:()=>new Date(nowMs),clock:()=>nowMs})
    signal?.throwIfAborted()
  } catch(error) {
    const publishedAirports=airports.filter(a=>{
      const entry=readAirportComparison({root,airport_icao:a.icao}).models.find(m=>m.model===model)
      return entry && entry.revision!==before.get(a.icao) && !isNwpCollectionDue({model,root,nowMs,airports:[a],settings})
    }).map(a=>a.icao)
    report={model,publishedAirports,reusedAirports:[],failedAirports:airports.filter(a=>!publishedAirports.includes(a.icao)).map(a=>a.icao),deferred:false,errors:[{code:signal?.aborted?'collection_cancelled':'provider_failed',message:'provider request failed'}]}
  }
  if(!report?.deferred) {
    const claimed=[...(report?.publishedAirports || []),...(report?.reusedAirports || []),...(report?.failedAirports || [])]
    const partitionValid=report?.model===model && claimed.length===airports.length && new Set(claimed).size===airports.length && airports.every(a=>claimed.includes(a.icao))
    const incomplete=airports.filter(a=>isNwpCollectionDue({model,root,nowMs,airports:[a],settings})).map(a=>a.icao)
    if(!partitionValid || incomplete.some(icao=>!report.failedAirports?.includes(icao))) {
      const failedAirports=partitionValid?incomplete:airports.map(a=>a.icao)
      report={...report,model,publishedAirports:(report?.publishedAirports || []).filter(icao=>!failedAirports.includes(icao)),reusedAirports:(report?.reusedAirports || []).filter(icao=>!failedAirports.includes(icao)),failedAirports,
        errors:[...(report?.errors || []),{code:'invalid_collection_postcondition',message:'complete airport windows were not published'}]}
    }
  }
  const attempt={...report,started_at,finished_at:new Date(clock?clock():nowMs+Date.now()-wallStarted).toISOString(),target_run_at,next_check_at:new Date((Math.floor(nowMs/600000)+1)*600000).toISOString()}
  writeCollectionAttempt({root,model,report:attempt})
  if(signal?.aborted) signal.throwIfAborted()
  cleanupComparisonRuns({root,model,maxRuns:settings?.max_runs || 4})
  if(report.failedAirports?.length || report.deferred) { const error=new Error(`nwp_collection_incomplete:${model}:${report.failedAirports?.length || 0}`);error.report=report;throw error }
  return report
}
