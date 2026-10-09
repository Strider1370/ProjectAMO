import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, addForecastHours } from './kim-nwp-model.js'
import { readKimNwpGridVariables, resolveKimNwpRunDir, resolveKimNwpGridPath } from './kim-nwp-store.js'
import { readKimRawText, writeKimRawText, kimDocumentStoragePath } from './kim-doc-store.js'
import { kimDomain, kimDomainRequest } from './kim-domain.js'
import { kimBulkCredentialOptions, selectKimRunCredential } from './kim-run-credential.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import { supplementBoundsMatch } from './kim-gktg-processor.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { aciHash, readKimAciField, writeKimAciField, writeKimAciAttempt, publishKimAciRun, ensureAciBinary } from './kim-aci-store.js'
import { DEFAULTS, ACI_SCORE_VERSION, packAciScore } from '../../../shared/aci.js'

export const ACI_ALGORITHM='kim-aci-sbcape-rk4-20hpa-v1'
export const ACI_SPEC={version:ACI_SCORE_VERSION,settings:DEFAULTS}
const levels=KIM_NWP_LEVELS.filter(l=>l.kind==='pressure')
const cli=fileURLToPath(new URL('../../python/kim_aci/calculate.py',import.meta.url))
const kernelDir=fileURLToPath(new URL('../../python/aci_experiment/',import.meta.url))
const engineRevision=()=>aciHash(Buffer.concat([fs.readFileSync(cli),...['engine.py','kernel.py','requirements-verify.txt'].map(n=>fs.readFileSync(path.join(kernelDir,n))),Buffer.from(ACI_ALGORITHM)]))
const sameGrid=(a,b)=>['nx','ny','lonMin','lonMax','latMin','latMax'].every(k=>a[k]===b[k])
const inputPath=(root,domain,tmfc,hf,name)=>path.join(resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc}),'raw',name==='ps'?'gktg':'aci',`hf${hf}-${name}-0.txt`)
export function validateAciSupplement(text,{name,tmfc,hf,grid}) {
  if(!text.includes(`.ft${String(hf).padStart(3,'0')}.${tmfc}.nc`)||!new RegExp(`=\\s*${name},\\s*unit`).test(text)||! /level\s*[:=]\s*0(?:\s|,)/.test(text)||!supplementBoundsMatch(text,grid))throw new Error(`ACI input identity mismatch: ${name}`)
  const parsed=parseKimGridText(text,{variable:name,level:0})
  const unit=parsed.unit.replace(/,$/,'').replaceAll('^','').replaceAll('²','2').replace(/[()]/g,'')
  if(parsed.nx!==grid.nx||parsed.ny!==grid.ny||unit!=={ps:'Pa',q2m:'kg/kg',pr:'kg/m2/s',ulwrtoa:'W/m2'}[name])throw new Error(`ACI input grid/unit mismatch: ${name}`)
  const ranges={ps:[20000,110000],q2m:[0,.05],pr:[0,1],ulwrtoa:[0,600]};const [lo,hi]=ranges[name]
  const values = Float32Array.from(parsed.values,v=>v==null||!Number.isFinite(v)||v<lo||v>hi?NaN:v)
  if (!values.some(Number.isFinite)) throw new Error(`ACI input has no valid columns: ${name}`)
  return values
}
export async function prefetchAciSupplements({root=config.storage.base_path,domain='ea',tmfc,hf,signal,fetchGrid=fetchKimGrid}) {
  const {grid}=readKimNwpGridVariables({root,domain,model:KIM_NWP_MODEL,tmfc,hf,levelId:levels[0].id,names:[]})
  let requests=0,bytes=0
  for(const name of ['ps','q2m','pr','ulwrtoa']) {
    signal?.throwIfAborted();const file=inputPath(root,domain,tmfc,hf,name);let text=readKimRawText(file)
    if(text===null) {
      const credential=selectKimRunCredential({tmfc,...kimBulkCredentialOptions(config,Date.now(),{required:kimDomain(domain).bulkOnly})})
      text=await fetchGrid({data:'U',name,level:0,tmfc,hf,sub:kimDomainRequest(config,domain).sub,credential,signal,operation:name==='ps'?'kim_grid_gktg':'kim_grid_aci'})
      validateAciSupplement(text,{name,tmfc,hf,grid});writeKimRawText(file,text.replaceAll(credential,'[redacted]'));requests++;bytes+=Buffer.byteLength(text)
    }else validateAciSupplement(text,{name,tmfc,hf,grid})
  }
  appendKimRunEvent(resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc}),{type:'aci_inputs',hf,requests,bytes})
  return {requests,bytes}
}
function decode(variable,size,unit) {
  if(variable?.values?.length!==size||variable.unit?.replace(/,$/,'')!==unit)throw new Error('Invalid ACI base component')
  const packed=variable.encoding==='int16-scaled-json-v1'
  if(packed&&(!Number.isFinite(variable.scale)||variable.scale<=0))throw new Error('Invalid ACI encoding')
  return Float32Array.from(variable.values,v=>v==null||!Number.isFinite(v)||(packed&&(v===-32768||Math.abs(v)===32767))?NaN:packed?v*variable.scale+(variable.offset||0):v)
}
async function runPython(job,stage,{signal,python}) {
  const timeout=AbortSignal.timeout(config.kim_aci.calculation_timeout_ms)
  await new Promise((resolve,reject)=>{
    const child=spawn(python,[cli,path.join(stage,'job.json'),stage],{signal:signal?AbortSignal.any([signal,timeout]):timeout,env:{...process.env,NUMBA_CACHE_DIR:config.kim_gktg.cache_path,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',NUMBA_NUM_THREADS:'1'},stdio:['ignore','pipe','pipe']})
    let error='';child.stdout.on('data',()=>{});child.stderr.on('data',chunk=>{error=(error+chunk).slice(-4000)})
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`aci_python_failed (${code}): ${error}`)))
  })
  const meta=JSON.parse(fs.readFileSync(path.join(stage,'result.json'),'utf8')),buf=fs.readFileSync(path.join(stage,'cape.f32'))
  if(meta.columns!==job.grid.nx*job.grid.ny||buf.length!==meta.columns*12)throw new Error('Invalid ACI Python output')
  return {values:new Float32Array(buf.buffer,buf.byteOffset,buf.byteLength/4),...meta}
}
const digestFiles=files=>aciHash(files.map(file=>{const s=fs.statSync(file);return [file,s.ino,s.size,s.mtimeMs]}))
export async function process({root=config.storage.base_path,domain='ea',tmfc,forecastHours=[],publish=true,signal,turn=async()=>()=>{},python=config.kim_aci.python,calculate=runPython,scoreSpec=ACI_SPEC}={}) {
  const runDir=resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc});const entries=[],failures=[];const engine=engineRevision()
  writeKimAciAttempt(root,domain,tmfc,{tmfc,outcome:'running',expectedHours:forecastHours,started_at:new Date().toISOString(),scoreSpec})
  for(const hf of forecastHours) {
    let stage,release;const started=Date.now()
    try {
      signal?.throwIfAborted()
      appendKimRunEvent(runDir,{type:'aci_wait',hf})
      release=await turn()
      appendKimRunEvent(runDir,{type:'aci_calculating',hf,waitedMs:Date.now()-started})
      const dir=path.join(runDir,'derived','aci','.staging');fs.mkdirSync(dir,{recursive:true});stage=fs.mkdtempSync(path.join(dir,'hour-'))
      const hash=createHash('sha256');let grid,size;const sources=[...levels.map(l=>l.id),'10m'].map(levelId=>kimDocumentStoragePath(resolveKimNwpGridPath({root,domain,model:KIM_NWP_MODEL,tmfc,hf,levelId})))
      if(sources.some(file=>!file))throw new Error('ACI base input unavailable')
      const baseCaptured=digestFiles(sources)
      for(const [k,level] of levels.entries()) {
        signal?.throwIfAborted()
        const layer=readKimNwpGridVariables({root,domain,model:KIM_NWP_MODEL,tmfc,hf,levelId:level.id,names:['T','q']})
        if(!grid){grid=layer.grid;size=grid.nx*grid.ny;hash.update(JSON.stringify({grid,tmfc,hf,levels:levels.map(l=>l.value)}))}
        if(layer.tmfc!==tmfc||Number(layer.hf)!==hf||layer.level.id!==level.id||!sameGrid(grid,layer.grid))throw new Error('Mixed ACI base grids')
        for(const [name,unit] of [['T','K'],['q','kg/kg']]) {
          const values=decode(layer.variables[name],size,unit),bytes=Buffer.from(values.buffer)
          fs.appendFileSync(path.join(stage,`${name}.f32`),bytes);hash.update(bytes)
        }
      }
      const surfaceLayer=readKimNwpGridVariables({root,domain,model:KIM_NWP_MODEL,tmfc,hf,levelId:'10m',names:['T']})
      if(surfaceLayer.tmfc!==tmfc||Number(surfaceLayer.hf)!==hf||!sameGrid(grid,surfaceLayer.grid))throw new Error('Mixed ACI surface grid')
      const t2m=decode(surfaceLayer.variables.T,size,'K'),inputs={}
      for(const name of ['ps','q2m','pr','ulwrtoa']) {
        const file=inputPath(root,domain,tmfc,hf,name),text=readKimRawText(file)
        if(text===null)throw new Error(`ACI cached input unavailable: ${name}`)
        inputs[name]=validateAciSupplement(text,{name,tmfc,hf,grid});sources.push(fs.existsSync(file+'.gz')?file+'.gz':file)
      }
      const captured=digestFiles(sources)
      for(const values of [inputs.ps,t2m,inputs.q2m]){const bytes=Buffer.from(values.buffer);fs.appendFileSync(path.join(stage,'surface.f32'),bytes);hash.update(bytes)}
      const capeRevision=aciHash(`${engine}:${hash.digest('hex')}`),job={grid,pressures:levels.map(l=>l.value),maxStepPa:2000}
      fs.writeFileSync(path.join(stage,'job.json'),JSON.stringify(job))
      const time={tmfc,hf,validTime:addForecastHours(tmfc,hf)}
      let capeField,computed=false
      try{capeField=readKimAciField({root,domain,tmfc,hf,revision:capeRevision,cape:true})}catch(error){if(!/ENOENT/.test(error.code||''))throw error}
      if(!capeField) {
        const result=await calculate(job,stage,{signal,python}),r=result.values
        if(r?.length!==size*3)throw new Error('Invalid ACI calculation shape')
        const status=Array.from(r.subarray(2*size));if(status.some(v=>![0,1,2].includes(v)))throw new Error('Invalid ACI calculation status')
        capeField=writeKimAciField({root,domain,cape:true,field:{type:'kim_aci_cape',grid,time,revision:capeRevision,engineRevision:engine,algorithm:ACI_ALGORITHM,cape:Array.from(r.subarray(0,size),v=>Number.isFinite(v)?v:null),cin:Array.from(r.subarray(size,2*size),v=>Number.isFinite(v)?v:null),status,checks:{fallbacks:result.fallbacks,seconds:result.seconds,maxStepHpa:20,topPressureHpa:150}}});computed=true
      }
      const rainRate=Array.from(inputs.pr,v=>Number.isFinite(v)?Math.fround(v*3600):null),olr=Array.from(inputs.ulwrtoa,v=>Number.isFinite(v)?v:null)
      const revision=aciHash({capeRevision,rainRate,olr,scoreSpec});let field
      try{field=readKimAciField({root,domain,tmfc,hf,revision})}catch(error){if(!/ENOENT/.test(error.code||''))throw error}
      if(!field) {
        const score=[],status=[...capeField.status];let validCount=0
        for(let i=0;i<size;i++){const value=packAciScore({cape:status[i]===0?capeField.cape[i]:null,rainRate:rainRate[i],olr:olr[i]},scoreSpec.settings);score.push(value);if(value>=0){validCount++}else if(status[i]===0)status[i]=1}
        if (!validCount) throw new Error('ACI has no usable columns')
        field=writeKimAciField({root,domain,field:{type:'kim_nwp_aci',product:'ACI_EXPERIMENT',model:KIM_NWP_MODEL,grid,time,revision,capeRevision,inputRevision:revision,engineRevision:engine,algorithm:ACI_ALGORITHM,scoreSpec,cape:capeField.cape,cin:capeField.cin,status,rainRate,olr,score,validCount,checks:capeField.checks}})
      }
      // Input replacement invalidates publication, including supplemental caches.
      if(digestFiles(sources)!==captured || digestFiles(sources.slice(0,levels.length+1))!==baseCaptured)throw new Error('ACI inputs changed during calculation')
      ensureAciBinary({root,domain,tmfc,hf,revision})
      entries.push({hf,validTime:time.validTime,revision,capeRevision,inputFiles:sources.map(file=>path.relative(root,file)),inputFingerprint:captured})
      appendKimRunEvent(runDir,{type:'aci_hour',hf,computed,validCount:field.validCount,ms:Date.now()-started,revision})
    }catch(error){if(signal?.aborted){writeKimAciAttempt(root,domain,tmfc,{tmfc,outcome:'cancelled',expectedHours:forecastHours,completed_at:new Date().toISOString()});throw error}failures.push({hf,reason:String(error.code||error.message).slice(0,250)});appendKimRunEvent(runDir,{type:'aci_hour_failed',hf,reason:failures.at(-1).reason})}
    finally{if(stage)fs.rmSync(stage,{recursive:true,force:true});release?.()}
  }
  const manifest=publish&&entries.length?publishKimAciRun({root,domain,tmfc,entries,expectedHours:forecastHours,algorithm:ACI_ALGORITHM,scoreSpec}):null
  writeKimAciAttempt(root,domain,tmfc,{tmfc,outcome:failures.length?'partial':publish?'complete':'computed',expectedHours:forecastHours,availableHours:entries.map(e=>e.hf),failures,scoreSpec,completed_at:new Date().toISOString()})
  return {type:'kim_aci',tmfc,entries,failures,saved:entries.length>0,revision:manifest?.revision}
}
export default {process}
