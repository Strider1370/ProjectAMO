import fs from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '../fixtures.mjs'
import { installModelComparisonFixture, comparisonFixture, SELECTED_TIME } from '../model-comparison-fixture.mjs'

const captureRoot=process.env.PROJECTAMO_COMPARISON_CAPTURE_DIR
async function capture(page,testInfo,label) {
  if(!captureRoot) return
  await fs.mkdir(captureRoot,{recursive:true})
  const scroller=page.locator('.mc-page')
  if(await scroller.count()) await scroller.evaluate(el=>{el.scrollTop=0})
  await page.screenshot({path:path.join(captureRoot,`${testInfo.project.name}-${label}.png`)})
  for(const section of await page.locator('[data-section]').all()) {
    const id=await section.getAttribute('data-section')
    for (const [index,chart] of (await section.locator('.mc-chart-wrap').all()).entries()) {
      await chart.scrollIntoViewIfNeeded()
      await expect(chart).toBeInViewport()
      await page.screenshot({path:path.join(captureRoot,`${testInfo.project.name}-${label}-${id}-chart-${index}.png`)})
    }
  }
  if(await scroller.count()) await scroller.evaluate(el=>{el.scrollTop=0})
}
async function noOverflow(page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
}
const temperatureTable=page=>page.getByRole('table',{name:'기온과 상대습도 시간별 비교',exact:true})

test.describe('airport-model-comparison',()=>{
  test('compact desktop header groups runs and keeps summary aligned without source wording',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop','Desktop header layout')
    await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    const summary=page.getByLabel('선택 시각 모델 비교 요약',{exact:true})
    await expect(summary).toBeVisible()
    await expect(page.getByRole('columnheader',{name:'출처',exact:true})).toHaveCount(0)
    const rain=summary.getByRole('region',{name:'강수량 요약',exact:true})
    await expect(rain).toContainText('ECMWF')
    await expect(summary.getByText('선택 시각 요약',{exact:true})).toHaveCount(0)
    const sources=page.getByRole('region',{name:'자료별 기준시각'})
    await expect(sources).toContainText('ECMWF Run 09-06 00:00Z')
    await expect(sources).toContainText('KIM Run 09-06 06:00Z')
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    const mode=page.getByRole('group',{name:'표시 방식',exact:true})
    const clock=page.getByRole('region',{name:'분석 기준',exact:true})
    expect(Math.abs((await mode.boundingBox()).y-(await clock.boundingBox()).y)).toBeLessThan(12)
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    await expect(temperatureTable(page)).toBeVisible()
    await page.getByRole('group',{name:'표시 시간대'}).getByRole('button',{name:'UTC',exact:true}).click()
    await expect(clock).toContainText('09:00 UTC')
    for(const width of [1920,1440]) {
      await page.setViewportSize({width,height:1080})
      await noOverflow(page)
      const box=await summary.boundingBox()
      expect(box.y+box.height).toBeLessThan(340)
      await capture(page,testInfo,`compact-header-${width}`)
    }
    await installModelComparisonFixture(page,{transform:payload=>{
      payload.models.forEach(model=>{model.run_at='2026-09-06T06:00:00.000Z'})
      return payload
    }})
    await page.reload()
    await expect(page.getByText('모델 Run 09-06 06:00Z · 4개 모델',{exact:true})).toBeVisible()
    await page.getByText('모델 Run 09-06 06:00Z · 4개 모델',{exact:true}).click()
    await expect(sources.getByText(/ECMWF · Run/)).toBeVisible()
  })
  test('TAF displays one value per element and time without conditional disclosure',async({page},testInfo)=>{
    if(testInfo.project.name==='desktop') await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page,{transform:payload=>{
      payload.observations.taf.change_groups=[{type:'BECMG',start:'2026-09-06T09:00:00.000Z',end:'2026-09-06T11:00:00.000Z',wind:{direction:80,speed:20,gust:null},wx:[{raw:'RA'}],wx_touched:true,clouds:[{amount:'BKN',base:500}],clouds_touched:true}]
      return payload
    }})
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await expect(page.getByRole('table',{name:'지상 바람 시간별 비교',exact:true})).toBeVisible()
    await expect(page.getByText('TAF 조건 기간',{exact:true})).toHaveCount(0)
    await expect(page.getByText(/BECMG 80/)).toHaveCount(0)
    for(const [name,before,after] of [['지상 바람 시간별 비교','30° 10 kt','80° 20 kt'],['시간당 강수량 비교','NSW','RA'],['운고와 운량 시간별 비교','NSC','500 ft']]) {
      const table=page.getByRole('table',{name,exact:true})
      const row=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'TAF',exact:true})})
      const headers=await table.getByRole('columnheader').allTextContents()
      const cells=row.getByRole('cell')
      const beforeIndex=headers.findIndex(text=>text.includes('18:00'))-1
      const afterIndex=headers.findIndex(text=>text.includes('20:00'))-1
      await expect(cells.nth(beforeIndex)).toContainText(before)
      await expect(cells.nth(afterIndex)).toContainText(after)
    }
    await expect(page.getByRole('img',{name:/^TAF 조건 /})).toHaveCount(0)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    const sample=page.getByRole('group',{name:'모델별 kt 추세 그래프',exact:true}).getByRole('img',{name:/^TAF 2026-09-06T09:00:00.000Z,/})
    await sample.focus()
    await expect(page.getByRole('tooltip')).not.toContainText('BECMG')
    await page.keyboard.press('Escape')
    await capture(page,testInfo,'taf-single-value')
  })
  test('short horizons preserve chart proportions and align hourly METAR humidity cells',async({page},testInfo)=>{
    if(testInfo.project.name==='desktop') await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page,{transform:payload=>{
      payload.effective_now='2026-09-06T15:20:00.000Z'
      payload.observations.metar=['13:00','13:30','14:00','14:30','15:00'].map((at,i)=>({...payload.observations.metar[0],observed_at:`2026-09-06T${at}:00.000Z`,dew_point_c:18+i*.2}))
      return payload
    }})
    await page.goto('/airport/RKPU/models?valid_at=2026-09-06T16%3A00%3A00.000Z')
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const temperature=page.getByRole('group',{name:'모델별 °C 추세 그래프',exact:true})
    const point=temperature.getByLabel(/^KIM 2026-09-06T16:00:00.000Z,/)
    await expect(point).toBeVisible()
    async function proportions() {
      const scale=await temperature.evaluate(el=>{const m=el.getScreenCTM();return {x:m.a,y:m.d}})
      expect.soft(scale.x).toBeCloseTo(1,2);expect.soft(scale.y).toBeCloseTo(1,2)
      const box=await point.boundingBox()
      expect.soft(box.width).toBeCloseTo(box.height,1)
      const column=await temperatureTable(page).getByRole('button',{pressed:true}).boundingBox()
      expect.soft(Math.abs(box.x+box.width/2-column.x-column.width/2)).toBeLessThan(1)
      const humidity=page.getByRole('group',{name:'모델별 % 추세 그래프',exact:true})
      const observations=await humidity.getByRole('img',{name:/^METAR 계산 /}).all()
      expect(observations.length).toBe(3)
      const boxes=await Promise.all(observations.map(cell=>cell.boundingBox()))
      for(let i=1;i<boxes.length;i++) expect.soft(boxes[i-1].x+boxes[i-1].width).toBeLessThan(boxes[i].x)
    }
    await proportions()
    await capture(page,testInfo,'short-horizon-proportions')
    if(testInfo.project.name==='desktop') {
      await page.setViewportSize({width:1440,height:900})
      await expect.poll(()=>temperature.evaluate(el=>Math.abs(el.getBoundingClientRect().width-el.viewBox.baseVal.width))).toBeLessThan(1)
      await proportions()
    }
  })
  test('only on-the-hour METAR observations populate humidity cells with readable labels',async({page},testInfo)=>{
    if(testInfo.project.name==='desktop') await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page,{transform:payload=>{
      payload.effective_now='2026-09-06T15:50:00.000Z'
      payload.observations.metar=['13:00','14:00','14:48','15:00','15:12','15:17','15:44'].map(at=>({...payload.observations.metar[0],observed_at:`2026-09-06T${at}:00.000Z`,temperature_c:at.endsWith(':00')?19:30,dew_point_c:19}))
      return payload
    }})
    await page.goto('/airport/RKNY/models?valid_at=2026-09-06T16%3A00%3A00.000Z')
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const humidity=page.getByRole('group',{name:'모델별 % 추세 그래프',exact:true})
    const observations=humidity.getByRole('img',{name:/^METAR 계산 /})
    await expect(observations).toHaveCount(3)
    for(const at of ['13:00','14:00','15:00']) {
      const cell=humidity.getByRole('img',{name:`METAR 계산 2026-09-06T${at}:00.000Z, 100 %`,exact:true})
      const fits=await cell.evaluate(el=>{const r=el.getBoundingClientRect(),t=el.nextElementSibling.getBoundingClientRect();return t.left>=r.left && t.right<=r.right})
      expect(fits).toBe(true)
    }
    await expect(humidity.getByRole('img',{name:/^METAR 계산 2026-09-06T16/})).toHaveCount(0)
    const sample=humidity.getByRole('img',{name:'METAR 계산 2026-09-06T15:00:00.000Z, 100 %',exact:true})
    await sample.focus()
    await expect(page.getByRole('tooltip')).toContainText('관측 09.07 00:00 KST')
    await page.keyboard.press('Escape')
    await capture(page,testInfo,'hourly-humidity')
  })
  test('approved chart design renders cumulative bars, stepped ceilings and humidity bands',async({page},testInfo)=>{
    if(testInfo.project.name==='desktop') await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page,{transform:payload=>{
      const phases={kim:0,ecmwf:1,gfs:2,icon:3}
      const rainfall={kim:[0,0,.3,2.4,7.8,5.1,1.8,.4,0,0,0,0,0],ecmwf:[0,0,0,.2,1.4,4.8,6.2,2.6,.8,.2,0,0,0],gfs:[0,0,0,0,.4,2.1,5.5,9.2,4.6,1.3,.3,0,0],icon:[0,.2,1.2,4.9,6.3,2.7,.8,3.2,1.4,.1,0,0,0]}
      for(const model of payload.models) model.records.forEach((r,i)=>{
        const phase=phases[model.model]
        r.precipitation_mm=i===0?null:rainfall[model.model][i]
        r.wind_speed_kt=[5,8,24,43,18,10][(i+phase)%6]
        r.wind_gust_kt=r.wind_speed_kt+24
        r.ceiling_agl_ft=i===6?null:4200-((i+phase)%5)*800
        r.ceiling_status=i===6?'no_ceiling':'value'
        r.temperature_c=28-Math.min(i,8)*.7+phase*.4
        r.relative_humidity_pct=65+((i+phase)%6)*6
      })
      return payload
    }})
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    const wind=page.getByRole('group',{name:'모델별 kt 추세 그래프',exact:true})
    await expect(wind.getByText('80 kt',{exact:true})).toBeVisible()
    await capture(page,testInfo,'approved-wind')
    await page.getByRole('tab',{name:'강수',exact:true}).click()
    const rain=page.getByRole('group',{name:'모델별 mm 추세 그래프',exact:true})
    const sample=rain.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/)
    await expect(sample).toHaveJSProperty('tagName','rect')
    await sample.scrollIntoViewIfNeeded();await sample.focus()
    await expect(page.getByRole('tooltip')).toContainText('누적 0.2 mm')
    await expect(page.getByText('09.06 15:00 KST 이후 누적',{exact:true})).toBeVisible()
    await expect(rain.getByLabel(/TAF 현재날씨/).first()).toBeVisible()
    await capture(page,testInfo,'approved-rain')
    await page.getByRole('tab',{name:'운고·운량',exact:true}).click()
    const ceiling=page.getByRole('group',{name:'모델별 ft 추세 그래프',exact:true})
    await expect(ceiling.getByRole('img',{name:'KIM 운고 계단선',exact:true})).toHaveAttribute('d',/H.*V/)
    await expect(ceiling.getByLabel(/^GFS 2026-09-06T12:00:00.000Z, NSC$/)).toBeVisible()
    await capture(page,testInfo,'approved-ceiling')
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const humidity=page.getByRole('region',{name:'상대습도 그래프',exact:true})
    await expect(humidity.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/)).toHaveJSProperty('tagName','rect')
    await capture(page,testInfo,'approved-design')
    await noOverflow(page)
  })
  test('clicking charts never changes the selection, time columns or chart size',async({page},testInfo)=>{
    await installModelComparisonFixture(page)
    const initial='2026-09-06T04:00:00.000Z'
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(initial)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    for(const [tab,units] of [['바람',['kt']],['강수',['mm']],['운고·운량',['ft']],['기온·RH',['°C','%']]]) {
      await page.getByRole('tab',{name:tab,exact:true}).click()
      const columns=await page.getByRole('columnheader').allTextContents()
      for(const unit of units) {
        const chart=page.getByRole('group',{name:`모델별 ${unit} 추세 그래프`,exact:true})
        await chart.scrollIntoViewIfNeeded()
        const before=await chart.boundingBox(),viewBox=await chart.getAttribute('viewBox')
        const point=chart.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/)
        await point.scrollIntoViewIfNeeded()
        const p=await point.boundingBox(),c=await chart.boundingBox(),position={x:p.x+p.width/2-c.x,y:p.y+p.height/2-c.y}
        if(testInfo.project.use.hasTouch) await chart.tap({position});else await chart.click({position})
        await expect(page).toHaveURL(new RegExp(encodeURIComponent(initial)))
        await expect(chart).toHaveAttribute('viewBox',viewBox)
        expect(await page.getByRole('columnheader').allTextContents()).toEqual(columns)
        const after=await chart.boundingBox()
        expect(after.width).toBeCloseTo(before.width,1);expect(after.height).toBeCloseTo(before.height,1)
        await page.mouse.move(0,0)
        await expect(page.getByRole('tooltip')).toHaveCount(0)
      }
    }
  })

  test('legend toggles hide only graph series and preserve the table',async({page},testInfo)=>{
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    const chart=page.getByRole('group',{name:'모델별 kt 추세 그래프',exact:true})
    const kimPoint=chart.getByLabel(/^KIM 2026-09-06T09:00:00.000Z,/)
    await expect(kimPoint).toBeVisible()
    const toggle=page.getByRole('button',{name:'KIM 그래프 표시',exact:true})
    await expect(toggle).toHaveAttribute('aria-pressed','true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed','false')
    await expect(kimPoint).toHaveCount(0)
    await expect(page.getByRole('table',{name:'지상 바람 시간별 비교',exact:true}).getByRole('rowheader',{name:'KIM',exact:true})).toBeVisible()
    await expect(chart.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/)).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed','true')
    await expect(chart.getByLabel(/^KIM 2026-09-06T09:00:00.000Z,/)).toBeVisible()
    await capture(page,testInfo,'legend-toggles')
  })

  test('chart values appear in a floating tooltip on hover and keyboard focus',async({page},testInfo)=>{
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    const chart=page.getByRole('group',{name:'모델별 kt 추세 그래프',exact:true})
    await chart.scrollIntoViewIfNeeded()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await expect(page.getByText('그래프 점을 선택하면 실행시각·F-hour 상세를 고정합니다.',{exact:true})).toHaveCount(0)
    const point=chart.getByLabel(/^KIM Gust 2026-09-06T09:00:00.000Z,/)
    if(testInfo.project.use.hasTouch) await chart.focus();else await point.hover()
    const tooltip=page.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    for(const model of ['KIM','ECMWF','GFS','ICON']) await expect(tooltip.getByText(model,{exact:true})).toBeVisible()
    await expect(tooltip).toContainText('09.06 18:00 KST')
    if(!testInfo.project.use.hasTouch) {
      await tooltip.hover()
      await expect(tooltip).toBeVisible()
      await page.mouse.move(0,0)
      await expect(tooltip).toHaveCount(0)
      const pointBox=await point.boundingBox(),chartBox=await chart.boundingBox()
      await page.mouse.move(pointBox.x+pointBox.width/2,chartBox.y+12)
      await expect(tooltip).toContainText('09.06 18:00 KST')
      await expect(page).toHaveURL(new RegExp(encodeURIComponent(SELECTED_TIME)))
    }
    const bounds=await tooltip.boundingBox(),viewport=page.viewportSize()
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height)
    if(captureRoot) { await fs.mkdir(captureRoot,{recursive:true});await page.screenshot({path:path.join(captureRoot,`${testInfo.project.name}-wind-tooltip.png`)}) }
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await page.getByRole('tab',{name:'바람',exact:true}).focus()
    await chart.focus();await chart.press('ArrowRight')
    await expect(tooltip).toBeVisible()
    await point.press('Enter')
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(SELECTED_TIME)))
    await page.getByRole('button',{name:'전체 보기',exact:true}).click()
    await expect(tooltip).toHaveCount(0)
  })

  test('KIM reference tabs share one panel and sounding samples switch actual images',async({page},testInfo)=>{
    if(testInfo.project.name==='desktop') await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    const references=page.getByRole('complementary',{name:'KIM 연직 참고'})
    await expect(references.getByRole('button',{name:'연직시계열 크게 보기',exact:true})).toBeVisible()
    await expect(references.getByRole('button',{name:'단열선도 크게 보기',exact:true})).toHaveCount(0)
    await references.getByRole('tab',{name:'단열선도',exact:true}).click()
    await expect(references.getByRole('button',{name:'연직시계열 크게 보기',exact:true})).toHaveCount(0)
    const slider=references.getByRole('slider',{name:'샘플 시각',exact:true})
    const sounding=references.getByRole('img',{name:/인천공항 단열선도 샘플/})
    await expect(sounding).toHaveAttribute('src',/_s018_2026090712.png$/)
    await expect(references.getByRole('button',{name:'이전 샘플 시각',exact:true})).toBeDisabled()
    const originalUrl=page.url()
    for(let index=0;index<13;index++) {
      if(index) await references.getByRole('button',{name:'다음 샘플 시각',exact:true}).click()
      await expect(sounding).toHaveAttribute('src',new RegExp(`_s${String(18+index*3).padStart(3,'0')}_2026090712.png$`))
      await expect.poll(()=>sounding.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
    }
    await expect(references.getByRole('button',{name:'다음 샘플 시각',exact:true})).toBeDisabled()
    expect(page.url()).toBe(originalUrl)
    await slider.focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await expect(slider).toHaveValue('1')
    await expect(references).toContainText('09.08 18:00 KST · KIM F021')
    const selectedValue=await slider.inputValue()
    await references.getByRole('button',{name:'단열선도 크게 보기',exact:true}).click()
    const dialog=page.getByRole('dialog')
    await expect(dialog).toContainText('단열선도')
    await expect(dialog.getByRole('slider',{name:'샘플 시각',exact:true})).toHaveValue(selectedValue)
    await dialog.getByRole('button',{name:'다음 샘플 시각',exact:true}).click()
    await expect(dialog.getByRole('img')).toHaveAttribute('src',/_s024_2026090712.png$/)
    await dialog.getByRole('button',{name:'닫기',exact:true}).click()
    await expect(dialog).toHaveCount(0)
    await expect(slider).toHaveValue('2')
    await references.getByRole('tab',{name:'연직시계열',exact:true}).click()
    if(captureRoot) {
      await fs.mkdir(captureRoot,{recursive:true})
      await references.screenshot({path:path.join(captureRoot,`${testInfo.project.name}-reference-profile.png`)})
    }
    await references.getByRole('tab',{name:'연직시계열',exact:true}).focus()
    await page.keyboard.press('ArrowRight')
    await expect(references.getByRole('tab',{name:'단열선도',exact:true})).toHaveAttribute('aria-selected','true')
    await expect(slider).toHaveValue('2')
    await page.getByRole('group',{name:'표시 시간대'}).getByRole('button',{name:'UTC',exact:true}).click()
    await expect(references).toContainText('09.08 12:00 UTC · KIM F024')
    await page.getByRole('group',{name:'표시 시간대'}).getByRole('button',{name:'KST',exact:true}).click()
    if(captureRoot) await references.screenshot({path:path.join(captureRoot,`${testInfo.project.name}-reference-sounding.png`)})
    await capture(page,testInfo,'kim-reference-slider')
  })

  test('value cells toggle cloud and temperature extras without separate information labels',async({page},testInfo)=>{
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const temperatureCell=temperatureTable(page).getByTitle(/^ECMWF · 2026-09-06T09:00:00.000Z/)
    const pair=temperatureCell.getByText('23.0°C / 74%',{exact:true})
    await expect(temperatureCell.getByText('보조 정보',{exact:true})).toHaveCount(0)
    await expect(temperatureCell.getByText(/이슬점/)).toBeHidden()
    if(testInfo.project.use.hasTouch) await pair.tap();else await pair.click()
    await expect(temperatureCell.getByText(/이슬점.*기압/)).toBeVisible()
    await pair.click()
    await expect(temperatureCell.getByText(/이슬점/)).toBeHidden()
    await page.getByRole('tab',{name:'운고·운량',exact:true}).click()
    const cell=page.getByRole('table',{name:'운고와 운량 시간별 비교',exact:true}).getByTitle(/^ECMWF · 2026-09-06T09:00:00.000Z/)
    const value=cell.getByText('4,524 ft',{exact:true})
    await expect(cell.getByText(/전\/저\/중\/상/)).toBeHidden()
    if(testInfo.project.use.hasTouch) await value.tap();else await value.click()
    await expect(cell.getByText(/전\/저\/중\/상/)).toBeVisible()
    expect((await cell.boundingBox()).height).toBeLessThan(250)
    await capture(page,testInfo,'RKPU-ceiling-expanded')
    const control=cell.getByLabel('4,524 ft',{exact:true})
    await control.focus();await control.press('Enter')
    await expect(cell.getByText(/전\/저\/중\/상/)).toBeHidden()
    await noOverflow(page)
  })

  test('loading and supported airport without AMOS retain navigation and explicit missing rainfall',async({page},testInfo)=>{
    await installModelComparisonFixture(page)
    let release
    const pending=new Promise(resolve=>{release=resolve})
    const payload=comparisonFixture({airport_icao:'RKPK'})
    payload.airport.name='김해국제공항'
    payload.observations.amos=[]
    await page.route('**/api/airport/RKPK/model-comparison',async route=>{
      await pending
      await route.fulfill({json:payload})
    })
    await page.goto('/airport/RKPK/models',{waitUntil:'domcontentloaded'})
    await expect(page.getByRole('status')).toContainText('불러오는 중')
    await expect(page.getByRole('link',{name:'공항 패널로 돌아가기',exact:true})).toBeVisible()
    await page.getByRole('group',{name:'표시 시간대'}).getByRole('button',{name:'UTC',exact:true}).click()
    await capture(page,testInfo,'RKPK-loading')
    release()
    await expect(page.getByRole('heading',{name:/김해국제공항 상세 예보 분석/})).toBeVisible()
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'강수',exact:true}).click()
    const amos=page.getByRole('table',{name:'시간당 강수량 비교',exact:true}).getByRole('row').filter({has:page.getByRole('rowheader',{name:'AMOS 실측',exact:true})})
    await expect(amos).toContainText('자료 없음')
    await expect(amos).not.toContainText('0.0 mm')
    await capture(page,testInfo,'RKPK-without-amos')
    await noOverflow(page)
  })

  test('future observations are visibly marked and no-ceiling states use NSC',async({page},testInfo)=>{
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    const wind=page.getByRole('table',{name:'지상 바람 시간별 비교',exact:true})
    const pending=wind.getByRole('cell',{name:'METAR 09.06 18:00 KST 관측 전',exact:true})
    await expect(pending).toBeVisible()
    await expect(pending).toHaveCSS('background-color','rgb(71, 85, 105)')
    await expect(pending).toHaveText('관측 전')
    await page.getByRole('tab',{name:'운고·운량',exact:true}).click()
    const ceiling=page.getByRole('table',{name:'운고와 운량 시간별 비교',exact:true})
    const gfs=ceiling.getByRole('row').filter({has:page.getByRole('rowheader',{name:'GFS',exact:true})})
    await expect(gfs.locator('td[title*="F004"]')).toContainText('NSC')
    const metar=ceiling.getByRole('row').filter({has:page.getByRole('rowheader',{name:'METAR',exact:true})})
    await expect(metar.getByText('NSC',{exact:true})).toBeVisible()
    await noOverflow(page)
    await capture(page,testInfo,'nsc-observation-pending')
  })

  test('all-zero precipitation and all-NSC ceiling use empty graph states',async({page},testInfo)=>{
    await installModelComparisonFixture(page,{transform:payload=>{
      payload.observations.metar[0].weather=[]
      payload.observations.taf.change_groups=[]
      payload.observations.amos=[{observed_at:'2026-09-06T08:00:00.000Z',precipitation_mm:0}]
      payload.observations.metar[0].clouds=[]
      payload.observations.taf.base.clouds=[]
      for(const model of payload.models) for(const record of model.records) {
        record.precipitation_mm=record.forecast_hour===0?null:0
        record.ceiling_agl_ft=null
        record.ceiling_status='not_detected_below_limit'
      }
      return payload
    }})
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'강수',exact:true}).click()
    await expect(page.getByRole('status',{name:'강수량 없음',exact:true})).toBeVisible()
    await expect(page.getByRole('group',{name:'모델별 mm 추세 그래프',exact:true})).toHaveCount(0)
    await page.getByRole('tab',{name:'운고·운량',exact:true}).click()
    await expect(page.getByRole('status',{name:'구름 없음',exact:true})).toBeVisible()
    await expect(page.getByRole('group',{name:'모델별 ft 추세 그래프',exact:true})).toHaveCount(0)
    await capture(page,testInfo,'empty-precipitation-ceiling')
  })

  test('temperature and RH use vertically separated charts on the same time axis',async({page})=>{
    await installModelComparisonFixture(page)
    await page.goto('/airport/RKPU/models')
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const temperature=page.getByRole('region',{name:'기온 그래프',exact:true})
    const humidity=page.getByRole('region',{name:'상대습도 그래프',exact:true})
    await expect(temperature).toBeVisible()
    await expect(humidity).toBeVisible()
    const first=await temperature.boundingBox(),second=await humidity.boundingBox()
    expect(second.y).toBeGreaterThanOrEqual(first.y+first.height)
    await expect(temperature.getByRole('group',{name:'모델별 °C 추세 그래프',exact:true})).toBeVisible()
    await expect(humidity.getByRole('group',{name:'모델별 % 추세 그래프',exact:true})).toBeVisible()
    await expect(temperature.getByRole('group',{name:'모델별 °C 추세 그래프',exact:true}).locator('path[stroke-dasharray]')).toHaveCount(0)
    const column=await temperatureTable(page).getByRole('button',{name:'09.06 18:00 KST',exact:true}).boundingBox()
    const sample=await temperature.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/).boundingBox()
    expect(Math.abs(column.x+column.width/2-sample.x-sample.width/2)).toBeLessThan(3)
    await humidity.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/).scrollIntoViewIfNeeded()
    await humidity.getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/).focus()
    await expect(page.getByRole('tooltip')).toContainText('23.0°C / 74%')
    await expect(page.getByRole('tooltip')).toHaveCount(1)
  })
  test('panel entry, paired values, UTC instant, refresh and return',async({page,consoleMessages},testInfo)=>{
    if(testInfo.project.name==='desktop') await page.setViewportSize({width:1920,height:1080})
    await installModelComparisonFixture(page)
    await page.goto('/?airport=RKPU',{waitUntil:'domcontentloaded'})
    const panel=page.locator('.airport-panel')
    await expect(panel.getByRole('heading',{name:'상세 예보 분석',exact:true})).toBeVisible()
    await expect(panel.getByRole('region',{name:'상세 예보 분석 요약'})).toContainText('09.06 18:00 KST')
    const link=panel.getByRole('link',{name:'분석 화면 열기 ↗',exact:true})
    const summary=panel.getByLabel('선택 시각 모델 비교 요약',{exact:true})
    await expect(summary.getByRole('region',{name:'강수량 요약',exact:true})).toBeVisible()
    await summary.scrollIntoViewIfNeeded()
    expect(Math.abs((await summary.boundingBox()).width-(await link.boundingBox()).width)).toBeLessThan(2)
    if(testInfo.project.name==='desktop') {
      const wind=await summary.getByRole('region',{name:'바람 요약',exact:true}).boundingBox()
      const rain=await summary.getByRole('region',{name:'강수량 요약',exact:true}).boundingBox()
      const ceiling=await summary.getByRole('region',{name:'운고 요약',exact:true}).boundingBox()
      expect(Math.abs(wind.y-rain.y)).toBeLessThan(2)
      expect(Math.abs(rain.y-ceiling.y)).toBeLessThan(2)
    }
    if(captureRoot) {
      await fs.mkdir(captureRoot,{recursive:true})
      const entry=panel.getByRole('region',{name:'상세 예보 분석 요약'})
      await entry.evaluate(el=>el.scrollIntoView({block:'center'}))
      await expect(link).toBeInViewport()
      const bounds={entry:await entry.boundingBox(),summary:await summary.boundingBox(),link:await link.boundingBox()}
      expect(bounds.link.y+bounds.link.height).toBeLessThanOrEqual(bounds.entry.y+bounds.entry.height+1)
      await fs.writeFile(path.join(captureRoot,`${testInfo.project.name}-panel-bounds.json`),JSON.stringify(bounds,null,2))
      await entry.screenshot({path:path.join(captureRoot,`${testInfo.project.name}-panel-compact-summary.png`)})
    }
    await expect(link).toHaveAttribute('href',new RegExp(encodeURIComponent(SELECTED_TIME)))
    await link.click()
    await expect(page.getByRole('heading',{name:/울산공항 상세 예보 분석/})).toBeVisible()
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(SELECTED_TIME)))
    await noOverflow(page);await capture(page,testInfo,'all')
    expect(await page.locator('.mc-page').evaluate(el=>el.clientHeight<=window.innerHeight && el.scrollHeight>el.clientHeight)).toBe(true)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await capture(page,testInfo,'wind')
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const table=temperatureTable(page),ec=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'ECMWF',exact:true})})
    await expect(ec.locator('td.is-selected')).toContainText('23.0°C / 74%')
    const humidityPoint=page.getByRole('region',{name:'상대습도 그래프',exact:true}).getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/)
    await expect(humidityPoint).toHaveAttribute('aria-label',/74 %/)
    const selectedPoint=page.getByRole('region',{name:'기온 그래프',exact:true}).getByLabel(/^ECMWF 2026-09-06T09:00:00.000Z,/)
    await selectedPoint.scrollIntoViewIfNeeded()
    await selectedPoint.focus()
    await expect(page.getByRole('tooltip')).toContainText('23.0°C / 74%')
    await page.getByRole('button',{name:'전체 보기',exact:true}).click()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await expect(table.getByRole('button',{name:'09.06 18:00 KST',exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(table.getByRole('rowheader',{name:'TAF',exact:true})).toHaveCount(0)
    await page.getByRole('group',{name:'표시 시간대'}).getByRole('button',{name:'UTC',exact:true}).click()
    await expect(table.getByRole('button',{name:'09.06 09:00 UTC',exact:true})).toHaveAttribute('aria-pressed','true')
    await page.reload()
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    await expect(temperatureTable(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:'ECMWF',exact:true})}).locator('td.is-selected')).toContainText('23.0°C / 74%')
    await capture(page,testInfo,'temp-rh');await noOverflow(page)
    await page.getByRole('link',{name:'공항 패널로 돌아가기',exact:true}).click()
    await expect(page.locator('.airport-panel').getByRole('link',{name:'분석 화면 열기 ↗',exact:true})).toBeVisible()
    expect(consoleMessages.filter(m=>m.type==='pageerror')).toEqual([])
  })

  test('EC actual F018, paired null, model methods and conditional observations',async({page,consoleMessages},testInfo)=>{
    await installModelComparisonFixture(page)
    await page.goto(`/airport/RKPU/models?valid_at=${encodeURIComponent(SELECTED_TIME)}`)
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await page.getByRole('tab',{name:'기온·RH',exact:true}).click()
    const table=temperatureTable(page)
    const ec=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'ECMWF',exact:true})})
    await expect(ec.locator('td[title*="F018"]')).toContainText('23.0°C / 74%')
    const icon=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'ICON',exact:true})})
    await expect(icon.locator('td[title*="F004"]')).toContainText('자료 없음 / 67%')
    const point=page.getByRole('region',{name:'기온 그래프',exact:true}).getByLabel(/ECMWF 2026-09-06T18:00:00.000Z,/)
    await table.getByRole('button',{name:'09.07 03:00 KST',exact:true}).click()
    await point.scrollIntoViewIfNeeded();await point.focus()
    await expect(page).toHaveURL(/18%3A00%3A00/)
    await expect(ec.locator('td.is-selected')).toHaveAttribute('title',/F018/)
    await page.getByRole('tab',{name:'운고·운량',exact:true}).click()
    const ceiling=page.getByRole('table',{name:'운고와 운량 시간별 비교',exact:true})
    for(const [model,method] of [['KIM','운량·응결물 기반 추정'],['ECMWF','습도 기반 추정'],['GFS','모델 자체 운고'],['ICON','압력면 기반 추정']]) {
      const row=ceiling.getByRole('row').filter({has:page.getByRole('rowheader',{name:model,exact:true})})
      await expect(row.getByRole('rowheader',{name:model,exact:true})).toContainText(method)
      await expect(row.getByText(method,{exact:true})).toHaveCount(1)
      await expect(row.locator('td.is-selected')).not.toContainText(method)
      expect((await row.boundingBox()).height).toBeLessThan(250)
    }
    await expect(ceiling.getByRole('row').filter({has:page.getByRole('rowheader',{name:'GFS',exact:true})}).locator('td[title*="F004"]')).toContainText('NSC')
    await expect(ceiling.getByRole('row').filter({has:page.getByRole('rowheader',{name:'ICON',exact:true})}).locator('td[title*="F006"]')).toContainText('입력자료 없음')
    const ceilingChart=page.getByRole('group',{name:'모델별 ft 추세 그래프',exact:true})
    await ceilingChart.scrollIntoViewIfNeeded();await ceilingChart.focus()
    const detail=page.getByRole('tooltip')
    for(const model of ['KIM','ECMWF','GFS','ICON']) await expect(detail.getByText(model,{exact:true})).toBeVisible()
    await expect(detail).toContainText('보간 1시간 자료')
    await expect(page.getByText(/상세 근거|산출 근거/)).toHaveCount(0)
    await expect(detail).toContainText('F018')
    const detailBox=await detail.boundingBox()
    expect(detailBox.x).toBeGreaterThanOrEqual(0)
    expect(detailBox.width).toBeLessThanOrEqual(page.viewportSize().width)
    await capture(page,testInfo,'ceiling-comparison')
    await capture(page,testInfo,'ceiling')
    await page.getByRole('tab',{name:'강수',exact:true}).click()
    const rain=page.getByRole('table',{name:'시간당 강수량 비교',exact:true})
    expect(await rain.getByRole('rowheader').allTextContents()).toEqual(['METAR 현재날씨','TAF','AMOS 실측','KIM','ECMWF','GFS','ICON'])
    await expect(rain.getByRole('row').filter({has:page.getByRole('rowheader',{name:'TAF',exact:true})})).not.toContainText('TEMPO')
    await capture(page,testInfo,'precipitation');await noOverflow(page)
    await expect(page.getByText(/순위|1등|자동 변화 감지/)).toHaveCount(0)
    const references=page.getByRole('complementary',{name:'KIM 연직 참고'})
    await expect(references).toContainText('현재 공항 실행자료와 연결되지 않았습니다.')
    await expect(references.getByRole('img',{name:'KMA KIM 무안공항 연직시계열 샘플',exact:true})).toBeVisible()
    await references.getByRole('tab',{name:'단열선도',exact:true}).click()
    await expect(references.getByRole('img',{name:/인천공항 단열선도 샘플/})).toBeVisible()
    expect(consoleMessages.filter(m=>m.type==='pageerror')).toEqual([])
  })

  for(const scenario of ['partial','empty']) test(`${scenario} data retains explicit model rows and missing states`,async({page},testInfo)=>{
    await installModelComparisonFixture(page,{scenario})
    await page.goto('/airport/RKPU/models')
    const sources=page.getByRole('region',{name:'자료별 기준시각'})
    await expect(sources).toContainText('KIM 자료 없음')
    await expect(sources).toContainText(scenario==='partial'?'ECMWF Run':'ECMWF 자료 없음')
    await page.getByRole('button',{name:'요소별 보기',exact:true}).click()
    await expect(page.getByRole('table',{name:'지상 바람 시간별 비교',exact:true}).getByRole('rowheader',{name:'GFS',exact:true})).toBeVisible()
    await capture(page,testInfo,scenario);await noOverflow(page)
  })

  test('refresh failure retains last values and recovery clears error',async({page})=>{
    const fixture=await installModelComparisonFixture(page)
    await page.clock.install({time:new Date('2026-09-06T08:20:00Z')})
    await page.goto('/airport/RKPU/models')
    await expect(page.getByRole('region',{name:'자료별 기준시각'})).toContainText('ICON Run')
    fixture.setScenario('error');await page.clock.fastForward(61_000)
    await expect(page.getByRole('status')).toContainText('마지막 성공 자료를 계속 표시합니다')
    await expect(page.getByRole('table',{name:'기온과 상대습도 시간별 비교'}).getByRole('row').filter({has:page.getByRole('rowheader',{name:'ECMWF',exact:true})}).locator('td.is-selected')).toContainText('23.0°C / 74%')
    fixture.setScenario('ready');fixture.setNow('2026-09-06T09:21:00.000Z');await page.clock.fastForward(61_000)
    await expect(page.getByText('갱신에 실패했습니다.',{exact:false})).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(SELECTED_TIME)))
    expect(fixture.requests).toBeGreaterThanOrEqual(3)
  })

  test('unsupported airports never request comparison upstream',async({page})=>{
    const fixture=await installModelComparisonFixture(page)
    await page.goto('/airport/RJAA/models')
    await expect(page.getByRole('heading',{name:'지원하지 않는 공항입니다.'})).toBeVisible()
    expect(fixture.requests).toBe(0)
  })
})
