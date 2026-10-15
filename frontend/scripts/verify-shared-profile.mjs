import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const base='http://127.0.0.1:5173', out='artifacts/profile-audit/shared'
await mkdir(out,{recursive:true})
const routeGeometry={type:'LineString',coordinates:[[126.45,37.46],[125.8,36.5],[126.49,33.51]]}
const routeMarkers=[{id:'start',label:'RKSI',lon:126.45,lat:37.46},{id:'middle',label:'MID',lon:125.8,lat:36.5},{id:'end',label:'RKPC',lon:126.49,lat:33.51}]
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.json()}
const [profile,crossSection]=await Promise.all([post('/api/vertical-profile',{routeGeometry,routeMarkers,plannedCruiseAltitudeFt:35000,candidateCruiseAltitudesFt:[15000,35000,45000]}),post('/api/briefing/cross-section',{routeGeometry,routeMarkers})])
const b=await chromium.launch(), errors=[],results=[]
try {
 const p=await b.newPage({viewport:{width:1600,height:1000}});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message))
 await p.goto(base+'/concepts/vertical-profile');await p.locator('.vpc-operational').waitFor()
 async function mount(kind,size={width:1600,height:1000}){
 await p.setViewportSize(size)
 await p.evaluate(async({kind,profile,crossSection})=>{
  const entry=await (await fetch('/src/main.jsx')).text()
  const reactUrl=entry.match(/"([^"]*\/react\.js[^"]*)"/)[1]
  const domUrl=entry.match(/"([^"]*\/react-dom_client\.js[^"]*)"/)[1]
  const React=(await import(reactUrl)).default
  const {createRoot}=(await import(domUrl)).default
  const Viewer=(await import('/src/features/route-briefing/VerticalProfileViewer.jsx')).default
  const {useCrossSectionLayers} = await import('/src/features/route-briefing/crossSectionLayers.jsx')
  document.querySelector('#root').style.display='none'
  if(!window.testRoot){const div=document.createElement('div');div.id='profile-test';div.style.cssText='position:fixed;inset:0;z-index:20000;background:white;overflow:auto';document.body.append(div);window.testRoot=createRoot(div)}
  window.profileCalls=[]
  const embedded=['panel','organization','dense'].includes(kind)
  const frozen=kind==='frozen'||kind==='organization'
  let value=structuredClone(profile)
  if(kind==='line'){delete value.flightPlan;value.candidateProfiles=[]}
  if(kind==='missing'){value.terrain={values:[]}}
  if(kind==='dense') {value.markers=Array.from({length:401},(_,i)=>({id:'fix-'+i,label:i%5===0?'DUPLICATE':'FIX'+i,distanceNm:i*15}));value.axis.totalDistanceNm=6000;value.axis.samples=Array.from({length:601},(_,i)=>({index:i,distanceNm:i*10}));value.terrain.values=value.axis.samples.map(s=>({index:s.index,elevationM:0}))}
  function Test(){
   const [layers,toggle]=useCrossSectionLayers()
   return React.createElement('div',{style:embedded?{width:'min(850px,100%)',height:600,margin:0}:{}},React.createElement(Viewer,{
    embedded,fillContainer:embedded,profile:value,crossSection:kind==='line'?null:crossSection,
    layers,onToggleLayer:toggle,isOpen:true,onClose:()=>{},
    ...(kind==='line'?{referenceAltitudeFt:15000,allowMissingTerrain:true}:{selectedCandidateAltitudeFt:35000}),
    ...(!frozen&&kind!=='line'?{candidateAltitudes:[15000,35000,45000],onSelectCandidateAltitude:v=>window.profileCalls.push(['altitude',v]),onSelectForecastHour:v=>window.profileCalls.push(['hour',v]),onSetWaypointNwpOffset:(...v)=>window.profileCalls.push(['offset',...v])}:{}),
    nwpTimeSelection:kind==='line'?null:{baseTime:crossSection.run.validTime,waypointOverrides:[]},
    statusMessage:kind==='warning'?'검증용 갱신 오류':null,
    highlightRangeNm:kind==='panel'?{startNm:40,endNm:100}:null,
    linkedItems:kind==='organization'?[{itemKey:'note:1',title:'연결 자료',distanceIntervals:[{startNm:40,endNm:100}],altitude:{minFt:10000,maxFt:20000}}]:[],
    activeLinkedItemId:kind==='organization'?'note:1':null,onSelectLinkedItem:kind==='organization'?id=>window.profileCalls.push(['linked',id]):undefined,
   }),embedded?React.createElement('div',{style:{height:1000}},'스크롤 확인'):null)
  }
  window.testRoot.render(React.createElement(Test,{key:kind}))
 },{kind,profile,crossSection})
 await p.locator('#profile-test .vpc-operational').waitFor();await p.waitForTimeout(350)
 }
 for(const kind of ['window','panel','organization','frozen','line','warning','missing','dense','mobile']){
 console.log('checking',kind)
 await mount(kind,kind==='mobile'?{width:667,height:375}:undefined)
 const root=p.locator('#profile-test'),chart=root.locator('.vertical-profile-plot-svg')
 if(kind==='missing'){assert.match(await root.textContent(),/지형고도 샘플이 없습니다/);results.push('missing terrain preserves restriction');continue}
 await chart.waitFor()
 if(kind==='mobile') await root.locator('.vpc-operational-controls > summary').click()
 assert.equal(await root.getByRole('button',{name:'난류',exact:true}).getAttribute('aria-pressed'),'true')
 if(kind==='line') {assert.equal(await root.locator('.vertical-profile-procedure-line:not(.vertical-profile-reference-line)').count(),0);assert.equal(await root.getByRole('combobox').count(),0);assert.match(await root.textContent(),/기상 단면/)}
 else assert.equal(await root.locator('.vertical-profile-procedure-line.is-selected').evaluate(el=>getComputedStyle(el).stroke),'rgb(37, 99, 235)')
 if(kind==='frozen'||kind==='organization'){assert.equal(await root.getByRole('button',{name:'이전 예보시간'}).count(),0);assert.equal(await root.locator('[aria-label$="부터 NWP 시간 설정"]').count(),0);assert.equal(await root.getByRole('combobox').count(),0)}
 if(kind==='warning')assert.ok(await root.getByRole('status').filter({hasText:'검증용 갱신 오류'}).isVisible())
 if(kind==='panel')assert.equal(await root.locator('.vertical-profile-leg-band').count(),1)
 if(kind==='organization'){await root.getByRole('button',{name:'연결 자료 · 고도 범위 연결'}).click();assert.deepEqual(await p.evaluate(()=>window.profileCalls.at(-1)),['linked','note:1'])}
 if(kind==='window'){
  assert.equal(await root.locator('.vertical-profile-reference-line').count(),1)
  await root.getByRole('button',{name:'15,000 ft',exact:true}).click();assert.deepEqual(await p.evaluate(()=>window.profileCalls.at(-1)),['altitude',15000])
  await root.locator('[aria-label$="부터 NWP 시간 설정"]').first().click();await root.getByRole('button',{name:'기준',exact:true}).click();assert.equal(await p.evaluate(()=>window.profileCalls.at(-1)[0]),'offset')
 }
 if(['window','panel','organization','frozen'].includes(kind)){
  const rect=await root.locator('.vertical-profile-plot-scroll').boundingBox();await p.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await p.mouse.wheel(0,-200);await p.waitForTimeout(200)
  const enlarged=await root.locator('.vertical-profile-plot-scroll').evaluate(e=>e.scrollWidth>e.clientWidth+2)
  assert.equal(enlarged,!['panel','organization'].includes(kind),'wheel respects parent scroll')
  await root.getByRole('button',{name:'차트 확대',exact:true}).click();await p.waitForTimeout(100);assert.ok(await root.locator('.vertical-profile-plot-scroll').evaluate(e=>e.scrollWidth>e.clientWidth))
  await root.getByRole('button',{name:'전체',exact:true}).click()
 }
 if(kind==='dense'){
  const boxes=await root.locator('.vertical-profile-marker-label').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {l:r.left,r:r.right}}).sort((a,b)=>a.l-b.l));for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].l>=boxes[i-1].r)
  assert.ok(boxes.length<40)
 }
 const h=await root.locator('.vertical-profile-chart-body').evaluate(e=>e.clientHeight);assert.ok(h>=160,`${kind} chart height ${h}`)
 await p.screenshot({path:`${out}/${kind}.png`});results.push(kind)
 }
 assert.deepEqual(errors,[])
}finally{await b.close();await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log({results,errors})}
