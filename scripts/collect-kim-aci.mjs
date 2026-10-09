// Offline/manual derived calculation: requires existing normalized grids and cached supplements.
import { parseArgs } from 'node:util'
import { runKimDerivedWorker } from '../backend/src/processors/kim-derived-worker.js'
const {values}=parseArgs({options:{tmfc:{type:'string'},hours:{type:'string'},domain:{type:'string',default:'ea'},'no-publish':{type:'boolean'}}})
if(!/^\d{10}$/.test(values.tmfc||''))throw new Error('--tmfc YYYYMMDDHH required')
const forecastHours=(values.hours||'12').split(',').map(Number)
const result=await runKimDerivedWorker('kim_aci',{jobOptions:{domain:values.domain,tmfc:values.tmfc,forecastHours,publish:!values['no-publish']}})
console.log(JSON.stringify(result,null,2))
if(result.failures.length)process.exitCode=1
