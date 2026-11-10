import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { kimDomain } from './kim-domain.js'
import { KIM_NWP_MODEL } from './kim-nwp-model.js'
import { resolveKimNwpRoot, resolveKimNwpRunDir, readKimNwpLatest } from './kim-nwp-store.js'
import { readKimDocument, writeKimDocument, kimDocumentExists } from './kim-doc-store.js'
import { ACIM_MISSING, ACIM_SCORE_SCALE, ACIM_VERSION, ACIM_TOP_TABLE, ACIM_DISPLAY_RULE, acimDisplayFl } from '../../../shared/acim.js'
import { readOrWriteKimMapBinary } from './kim-map-responses.js'

export const aciHash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex').slice(0, 24)
export function validateAciSelection({ domain = 'ea', tmfc, hf, revision }) {
  kimDomain(domain)
  if (!/^\d{10}$/.test(String(tmfc)) || !kimDomain(domain).forecastHours.includes(Number(hf)) || !Number.isInteger(Number(hf))) throw new Error('Invalid ACI time selection')
  if (!/^[a-f0-9]{20,64}$/.test(String(revision))) throw new Error('Invalid ACI revision')
}
export function aciPath({ root, domain = 'ea', tmfc, hf, revision, cape = false }) {
  validateAciSelection({domain,tmfc,hf,revision})
  return path.join(resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc}), 'derived','aci',...(cape?['cape']:[]),`hf${String(Number(hf)).padStart(3,'0')}`,`${revision}.json`)
}
const jsonRead = file => { try { return JSON.parse(fs.readFileSync(file,'utf8')) } catch (e) { if(e.code==='ENOENT') return null; throw e } }
export function writeAciJson(file, value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file)
}
export function readKimAciLatest(root,domain='ea') {return jsonRead(path.join(resolveKimNwpRoot(root,domain),'derived','aci','latest.json'))}
export function writeKimAciAttempt(root,domain,tmfc,attempt) {
  for(const dir of [resolveKimNwpRoot(root,domain),resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc})]) writeAciJson(path.join(dir,'derived','aci','last-attempt.json'),attempt)
}
const TOP_LEVELS = new Set(ACIM_TOP_TABLE.map(([fl]) => fl))
const contentHash = doc => { const {content_hash,...value}=doc;return aciHash(value) }
function validateShape(field,capeOnly=false) {
  const g=field.grid,n=g?.nx*g?.ny
  if (!Number.isInteger(n)||n<=0||![g.lonMin,g.lonMax,g.latMin,g.latMax].every(Number.isFinite)||g.lonMax<=g.lonMin||g.latMax<=g.latMin) throw new Error('Invalid ACI grid')
  const arrays=capeOnly?['cape','cin','status']:['cape','cin','status','precc','olr','score','topFl']
  if(!arrays.every(k=>Array.isArray(field[k])&&field[k].length===n))throw new Error('Invalid ACI array shape')
  if(field.status.some(v=>![0,1,2].includes(v)))throw new Error('Unresolved ACI status')
  for(let i=0;i<n;i++) {
    // CAPE(참고값)는 계산 상태가 0일 때만 값이 있다. ACIM 점수는 OLR·precc만으로 정해지며 CAPE 상태와 무관하다.
    if(field.status[i]===0&&(!Number.isFinite(field.cape[i])||field.cape[i]<0||!Number.isFinite(field.cin[i]))) throw new Error('Invalid ACI CAPE')
    if(capeOnly)continue
    const score=field.score[i],top=field.topFl[i]
    if(score===ACIM_MISSING){if(top!==null)throw new Error('Invalid ACI missing score');continue}
    if(!Number.isInteger(score)||score<0||score>10000||!TOP_LEVELS.has(top))throw new Error('Invalid ACI score')
    if(!Number.isFinite(field.precc[i])||field.precc[i]<0||!Number.isFinite(field.olr[i])||field.olr[i]<0||field.olr[i]>=600)throw new Error('Invalid ACI inputs')
  }
}
export function writeKimAciField({root,domain='ea',field,cape=false}) {
  validateShape(field,cape);const target=aciPath({root,domain,...field.time,revision:field.revision,cape})
  const doc={...field,domain,content_hash:contentHash({...field,domain})}
  if(kimDocumentExists(target)) {
    const old=readKimDocument(target)
    if(old.content_hash!==contentHash(old))throw new Error('Corrupt ACI immutable field')
    if(!isDeepStrictEqual(old,doc))throw new Error('ACI immutable collision')
  }else writeKimDocument(target,doc)
  return doc
}
export function readKimAciField(selection) {
  const {root,domain='ea',cape=false}=selection
  const field=readKimDocument(aciPath({...selection,domain}))
  if(field.domain!==domain||field.time?.tmfc!==selection.tmfc||field.time?.hf!==Number(selection.hf)||field.revision!==selection.revision||field.content_hash!==contentHash(field))throw new Error('Corrupt ACI immutable field')
  validateShape(field,cape);return field
}
export function aciMapField(field) {return {type:'kim_nwp_aci_map',product:'ACIM',domain:field.domain,grid:field.grid,time:field.time,revision:field.revision,algorithm:field.algorithm,scoreSpec:field.scoreSpec,season:field.season,displayRule:ACIM_DISPLAY_RULE,scoreScale:ACIM_SCORE_SCALE,missing:ACIM_MISSING,displayFl:aciDisplayFl(field),validCount:field.validCount}}
// 지도·브리핑이 쓰는 표시 운정고도(FL250 이상만). 원래 운정고도는 지점 조회에서 그대로 보여 준다.
export function aciDisplayFl(field) {return field.topFl.map(top=>acimDisplayFl(top))}
export function aciBinaryPath(selection) {
  validateAciSelection(selection)
  const {root,domain='ea',tmfc,hf,revision}=selection
  return path.join(resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc}),'derived','map-bin',`aci-${revision}-acim-v4`,'column',`hf${String(Number(hf)).padStart(3,'0')}.bin.gz`)
}
export function ensureAciBinary(selection) {return readOrWriteKimMapBinary(aciBinaryPath(selection),()=>aciMapField(readKimAciField(selection)))}
export function publishKimAciRun({root,domain='ea',tmfc,entries,expectedHours,algorithm,scoreSpec}) {
  if(!entries.length)throw new Error('Empty ACI run cannot be published')
  const unique=[...new Map(entries.map(e=>[e.hf,e])).values()].sort((a,b)=>a.hf-b.hf)
  for(const e of unique){
    if(!expectedHours.includes(e.hf))throw new Error('Invalid ACI manifest hour')
    readKimAciField({root,domain,tmfc,...e})
    if(e.inputFiles) {
      const stamp=aciHash(e.inputFiles.map(relative=>{
        const file=path.resolve(root,relative),base=path.resolve(root)+path.sep
        if(!file.startsWith(base))throw new Error('Invalid ACI input path')
        const s=fs.statSync(file);return [file,s.ino,s.size,s.mtimeMs]
      }))
      if(stamp!==e.inputFingerprint)throw new Error('ACI inputs changed before publication')
    }
  }
  const previous=readKimAciLatest(root,domain)
  if(previous?.tmfc>tmfc)return previous
  const manifest={type:'kim_aci_manifest',model:KIM_NWP_MODEL,domain,tmfc,runId:`KIMG_NE57_${tmfc}`,algorithm,scoreSpec,entries:unique,expectedHours,availableHours:unique.map(e=>e.hf),complete:expectedHours.every(h=>unique.some(e=>e.hf===h)),usable:true,revision:aciHash({tmfc,unique,scoreSpec}),fetched_at:new Date().toISOString()}
  if(previous?.tmfc===tmfc&&previous.entries.length>unique.length&&aciHash(previous.scoreSpec)===aciHash(scoreSpec))return previous
  writeAciJson(path.join(resolveKimNwpRunDir({root,domain,model:KIM_NWP_MODEL,tmfc}),'derived','aci',manifest.revision,'manifest.json'),manifest)
  writeAciJson(path.join(resolveKimNwpRoot(root,domain),'derived','aci','latest.json'),manifest)
  return manifest
}
export function readKimAciIndex(root,domain='ea') {
  const latest=readKimAciLatest(root,domain),base=readKimNwpLatest(root,domain)
  if(!latest)return null
  // 옛 3변수 실험 점수 회차는 ACIM 회차가 게시될 때까지 보여주지 않는다(다른 의미의 값을 같은 색으로 그리지 않음).
  const current=latest.scoreSpec?.version===ACIM_VERSION
  const matches=!base?.latestRun||base.latestRun===latest.tmfc
  return {type:'kim_nwp_aci_index',product:'ACIM',domain,latestRun:latest.tmfc,baseRun:base?.latestRun,revision:latest.revision,algorithm:latest.algorithm,scoreSpec:latest.scoreSpec,complete:latest.complete,plannedHours:latest.expectedHours,availableHours:latest.availableHours,times:matches&&current?latest.entries.filter(e=>!base?.hours||base.hours.includes(e.hf)).map(({hf,validTime,revision})=>({hf,validTime,revision,tmfc:latest.tmfc})):[],reason:!matches?'aci_base_run_mismatch':!current?'acim_pending':null}
}
