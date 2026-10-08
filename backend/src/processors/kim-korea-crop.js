// 확대 영역(ea) 회차에서 한반도 격자를 잘라 한반도(kr) 회차로 게시한다(06 UTC, 운영안 2026-10-08).
//
// 두 영역은 같은 KIM 전구 1/12° 격자에서 범위만 다르게 받은 것이라, 한반도 범위의 칸을 그대로 옮기면 한반도 단독
// 수집과 같은 값이 된다. 06 UTC 한반도 회차를 일반 키로 따로 받지 않아도 된다. 문서 모양(격자 정보 키 순서 포함)은
// 한반도 수집기가 쓰는 것과 같게 만든다.
import path from 'node:path'

import config from '../config.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpIndex, buildKimNwpIndexEntry } from './kim-nwp-model.js'
import {
  buildKimNwpRunId, cleanupKimNwpRuns, readKimNwpGrid, readKimNwpLatest, readKimNwpManifest, resolveKimNwpGridPath, resolveKimNwpRunDir,
  writeKimNwpGrid, writeKimNwpIndex, writeKimNwpLatest, writeKimNwpManifest,
} from './kim-nwp-store.js'
import { kimDomainRequest } from './kim-domain.js'
import { appendKimRunEvent } from './kim-run-events.js'
import store from '../store.js'

const CELLS_PER_DEGREE = 12

// ea 격자 문서 하나를 한반도 범위로 자른다. 한반도 범위가 확대 영역 밖이거나 격자 간격이 다르면 오류.
export function cropGridDocument(doc, bounds) {
  const source = doc.grid
  const nx = Math.round((bounds.lonMax - bounds.lonMin) * CELLS_PER_DEGREE) + 1
  const ny = Math.round((bounds.latMax - bounds.latMin) * CELLS_PER_DEGREE) + 1
  const x0 = Math.round((bounds.lonMin - source.lonMin) * CELLS_PER_DEGREE)
  const y0 = Math.round((bounds.latMin - source.latMin) * CELLS_PER_DEGREE)
  const sourceStep = (source.lonMax - source.lonMin) / (source.nx - 1)
  if (Math.abs(sourceStep * CELLS_PER_DEGREE - 1) > 1e-6 || x0 < 0 || y0 < 0 || x0 + nx > source.nx || y0 + ny > source.ny) {
    throw new Error('kim_korea_crop_outside_expanded_grid')
  }
  const crop = (values) => {
    if (values.length !== source.nx * source.ny) throw new Error('kim_korea_crop_size_mismatch')
    const out = new Array(nx * ny)
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) out[y * nx + x] = values[(y0 + y) * source.nx + x0 + x]
    return out
  }
  return {
    ...doc,
    grid: { nx, ny, ...bounds },
    variables: Object.fromEntries(Object.entries(doc.variables).map(([name, variable]) => [name, { ...variable, values: crop(variable.values) }])),
  }
}

// ea 회차의 hours 시각을 잘라 한반도 회차로 저장·게시한다. 한반도에 이미 같은 회차가 완성돼 있으면 하지 않는다.
export function publishKoreaFromExpanded({ root = config.storage.base_path, tmfc, hours = config.kim_nwp.forecast_hours }) {
  const runId = buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc })
  const existing = readKimNwpManifest(root, runId)
  if (existing?.usable && existing.complete !== false) return { skipped: true, reason: 'kim_korea_run_already_complete', tmfc }
  const { bounds } = kimDomainRequest(config, 'kr')
  const entries = []
  for (const hf of hours) {
    for (const level of KIM_NWP_LEVELS) {
      const grid = cropGridDocument(readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, domain: 'ea' }), bounds)
      writeKimNwpGrid({ root, grid })
      entries.push(buildKimNwpIndexEntry(grid, path.relative(root, resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id })).replace(/\\/g, '/')))
    }
  }
  const index = buildKimNwpIndex({ model: KIM_NWP_MODEL, tmfc, entries })
  writeKimNwpManifest(root, { type: 'kim_nwp_manifest', model: KIM_NWP_MODEL, tmfc, runId, usable: true, complete: true,
    gridCount: entries.length, expectedGridCount: entries.length, failedTaskCount: 0, source: 'expanded_crop', updated_at: new Date().toISOString() })
  const previous = readKimNwpLatest(root)
  if (previous?.latestRun && previous.latestRun > tmfc) return { saved: false, reason: 'kim_korea_newer_run_published', tmfc, grids: entries.length }
  writeKimNwpIndex(root, index)
  writeKimNwpLatest(root, { type: 'kim_nwp_latest', model: KIM_NWP_MODEL, latestRun: tmfc, latestRunId: runId, indexPath: 'kim_nwp/index.json',
    source: 'expanded_crop', updated_at: new Date().toISOString(), content_hash: store.canonicalHash(index) })
  appendKimRunEvent(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), { type: 'base_published', source: 'expanded_crop', complete: true, grids: entries.length })
  cleanupKimNwpRuns({ root, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId: runId })
  return { saved: true, tmfc, grids: entries.length }
}
