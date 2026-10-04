// Render the actual app in an isolated, offline preview. Only fixture data, offline resources and an inspection bridge are injected; presentation code is unchanged.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { readKimNwpIndex, readKimNwpGrid } from '../backend/src/processors/kim-nwp-store.js'
import { buildKimSurfaceWindFieldFromWindGrid, buildKimIcingFieldFromGrid, buildKimTemperatureFieldFromGrid, buildKimCloudPotentialFieldFromGrid, filterKimNwpIndexForVariables } from '../backend/src/processors/kim-nwp-model.js'
import { loadRouteCrossSection } from '../backend/src/briefing/enroute-cross-section.js'
import { organizationFlightFixture, organizationBundleFixture } from '../frontend/verification/organization-fixture.mjs'
import airports from '../shared/airports.js'
import { CURRENT_VERSION } from '../frontend/src/features/about/changelog.js'

const repo = process.cwd(), out = path.join(repo, 'artifacts/cloud-icing-production')
await fs.mkdir(out, { recursive: true })
const index = readKimNwpIndex('backend/data'), times = index.times.slice(0, 2), levelIds = ['600hPa', '500hPa', '450hPa', '250hPa']
const fields = {}
for (const { hf } of times) for (const levelId of levelIds) {
  const grid = readKimNwpGrid({ root: 'backend/data', model: index.model, tmfc: index.latestRun, hf, levelId })
  fields[`${hf}:${levelId}`] = { wind: buildKimSurfaceWindFieldFromWindGrid(grid), temp: buildKimTemperatureFieldFromGrid(grid), cloud: buildKimCloudPotentialFieldFromGrid(grid), icing: parseFloat(levelId) >= 300 ? buildKimIcingFieldFromGrid(grid) : null }
}
const selectedIndex = { ...index, levels: index.levels.filter(l => levelIds.includes(l.id)).sort((a,b) => (a.id === '600hPa' ? -1 : b.id === '600hPa' ? 1 : 0)), times,
  availability: Object.fromEntries(levelIds.map(level => [level, Object.fromEntries(times.map(t => [String(t.hf), index.availability[level][String(t.hf)]]))])) }
const fixture = { tmfc: index.latestRun, times, fields, airports, indexes: {
  wind: filterKimNwpIndexForVariables(selectedIndex, ['u','v']), temp: filterKimNwpIndexForVariables(selectedIndex, ['T']), cloud: filterKimNwpIndexForVariables(selectedIndex, ['T', 'rh']),
  icing: filterKimNwpIndexForVariables(selectedIndex, ['T', 'rh_liq', 'w', 'tqc', 'tqi', 'tqr', 'tqs', 'cld']),
}, provinces: JSON.parse(await fs.readFile('frontend/public/Geo/sido.json', 'utf8')), assets: {} }
// Real KIM profile; only the explicitly named occlusion scenario adds a controlled GKTG band.
const route = { type: 'LineString', coordinates: [[126.45,37.46],[126.49,33.51]] }
const storedProfile = loadRouteCrossSection({ root:'backend/data', routeGeometry:route, body:{tmfc:index.latestRun,hf:times[0].hf,sampleSpacingMeters:5000} })
const flight = structuredClone(organizationFlightFixture)
flight.name='RKSI → RKPC 저장 KIM 검증'; flight.etd=times[0].validTime; flight.eta=times[1].validTime
flight.snapshot.routeGeometry=route; flight.snapshot.base.routeForm={flightRule:'VFR',departureAirport:'RKSI',arrivalAirport:'RKPC'}
flight.snapshot.base.routeString='RKSI RKPC'; flight.snapshot.cruiseAltitudeFt=14000
const bundle=organizationBundleFixture(flight, {}, 'offline-a-bundle')
bundle.crossSection={...storedProfile.crossSection, availableTimes:times}
bundle.verticalProfile={...bundle.verticalProfile, axis:storedProfile.axis, terrain:{unit:'m',values:storedProfile.axis.samples.map(s=>({index:s.index,elevationM:80}))}, markers:[{distanceNm:0,label:'RKSI'},{distanceNm:storedProfile.totalDistanceNm,label:'RKPC'}]}
bundle.componentStatus={kim:{status:'available'},verticalProfile:{status:'available'},terrain:{status:'available'}}
bundle.mapDataSelection={bundleId:bundle.bundleId,models:{kim:{status:'available',tmfc:index.latestRun,hf:times[0].hf,validTime:times[0].validTime,levelIds,resources:Object.fromEntries(['wind','temp','cloud','icing'].map(variable=>[variable,Object.fromEntries(levelIds.filter(id=>variable!=='icing'||parseFloat(id)>=300).map(id=>[id,{revision:`offline-${variable}-${id}`}]))]))}},frames:{}}
bundle.briefing.sections.enroute.crossSectionAvailable=true
const occlusion=structuredClone(bundle)
const row=occlusion.crossSection.levels.findIndex((l,i,all)=>i<all.length-1&&l.values.some(v=>v.icing>=1))
if(row<0) throw new Error('Stored profile needs an icing cell for the occlusion contract')
const bottom=occlusion.crossSection.levels[row],top=occlusion.crossSection.levels[row+1]
occlusion.crossSection.turbulence={available:true,product:'GKTG',levels:[bottom,top].map(l=>({altFt:l.altFt,values:l.values.map(v=>({distanceNm:v.distanceNm,altFt:l.altFt,gktg:.25}))}))}
occlusion.briefing.sections.enroute.model={totalDistanceNm:storedProfile.totalDistanceNm,elements:[{kind:'turbulence',label:'중첩 확인용 난류 fixture',intervals:[]}]}
fixture.bundle=bundle;fixture.occlusion=occlusion
fixture.session={id:81,orgId:11,name:'구름·착빙 제품 오프라인 검증',version:1,materialRefs:[]}
fixture.run={id:91,orgId:11,version:1,status:'active',startedBy:2,startedAt:times[0].validTime,pinnedSnapshot:{briefing:fixture.session,flights:[flight]},appliedBundles:{71:occlusion}}
for (const file of ['briefing-charts/surf_2026070112.png', 'favicon-gisang.png', 'favicon.png', 'basemap-thumbs/standard.png', 'basemap-thumbs/outline.png', 'basemap-thumbs/outline-green.png', 'basemap-thumbs/outline-slate.png', 'basemap-thumbs/satellite.png']) {
  const bytes = await fs.readFile(path.join(repo, 'frontend/public', file)).catch(() => null)
  if (bytes) fixture.assets['/' + file] = 'data:image/png;base64,' + bytes.toString('base64')
}
for (const entry of await fs.readdir('frontend/public/Symbols', { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(svg|png)$/.test(entry.name)) continue
  const file = path.join(entry.parentPath, entry.name), pathname = '/' + path.relative('frontend/public', file)
  fixture.assets[pathname] = `data:image/${entry.name.endsWith('.svg') ? 'svg+xml' : 'png'};base64,` + (await fs.readFile(file)).toString('base64')
}
for (const file of ['data/airports.geojson', 'data/airports-overseas.geojson', 'data/fir-overseas.geojson', 'Geo/sido.json', 'Geo/korea_neighbors_masked.v1.geojson']) {
  const bytes = await fs.readFile(path.join('frontend/public', file)).catch(() => Buffer.from('{"type":"FeatureCollection","features":[]}'))
  fixture.assets['/' + file] = 'data:application/json;base64,' + bytes.toString('base64')
}
const transform = {
  name: 'offline-product-fixture', setup(b) {
    b.onResolve({filter: /pdf\.worker\.min\.mjs\?url$/}, () => ({path: 'offline-pdf-worker', namespace: 'offline'}))
    b.onLoad({filter: /.*/, namespace: 'offline'}, () => ({contents: 'export default "data:text/javascript,"', loader: 'js'}))
    b.onLoad({ filter: /\/wafsChartRenderer\.js$/ }, async ({ path: file }) => ({contents: (await fs.readFile(file, 'utf8')).replace(/import\.meta\.glob\([^\n]+\)/, '{}'), loader: 'js', resolveDir: path.dirname(file)}))
    b.onLoad({ filter: /\/features\/map\/MapView\.jsx$/ }, async ({ path: file }) => {
      let s = await fs.readFile(file, 'utf8')
      s = s.replace('initMetVisibility(initialMetVisibility)', 'initMetVisibility(initialMetVisibility ?? { radarHsr: false, cloudIcing: true })')
      s = s.replace('const initialBasemap = BASEMAP_OPTIONS[0]', "const initialBasemap = { ...BASEMAP_OPTIONS[0], style: window.__PROJECT_UI.style, config: undefined }")
      s = s.replace('container: mapContainerRef.current,', "container: mapContainerRef.current, testMode: true, localFontFamily: 'Wanted Sans Variable', transformRequest: url => ({ url: window.__PROJECT_UI.assets[new URL(url, location.href).pathname] ?? url }),")
      s = s.replace('  // ???? Render', '  window.__projectUi = { map: mapRef.current, metVisibility, toggleMet, clearMetLayers, setMetVisibility, setLayerOn, nwpSelection, setNwpSelection, icingField, cloudField, temperatureField };\n  // ???? Render')
      return { contents: s, loader: 'jsx', resolveDir: path.dirname(file) }
    })

  },
}
const source = `
import React, {useState} from 'react';import{createRoot}from'react-dom/client';import{FluentProvider}from'@fluentui/react-components';
import App from './frontend/src/app/App.jsx';
import {AuthProvider} from './frontend/src/features/auth/AuthContext.jsx';
import OrganizationPresentation from './frontend/src/features/organization-lounge/OrganizationPresentation.jsx';
import OrganizationMap from './frontend/src/features/organization-lounge/OrganizationMap.jsx';
import VerticalProfileWindow from './frontend/src/features/route-briefing/VerticalProfileWindow.jsx';
import BriefingView from './frontend/src/features/route-briefing/BriefingView.jsx';
import CopilotResultView from './frontend/src/features/route-briefing/CopilotResultView.jsx';import{appLightTheme}from'./frontend/src/shared/theme/fluentTheme.js';
import './frontend/src/shared/theme/tokens.css';import './frontend/src/app/App.css';import './frontend/src/assets/fonts/wanted-sans/1.0.3/WantedSansVariable.css';
document.documentElement.style.setProperty('--app-font', "'Wanted Sans Variable', system-ui, sans-serif");
localStorage.setItem('projectamo:skip-intro','1');localStorage.setItem('amo.tour.v1.done','true');localStorage.setItem('projectamo:lastSeenVersion',${JSON.stringify(CURRENT_VERSION)});
function Scenario(){
 const query=new URLSearchParams(location.search),view=query.get('view'),fixture=window.__PROJECT_UI;
 const b=query.get('occlusion')==='0'?fixture.bundle:fixture.occlusion;
 const [open,setOpen]=useState(false),[alt,setAlt]=useState(14000),[hf,setHf]=useState(6);
 const profileWindow=<VerticalProfileWindow profile={b.verticalProfile} crossSection={b.crossSection} isOpen={view==='profile'||open} onClose={()=>setOpen(false)} placement={query.get('placement')??'bottom'} referenceAltitudeFt={14000} candidateAltitudes={[12000,14000,16000]} selectedCandidateAltitudeFt={alt} onSelectCandidateAltitude={setAlt} onSelectForecastHour={view==='profile'?setHf:undefined} statusMessage={view==='profile'?'저장 KIM 단면 · 중첩 시험 GKTG fixture · 선택 F+'+hf:null}/>;
 if(view==='organization')return <AuthProvider><OrganizationPresentation orgId={11} sessionId={81}/></AuthProvider>;
 if(view==='organization-live')return <AuthProvider><OrganizationMap orgId={11} bundle={b} showControls={query.get('controls')!=='hidden'}/></AuthProvider>;
 if(view==='profile')return profileWindow;
 if(view==='briefing')return <AuthProvider><><BriefingView briefing={b.briefing} verticalProfile={b.verticalProfile} crossSection={b.crossSection} onOpenProfile={()=>setOpen(true)}/>{profileWindow}</></AuthProvider>;
 if(view==='copilot')return <CopilotResultView bundle={{...b,reference:{briefingRef:'offline-saved-result',effectiveNow:fixture.times[0].validTime},request:{nwpTimeSelection:null},advisories:[]}}/>;
 return <App/>;
}
createRoot(document.getElementById('root')).render(<FluentProvider theme={appLightTheme} style={{display:'contents'}}><Scenario/></FluentProvider>);
`
const result = await build({ stdin: { contents: source, resolveDir: repo, loader: 'jsx' }, bundle: true, write: false,
  alias: { react: path.join(repo, 'frontend/node_modules/react'), 'react-dom': path.join(repo, 'frontend/node_modules/react-dom') },
  nodePaths: [path.join(repo, 'frontend/node_modules')], outdir: path.join(out, 'bundle'), plugins: [transform], format: 'iife', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ VITE_MAPBOX_TOKEN: 'pk.offline-design-fixture', BASE_URL: '/', DEV: false, PROD: true }) },
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.webm': 'empty' }, logLevel: 'warning' })
const js = result.outputFiles.find(f => f.path.endsWith('.js')).text, css = result.outputFiles.find(f => f.path.endsWith('.css')).text.replace(/@import[^;]*;/g, '')
const bootstrap = `
const fixture=window.__PROJECT_UI;
const ReviewDate=Date,reviewNow=ReviewDate.parse(fixture.times[0].validTime);
window.Date=class extends ReviewDate{constructor(...args){super(...(args.length?args:[reviewNow]))}static now(){return reviewNow}};
fixture.requests=[];
const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(value){let key;try{key=new URL(value,location.href).pathname}catch{}imageSrc.set.call(this,fixture.assets[key]??value)}});
fixture.style={version:8,glyphs:'data:application/x-protobuf,{fontstack}/{range}',sources:{provinces:{type:'geojson',data:fixture.provinces}},layers:[{id:'bg',type:'background',paint:{'background-color':'#88bedd'}},{id:'land',type:'fill',source:'provinces',paint:{'fill-color':'#f2f4ef'}},{id:'province',type:'line',source:'provinces',paint:{'line-color':'#aeb9c1','line-width':.6}},{id:'bottom',type:'slot'},{id:'middle',type:'slot'},{id:'top',type:'slot'}]};
const readEmbedded=window.fetch.bind(window);
window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href),p=url.pathname;if(url.protocol==='data:'||url.protocol==='blob:')return readEmbedded(input,options);fixture.requests.push(p+url.search);
 let value=null,status=200;
 if(p==='/api/auth/me'){value=new URLSearchParams(location.search).has('view')?{id:2,username:'offline-presenter',role:'pilot'}:{};status=new URLSearchParams(location.search).has('view')?200:401;}
 else if(p==='/api/organizations/11/briefings/81')value={briefing:fixture.session};
 else if(p.endsWith('/runs')||p.endsWith('/runs/91'))value={run:fixture.run};
 else if(p==='/api/airports')value=fixture.airports;
 else if(p==='/api/demo-mode')value={on:false};
 else if(p==='/api/snapshot-meta')value={};
 else if(p.startsWith('/api/kim/')){const parts=p.split('/'),variable=parts[3];if(parts[4]==='index')value=fixture.indexes[variable]??null;else value=window.__fixtureFailVariable===variable?null:fixture.fields[url.searchParams.get('hf')+':'+url.searchParams.get('level')]?.[variable]??null;}
 else if(p.includes('/api/notifications'))value={items:[],unreadCount:0};
 else if(p.endsWith('.geojson'))value={type:'FeatureCollection',features:[]};
 else if(p.includes('/airports-overseas'))value=[];
 else if(p.includes('/api/sigmet')||p.includes('/api/airmet'))value={items:[]};
 else if(p.includes('/api/metar')||p.includes('/api/taf')||p.includes('/api/amos')||p.includes('/api/warning'))value={airports:{}};
 else if(p.includes('/api/me/maps'))value={maps:[]};
 if(value===null)status=404;
 return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
};
new MutationObserver(()=>{for(const img of document.images){let pathname;try{pathname=new URL(img.getAttribute('src'),location.href).pathname}catch{continue}if(fixture.assets[pathname])img.src=fixture.assets[pathname];}}).observe(document.documentElement,{childList:true,subtree:true});
`
const extraCss = `
.review-toolbar{position:fixed;z-index:99999;top:12px;left:50%;transform:translateX(-50%);height:32px;border:1px solid var(--stroke-1);border-radius:var(--radius-sm);display:flex;align-items:center;gap:var(--space-s);padding:0 var(--space-m);background:var(--bg-1);border-bottom:1px solid var(--stroke-1);font:var(--fs-200)/1.3 var(--app-font);color:var(--text-2)}
.review-toolbar a{color:var(--accent);padding:var(--space-xs) var(--space-s);border:1px solid var(--stroke-1);border-radius:var(--radius-sm);text-decoration:none}.review-toolbar strong{margin-right:var(--space-s)}
html:has(.organization-map) .organization-map{height:100dvh}#root{height:100dvh}#root>.fui-FluentProvider{height:100%}#root .app{height:100%;min-height:0}

`
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProjectAMO 실제 UI · 구름·착빙 조작 검토</title><style>${css}\n${extraCss}</style></head><body><div id="root"></div><script>window.__PROJECT_UI=${JSON.stringify(fixture).replaceAll('<','\\u003c')};</script><script>${bootstrap}</script><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`
await fs.writeFile(path.join(out,'preview.html'),html)
const review = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>구름·착빙 A 제품 검증</title><style>body{margin:0}iframe{width:100%;height:100dvh;border:0;display:block}</style></head><body><iframe title="ProjectAMO 제품 구현 · 저장 KIM 오프라인 검증" src="preview.html"></iframe></body></html>`
await fs.writeFile(path.join(out,'index.html'),review)
console.log('실제 App/MapView 오프라인 시안:',path.join(out,'preview.html'), 'bytes:', Buffer.byteLength(html))
