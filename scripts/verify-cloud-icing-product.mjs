import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '../frontend/node_modules/playwright/index.mjs'

const out=path.resolve('artifacts/cloud-icing-production'), errors=[],consoleErrors=[],external=[],failed=[],checks=[]
checks.push=(...items)=>{console.log('통과:',items.join('; '));return Array.prototype.push.apply(checks,items)}
const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files']})
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror', e=>errors.push(e.message))
  page.on('console', m=>{if(m.type()==='error')consoleErrors.push(m.text())})
  page.on('requestfailed', r=>failed.push(r.url().slice(0,160)))
  await page.route(/^https?:/, r=>{external.push(r.request().url());return r.abort()})
  await page.goto('file://'+out+'/index.html')
  let app
  async function ready() {
    await page.locator('iframe').waitFor()
    for(let i=0;i<100;i++){app=page.frames().find(f=>f.url().includes('/preview.html'));if(app)break;await page.waitForTimeout(30)}
    await app.waitForFunction(()=>!!window.__projectUi?.cloudField&&!!window.__projectUi?.map?.isStyleLoaded())
    await app.evaluate(()=>window.__projectUi.map.jumpTo({center:[128,36.5],zoom:5.6}))
    await page.waitForTimeout(400)
  }
  await ready()
  const controls=()=>app.getByRole('group',{name:'구름·착빙 지도 표시'})
  const selection=()=>app.evaluate(()=>JSON.stringify(window.__projectUi.nwpSelection))
  const layer=id=>app.evaluate(id=>window.__projectUi.map.getLayer(id) ? (window.__projectUi.map.getLayoutProperty(id,'visibility')??'visible') : 'missing',id)
  async function weatherPanel(){await app.getByRole('button',{name:/^기상정보( 레이어)?$/}).click();await page.waitForTimeout(180)}
  await weatherPanel()
  assert.equal(await app.locator('.cloud-icing-controls').count(),0)
  assert.equal(await app.locator('.layer-tile-group').filter({hasText:'수치모델'}).locator('.layer-tile').count(),5)
  await page.screenshot({path:out+'/desktop-panel.png'})
  await weatherPanel()
  await page.screenshot({path:out+'/desktop.png'})
  checks.push('actual App/MapView + five NWP tiles; no added checkbox box')

  const selected=await selection(), original=await app.evaluate(()=>JSON.stringify(window.__PROJECT_UI.fields))
  await controls().getByRole('button',{name:'구름',exact:true}).click()
  assert.equal(await layer('kim-cloud-potential-image-layer'),'none')
  assert.equal(await layer('kim-icing-pattern-layer'),'visible')
  await controls().getByRole('button',{name:'착빙',exact:true}).click()
  assert.equal(await layer('kim-icing-pattern-layer'),'none')
  assert.equal(await layer('kim-icing-outer-layer'),'none')
  assert.equal(await controls().getByRole('button').count(),2)
  assert.equal(await app.getByRole('button',{name:'등온선 표시 선택'}).count(),0)
  assert.equal(await layer('kim-temperature-zero-line'),'visible')
  assert.equal(await layer('kim-temperature-cold-line'),'visible')
  assert.equal(await controls().isVisible(),true)
  assert.equal(await selection(),selected)
  await controls().getByRole('button',{name:'구름',exact:true}).click()
  await controls().getByRole('button',{name:'착빙',exact:true}).click()
  const contours=await app.evaluate(()=>{
    const map=window.__projectUi.map
    return {
      colors:['kim-temperature-zero-line','kim-temperature-cold-line'].map(id=>map.getPaintProperty(id,'line-color')),
      label:map.getPaintProperty('kim-temperature-contour-labels','text-color'),
      values:[...new Set(map.getSource('kim-temperature-contour-source')._data.features.map(f=>f.properties.temperature))],
    }
  })
  assert.deepEqual(contours.colors,['#c0291f','#c0291f']);assert.equal(contours.label,'#c0291f')
  assert.ok(contours.values.every(v=>v===0||v===-20))
  for (const [level, temperature] of [['600hPa',0],['450hPa',-20]]) {
    await app.evaluate(level=>window.__projectUi.setNwpSelection(s=>({...s,level,hf:6})),level)
    await app.waitForFunction(({level,temperature})=>window.__projectUi.temperatureField?.level?.id===level && window.__projectUi.map.getSource('kim-temperature-contour-source')._data.features.some(f=>f.properties.temperature===temperature),{level,temperature})
    const values=await app.evaluate(()=>window.__projectUi.map.getSource('kim-temperature-contour-source')._data.features.map(f=>f.properties.temperature))
    assert.ok(values.every(v=>v===0||v===-20));assert.ok(values.includes(temperature))
    await page.waitForTimeout(250)
    await page.screenshot({path:out+`/red-isotherm-${level}.png`})
  }
  checks.push('only cloud/icing buttons; fixed 0/-20 red contours and labels remain when cloud/icing are off')
  await controls().getByRole('button',{name:'구름',exact:true}).click()
  await controls().getByRole('button',{name:'착빙',exact:true}).click()
  for(const action of ['cloudIcing','wind','ctps','turbulence','clear']) {
    await app.evaluate(action=>action==='clear'?window.__projectUi.clearMetLayers():window.__projectUi.toggleMet(action),action)
    await app.waitForFunction(()=>!window.__projectUi.metVisibility.cloudIcing)
    for(const id of ['kim-icing-pattern-layer','kim-icing-outer-layer','kim-temperature-zero-halo','kim-temperature-cold-halo','kim-temperature-zero-line','kim-temperature-cold-line','kim-temperature-contour-labels']) assert.equal(await layer(id),'none')
    await app.evaluate(()=>window.__projectUi.setLayerOn('temp','met'))
    await app.waitForFunction(()=>window.__projectUi.metVisibility.cloudIcing&&window.__projectUi.temperatureField)
    assert.equal(await app.evaluate(()=>window.__projectUi.metVisibility.cloud||window.__projectUi.metVisibility.icing),false)
    await app.evaluate(()=>window.__projectUi.setLayerOn('temp','met'))
    assert.equal(await app.evaluate(()=>window.__projectUi.metVisibility.cloudIcing),true)
  }
  await controls().getByRole('button',{name:'구름',exact:true}).click()
  await controls().getByRole('button',{name:'착빙',exact:true}).click()
  checks.push('both faces OFF survives parent/all-clear/wind/ctps/turbulence; halos and labels hidden; temp enable idempotent')


  await weatherPanel()
  await app.getByRole('button',{name:'구름·착빙',exact:true}).click()
  assert.equal(await controls().count(),0)
  assert.equal(await layer('kim-temperature-zero-line'),'none')
  assert.equal(await layer('kim-temperature-cold-line'),'none')
  await app.getByRole('button',{name:'구름·착빙',exact:true}).click()
  assert.equal(await controls().count(),1)
  await weatherPanel()
  await app.evaluate(()=>window.__projectUi.setNwpSelection(s=>({...s,level:'250hPa'})))
  await app.waitForFunction(()=>window.__projectUi.cloudField?.level?.id==='250hPa'||window.__projectUi.cloudField?.level==='250hPa')
  assert.equal(await controls().getByRole('button',{name:'착빙',exact:true}).isDisabled(),true)
  await app.evaluate(()=>window.__projectUi.setNwpSelection(s=>({...s,level:'450hPa',hf:9})))
  await app.waitForFunction(()=>window.__projectUi.icingField&&window.__projectUi.nwpSelection.hf===9)
  assert.equal(await controls().getByRole('button',{name:'착빙',exact:true}).isDisabled(),false)
  assert.equal(await app.evaluate(()=>JSON.stringify(window.__PROJECT_UI.fields)),original)
  await app.evaluate(()=>window.__projectUi.setNwpSelection(s=>({...s,level:'600hPa',hf:6})))
  await app.waitForFunction(()=>window.__projectUi.cloudField?.level?.id==='600hPa'||window.__projectUi.cloudField?.level==='600hPa')
  checks.push('parent tile hide/restore, shared real level/time selection, unsupported icing at 250 hPa')

  const geometry=[]
  for(const width of [1440,1180,1024,390]) {
    await page.setViewportSize({width,height:({390:844,1180:820,1024:768})[width]??1000})
    await page.waitForTimeout(300)
    assert.ok(await app.evaluate(()=>document.body.scrollWidth<=innerWidth))
    assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth))
    const boxes=await app.locator('.map-bottom-control-dock').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,top:r.top,width:innerWidth,height:innerHeight}})
    assert.ok(boxes.left>=0&&boxes.right<=boxes.width&&boxes.bottom<=boxes.height)
    geometry.push({width,dock:boxes})
    await page.screenshot({path:out+`/after-${width}.png`})
    await app.getByRole('button',{name:/^범례/}).click()
    await page.waitForTimeout(240)
    assert.equal(await app.locator('.map-legend-mobile-dock > .map-legends-bottom').isVisible(),true)
    await page.screenshot({path:out+`/legend-${width}.png`})
    await app.getByRole('button',{name:/^범례/}).click()
    await weatherPanel()
    await page.screenshot({path:out+`/panel-${width}.png`})
    await weatherPanel()
  }
  checks.push('1440/1180/1024/390: actual panels, legend, altitude rail, timeline; controls inside viewport')

  await page.setViewportSize({width:1440,height:1000})

  // Each consumer is the actual product component with embedded data, without design transforms.
  async function scenario(view,query='') {
    await page.goto('file://'+out+'/preview.html?view='+view+query)
    return page
  }
  async function assertPatterns(container=page) {
    const patterns=await container.locator('svg defs pattern[id*="-icing-"]').evaluateAll(items=>items.slice(0,3).map(p=>({width:p.getAttribute('width'),fill:p.querySelector('rect').getAttribute('fill'),opacity:p.querySelector('rect').getAttribute('fill-opacity'),dot:p.querySelector('circle').getAttribute('fill'),radius:p.querySelector('circle').getAttribute('r')})))
    assert.equal(patterns.length,3)
    assert.deepEqual(patterns.map(p=>p.fill),['#ACC7FF','#6B88CD','#383D6F'])
    assert.ok(patterns.every(p=>p.width==='9'&&p.opacity==='1'&&p.dot==='#ffffff'&&p.radius==='0.85'))
  }
  for(const placement of ['bottom','side','mobile-full']) {
    await scenario('profile','&placement='+placement)
    await page.locator('[data-testid="kim-icing-patterns"]').waitFor()
    await assertPatterns()
    await page.getByRole('button',{name:'난류',exact:true}).click()
    await page.getByRole('button',{name:'난류 보기',exact:true}).waitFor()
    await page.getByRole('button',{name:'난류 보기',exact:true}).click()
    assert.equal(await page.locator('[data-testid="kim-icing-patterns"]').count(),0)
    assert.equal(await page.locator('[data-testid="kim-cloud-shading"]').count(),0)
    await page.getByRole('button',{name:'바람',exact:true}).click()
    await page.getByRole('button',{name:'이전 표시로',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'착빙',exact:true}).getAttribute('aria-pressed'),'true')
    assert.equal(await page.getByRole('button',{name:'구름층 추정',exact:true}).getAttribute('aria-pressed'),'true')
    assert.equal(await page.getByRole('button',{name:'바람',exact:true}).getAttribute('aria-pressed'),'false')
    await page.getByRole('checkbox',{name:'−10°C 추가',exact:true}).check()
    await page.getByRole('button',{name:'등온선',exact:true}).click()
    assert.equal(await page.locator('.cs-isotherm').count(),0)
    await page.getByRole('button',{name:'등온선',exact:true}).click()
    await page.screenshot({path:out+'/profile-'+placement+'.png'})
  }
  checks.push('bottom/side/mobile-full actual profile, A patterns, overlap switch and restoration, existing temperature controls')

  await scenario('copilot')
  await page.locator('[data-testid="kim-icing-patterns"]').waitFor()
  await assertPatterns()
  assert.equal(await page.getByRole('button',{name:'이전 예보시간',exact:true}).count(),0)
  await page.getByRole('button',{name:'단면도 크게 열기',exact:true}).click()
  await page.getByRole('dialog',{name:'연직단면도',exact:true}).waitFor()
  await assertPatterns(page.getByRole('dialog',{name:'연직단면도',exact:true}))
  assert.equal(await page.getByRole('button',{name:'다음 예보시간',exact:true}).count(),0)
  assert.ok(await page.getByText('최신 조회가 아닙니다.',{exact:false}).count()>0)
  assert.equal(await page.evaluate(()=>window.__PROJECT_UI.requests.some(r=>/cross-section|nwp-time-refresh|route-briefing/.test(r))),false)
  await page.screenshot({path:out+'/copilot-saved.png'})
  checks.push('AI saved result uses A inline/window with no forecast navigation or refresh API')

  await scenario('briefing')
  await page.locator('[data-testid="kim-icing-patterns"]').waitFor()
  await page.getByRole('button',{name:'난류 보기',exact:true}).click()
  await page.getByRole('button',{name:'이전 표시로',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'착빙',exact:true}).click()
  await page.getByRole('button',{name:'단면도 크게 열기',exact:true}).click()
  await page.locator('.bv-xfull').waitFor()
  assert.equal(await page.locator('.bv-xfull').getByRole('button',{name:'착빙',exact:true}).getAttribute('aria-pressed'),'false')
  await page.locator('.bv-xfull').getByRole('button',{name:'착빙',exact:true}).click()
  await page.locator('.bv-xfull').getByRole('button',{name:'난류 보기',exact:true}).click()
  await page.screenshot({path:out+'/briefing-expanded-mobile.png'})
  checks.push('briefing inline/mobile expanded share face choices and temporary turbulence view')

  await page.setViewportSize({width:1440,height:1000})
  await scenario('organization')
  await page.locator('.op-footer').waitFor()
  await page.locator('.op-profile-panel [data-testid="kim-icing-patterns"]').waitFor()
  await assertPatterns(page.locator('.op-grid .op-profile-panel'))
  await page.getByRole('button',{name:'난류 보기',exact:true}).click()
  await page.getByRole('button',{name:'연직단면도 확대',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'발표 자료 확대',exact:true})
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('button',{name:'착빙',exact:true}).getAttribute('aria-pressed'),'false')
  await dialog.getByRole('button',{name:'이전 표시로',exact:true}).click()
  await page.getByRole('button',{name:'발표 배치로 복귀',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'착빙',exact:true}).getAttribute('aria-pressed'),'true')
  await page.getByRole('button',{name:'기상표시',exact:true}).click()
  assert.equal(await page.locator('.layer-tile-group').locator('.layer-tile').count(),3)
  await page.getByRole('button',{name:'구름·착빙',exact:true}).click()
  await page.waitForFunction(()=>window.__projectUi?.icingField&&window.__projectUi?.map?.getLayer('kim-icing-pattern-layer'))
  assert.equal(await page.getByRole('group',{name:'구름·착빙 지도 표시'}).count(),1)
  await page.getByRole('button',{name:'기상표시',exact:true}).click()
  await page.getByRole('button',{name:/^범례/}).click()
  await page.screenshot({path:out+'/organization.png'})
  const pinnedCalls=await page.evaluate(()=>window.__PROJECT_UI.requests.filter(r=>r.startsWith('/api/kim/')))
  assert.ok(pinnedCalls.length>0)
  assert.ok(pinnedCalls.every(r=>r.includes('/field?')&&r.includes('revision=offline-')&&r.includes('tmfc=2026091006')&&r.includes('hf=6')),pinnedCalls.join('\n'))
  await page.getByRole('button',{name:'평면 기상 지도 확대',exact:true}).click()
  await dialog.waitFor()
  await dialog.getByRole('button',{name:'기상표시',exact:true}).click()
  await dialog.getByRole('button',{name:'구름·착빙',exact:true}).click()
  await dialog.getByRole('group',{name:'구름·착빙 지도 표시'}).waitFor()
  await page.screenshot({path:out+'/organization-expanded-map.png'})
  checks.push('organization normal/expanded profile share state; pinned map three entries and exact variable revisions without live index')

  await scenario('organization-live','&controls=hidden')
  await page.waitForFunction(()=>window.__projectUi?.icingField&&window.__projectUi.map?.isStyleLoaded())
  assert.equal(await page.getByRole('group',{name:'구름·착빙 지도 표시'}).count(),0)
  assert.equal(await page.locator('.organization-map__layer-buttons').count(),0)
  assert.equal(await page.getByRole('button',{name:/^범례/}).count(),0)
  checks.push('organization showControls=false hides panel, legend and face buttons')
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed,[])
  await fs.writeFile(out+'/verification.json',JSON.stringify({checks,geometry,errors,consoleErrors,external,failed,tmfc:'2026091006'},null,2))
  console.log(JSON.stringify({checks,errors,consoleErrors,external,failed},null,2))
}finally{await browser.close()}
