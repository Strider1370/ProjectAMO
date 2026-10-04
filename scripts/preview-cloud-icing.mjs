// Read stored KIM fields and bundle the product renderers into a standalone, reviewable HTML.
// This command does not start a server or collect KMA data. Mapbox runs in testMode with local boundaries; no network authentication.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { readKimNwpGrid, readKimNwpIndex } from '../backend/src/processors/kim-nwp-store.js'
import { buildKimIcingFieldFromGrid, buildKimTemperatureFieldFromGrid, buildKimCloudPotentialFieldFromGrid } from '../backend/src/processors/kim-nwp-model.js'
import { loadRouteCrossSection } from '../backend/src/briefing/enroute-cross-section.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = path.resolve(process.argv[2] || path.join(repo, 'backend/data'))
const out = path.join(repo, 'artifacts/cloud-icing-real-kim.html')
const index = readKimNwpIndex(dataRoot)
if (!index?.latestRun) throw new Error('Stored KIM index is required')
const route = { type: 'LineString', coordinates: [[126.45, 37.46], [126.49, 33.51]] }
const times = index.times.slice(0, 2)
const levels = ['600hPa', '500hPa', '450hPa', '250hPa']
const fields = {}, profiles = {}, counts = {}
for (const { hf } of times) {
  profiles[hf] = loadRouteCrossSection({ root: dataRoot, routeGeometry: route, body: { tmfc: index.latestRun, hf, sampleSpacingMeters: 5000 } })
  for (const levelId of levels) {
    const grid = readKimNwpGrid({ root: dataRoot, model: index.model, tmfc: index.latestRun, hf, levelId })
    const icing = Number.parseFloat(levelId) >= 300 ? buildKimIcingFieldFromGrid(grid) : null
    fields[`${hf}:${levelId}`] = { temperature: buildKimTemperatureFieldFromGrid(grid), cloud: buildKimCloudPotentialFieldFromGrid(grid), icing }
    counts[`${hf}:${levelId}`] = icing?.icingGrade.reduce((a, grade) => { if (grade >= 0 && grade <= 3) a[grade]++; return a }, [0, 0, 0, 0]) ?? null
  }
}
const mapboxToken = 'pk.offline-product-fixture'
const data = { mapboxToken, tmfc: index.latestRun, times, levels, fields, profiles, route, counts, provinces: JSON.parse(await fs.readFile(path.join(repo, 'frontend/public/Geo/sido.json'), 'utf8')) }
const source = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './frontend/src/features/map/MapView.css';
import './frontend/src/features/route-briefing/RouteBriefing.css';
import './frontend/src/shared/theme/tokens.css';
import WeatherOverlayPanel from './frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx';
import CloudIcingMapControls from './frontend/src/features/weather-overlays/CloudIcingMapControls.jsx';
import CloudIcingLegend from './frontend/src/features/weather-overlays/CloudIcingLegend.jsx';
import VerticalProfileChart from './frontend/src/features/route-briefing/VerticalProfileChart.jsx';
import { CrossSectionToggles, CrossSectionOverlapNotice, useCrossSectionLayers } from './frontend/src/features/route-briefing/crossSectionLayers.jsx';
import { MET_LAYERS } from './frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js';
import { createInitialMetVisibility, getNextMetVisibility } from './frontend/src/features/weather-overlays/lib/metLayerVisibility.js';
import { syncCloudPotentialOverlay } from './frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.js';
import { syncIcingPatternOverlay } from './frontend/src/features/weather-overlays/lib/icingPatternOverlay.js';
import { syncTemperatureContourOverlay } from './frontend/src/features/weather-overlays/lib/temperatureContourOverlay.js';
const data=window.KIM_PREVIEW_DATA; mapboxgl.accessToken='';
function basemap(dark) { return { version:8, glyphs:'data:application/x-protobuf,{fontstack}/{range}', sources:{ provinces:{type:'geojson',data:data.provinces}, route:{type:'geojson',data:{type:'Feature',properties:{},geometry:data.route}} }, layers:[{id:'background',type:'background',paint:{'background-color':dark?'#101e30':'#edf3f5'}},{id:'land',type:'fill',source:'provinces',paint:{'fill-color':dark?'#263849':'#fafafa'}},{id:'coast',type:'line',source:'provinces',paint:{'line-color':dark?'#60768b':'#aeb9c1','line-width':1}},{id:'route',type:'line',source:'route',paint:{'line-color':'#334155','line-width':2,'line-dasharray':[3,2]}}] }; }
function App() {
 const [hf,setHf]=useState(data.times[0].hf),[level,setLevel]=useState('500hPa'),[dark,setDark]=useState(false),[panel,setPanel]=useState(true),[revision,setRevision]=useState(0);
 const [visibility,setVisibility]=useState(()=>createInitialMetVisibility(MET_LAYERS.map(l=>l.id),{radarHsr:false,cloudIcing:true}));
 const [layers,toggleLayer,layerView]=useCrossSectionLayers(); const mapRef=useRef(null),container=useRef(null);
 const fields=data.fields[hf+':'+level];
 function toggle(id){setVisibility(v=>getNextMetVisibility(v,id))}
 useEffect(()=>{const map=new mapboxgl.Map({container:container.current,testMode:true,style:basemap(false),center:[127,36],zoom:5.6,localFontFamily:'sans-serif',attributionControl:false,preserveDrawingBuffer:true,fadeDuration:0});mapRef.current=map;map.on('style.load',()=>setRevision(v=>v+1));map.on('idle',()=>{if(!map.getLayer('kim-temperature-zero-line'))setRevision(v=>v+1)});map.on('error',e=>{window.previewErrors.push(e.error.message)});window.__cloudIcingPreview={map};return()=>map.remove()},[]);
 useEffect(()=>{const map=mapRef.current;if(!map||!revision||!map.style?.stylesheet)return;syncCloudPotentialOverlay(map,{cloudPotentialField:fields.cloud,isVisible:visibility.cloud});syncIcingPatternOverlay(map,{icingField:fields.icing,isVisible:visibility.cloudIcing&&visibility.icing,basemapId:dark?'outline':'standard'});syncTemperatureContourOverlay(map,{temperatureField:fields.temperature,isVisible:visibility.cloudIcing});window.__cloudIcingPreview={map,visibility,level,hf,fields,layers};},[visibility,level,hf,revision,dark,layers]);
 const p=data.profiles[hf],profile={axis:p.axis,terrain:{values:[]},markers:[{distanceNm:0,label:'RKSI'},{distanceNm:p.totalDistanceNm,label:'RKPC'}]};
 return <main>
  <header><strong>구름·착빙 · 실제 저장 KIM 자료</strong><span>발표 {data.tmfc.slice(0,4)}-{data.tmfc.slice(4,6)}-{data.tmfc.slice(6,8)} {data.tmfc.slice(8)} UTC · 유효 {new Date(data.times.find(t=>t.hf===hf).validTime).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</span><small>제품의 지도 어댑터·단면 컴포넌트 사용 · 배경은 로컬 시도 경계 · 지형 생략</small></header>
  <nav><label>기압층 <select aria-label="기압층" value={level} onChange={e=>setLevel(e.target.value)}>{data.levels.map(l=><option key={l}>{l}</option>)}</select></label><label>예보시간 <select aria-label="예보시간" value={hf} onChange={e=>setHf(Number(e.target.value))}>{data.times.map(t=><option key={t.hf} value={t.hf}>F+{t.hf}h</option>)}</select></label><button onClick={()=>{const next=!dark;setDark(next);mapRef.current.setStyle(basemap(next),{diff:false})}}>배경 전환</button><button onClick={()=>setPanel(v=>!v)}>기상 설정</button><span>착빙 격자: {fields.icing?data.counts[hf+':'+level].slice(1).join(' / ')+' (LGT / MOD / SEV)':'지원층 밖'}</span></nav>
  <section className="preview-map map-view-wrapper"><div ref={container} className="map-view" />{panel&&<WeatherOverlayPanel layers={MET_LAYERS.filter(l=>['wind','cloudIcing','temp','cloud','icing','turbulence'].includes(l.id))} visibility={visibility} onToggle={toggle} onClose={()=>setPanel(false)} onClearAll={()=>setVisibility(createInitialMetVisibility(MET_LAYERS.map(l=>l.id),{radarHsr:false}))} isLayerDisabled={id=>['wind','turbulence'].includes(id)} getLayerBadge={()=>0} showRadarWindControl={false} selectedKimLevel={level} cloudIcingStatuses={{temp:'ready',cloud:'ready',icing:fields.icing?'ready':'unavailable'}}/>}{visibility.cloudIcing&&<div className="map-bottom-control-dock"><CloudIcingMapControls visibility={visibility} onToggle={toggle} level={level}/></div>}<div className="preview-legend"><CloudIcingLegend cloud={visibility.cloud} icing={visibility.icing&&!!fields.icing} temperature={visibility.cloudIcing} mode="map"/></div></section>
  <section className="preview-profile"><h2>연직단면도 · RKSI → RKPC · 실제 KIM 21개 기압층</h2><CrossSectionToggles layers={layers} onToggle={toggleLayer}/><CrossSectionOverlapNotice crossSection={p.crossSection} layers={layers} view={layerView}/><VerticalProfileChart profile={profile} crossSection={p.crossSection} layers={layers} allowMissingTerrain hideMeta/></section>
 </main>
}
window.previewErrors=[];createRoot(document.getElementById('root')).render(<App/>);
`
const result = await build({ stdin: { contents: source, resolveDir: repo, loader: 'jsx' }, bundle: true, write: false, alias: { react: path.join(repo, 'frontend/node_modules/react'), 'react-dom': path.join(repo, 'frontend/node_modules/react-dom'), 'mapbox-gl': path.join(repo, 'frontend/node_modules/mapbox-gl') }, outdir: path.join(repo, 'artifacts/preview-bundle'), format: 'iife', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' }, logLevel: 'warning' })
const js = result.outputFiles.find(f=>f.path.endsWith('.js')).text
const css = result.outputFiles.find(f=>f.path.endsWith('.css'))?.text || ''
const extraCss = `body{margin:0;font-family:var(--app-font);color:var(--text-1);background:var(--bg-2)}main{max-width:1600px;margin:auto}header{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;padding:16px}header strong{font-size:20px}header small{display:block;width:100%;color:var(--text-3)}nav{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:8px 16px;border-top:1px solid var(--stroke-1);border-bottom:1px solid var(--stroke-1)}nav select,nav button{font:inherit;min-height:44px;background:white;border:1px solid var(--stroke-1);border-radius:4px;padding:4px 8px}nav label{display:flex;align-items:center;gap:8px}.preview-map{height:570px}.preview-legend{position:absolute;right:12px;bottom:12px;max-width:300px;z-index:3}.preview-profile{padding:16px}.preview-profile h2{font-size:16px;margin:0 0 12px}.preview-profile .vertical-profile-chart{margin-top:12px}.preview-map .layer-drawer{left:12px;right:auto;width:300px}.preview-map .layer-tile-grid{grid-template-columns:repeat(3,1fr)}@media(max-width:600px){.preview-map{height:470px}.preview-legend{max-width:230px;bottom:8px;right:8px}.preview-profile{padding:8px}header strong{font-size:16px}nav{gap:8px;padding:8px}nav span{font-size:12px;overflow-wrap:anywhere}nav label{min-width:0}nav select{max-width:120px}.preview-profile .cross-section-toggles{flex-wrap:wrap}.preview-profile .cross-section-toggle-group{flex-wrap:wrap}}`
await fs.mkdir(path.dirname(out), { recursive: true })
await fs.writeFile(out, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KIM 구름·착빙 실제 자료 검증</title><style>${css}\n${extraCss}</style></head><body><div id="root"></div><script>window.KIM_PREVIEW_DATA=${JSON.stringify(data).replaceAll('<','\\u003c')};</script><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`)
await fs.writeFile(path.join(repo, 'artifacts/cloud-icing-real-data.json'), JSON.stringify({ tmfc:data.tmfc,times,levels,counts,profileLevels:profiles[times[0].hf].crossSection?.levels?.length },null,2))
console.log(out)
