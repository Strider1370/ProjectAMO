// 해외 레이더(RainViewer) 메타 수집.
// KMA 레이더와 달리 원자료를 받지 않는다 — RainViewer는 이미 렌더된 래스터 타일을 CDN으로 서빙하고,
// 이 JSON(약 800B)은 "몇 시 프레임이 어느 경로에 있는지"만 알려주는 목차다.
// 타일 자체는 브라우저 → RainViewer CDN 직접 호출(프록시 금지: 서버 IP로 트래픽이 몰려 차단 위험).
// 라이선스: personal/educational only. 출처 표기 필수. 운영 전환 시 재검토.
// 스펙/계획: docs/superpowers/{specs,plans}/2026-07-14-overseas-radar-rainviewer*.md
import fs from 'fs'
import path from 'path'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'

// 색상 2(Universal Blue), smooth=1, snow=1. 512px 타일.
const TILE_TEMPLATE = '{host}{path}/512/{z}/{x}/{y}/2/1_1.png'
const COVERAGE_TEMPLATE = '{host}/v2/coverage/0/512/{z}/{x}/{y}/0/0_0.png'

/**
 * weather-maps.json → 우리 메타. 순수 함수(테스트 대상).
 * ★ tm 필수 — server.js의 buildFrameEntry가 payload.tm 없으면 null을 반환하고,
 *   그러면 스냅샷 diff가 갱신을 영영 감지 못 해 프론트 레이더가 초기 1회 후 멈춘다.
 */
export function buildRainviewerMeta(payload) {
  const host = payload?.host
  const past = payload?.radar?.past
  if (typeof host !== 'string' || !host || !Array.isArray(past)) {
    throw new Error('rainviewer: unexpected weather-maps.json shape')
  }

  const frames = past
    .filter((f) => Number.isFinite(f?.time) && typeof f?.path === 'string' && f.path)
    .map((f) => ({ timeMs: f.time * 1000, path: f.path }))
    .sort((a, b) => a.timeMs - b.timeMs)

  if (!frames.length) throw new Error('rainviewer: no past frames')

  return {
    type: 'RAINVIEWER',
    tm: String(frames[frames.length - 1].timeMs), // 스냅샷 diff 키 — 최신 프레임이 바뀔 때만 변한다
    updated_at: new Date().toISOString(),
    host,
    tileTemplate: TILE_TEMPLATE,
    coverageTemplate: COVERAGE_TEMPLATE,
    frames,
  }
}

async function process() {
  const response = await fetchWithTimeout(config.rainviewer.url, config.rainviewer.timeout_ms)
  if (!response.ok) throw new Error(`rainviewer: HTTP ${response.status}`)

  // 실패 시 throw → runWithLock이 stats에 기록. 기존 meta 파일은 그대로 남아 프론트는 무중단.
  const meta = buildRainviewerMeta(await response.json())

  const radarDir = path.join(config.storage.base_path, 'radar')
  fs.mkdirSync(radarDir, { recursive: true })
  fs.writeFileSync(
    path.join(radarDir, 'rainviewer_meta.json'),
    `${JSON.stringify(meta, null, 2)}\n`,
    'utf8',
  )

  return { type: 'rainviewer', saved: true, tm: meta.tm, frameCount: meta.frames.length }
}

export { process }
export default { process }
