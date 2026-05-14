import fs from 'fs'
import path from 'path'

const samplesRoot = path.resolve('reference', 'sigwx_low_samples')
const outputPath = path.resolve('docs', 'SIGWX_LOW_Rendering_Matrix.md')

function listParsedSamples(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root)
    .map((tmfc) => ({ tmfc, parsedPath: path.join(root, tmfc, 'parsed.json') }))
    .filter((entry) => fs.existsSync(entry.parsedPath))
}

function matrixKey(item) {
  return [
    item.item_type,
    item.contour_name || '',
    item.item_name || '',
    item.icon_name || '',
    item.shape_type || '',
    item.line_type || '',
    item.is_close ? 'closed' : 'open',
  ].join(' | ')
}

const rows = new Map()
for (const sampleInfo of listParsedSamples(samplesRoot)) {
  const sample = JSON.parse(fs.readFileSync(sampleInfo.parsedPath, 'utf8'))
  for (const item of sample.items || []) {
    const key = matrixKey(item)
    const row = rows.get(key) || {
      count: 0,
      samples: new Set(),
      labels: new Set(),
      renderRole: 'unclassified',
      semanticRole: 'unclassified',
    }
    row.count += 1
    row.samples.add(sampleInfo.tmfc)
    const label = String(item.label || item.text_label || '').replace(/&#10;/g, ' / ').trim()
    if (label) row.labels.add(label)
    rows.set(key, row)
  }
}

const lines = [
  '# SIGWX_LOW Rendering Matrix',
  '',
  'This matrix is generated from paired SIGWX_LOW XML/PNG samples. Update `renderRole` and `semanticRole` manually after comparing each row against target chart images.',
  '',
  '| Count | Samples | Item Key | Example Labels | Semantic Role | Render Role |',
  '| ---: | ---: | --- | --- | --- | --- |',
]

for (const [key, row] of [...rows.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))) {
  let semanticRole = row.semanticRole
  let renderRole = row.renderRole
  if (key === '4 | freezing_level |  |  |  | 3 | open') {
    semanticRole = 'freezing-level'
    renderRole = 'dashed-freezing-line'
  } else if (key === '4 | sfc_wind | l_wind |  |  | 1 | closed') {
    semanticRole = 'strong-surface-wind-area'
    renderRole = 'blue-wind-area-boundary'
  } else if (key === '8 | sfc_wind | wind_strong |  | diamond | 1 | open') {
    semanticRole = 'strong-surface-wind-speed'
    renderRole = 'wind-diamond-label'
  } else if (key === '4 | cld | cloud |  |  | 5 | closed') {
    semanticRole = 'cb-cloud-area'
    renderRole = 'cloud-scallop-overlay-and-multiline-label'
  }
  lines.push(`| ${row.count} | ${row.samples.size} | \`${key}\` | ${[...row.labels].slice(0, 4).join('<br>')} | ${semanticRole} | ${renderRole} |`)
}

lines.push(
  '',
  '## Front And Cloud Shape Acceptance',
  '',
  'Front/cloud rendering must be judged against paired `target.png` samples, not only against parser output. The preferred implementation is an FPV-space chart-line engine that uses original XML `fpv_points`, not lat/lon-only geometry, because the KMA finished chart appears to be generated in the original chart coordinate space.',
  '',
  'For each sample containing `font_line` or `cld/cloud`:',
  '',
  '- The rendered line follows the target path without obvious lateral drift.',
  '- Front symbols repeat at a similar density to the target image.',
  '- Warm/cold/occluded symbol orientation follows line direction.',
  '- CB cloud scallops sit outside the cloud area, not across the interior.',
  '- Scallop density is close enough that the boundary reads as the same chart convention.',
  '- The underlying source item remains available as a phenomenon for toggles, route intersection, briefing, and vertical-profile work.',
  '',
  'Accepted implementation modes:',
  '',
  '- `fpv-sampled-vector-symbols`: preferred final mode because it follows the original chart-engine model while preserving per-phenomenon toggles and interaction.',
  '- `per-phenomenon-raster`: acceptable fallback only after FPV vector sampling fails visual review for a documented reason.',
  '- `whole-layer-raster`: temporary reference mode only; do not treat it as the final interactive engine.',
)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote ${outputPath}`)
