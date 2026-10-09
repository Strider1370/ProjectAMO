import { DEFAULTS, calculateScore, validateSettings } from './calculation.mjs'
const data = window.ACI_DATA, land = window.ACI_LAND
const $ = id => document.getElementById(id)
let settings = { ...DEFAULTS }, selection = 0, results = []
const specs = [['cape', 'CAPE', 'J/kg', 100], ['rain', '강수강도', 'mm/h', 0.1], ['olr', 'OLR', 'W/m²', 5]]
$('ranges').innerHTML = specs.map(([name, label, unit, step]) => `<h3 style="font-size:14px;margin:12px 0 4px">${label} · ${unit}</h3><div class="param-row"><label>하한<input type="number" id="${name}Low" min="0" step="${step}" value="${settings[`${name}Low`]}"></label><label>상한<input type="number" id="${name}High" min="0" step="${step}" value="${settings[`${name}High`]}"></label></div>`).join('')
$('weights').innerHTML = specs.map(([name, label]) => `<div class="weight"><label for="${name}Weight">${label} 가중치<output id="${name}Percent"></output></label><input id="${name}Weight" type="range" min="0" max="1" step="0.05" value="1"></div>`).join('')
const places = [['인천',126.45,37.46],['서울',126.98,37.57],['광주',126.85,35.16],['부산',129.08,35.18],['제주',126.53,33.5],['서해',124.5,35.5],['동해',131,37],['남해',128,33]]
const closest = (lon, lat) => data.cells.reduce((best, p, i) => ((p.lon-lon)**2+(p.lat-lat)**2 < (data.cells[best].lon-lon)**2+(data.cells[best].lat-lat)**2 ? i : best), 0)
selection = closest(126.45,37.46)
$('point').innerHTML = places.map(([name,lon,lat])=>`<option value="${closest(lon,lat)}">${name} 인근 격자</option>`).join('') + '<option value="custom" disabled>지도 선택 격자</option>'
$('point').value = String(selection)
$('point').onchange = () => {selection = Number($('point').value); showSelection(); draw()}
const dateLabel = zone => new Intl.DateTimeFormat('ko-KR',{timeZone:zone === 'KST'?'Asia/Seoul':'UTC',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(data.validAt)) + ` ${zone}`
const fmt = (v, n=2) => Number.isFinite(v) ? v.toLocaleString('ko-KR',{maximumFractionDigits:n, minimumFractionDigits:n}) : '결측'
function showSelection() {
  const p = data.cells[selection], r = results[selection]
  $('coords').textContent = `${p.lat.toFixed(2)}°N · ${p.lon.toFixed(2)}°E · ${dateLabel($('timezone').value)}`
  $('selected-score').textContent = r ? fmt(r.score,3) : '계산 불가'
  $('values').innerHTML = [['CAPE',p.cape,'J/kg'],['강수강도',p.rainRate,'mm/h'],['OLR',p.olr,'W/m²']].map(([label,value,unit],i)=>`<tr><td>${label}</td><td>${fmt(value)} ${unit}</td><td>${r?fmt(r.membership[i],3):'—'}</td><td>${r?fmt(r.contributions[i],3):'—'}</td></tr>`).join('')
  $('sum').textContent = r ? `가중 기여의 합 = ${fmt(r.score,3)} · CIN ${fmt(p.cin)} J/kg` : '입력 결측 또는 설정 오류로 계산하지 않았습니다.'
}
const merc = lat => Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360))
function draw() {
  const canvas=$('map'), rect=canvas.getBoundingClientRect(), w=rect.width,h=rect.height,dpr=window.devicePixelRatio||1
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr)
  const minLon=119,maxLon=136,minLat=30,maxLat=44
  const x=lon=>(lon-minLon)/(maxLon-minLon)*w,y=lat=>(merc(maxLat)-merc(lat))/(merc(maxLat)-merc(minLat))*h
  ctx.fillStyle='#edf0f2';ctx.fillRect(0,0,w,h)
  const layer=$('layer').value, cutoff=Number($('cutoff').value)
  const lo={score:0,cape:0,rainRate:0,olr:150}[layer],hi={score:1,cape:2000,rainRate:10,olr:300}[layer]
  $('legend-title').textContent={score:'실험 대류점수 · 0~1',cape:'지표 기반 CAPE · J/kg',rainRate:'강수강도 · mm/h',olr:'OLR · W/m²'}[layer]
  $('legend-ticks').innerHTML=`<span>${lo}</span><span>${(lo+hi)/2}</span><span>${hi}${layer==='score'?'':' 이상'}</span>`
  $('cutoff').disabled=layer!=='score'
  const half=data.grid.stepDegrees/2
  data.cells.forEach((p,i)=>{
    const value=layer==='score'?results[i]?.score:p[layer]
    if (!Number.isFinite(value) || (layer==='score' && value<cutoff)) return
    const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)))
    ctx.fillStyle=`rgb(${Math.round(255-143*t)},${Math.round(237-175*t)},${Math.round(177-154*t)})`
    ctx.fillRect(x(p.lon-half),y(p.lat+half),x(p.lon+half)-x(p.lon-half)+0.2,y(p.lat-half)-y(p.lat+half)+0.2)
  })
  ctx.lineWidth=0.65;ctx.strokeStyle='#676e73'
  for(const ring of land){ctx.beginPath();ring.forEach(([lon,lat],i)=>i?ctx.lineTo(x(lon),y(lat)):ctx.moveTo(x(lon),y(lat)));ctx.stroke()}
  ctx.font='12px system-ui';ctx.fillStyle='#242424'
  for(const [name,lon,lat] of places.slice(0,5)){ctx.beginPath();ctx.arc(x(lon),y(lat),2.5,0,2*Math.PI);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(x(lon)+4,y(lat)-13,27,17);ctx.fillStyle='#242424';ctx.fillText(name,x(lon)+5,y(lat))}
  const p=data.cells[selection];ctx.beginPath();ctx.arc(x(p.lon),y(p.lat),8,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#242424';ctx.lineWidth=2;ctx.stroke()
}
function render() {
  const proposed=Object.fromEntries(Object.keys(DEFAULTS).map(key=>[key,$(key).value.trim()===''?NaN:Number($(key).value)]))
  try {validateSettings(proposed);settings=proposed;$('error').textContent='';results=data.cells.map(p=>calculateScore(p,settings))}
  catch {$('error').textContent='상한은 하한보다 커야 하고, 가중치 합은 0보다 커야 합니다.';results=data.cells.map(()=>null)}
  const sum=settings.capeWeight+settings.rainWeight+settings.olrWeight
  for(const [name] of specs) $(''+name+'Percent').textContent=fmt(settings[`${name}Weight`]/sum*100,0)+'%'
  $('formula').textContent=`MC = clip((CAPE − ${settings.capeLow}) / ${settings.capeHigh-settings.capeLow})\nMR = clip((강수 − ${settings.rainLow}) / ${settings.rainHigh-settings.rainLow})\nMO = clip((${settings.olrHigh} − OLR) / ${settings.olrHigh-settings.olrLow})`
  $('formula').style.whiteSpace='pre-line'
  const scores=results.filter(Boolean).map(r=>r.score)
  $('maximum').textContent=scores.length?fmt(Math.max(...scores),3):'계산 불가'
  $('coverage').textContent=`${scores.length} / ${data.cells.length}`
  $('time').textContent=dateLabel($('timezone').value)
  showSelection();draw()
}
Object.keys(DEFAULTS).forEach(key=>$(key).addEventListener('input',render))
$('reset').onclick=()=>{Object.entries(DEFAULTS).forEach(([key,value])=>$(key).value=value);render()}
$('layer').onchange=draw;$('cutoff').onchange=draw;$('timezone').onchange=render
$('map').onclick=e=>{const r=$('map').getBoundingClientRect();const lon=119+(e.clientX-r.left)/r.width*17;const m=merc(44)-(e.clientY-r.top)/r.height*(merc(44)-merc(30));const lat=(2*Math.atan(Math.exp(m))-Math.PI/2)*180/Math.PI;selection=closest(lon,lat);$('point').value='custom';showSelection();draw()}
$('provenance').textContent=`KIMG/NE57 · 실행 ${data.tmfc} UTC · +${data.hf}h. 저장된 연직 자료와 같은 시각의 지상·강수·OLR API 자료를 결합했습니다. 최신 예보가 아닙니다. 원 격자는 1/12°이고, 이번 예시는 8칸 간격(${data.grid.stepDegrees.toFixed(2)}°)으로 표본을 계산했습니다. MetPy ${data.metpyVersion}.`
new ResizeObserver(draw).observe($('map'))
window.aciExperiment={data,get settings(){return settings},get results(){return results},get selection(){return selection}}
render()
