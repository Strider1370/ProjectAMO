import { readKimAciIndex, readKimAciField, aciMapField } from '../processors/kim-aci-store.js'
import { ACIM_SCORE_SCALE, ACIM_MISSING, ACIM_DISPLAY_MIN_FL } from '../../../shared/acim.js'

export function registerKimAciRoutes(app,{root,resolveDomain,sendIndex,sendField}) {
  app.get('/api/kim/aci/index',(req,res)=>{
    try {
      const domain=resolveDomain(req.query.domain??'auto'),index=readKimAciIndex(root,domain)
      if(!index)return res.status(503).json({error:'ACI 자료 준비 중'})
      sendIndex(res,index,`aci:${domain}:${index.revision}:${index.baseRun||'none'}`)
    }catch(error){res.setHeader('Cache-Control','no-store');res.status(400).json({error:error.message})}
  })
  for(const kind of ['field','point']) app.get(`/api/kim/aci/${kind}`,(req,res)=>{
    try {
      const domain=resolveDomain(req.query.domain??'auto')
      const selection={root,domain,tmfc:req.query.tmfc,hf:Number(req.query.hf),revision:req.query.revision}
      const stored=readKimAciField(selection)
      let payload=aciMapField(stored),suffix=''
      if(kind==='point') {
        const lon=Number(req.query.lon),lat=Number(req.query.lat),g=stored.grid
        if(req.query.lon==null||req.query.lat==null||!Number.isFinite(lon)||!Number.isFinite(lat))throw new Error('Invalid ACI point')
        const dx=(g.lonMax-g.lonMin)/(g.nx-1),dy=(g.latMax-g.latMin)/(g.ny-1)
        const x=Math.round((lon-g.lonMin)/dx),y=Math.round((lat-g.latMin)/dy)
        if(x<0||x>=g.nx||y<0||y>=g.ny)return res.status(404).json({error:'ACI 영역 밖입니다'})
        const i=y*g.nx+x,missing=stored.score[i]===ACIM_MISSING
        // 지도와 같은 저장값. CAPE는 ACIM 계산에 쓰지 않는 참고값이다.
        payload={olr:stored.olr[i],precc:stored.precc[i],cape:stored.status[i]===0?stored.cape[i]:null,lon:g.lonMin+x*dx,lat:g.latMin+y*dy,score:missing?null:stored.score[i]*ACIM_SCORE_SCALE,topFl:missing?null:stored.topFl[i],shown:missing?null:stored.topFl[i]>=ACIM_DISPLAY_MIN_FL,season:stored.season,status:stored.status[i],domain,time:stored.time,revision:stored.revision};suffix=`:${x}:${y}`
      }
      sendField(res,payload,`aci:${kind}:${domain}:${stored.time.tmfc}:${stored.time.hf}:${stored.revision}${suffix}`)
    }catch(error){res.setHeader('Cache-Control','no-store');res.status(error.code==='ENOENT'?404:400).json({error:error.message})}
  })
}
