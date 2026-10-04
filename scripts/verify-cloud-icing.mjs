// Stored-data browser verification; all HTTP requests are intercepted.
// Run from the repository root: node scripts/verify-cloud-icing.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from '../frontend/node_modules/playwright/index.mjs'
import { readKimNwpGrid,readKimNwpIndex } from '../backend/src/processors/kim-nwp-store.js'
import { buildKimIcingFieldFromGrid,buildKimTemperatureFieldFromGrid,buildKimCloudPotentialFieldFromGrid,filterKimNwpIndexForVariables } from '../backend/src/processors/kim-nwp-model.js'
await import('./preview-cloud-icing.mjs')
async function verifyMap() {
const browser = await chromium.launch({headless:true,args:['--allow-file-access-from-files','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page = await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1})
try {
const errors=[],external=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500))})
await page.route(/^https?:\/\//,route=>{const url=new URL(route.request().url());external.push(url.origin+url.pathname);if(url.hostname==='api.mapbox.com'||url.hostname==='events.mapbox.com')return route.fulfill({status:200,contentType:'application/json',body:'{}'});return route.abort()})
await page.goto('file://'+path.resolve('artifacts/cloud-icing-real-kim.html'))
await page.waitForFunction(()=>window.__cloudIcingPreview?.map?.getLayer('kim-icing-outer-layer'),null,{timeout:15000}).catch(async e=>{ console.log({errors,external,state:await page.evaluate(()=>({mapErrors:window.previewErrors,preview:!!window.__cloudIcingPreview,loaded:window.__cloudIcingPreview?.map?.isStyleLoaded(),layers:window.__cloudIcingPreview?.map?.getStyle()?.layers.map(l=>l.id),text:document.body.innerText.slice(0,800)}))}); throw e })
await page.waitForTimeout(1800)
console.log(await page.evaluate(()=>({mapErrors:window.previewErrors,layers:window.__cloudIcingPreview.map.getStyle().layers.map(l=>l.id),cloud:document.querySelectorAll('[data-testid="kim-cloud-shading"] rect').length,icing:document.querySelectorAll('[data-testid="kim-icing-patterns"] rect').length})))
await page.screenshot({path:'artifacts/cloud-icing-real-desktop.png',fullPage:true})
const state=()=>page.evaluate(()=>{const p=window.__cloudIcingPreview;return{hf:p.hf,level:p.level,visibility:p.visibility,order:p.map.getStyle().layers.map(l=>l.id),ice:p.map.getLayoutProperty('kim-icing-pattern-layer','visibility'),line:p.map.getLayoutProperty('kim-icing-outer-layer','visibility')}})
assert.equal((await state()).visibility.cloud&& (await state()).visibility.icing,true)
const controls=page.getByRole('group',{name:'구름·착빙 지도 표시'})
await controls.getByRole('button',{name:'착빙',exact:true}).click();await page.waitForTimeout(80)
assert.equal((await state()).ice,'none');assert.equal((await state()).line,'none');assert.equal((await state()).visibility.cloud,true)
await controls.getByRole('button',{name:'착빙',exact:true}).click()
assert.equal(await page.locator('.cloud-icing-controls').count(),0)
await page.getByRole('combobox',{name:'예보시간'}).selectOption('9');await page.waitForTimeout(300)
assert.equal((await state()).hf,9)
await page.getByRole('combobox',{name:'기압층'}).selectOption('250hPa');await page.waitForTimeout(250)
assert.equal((await state()).ice,'none');assert.equal(await controls.getByRole('button',{name:'착빙',exact:true}).isDisabled(),true)
assert.equal((await state()).visibility.temp&& (await state()).visibility.cloud,true)
await page.getByRole('combobox',{name:'기압층'}).selectOption('500hPa')
for(let i=0;i<2;i++){
 await page.getByRole('button',{name:'배경 전환',exact:true}).click();await page.waitForTimeout(1200)
 const s=await state();assert.equal(s.ice,'visible');assert.ok(s.order.indexOf('kim-cloud-potential-image-layer')<s.order.indexOf('kim-icing-pattern-layer'));assert.ok(s.order.indexOf('kim-icing-outer-layer')<s.order.indexOf('kim-temperature-zero-line'))
}
await page.getByRole('combobox',{name:'예보시간'}).selectOption('6')
await page.getByRole('button',{name:'배경 전환',exact:true}).click();await page.waitForTimeout(1500)
await page.screenshot({path:'artifacts/cloud-icing-real-dark.png',fullPage:true})
const profile=page.locator('.preview-profile')
assert.ok(await profile.locator('[data-testid="kim-cloud-shading"] rect').count()>0)
assert.ok(await profile.locator('[data-testid="kim-icing-patterns"] rect').count()>0)
await profile.getByRole('button',{name:'착빙',exact:true}).click();assert.equal(await profile.locator('[data-testid="kim-icing-patterns"]').count(),0);assert.ok(await profile.locator('[data-testid="kim-cloud-shading"] rect').count()>0)
await profile.getByRole('button',{name:'착빙',exact:true}).click()
await profile.getByRole('button',{name:'구름층 추정',exact:true}).click();assert.equal(await profile.locator('[data-testid="kim-cloud-shading"]').count(),0);assert.ok(await profile.locator('[data-testid="kim-icing-patterns"] rect').count()>0)
await profile.getByRole('button',{name:'구름층 추정',exact:true}).click()
await profile.getByRole('button',{name:'바람',exact:true}).click()
await page.getByRole('combobox',{name:'기압층'}).selectOption('600hPa')
await page.getByRole('button',{name:'배경 전환',exact:true}).click();await page.waitForTimeout(1200)
for(const zoom of [6.8,4.8]){await page.evaluate(z=>window.__cloudIcingPreview.map.jumpTo({zoom:z}),zoom);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__cloudIcingPreview.map.hasImage('kim-icing-a-dots-1')),true)}
await page.evaluate(()=>window.__cloudIcingPreview.map.jumpTo({zoom:5.6}));await page.waitForTimeout(300)
await page.screenshot({path:'artifacts/cloud-icing-real-weather-only.png',fullPage:true})
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500)
// The product panel switches to its mobile sheet. Close it to inspect the map/chart at 390px.
const close=page.getByRole('button',{name:'닫기',exact:true});if(await close.count())await close.last().click()
await page.waitForTimeout(300);await page.screenshot({path:'artifacts/cloud-icing-real-mobile.png',fullPage:true})
const overflow=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth,errors:window.previewErrors}))
await fs.writeFile('artifacts/cloud-icing-browser-verification.json',JSON.stringify({errors,external,overflow,checks:['simultaneous cloud and icing','icing pattern+outline hide together','map fixed 0/-20; profile optional -10 preserved','F6 to F9','250hPa unsupported icing leaves cloud and temperature','two style replacements','profile independent toggles','390px mobile']},null,2))
console.log({errors,external,overflow});
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(overflow.errors,[]);assert.ok(overflow.body<=overflow.viewport)
} finally { await browser.close() }

}
async function verifySelection() {
const repo=process.cwd(),idx=readKimNwpIndex('backend/data'),fixtures={tmfc:idx.latestRun,fields:{},indexes:{temp:filterKimNwpIndexForVariables(idx,['T']),cloud:filterKimNwpIndexForVariables(idx,['T','rh']),icing:filterKimNwpIndexForVariables(idx,['T','rh_liq','w','tqc','tqi','tqr','tqs','cld'])}}
for(const hf of [6,9])for(const levelId of ['1000hPa','500hPa','450hPa','250hPa']){
 const g=readKimNwpGrid({root:'backend/data',model:idx.model,tmfc:idx.latestRun,hf,levelId})
 fixtures.fields[hf+':'+levelId]={temp:buildKimTemperatureFieldFromGrid(g),cloud:buildKimCloudPotentialFieldFromGrid(g),icing:parseFloat(levelId)>=300?buildKimIcingFieldFromGrid(g):null}
}
const source=`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{useNwpOverlays}from'./frontend/src/features/weather-overlays/lib/useNwpOverlays.js';
const fixture=window.fixture;window.calls=[];window.flags={failTempIndex:location.search.includes('failTempIndex')};
window.fetch=async(input,options={})=>{const u=new URL(input,'https://fixture.test');window.calls.push(u.pathname+u.search);
 if(u.pathname==='/api/snapshot-meta')return new Response('{}');
 const parts=u.pathname.split('/'),variable=parts[3],kind=parts[4];if(parts[2]!=='kim')throw new Error('unexpected endpoint '+u.pathname);
 if(kind==='index'){if(variable==='temp'&&window.flags.failTempIndex)return new Response('{}',{status:500});return new Response(JSON.stringify(fixture.indexes[variable]));}
 if(window.flags.failCloud&&variable==='cloud'&&u.searchParams.get('level')==='450hPa')return new Response('{}',{status:500});
 await new Promise(r=>setTimeout(r,variable==='icing'?300:30)); // Deliberately allow aborted responses to complete.
 const fields=fixture.fields[u.searchParams.get('hf')+':'+u.searchParams.get('level')],field=fields?.[variable];return new Response(JSON.stringify(field??{}),{status:field?200:404});
};
function Harness(){const[config,setConfig]=useState({dataMode:'live',metVisibility:{temp:true,cloud:true,icing:true,cloudIcing:true}});
 const n=useNwpOverlays({enableWindOverlay:true,...config});window.setConfig=setConfig;window.select=n.setNwpSelection;window.state={selection:n.nwpSelection,levels:n.sliderLevels.map(l=>l.id),temp:n.temperatureField,cloud:n.cloudField,icing:n.icingField,status:[n.tempStatus,n.cloudStatus,n.icingStatus]};
 return <div>{JSON.stringify({selection:n.nwpSelection,status:window.state.status,levels:window.state.levels.length})}</div>}
createRoot(document.getElementById('root')).render(<Harness/>);`
const b=await build({stdin:{contents:source,resolveDir:repo,loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',alias:{react:path.join(repo,'frontend/node_modules/react'),'react-dom':path.join(repo,'frontend/node_modules/react-dom')},define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},logLevel:'silent'})
await fs.writeFile('artifacts/cloud-icing-selection-test.html','<div id="root"></div><script>window.fixture='+JSON.stringify(fixtures)+'</script><script>'+b.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>')
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('file://'+repo+'/artifacts/cloud-icing-selection-test.html');await page.waitForFunction(()=>window.state?.temp&&window.state?.cloud&&window.state?.icing)
 console.log('pressure levels ready',await page.evaluate(()=>document.body.innerText));
 assert.equal(await page.evaluate(()=>window.state.levels.length),21)
 await page.evaluate(()=>window.select({tmfc:window.fixture.tmfc,hf:6,level:'500hPa'}));await page.waitForFunction(()=>window.state?.icing?.level.id==='500hPa')
 await page.evaluate(()=>{window.select({tmfc:window.fixture.tmfc,hf:9,level:'450hPa'});setTimeout(()=>window.select({tmfc:window.fixture.tmfc,hf:6,level:'250hPa'}),50)})
 await page.waitForFunction(()=>window.state.temp?.level.id==='250hPa'&&window.state.cloud?.level.id==='250hPa');await page.waitForTimeout(450)
 assert.equal(await page.evaluate(()=>window.state.selection.level),'250hPa');assert.equal(await page.evaluate(()=>window.state.icing),null)
 assert.equal(await page.evaluate(()=>window.calls.some(c=>c.includes('/icing/field')&&c.includes('level=250hPa'))),false)
 await page.evaluate(()=>{window.flags.failCloud=true;window.select({tmfc:window.fixture.tmfc,hf:6,level:'450hPa'})})
 await page.waitForFunction(()=>window.state.temp?.level.id==='450hPa'&&window.state.icing?.level.id==='450hPa'&&window.state.status[1]==='error')
 assert.equal(await page.evaluate(()=>window.state.cloud),null)
 const pinned={bundleId:'immutable-review-bundle',models:{kim:{status:'available',tmfc:idx.latestRun,hf:6,validTime:idx.times.find(t=>t.hf===6)?.validTime,levelIds:['10m','500hPa','250hPa'],resources:{temp:{'10m':{revision:'temp-surface'},'500hPa':{revision:'temp-500'},'250hPa':{revision:'temp-250'}},cloud:{'500hPa':{revision:'cloud-500'},'250hPa':{revision:'cloud-250'}},icing:{'500hPa':{revision:'icing-500'}}}}}}
 await page.evaluate(()=>window.select({tmfc:window.fixture.tmfc,hf:6,level:'10m'}))
 const count=await page.evaluate(()=>window.calls.length)
 await page.evaluate(p=>{window.flags.failCloud=false;window.setConfig({dataMode:'pinned',mapDataSelection:p,metVisibility:{temp:true,cloud:true,icing:true,cloudIcing:true}})},pinned)
 await page.waitForFunction(()=>window.state.selection?.mode==='pinned'&&window.state.temp?.level.id==='500hPa'&&window.state.icing?.level.id==='500hPa')
 const pinnedCalls=await page.evaluate(count=>window.calls.slice(count),count)
 assert.ok(pinnedCalls.every(c=>c.includes('/field?')&&c.includes('revision=')),pinnedCalls.join('\n'))
 await page.evaluate(()=>window.select(p=>({...p,level:'250hPa'})))
 await page.waitForFunction(()=>window.state.temp?.level.id==='250hPa'&&window.state.cloud?.level.id==='250hPa')
 assert.equal(await page.evaluate(()=>window.state.icing),null)
 await page.evaluate(p=>{delete p.models.kim.resources.temp;window.setConfig({dataMode:'pinned',mapDataSelection:p,metVisibility:{temp:true,cloud:true,icing:true,cloudIcing:true}})},pinned)
 await page.waitForFunction(()=>window.state.temp===null&&window.state.cloud?.level.id==='250hPa')
 assert.equal(await page.evaluate(()=>window.state.levels.length),2)
 await page.goto('file://'+repo+'/artifacts/cloud-icing-selection-test.html?failTempIndex=1')
 await page.waitForFunction(()=>window.state?.temp&&window.state?.cloud&&window.state?.icing)
 console.log('pressure levels ready',await page.evaluate(()=>document.body.innerText));
 assert.equal(await page.evaluate(()=>window.state.levels.length),21)
 assert.deepEqual(errors,[])
 await fs.writeFile('artifacts/cloud-icing-selection-verification.json',JSON.stringify({passed:true,errors,checks:['21 pressure levels','late aborted icing result ignored','no icing request at 250hPa','cloud failure leaves temperature and icing usable','pinned variable revisions, no live index fallback','pinned 250hPa partial view','pinned surface state migrates to pressure layer','pinned missing temperature preserves cloud' ,'temperature index failure falls back to common cloud metadata']},null,2))
 console.log('selection integration passed')
}catch(error){console.log({errors,state:await page.evaluate(()=>({text:document.body.innerText,calls:window.calls.slice(-12)}))});throw error}finally{await browser.close()}
}
await verifyMap()
await verifySelection()
