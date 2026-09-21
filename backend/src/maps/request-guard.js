// Authenticated map writes only. Socket address is used so forwarded headers cannot
// manufacture new IP buckets. Account buckets remain independent behind nginx.
export function createMapWriteGuard({ maxRequests=30, maxBytes=20*1024*1024, maxBodyBytes=5*1024*1024, maxConcurrent=4, now=Date.now, log=entry=>console.warn('[map-write-blocked]',JSON.stringify(entry)) }={}) {
  const buckets=new Map(); let active=0, nextSweep=0
  return (req,res,next)=>{
    if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next()
    const time=now()
    if (time>=nextSweep) { for(const [key,value] of buckets) if(value.until<=time) buckets.delete(key); nextSweep=time+60000 }
    const account=String(req.session?.userId??'anonymous'), ip=req.socket?.remoteAddress??'unknown'
    const keys=[`account:${account}`,`ip:${ip}`]
    const records=keys.map(key=>{
      let value=buckets.get(key)
      if (!value || value.until<=time) { value={until:time+60000,count:0,bytes:0,active:0,logged:false}; if(buckets.size<10000 || buckets.has(key)) buckets.set(key,value); else return null }
      return value
    })
    const reject=(code,status,retry=60)=>{
      if(!records[0]?.logged) { log({accountId:account,reason:code}); if(records[0]) records[0].logged=true }
      return res.status(status).set('Retry-After',String(retry)).json({error:code,retryAfterSeconds:retry})
    }
    if(records.some(value=>!value)) return reject('map_rate_limit',429)
    if(req.headers['content-encoding'] && req.headers['content-encoding']!=='identity') return reject('map_compressed_request_not_allowed',415)
    const raw=req.headers['content-length']
    const size=raw===undefined ? maxBodyBytes : Number(raw)
    if(!Number.isSafeInteger(size) || size<0 || size>maxBodyBytes) return reject('map_too_large',413)
    const retry=Math.max(1,Math.ceil((records[0].until-time)/1000))
    if(records[0].count>=maxRequests || records[0].bytes+size>maxBytes || records[1].count>=maxRequests*10 || records[1].bytes+size>maxBytes*10) return reject('map_rate_limit',429,retry)
    if(active>=maxConcurrent || records[0].active>=2) return reject('map_write_busy',429,2)
    active++
    for(const value of records) { value.count++; value.bytes+=size; value.active++ }
    let done=false
    const release=()=>{ if(!done) { done=true;active--;for(const value of records)value.active-- } }
    res.once('finish',release); res.once('close',release)
    next()
  }
}
