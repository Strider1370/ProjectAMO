import { ICING_PRESENTATION, ICING_DOTS, ICING_OUTLINE_COLOR } from '../../../../frontend/src/shared/weather/cloudIcingPresentation.js'
import { color } from '../../../../frontend/src/shared/theme/tokens.js'
import { buildIcingGeometry, buildTemperatureContours } from '../../../../frontend/src/features/weather-overlays/lib/cloudIcingModel.js'
import { decodeSpreadValue, pickCloudPotentialColor } from '../../../../frontend/src/features/weather-overlays/lib/cloudPotentialField.js'
import { buildProfileCloudIcing } from '../../../../frontend/src/features/route-briefing/lib/cloudIcingProfile.js'
import { pressureToFallbackFt } from '../../../../frontend/src/features/route-briefing/lib/crossSectionGrid.js'
import { isothermSegments, chainContourSegments } from '../../../../frontend/src/shared/weather/gridContours.js'

// Historical B–F comparison styles are intentionally independent of product A.
const HISTORICAL_ICING = ICING_PRESENTATION.map(p => ({ ...p, color: color.icingPattern[p.grade], size: 64, repeats: [1,6,7,9][p.grade], radius: [0,1.5,1.9,2.1][p.grade] }))
const icingPatternSpacing = p => p.size / p.repeats
const data = window.CLOUD_ICING_DESIGN_DATA
const ns = 'http://www.w3.org/2000/svg'
const W = 720, MAP_H = 470, PROFILE_H = 350
const domain = { west: 122.5, east: 134, south: 32, north: 40 }
const plans = [
  { id: 'A', title: '구름 배경 + 착빙 색 면', description: '선택한 A안. 구름은 그대로 두고, 착빙 등급을 색 면으로 구분합니다. 흰 점의 크기·간격은 전 등급 동일합니다.', note: '윤곽선은 착빙 전체의 최외각에만 표시합니다. 착빙 면 아래의 구름 세부 명암은 가려집니다.' },
  { id: 'B', title: '점만 · 투명 배경', description: '착빙의 밑색을 없애고, 흰 테두리가 있는 파란 점만 올립니다.', note: '구름 농도가 잘 보입니다. 좁은 영역은 최외곽선으로 보완합니다.' },
  { id: 'C', title: '사선 해칭', description: '구름은 회색 면, 착빙은 사선의 간격·굵기로 구분합니다.', note: '층을 다른 질감으로 읽을 수 있습니다. 조밀한 해칭은 복잡해 보일 수 있습니다.' },
  { id: 'D', title: '투명 색 면 + 등급', description: '점 대신 투명한 파랑 면을 쓰고 L / M / S 표식을 함께 둡니다.', note: '작은 착빙층도 면으로 드러납니다. 진한 구름에서는 면 색이 섞입니다.' },
  { id: 'E', title: '파랑 면 + 흰 점', description: '착빙은 파랑 면으로 잡고, 흰 점의 밀도로 등급을 보여줍니다.', note: '착빙의 존재감이 큽니다. 구름보다 착빙이 먼저 읽히는 표현입니다.' },
  { id: 'F', title: '최외곽 + 등급 표식', description: '영역 내부를 비워 두고, 최외곽과 대표 등급 표식만 둡니다.', note: '구름을 가장 잘 보존합니다. 내부 등급의 상세 분포는 덜 보입니다.' },
]
const state = { dataset: 'real', hf: data.times[0].hf, level: '500hPa', view: 'both', dark: false, cloud: true, icing: true, temp: true, detail: false, selected: new Set(), pair: false, focusA: true }
const cloudImages = new WeakMap(), syntheticMaps = new Map(), syntheticProfiles = new Map()
let zoomPlan = null, serial = 0
const $ = id => document.getElementById(id)
function el(tag, attrs = {}, text = '') { const e = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); if(text) e.textContent=text; return e }
function add(parent, tag, attrs, text) { const e=el(tag,attrs,text); parent.append(e); return e }
function linePath(points, close = false) { return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + (close?' Z':'') }
function mapXY([lon,lat]) { return [(lon-domain.west)/(domain.east-domain.west)*W, (domain.north-lat)/(domain.north-domain.south)*MAP_H] }
function geoPath(polygon) { return polygon.map(ring=>linePath(ring.map(mapXY),true)).join(' ') }
function allPolygons(geometry) { return geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[] }
function simplifyRing(ring) {
  const kept = [ring[0]]
  for (let i=1;i<ring.length;i++) {
    const a=mapXY(kept[kept.length-1]),b=mapXY(ring[i])
    if(i===ring.length-1||Math.hypot(a[0]-b[0],a[1]-b[1])>.65)kept.push(ring[i])
  }
  return kept.length>=4?kept:ring
}
const landPaths = data.provinces.features.flatMap(f=>allPolygons(f.geometry)).map(poly=>geoPath(poly.map(simplifyRing)))

function syntheticWeather(lon,lat,ft) {
  const footprint=Math.exp(-Math.pow((lon-127.1)/3.4,2))*(.87+.13*Math.sin(lat*1.6+lon))
  const a=7500+1500*Math.sin((lat-33)*1.15)+350*(lon-126), b=16000+1500*Math.sin((lat-34)*1.2+(lon-126))
  const amount=Math.min(1,footprint*(Math.exp(-Math.pow((ft-a)/4100,2))+.9*Math.exp(-Math.pow((ft-b)/3600,2))))
  let grade=amount>.81?3:amount>.55?2:amount>.25?1:0
  if (Math.hypot((lon-127)/.55,(lat-35.4)/.4)<1) grade=0
  return { spread: 6*(1-amount), t: 15-.0016*ft-2.2*(lat-33), icing:grade }
}
function syntheticMap() {
  const key=state.level+':'+state.hf
  if(syntheticMaps.has(key))return syntheticMaps.get(key)
  const grid={nx:112,ny:84,lonMin:domain.west,lonMax:domain.east,latMin:domain.south,latMax:domain.north}
  const ft={ '600hPa':14000,'500hPa':18000,'450hPa':21000 }[state.level]
  const samples=Array.from({length:grid.nx*grid.ny},(_,i)=>syntheticWeather(grid.lonMin+i%grid.nx/(grid.nx-1)*(grid.lonMax-grid.lonMin)+(state.hf-data.times[0].hf)*.09,grid.latMin+Math.floor(i/grid.nx)/(grid.ny-1)*(grid.latMax-grid.latMin),ft))
  const cloud={grid,spread:samples.map(v=>v.spread),level:{id:state.level}}
  const icing=buildIcingGeometry({grid,icingGrade:samples.map(v=>v.icing)})
  const contours=buildTemperatureContours({grid,T:samples.map(v=>v.t+273.15)},true)
  const counts=samples.reduce((a,v)=>{a[v.icing]++;return a},[0,0,0,0])
  const result={cloud,icing,contours,counts};syntheticMaps.set(key,result);return result
}
function syntheticProfile() {
  if(syntheticProfiles.has(state.hf))return syntheticProfiles.get(state.hf)
  const result={totalDistanceNm:240,levels:Array.from({length:21},(_,i)=>{const ft=i*1500;return{pressure:Math.round(1013.25*Math.pow(1-ft/145366,5.255)),altFt:ft,values:Array.from({length:81},(_,j)=>{const f=j/80;return{distanceNm:f*240,...syntheticWeather(126.45+(126.49-126.45)*f+(state.hf-data.times[0].hf)*.09,37.46+(33.51-37.46)*f,ft)}})}})}
  syntheticProfiles.set(state.hf,result);return result
}
function currentMap(){return state.dataset==='real'?data.maps[state.hf+':'+state.level]:syntheticMap()}
function currentProfile(){return state.dataset==='real'?data.profiles[state.hf]:syntheticProfile()}
function cloudImage(field) {
  if(cloudImages.has(field))return cloudImages.get(field)
  const {nx,ny}=field.grid,c=document.createElement('canvas');c.width=nx;c.height=ny
  const ctx=c.getContext('2d'), pixels=ctx.createImageData(nx,ny)
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const value=decodeSpreadValue(field.spread[(ny-1-y)*nx+x],field)
    const color=pickCloudPotentialColor(value,field).color.match(/[\d.]+/g).map(Number)
    pixels.data.set([color[0],color[1],color[2],Math.round(color[3]*255)],(y*nx+x)*4)
  }
  ctx.putImageData(pixels,0,0);const uri=c.toDataURL();cloudImages.set(field,uri);return uri
}

function pattern(defs, plan, p, prefix, scale) {
  const id=`${prefix}-${p.grade}`, spacing=icingPatternSpacing(p)*scale
  const size=plan.id==='A'?ICING_DOTS.spacing*scale:plan.id==='C'?[0,12,9,7][p.grade]*scale:spacing
  const pat=add(defs,'pattern',{id,width:size,height:size,patternUnits:'userSpaceOnUse'})
  if(plan.id==='A'){
    add(pat,'rect',{width:size,height:size,fill:p.fillColor})
    add(pat,'circle',{cx:size/2,cy:size/2,r:ICING_DOTS.radius*scale,fill:ICING_DOTS.color,'fill-opacity':ICING_DOTS.opacity})
    return id
  }
  if(plan.id==='D'||plan.id==='E')add(pat,'rect',{width:size,height:size,fill:p.color,'fill-opacity':(plan.id==='D'?[0,.18,.32,.48]:[0,.28,.43,.58])[p.grade]})
  if(plan.id==='B'||plan.id==='E'){
    if(plan.id==='B')add(pat,'circle',{cx:size/2,cy:size/2,r:(p.radius+.75)*scale,fill:'#ffffff'})
    add(pat,'circle',{cx:size/2,cy:size/2,r:p.radius*scale,fill:plan.id==='E'?'#ffffff':p.color})
  }
  if(plan.id==='C') {
    add(pat,'path',{d:`M ${-size/2},${size/2} L ${size/2},${-size/2} M 0,${size} L ${size},0 M ${size/2},${size*1.5} L ${size*1.5},${size/2}`,fill:'none',stroke:p.color,'stroke-width':[0,1,1.5,2][p.grade]*scale})
    if(p.grade===3)add(pat,'path',{d:`M 0,0 L ${size},${size}`,stroke:p.color,'stroke-width':1.2*scale})
  }
  return id
}
function patterns(svg,plan,scale,prefix){const defs=add(svg,'defs');for(const p of HISTORICAL_ICING.slice(1))pattern(defs,plan,p,prefix,scale);return defs}
function outlineColor(plan){return plan.id==='A'?(state.dark?'#e6edf5':color.accent):ICING_OUTLINE_COLOR}
function drawContours(svg,contours,transform,scale){
  for(const f of contours.features){const level=f.properties.temperature;if(!state.detail&&level===-10)continue
    const paths=f.geometry.coordinates.map(chain=>linePath(chain.map(transform)))
    for(const d of paths){add(svg,'path',{d,class:`contour halo${level===0?' zero':''}`});add(svg,'path',{d,class:`contour${level===0?' zero':''}`})}
    const chains=f.geometry.coordinates.filter(c=>c.length>3)
    if(chains.length){const chain=chains.reduce((a,b)=>a.length>b.length?a:b),p=transform(chain[Math.floor(chain.length*.68)]);if(p[0]>30&&p[0]<W-50&&p[1]>20&&p[1]<MAP_H-10)add(svg,'text',{x:p[0],y:p[1]-6*scale,'font-size':11*scale,class:'temperature-label'},`${level}°C`)}
  }
}
function badge(svg,x,y,grade,scale,allowEdge=false){
  if(!allowEdge&&(x<20||x>W-20||y<20))return
  const c=HISTORICAL_ICING[grade].color
  add(svg,'rect',{x:x-10*scale,y:y-9*scale,width:20*scale,height:18*scale,rx:3*scale,fill:'#ffffff',stroke:c,'stroke-width':1.2,'vector-effect':'non-scaling-stroke'})
  add(svg,'text',{x,y:y+4*scale,'text-anchor':'middle','font-size':12*scale,'font-weight':700,fill:c},['','L','M','S'][grade])
}
function mapBadges(svg,model,scale){
  for(let grade=1;grade<=3;grade++){
    const candidates=model.fills.features.filter(f=>f.properties.grade===grade).map(f=>f.geometry.coordinates[0].map(mapXY))
    if(!candidates.length)continue
    const ring=candidates.reduce((a,b)=>a.length>b.length?a:b)
    const minX=Math.min(...ring.map(p=>p[0])),maxX=Math.max(...ring.map(p=>p[0])),minY=Math.min(...ring.map(p=>p[1])),maxY=Math.max(...ring.map(p=>p[1]))
    // Anchor the grade label on a real polygon boundary, rather than a possibly empty centroid.
    const target=[(minX+maxX)/2,(minY+maxY)/2]
    const p=ring.reduce((a,b)=>Math.hypot(a[0]-target[0],a[1]-target[1])<Math.hypot(b[0]-target[0],b[1]-target[1])?a:b)
    badge(svg,p[0],p[1],grade,scale)
  }
}
function mapFigure(plan,parent){
  const fig=document.createElement('figure');fig.className='figure';fig.innerHTML='<figcaption>수평 지도 · '+state.level+' · 모든 안의 영역 동일</figcaption>';parent.append(fig)
  const scale=W/Math.max(300,fig.clientWidth),svg=add(fig,'svg',{viewBox:`0 0 ${W} ${MAP_H}`,role:'img','aria-label':`${plan.id}안 수평 지도`}),prefix=`pattern-${++serial}`
  const defs=patterns(svg,plan,scale,prefix),clip=`clip-${serial}`;add(add(defs,'clipPath',{id:clip}),'rect',{width:W,height:MAP_H})
  const plot=add(svg,'g',{'clip-path':`url(#${clip})`})
  add(plot,'rect',{width:W,height:MAP_H,fill:state.dark?'#101e30':'#edf3f5'})
  for(const d of landPaths)add(plot,'path',{d,fill:state.dark?'#263849':'#fafafa',stroke:state.dark?'#60768b':'#aeb9c1','stroke-width':.65,'vector-effect':'non-scaling-stroke'})
  const model=currentMap(),g=model.cloud.grid
  if(state.cloud){const [x,y]=mapXY([g.lonMin,g.latMax]),[xr,yb]=mapXY([g.lonMax,g.latMin]);add(plot,'image',{x,y,width:xr-x,height:yb-y,href:cloudImage(model.cloud),opacity:.82,'data-layer':'cloud'})}
  if(state.icing){
    const ice=add(plot,'g',{'data-layer':'icing'})
    if(plan.id!=='F')for(const f of model.icing.fills.features)add(ice,'path',{d:geoPath(f.geometry.coordinates),fill:`url(#${prefix}-${f.properties.grade})`,'fill-rule':'evenodd','data-grade':f.properties.grade,'data-mask':geoPath(f.geometry.coordinates)})
    for(const f of model.icing.outlines.features)add(ice,'path',{d:linePath(f.geometry.coordinates.map(mapXY)),class:'outline',stroke:outlineColor(plan),'data-outline':'union'})
    if(plan.id==='D'||plan.id==='F')mapBadges(ice,model.icing,scale)
  }
  if(state.temp)drawContours(plot,model.contours,mapXY,scale)
  add(plot,'path',{d:linePath(data.route.map(mapXY)),fill:'none',stroke:state.dark?'#d1d1d1':'#334155','stroke-dasharray':'5 4','stroke-width':1.2,'vector-effect':'non-scaling-stroke'})
  for(const [label,point]of [['RKSI',data.route[0]],['RKPC',data.route[1]]]){const[x,y]=mapXY(point);add(plot,'circle',{cx:x,cy:y,r:3*scale,fill:'#fff',stroke:'#334155'});add(plot,'text',{x:x+6*scale,y:y-6*scale,'font-size':11*scale,class:'temperature-label'},label)}
}
function profileFigure(plan,parent){
  const fig=document.createElement('figure');fig.className='figure';fig.innerHTML='<figcaption>연직단면 · RKSI → RKPC · 0–30,000 ft</figcaption>';parent.append(fig)
  const scale=W/Math.max(300,fig.clientWidth),height=Math.max(PROFILE_H,240*scale),svg=add(fig,'svg',{viewBox:`0 0 ${W} ${height}`,role:'img','aria-label':`${plan.id}안 연직단면`}),prefix=`profile-${++serial}`,defs=patterns(svg,plan,scale,prefix)
  const left=Math.max(62,56*scale),right=W-Math.max(36,34*scale),top=24*scale,bottom=height-30*scale
  const source=currentProfile(),levels=source.levels, xFor=d=>left+d/source.totalDistanceNm*(right-left),yFor=ft=>bottom-ft/30000*(bottom-top),altFor=l=>Number.isFinite(l.altFt)?l.altFt:pressureToFallbackFt(l.pressure)
  const clip=`clip-${serial}`;add(add(defs,'clipPath',{id:clip}),'rect',{x:left,y:top,width:right-left,height:bottom-top})
  add(svg,'rect',{width:W,height,fill:state.dark?'#101e30':'#fff'})
  for(const ft of [0,10000,20000,30000]){const y=yFor(ft);add(svg,'line',{x1:left,x2:right,y1:y,y2:y,stroke:state.dark?'#334155':'#e0e0e0','stroke-width':.7});add(svg,'text',{x:left-8*scale,y:y+4*scale,'text-anchor':'end','font-size':10*scale,fill:state.dark?'#d1d1d1':'#616161'},ft.toLocaleString('en-US'))}
  const plot=add(svg,'g',{'clip-path':`url(#${clip})`}),model=buildProfileCloudIcing(levels,xFor,yFor,altFor)
  if(state.cloud){const blur=`blur-${serial}`;add(add(defs,'filter',{id:blur,x:'-5%',y:'-5%',width:'110%',height:'110%'}),'feGaussianBlur',{stdDeviation:4*scale});const cloud=add(plot,'g',{filter:`url(#${blur})`,'data-layer':'cloud'});for(const c of model.cloud)add(cloud,'rect',{x:c.x,y:c.y,width:c.w,height:c.h,fill:c.fill})}
  if(state.icing){const ice=add(plot,'g',{'data-layer':'icing'});if(plan.id!=='F')for(const c of model.icing)add(ice,'rect',{x:c.x,y:c.y,width:c.w,height:c.h,fill:`url(#${prefix}-${c.grade})`,'data-grade':c.grade,'data-mask':[c.x,c.y,c.w,c.h,c.grade].join(',')});for(const d of model.outlines)add(ice,'path',{d,class:'outline',stroke:outlineColor(plan),'data-outline':'union'});if(plan.id==='D'||plan.id==='F')for(let grade=1;grade<=3;grade++){const cells=model.icing.filter(c=>c.grade===grade);if(cells.length){const c=cells[Math.floor(cells.length/2)];badge(ice,c.x+c.w/2,c.y+c.h/2,grade,scale)}}}
  if(state.temp){const grid={nx:levels[0].values.length,ny:levels.length,xs:levels[0].values.map(v=>xFor(v.distanceNm)),ys:levels.map(l=>yFor(altFor(l))),values:levels.flatMap(l=>l.values.map(v=>v.t))};for(const t of state.detail?[0,-10,-20]:[0,-20]){const chains=chainContourSegments(isothermSegments(grid,t));for(const chain of chains){const d=linePath(chain.map(p=>[p.x,p.y]));add(plot,'path',{d,class:`contour halo${t===0?' zero':''}`});add(plot,'path',{d,class:`contour${t===0?' zero':''}`})}if(chains.length){const p=chains.flat().reduce((a,b)=>a.x>b.x?a:b);if(p.y>=top&&p.y<=bottom)add(svg,'text',{x:right+4*scale,y:p.y+3*scale,'font-size':10*scale,fill:state.dark?'#d1d1d1':'#616161'},`${t}°`)}}}
  for(const [x,label,anchor]of [[left,'RKSI','start'],[right,'RKPC','end']])add(svg,'text',{x,y:height-10*scale,'text-anchor':anchor,'font-size':11*scale,fill:state.dark?'#d1d1d1':'#242424'},label)
}
function legend(plan,parent){
  const row=document.createElement('div');row.className='legend';parent.append(row)
  const cloud=document.createElement('span');cloud.innerHTML='<i class="cloud-key"></i>구름 동일';row.append(cloud)
  for(const p of HISTORICAL_ICING.slice(1)){const span=document.createElement('span');row.append(span);const svg=add(span,'svg',{viewBox:'0 0 32 18','aria-hidden':'true'}),prefix=`legend-${++serial}`;patterns(svg,plan,1,prefix);add(svg,'rect',{x:0,y:0,width:32,height:18,fill:plan.id==='F'?'transparent':`url(#${prefix}-${p.grade})`,stroke:plan.id==='A'?color.accent:ICING_OUTLINE_COLOR});if(plan.id==='F')badge(svg,16,9,p.grade,.7,true);span.append(document.createTextNode(p.label==='MODERATE'?'MOD':p.label==='SEVERE'?'SEV':'LGT'))}
}
function renderCard(plan,parent,zoom=false){
  const card=document.createElement('article');card.className='card'+(state.selected.has(plan.id)?' selected':'');card.dataset.plan=plan.id;parent.append(card)
  card.innerHTML=`<div class="card-head"><div class="card-title"><h2>${plan.id} · ${plan.title}</h2></div><p>${plan.description}</p>${zoom?'':`<div class="card-actions"><label><input type="checkbox" data-select="${plan.id}" ${state.selected.has(plan.id)?'checked':''} ${state.selected.size===2&&!state.selected.has(plan.id)?'disabled':''}>비교에 담기</label><button type="button" data-zoom="${plan.id}" aria-label="${plan.id}안 확대">확대 보기</button></div>`}</div>`
  const figures=document.createElement('div');figures.className='figures'+(!zoom&&state.focusA&&state.view!=='both'?' single-view':'');card.append(figures)
  if(zoom||state.view!=='profile')mapFigure(plan,figures)
  if(zoom||state.view!=='map')profileFigure(plan,figures)
  legend(plan,card)
  const foot=document.createElement('div');foot.className='card-foot';foot.textContent=plan.note;card.append(foot)
}
function sourceInfo(){
  const m=currentMap(),synthetic=state.dataset==='synthetic'
  const valid=new Date(data.times.find(t=>t.hf===state.hf).validTime).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})
  $('source-info').innerHTML=`<strong>${synthetic?'합성 등급 시험장 · 실제 예보 아님':`보관 KIM · 발표 ${data.tmfc.slice(0,4)}-${data.tmfc.slice(4,6)}-${data.tmfc.slice(6,8)} ${data.tmfc.slice(8)} UTC · 유효 ${valid} KST`}</strong><br>${synthetic?'세 등급·빈 영역·내부 구멍을 함께 보기 위한 시각 시험입니다.':'실제 저장된 205×169 격자와 인천→제주 단면입니다. 현재 예보가 아닙니다.'} 착빙 격자 LGT / MOD / SEV: ${m.counts.slice(1).join(' / ')}`
}
function renderCards(){
  const focused=document.activeElement?.dataset.select
  const cards=$('cards');cards.replaceChildren();cards.classList.toggle('show-pair',state.pair);cards.classList.toggle('show-single',state.focusA)
  for(const plan of plans.filter(p=>state.focusA?p.id==='A':!state.pair||state.selected.has(p.id)))renderCard(plan,cards)
  $('compare-selected').disabled=state.selected.size!==2;$('compare-selected').textContent=state.pair?'전체 6개 보기':`선택 2개 크게 비교 (${state.selected.size}/2)`
  $('show-all').textContent=state.focusA?'기존 6안 비교':'A안만 보기';$('show-all').setAttribute('aria-pressed',String(!state.focusA));$('compare-selected').hidden=state.focusA
  sourceInfo()
  if(focused)document.querySelector(`[data-select="${focused}"]`)?.focus({preventScroll:true})
}
function renderZoom(){if(!zoomPlan)return;$('zoom-content').replaceChildren();renderCard(plans.find(p=>p.id===zoomPlan),$('zoom-content'),true)}

$('app').innerHTML=`<header><div><div class="eyebrow">PROJECTAMO · CLOUD / ICING DISPLAY STUDY</div><h1>A안 · 실제 KIM 구름 + 착빙</h1><p>저장된 실제 KIM 자료에 선택한 A안을 적용했습니다. 구름은 그대로, 착빙은 등급별 색 면과 동일한 흰 점무늬로 표시합니다.</p></div><span class="status">표현 비교 시안 · 서비스 미적용</span></header>
<section class="toolbar" aria-label="공통 비교 설정">
 <label>자료 <select id="dataset" aria-label="시험 자료"><option value="real" selected>보관 KIM 실자료</option><option value="synthetic">합성 · 세 등급 시험장</option></select></label>
 <label>기압층 <select id="level" aria-label="기압층">${data.levels.map(l=>`<option ${l===state.level?'selected':''}>${l}</option>`).join('')}</select></label>
 <label>예보 <select id="hf" aria-label="예보시간">${data.times.map(t=>`<option value="${t.hf}">F+${t.hf}h</option>`).join('')}</select></label>
 <div class="toolbar-group" role="group" aria-label="비교 화면"><span>보기</span><button data-view="map" aria-pressed="false">지도</button><button data-view="profile" aria-pressed="false">단면</button><button data-view="both" aria-pressed="true">지도 + 단면</button></div>
 <button id="background" aria-pressed="false">어두운 배경</button>
 <div class="toolbar-group"><label class="layer-switch"><input type="checkbox" data-toggle="cloud" checked>구름</label><label class="layer-switch"><input type="checkbox" data-toggle="icing" checked>착빙</label><label class="layer-switch"><input type="checkbox" data-toggle="temp" checked>등온선</label><label class="layer-switch"><input type="checkbox" data-toggle="detail">−10°C 추가</label></div>
</section><p class="source-info" id="source-info" aria-live="polite"></p>
<div class="comparison-actions"><p>A안은 등급별 색 면과 동일한 점무늬를 사용합니다. 기존 안과도 같은 자료로 비교할 수 있습니다.</p><div class="comparison-buttons"><button id="show-all" aria-pressed="false">기존 6안 비교</button><button id="compare-selected" hidden disabled>선택 2개 크게 비교 (0/2)</button></div></div>
<section class="cards" id="cards" aria-label="A안과 기존 착빙 표현 비교"></section>
<p class="data-note">A안의 점무늬는 착빙이라는 현상을 나타내는 보조 표식이고, 강도는 면의 색·명도와 범례로 구분합니다. 비교 화면은 로컬 SVG 지도이며 위성 배경·지형은 생략했습니다. 각 안은 같은 구름과 착빙 영역을 사용하며, 데이터 변경 없이 표시 방식만 바꿉니다. 추가 기상청 호출이나 서버 실행 없이 파일로 열 수 있습니다.</p>`
for(const key of ['dataset','level','hf'])$(key).addEventListener('change',e=>{state[key]=key==='hf'?Number(e.target.value):e.target.value;renderCards();renderZoom()})
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{state.view=b.dataset.view;for(const x of document.querySelectorAll('[data-view]'))x.setAttribute('aria-pressed',String(x===b));renderCards()})
for(const b of document.querySelectorAll('[data-toggle]'))b.addEventListener('change',()=>{state[b.dataset.toggle]=b.checked;renderCards();renderZoom()})
$('background').addEventListener('click',()=>{state.dark=!state.dark;$('background').setAttribute('aria-pressed',String(state.dark));renderCards();renderZoom()})
$('cards').addEventListener('change',e=>{const id=e.target.dataset.select;if(!id)return;if(e.target.checked)state.selected.add(id);else state.selected.delete(id);if(state.selected.size<2)state.pair=false;renderCards()})
$('show-all').addEventListener('click',()=>{state.focusA=!state.focusA;state.pair=false;renderCards()})
$('compare-selected').addEventListener('click',()=>{state.pair=!state.pair;renderCards()})
$('cards').addEventListener('click',e=>{const id=e.target.closest('[data-zoom]')?.dataset.zoom;if(!id)return;zoomPlan=id;$('zoom-dialog').showModal();renderZoom()})
$('close-dialog').addEventListener('click',()=>$('zoom-dialog').close())
$('zoom-dialog').addEventListener('close',()=>{zoomPlan=null})
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{renderCards();renderZoom()},120)})
window.__cloudIcingVariants={state,plans,currentMap,currentProfile,renderCards}
renderCards()
