import fs from 'node:fs/promises'
import { build } from '../../../../frontend/node_modules/esbuild/lib/main.js'
const dir='docs/design/mockups/aci-experiment'
const data=JSON.parse(await fs.readFile('artifacts/aci-experiment/public/data.json','utf8'))
if (!data.cells.some(c=>Number.isFinite(c.cape))) throw new Error('No usable CAPE data')
const geo=JSON.parse(await fs.readFile('frontend/public/Geo/sido.json','utf8'))
const land=geo.features.flatMap(({geometry:g}) => {
  const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates
  return polygons.map(p=>p[0].filter((_,i)=>i%Math.max(1,Math.floor(p[0].length/300))===0))
})
const bundle=await build({entryPoints:[`${dir}/preview.mjs`],bundle:true,write:false,format:'iife',logLevel:'warning'})
const serialize=x=>JSON.stringify(x).replaceAll('<','\\u003c')
let html=await fs.readFile(`${dir}/preview.html`,'utf8')
html=html.replace('__TOKENS__',await fs.readFile('frontend/src/shared/theme/tokens.css','utf8')).replace('__DATA__',serialize(data)).replace('__LAND__',serialize(land)).replace('__SCRIPT__',bundle.outputFiles[0].text.replaceAll('</script','<\\/script'))
await fs.writeFile('artifacts/aci-experiment/public/index.html',html)
console.log('Built experimental three-variable preview')
