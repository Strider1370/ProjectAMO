import { Worker } from 'node:worker_threads'
let active = 0
export async function parseOrganizationMapMaterialAsync(buffer, mimeType, { timeoutMs = 3000 } = {}) {
  if (active >= 2) throw new Error('invalid_map_material:analysis_busy')
  active++
  let worker, timer
  try {
    return await new Promise((resolve,reject) => {
      worker = new Worker(new URL('./organization-kml-worker.js',import.meta.url), { workerData:{bytes:buffer,mimeType}, resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4} })
      timer=setTimeout(()=>reject(new Error('invalid_map_material:analysis_timeout')),timeoutMs)
      worker.once('message',message=>message.error?reject(new Error(message.error)):resolve(message.result))
      worker.once('error',()=>reject(new Error('invalid_map_material:analysis_failed')))
      worker.once('exit',()=>reject(new Error('invalid_map_material:analysis_stopped')))
    })
  } finally { clearTimeout(timer); await worker?.terminate(); active-- }
}
