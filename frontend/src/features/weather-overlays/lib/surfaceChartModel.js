// KIM 지상 일기도의 순수 규칙: 런·시각 선택, 타임라인 시각 목록, 바람깃 격자점 고르기.
import { createWindFieldSampler } from './windField.js'

const HOUR_MS = 3_600_000
const KNOTS_PER_MPS = 1.943844492
// 일기도는 3시간 간격이다. 선택 시각에서 1.5시간 안의 장면만 보여 준다.
export const SURFACE_CHART_MAX_OFFSET_MS = 1.5 * HOUR_MS
export const SURFACE_CHART_BARB_SPACING_PX = 48
export const SURFACE_CHART_CALM_KT = 2.5

// 최신 런 목록은 API로 받아 항상 재확인한다. 시각별 파일은 런 폴더 아래라 바뀌지 않는다.
export const SURFACE_CHART_LATEST_URL = '/api/kim/surface-chart'

// 런 파일은 오래 캐시된다. 같은 런을 다시 발행하면 revision이 바뀌어 주소도 바뀐다.
export function surfaceChartFrameUrls(latest, frame, run = null) {
  if (!latest?.files || !frame?.path) return null
  const base = `/data/${frame.path}`
  const version = Number.isFinite(run?.revision) ? `?v=${run.revision}` : ''
  return {
    isobars: `${base}/${latest.files.isobars}${version}`,
    centers: `${base}/${latest.files.centers}${version}`,
    precip: `${base}/${latest.files.precip}${version}`,
    wind: `${base}/${latest.files.wind}${version}`,
  }
}

// 기관 브리핑처럼 특정 KIM 런에 고정된 경우 그 런만 쓴다. 보관 기간이 지나 없으면 다른 런으로 대체하지 않는다.
export function selectSurfaceChartRun(latest, { pinnedTmfc = null } = {}) {
  const runs = Array.isArray(latest?.runs) ? latest.runs : []
  if (pinnedTmfc) return runs.find((run) => run.tmfc === pinnedTmfc) || null
  return runs[0] || null
}

export function listSurfaceChartTimes(run) {
  return (run?.frames || [])
    .filter((frame) => Number.isFinite(frame.validTimeMs))
    .map((frame) => ({ tmfc: run.tmfc, hf: frame.hf, validTime: new Date(frame.validTimeMs).toISOString() }))
}

export function pickSurfaceChartFrame(run, targetMs) {
  if (!run || !Number.isFinite(targetMs)) return null
  let best = null
  for (const frame of run.frames || []) {
    const offset = Math.abs(frame.validTimeMs - targetMs)
    if (offset <= SURFACE_CHART_MAX_OFFSET_MS && (!best || offset < Math.abs(best.validTimeMs - targetMs))) best = frame
  }
  return best
}

export function windDirectionFrom(u, v) {
  return (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
}

// 공항 바람깃 그림과 같은 5 kt 단위(5~60 kt)를 쓴다.
export function surfaceChartBarbIconId(speedKt) {
  const bucket = Math.min(60, Math.max(5, Math.round(speedKt / 5) * 5))
  return `airport-wind-${String(bucket).padStart(3, '0')}`
}

// 화면을 spacingPx 간격 격자로 나눠 각 점의 바람을 뽑는다. 줌과 관계없이 화면 밀도가 일정하다.
// unproject([x, y]) → { lng, lat } 는 지도에서 받는다(테스트에서는 가짜 함수를 넣는다).
export function selectSurfaceChartBarbs(windField, { width, height, unproject, spacingPx = SURFACE_CHART_BARB_SPACING_PX }) {
  if (!windField?.grid || !(width > 0) || !(height > 0) || typeof unproject !== 'function') return { type: 'FeatureCollection', features: [] }
  const sampler = createWindFieldSampler(windField)
  const features = []
  for (let y = spacingPx / 2; y < height; y += spacingPx) {
    for (let x = spacingPx / 2; x < width; x += spacingPx) {
      const point = unproject([x, y])
      if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) continue
      const vector = sampler.sample(point.lng, point.lat)
      if (!vector) continue
      const speedKt = vector.speed * KNOTS_PER_MPS
      const calm = speedKt < SURFACE_CHART_CALM_KT
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        properties: {
          calm,
          icon: calm ? '' : surfaceChartBarbIconId(speedKt),
          direction: calm ? 0 : Math.round(windDirectionFrom(vector.u, vector.v)),
          speedKt: Math.round(speedKt),
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
