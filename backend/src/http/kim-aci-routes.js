import { readKimAciIndex, readKimAciField, aciMapField } from '../processors/kim-aci-store.js'
import { calculateScore, ACI_SCORE_SCALE, ACI_MISSING } from '../../../shared/aci.js'

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
        const i=y*g.nx+x,input={cape:stored.cape[i],rainRate:stored.rainRate[i],olr:stored.olr[i]},result=stored.score[i]===ACI_MISSING?null:calculateScore(input,stored.scoreSpec.settings)
        payload={...input,lon:g.lonMin+x*dx,lat:g.latMin+y*dy,score:result?stored.score[i]*ACI_SCORE_SCALE:null,status:stored.status[i],contributions:result?.contributions??null,domain,time:stored.time,revision:stored.revision};suffix=`:${x}:${y}`
      }
      sendField(res,payload,`aci:${kind}:${domain}:${stored.time.tmfc}:${stored.time.hf}:${stored.revision}${suffix}`)
    }catch(error){res.setHeader('Cache-Control','no-store');res.status(error.code==='ENOENT'?404:400).json({error:error.message})}
  })
}
