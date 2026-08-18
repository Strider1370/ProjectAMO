import { useEffect, useRef, useState } from 'react'
import { msToKt, windBarbFeathers, windDirectionFromUV, isothermSegments, pressureToFallbackFt } from './lib/crossSectionGrid.js'
import { advisorySymbolUrl } from '../weather-overlays/lib/advisoryLayers.js'
import { buildCloudContourModel } from './lib/cloudContour.js'
import { buildNwpTimeRail } from './lib/nwpTimeSelection.js'
import { formatBriefingTime } from './lib/briefingTime.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

const ADVISORY_ICON_PX = 32 // 평면도 기호의 ~2배. 단면도 맨 앞에 그림.

const M_TO_FT = 3.28084

function formatFt(value) {
  if (!Number.isFinite(value)) return '--'
  return `${Math.round(value).toLocaleString()} ft`
}

function formatFlightLevel(value) {
  return value >= 10000 ? `FL${Math.round(value / 100)}` : `${Math.round(value).toLocaleString()} ft`
}

function formatNm(value) {
  if (!Number.isFinite(value)) return '--'
  return `${Math.abs(value).toFixed(1)}NM`
}

function buildPath(points) {
  if (points.length === 0) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function fitMarkerLabel(label) {
  const value = String(label ?? '')
  return value.length > 10 ? `${value.slice(0, 9)}...` : value
}

function getAltitudeHeadroomFt(cruiseAltitudeFt) {
  return cruiseAltitudeFt <= 10000 ? 5000 : 10000
}

function assignMarkerLanes(markers, xFor) {
  const laneEnds = []
  return [...markers].sort((a, b) => a.distanceNm - b.distanceNm).map((marker) => {
    const x = xFor(marker.distanceNm)
    const halfWidth = Math.max(16, fitMarkerLabel(marker.label).length * 3.5 + 6)
    const lane = laneEnds.findIndex((end) => end <= x - halfWidth)
    const laneIndex = lane < 0 ? laneEnds.length : lane
    laneEnds[laneIndex] = x + halfWidth
    return { ...marker, x, lane: laneIndex }
  })
}

function icingColor(g) {
  return ['rgba(0,0,0,0)', 'rgba(120,180,255,0.35)', 'rgba(120,120,255,0.5)', 'rgba(150,80,220,0.6)'][Math.max(0, Math.min(3, Math.round(g)))]
}
function ktgColor(ktg) {
  if (ktg == null || ktg < 0.3) return null
  if (ktg < 0.475) return 'rgba(100,210,100,0.40)'
  if (ktg < 0.75)  return 'rgba(255,195,0,0.55)'
  return 'rgba(255,55,55,0.65)'
}
function chainSegments(segs) {
  if (segs.length === 0) return []
  const key = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  const adj = new Map()
  segs.forEach((seg, i) => {
    const k0 = key(seg[0]); const k1 = key(seg[1])
    if (!adj.has(k0)) adj.set(k0, [])
    if (!adj.has(k1)) adj.set(k1, [])
    adj.get(k0).push([i, 0])
    adj.get(k1).push([i, 1])
  })
  const used = new Set()
  const chains = []
  for (let s = 0; s < segs.length; s++) {
    if (used.has(s)) continue
    const chain = [...segs[s]]
    used.add(s)
    for (let dir = 0; dir < 2; dir++) {
      let running = true
      while (running) {
        running = false
        const tip = dir === 0 ? chain[chain.length - 1] : chain[0]
        for (const [idx, end] of (adj.get(key(tip)) || [])) {
          if (used.has(idx)) continue
          const next = segs[idx][1 - end]
          if (dir === 0) chain.push(next); else chain.unshift(next)
          used.add(idx)
          running = true
          break
        }
      }
    }
    chains.push(chain)
  }
  return chains
}

function catmullRomPath(pts, maxPoints = 40) {
  if (pts.length < 2) return ''
  const n = Math.max(2, Math.min(maxPoints, pts.length))
  const sampled = pts.length <= n ? pts :
    Array.from({ length: n }, (_, i) => pts[Math.round(i * (pts.length - 1) / (n - 1))])
  if (sampled.length === 2) return `M ${sampled[0].x.toFixed(1)} ${sampled[0].y.toFixed(1)} L ${sampled[1].x.toFixed(1)} ${sampled[1].y.toFixed(1)}`
  const last = sampled[sampled.length - 1]
  const all = [
    { x: 2 * sampled[0].x - sampled[1].x, y: 2 * sampled[0].y - sampled[1].y },
    ...sampled,
    { x: 2 * last.x - sampled[sampled.length - 2].x, y: 2 * last.y - sampled[sampled.length - 2].y },
  ]
  const d = [`M ${sampled[0].x.toFixed(1)} ${sampled[0].y.toFixed(1)}`]
  for (let i = 1; i < all.length - 2; i++) {
    const [p0, p1, p2, p3] = [all[i - 1], all[i], all[i + 1], all[i + 2]]
    d.push(`C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)},${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)},${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`)
  }
  return d.join(' ')
}

// Same thresholds as map cloud layer (cloudPotentialField.js)
const SPREAD_COLOR_RAMP = [
  [0, 1, 'rgba(24,96,44,0.68)'],
  [1, 2, 'rgba(49,124,62,0.58)'],
  [2, 3, 'rgba(85,150,85,0.48)'],
  [3, 4, 'rgba(132,176,124,0.36)'],
  [4, 5, 'rgba(163,195,151,0.28)'],
  [5, 6, 'rgba(188,209,174,0.22)'],
]
function moistureColor(spread, maxSpread = 4) {
  if (!Number.isFinite(spread) || spread > maxSpread) return 'rgba(0,0,0,0)'
  const entry = SPREAD_COLOR_RAMP.find(([min, max]) => spread >= min && spread < max)
  return entry ? entry[2] : 'rgba(0,0,0,0)'
}

// Ray-casting point-in-polygon for GeoJSON polygon ring [[lon, lat], ...]
function pointInRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}
function pointInGeometry(lon, lat, geometry) {
  if (!geometry) return false
  if (geometry.type === 'Polygon') return pointInRing(lon, lat, geometry.coordinates[0])
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((poly) => pointInRing(lon, lat, poly[0]))
  return false
}

// 단면도 마커는 공간이 좁아 짧은 한글. (오버레이/브리핑은 phenomenonKo 전체명 사용)
const PHEN_LABEL = { SEV_TURB: '난기류', MOD_TURB: '난기류', SEV_ICE: '착빙', MOD_ICE: '착빙', TS: '뇌우', CB: '적란운', TC: '태풍' }
function phenLabel(code) {
  if (!code) return '?'
  return PHEN_LABEL[code] ?? code.split('_')[0].slice(0, 4)
}
const ADVISORY_COLORS = { sigmet: '#EF4444', airmet: '#F59E0B' }
function WindBarb({ cx, cy, u, v }) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null
  const kt = msToKt(Math.hypot(u, v))
  if (kt < 2.5) return <circle cx={cx} cy={cy} r={2} className="cs-wind-calm" />
  const { pennants, full, half } = windBarbFeathers(kt)
  const dir = windDirectionFromUV(u, v)
  const fromRad = (dir * Math.PI) / 180
  const size = 13
  const tx = cx + Math.sin(fromRad) * size
  const ty = cy - Math.cos(fromRad) * size
  const sdx = (tx - cx) / size
  const sdy = (ty - cy) / size
  const px = -sdy; const py = sdx
  const barbLen = size * 0.65
  const STEP = size * 0.28
  const lineParts = [`M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`]
  const polyParts = []
  let pos = 0
  for (let i = 0; i < pennants; i += 1) {
    const bx = tx - sdx * pos; const by = ty - sdy * pos
    const mx = bx - sdx * STEP; const my = by - sdy * STEP
    polyParts.push(`${bx.toFixed(1)},${by.toFixed(1)} ${(bx + px * barbLen).toFixed(1)},${(by + py * barbLen).toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`)
    pos += STEP * 1.2
  }
  for (let i = 0; i < full; i += 1) {
    const bx = tx - sdx * pos; const by = ty - sdy * pos
    lineParts.push(`M ${bx.toFixed(1)} ${by.toFixed(1)} L ${(bx + px * barbLen).toFixed(1)} ${(by + py * barbLen).toFixed(1)}`)
    pos += STEP
  }
  if (half > 0) {
    const bx = tx - sdx * pos; const by = ty - sdy * pos
    lineParts.push(`M ${bx.toFixed(1)} ${by.toFixed(1)} L ${(bx + px * barbLen * 0.5).toFixed(1)} ${(by + py * barbLen * 0.5).toFixed(1)}`)
  }
  return (
    <g>
      <path d={lineParts.join(' ')} className="cs-wind-barb" />
      {polyParts.map((pts, i) => <polygon key={i} points={pts} className="cs-wind-pennant" />)}
    </g>
  )
}

export default function VerticalProfileChart({
  profile,
  crossSection = null,
  layers = {},
  advisories = [],
  selectedCandidateAltitudeFt = null,
  candidateAltitudes = [],
  onSelectCandidateAltitude,
  enableDragScroll = false,
  hideMeta = false,
  metaTrailing = null,
  nwpTimeSelection = null,
  onSetWaypointNwpOffset = null,
  highlightRangeNm = null, // NAVLOG에서 가리킨 구간 {startNm, endNm, pinned}
}) {
  // 차트가 놓인 컨테이너(하단 바/패널) 실제 폭을 측정해 그 폭을 채운다.
  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [editingNwpSegment, setEditingNwpSegment] = useState(null)
  const [nwpMissingNoticeDismissed, setNwpMissingNoticeDismissed] = useState(false)
  const { tz } = useTimeZone()
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w) setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const samples = profile?.axis?.samples ?? []
  const terrainValues = profile?.terrain?.values ?? []
  const cruiseAltitudeFt = profile?.flightPlan?.plannedCruiseAltitudeFt
  const markers = profile?.markers ?? []
  const flightProfile = profile?.flightPlan?.profile ?? null
  const candidateProfiles = profile?.candidateProfiles ?? []
  const selectableAltitudes = [...new Set(candidateAltitudes.filter(Number.isFinite))].sort((a, b) => a - b)
  const selectedAltitudeIndex = selectableAltitudes.indexOf(selectedCandidateAltitudeFt)
  const previousAltitude = selectableAltitudes[selectedAltitudeIndex - 1]
  const nextAltitude = selectableAltitudes[selectedAltitudeIndex + 1]

  if (samples.length < 2) {
    return (
      <div className="vertical-profile-empty">
        {'\uc5f0\uc9c1\ub2e8\uba74\ub3c4 \uc0d8\ud50c\uc774 \ubd80\uc871\ud569\ub2c8\ub2e4.'}
      </div>
    )
  }

  const terrainByIndex = new Map(terrainValues.map((value) => [value.index, value.elevationM]))
  const terrainPoints = samples
    .map((sample) => ({
      distanceNm: sample.distanceNm,
      elevationFt: terrainByIndex.get(sample.index) == null ? null : terrainByIndex.get(sample.index) * M_TO_FT,
    }))
    .filter((point) => Number.isFinite(point.elevationFt))

  if (terrainPoints.length === 0) {
    return (
      <div className="vertical-profile-empty">
        {'\ud45c\uc2dc\ud560 \uc9c0\ud615\uace0\ub3c4 \uc0d8\ud50c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.'}
      </div>
    )
  }

  const height = 380
  const basePadding = { top: 26, right: 58, left: 80 }
  const maxDistance = Math.max(profile.axis.totalDistanceNm || 0, samples[samples.length - 1].distanceNm || 0.1)
  // 컨테이너 폭을 채우되 항로가 길면 전체 거리를 유지한다. 장거리 항로는 차트 안에서 가로 이동한다.
  const availWidth = Math.max(320, Math.round(containerWidth) || 960)
  const PX_PER_NM = 1.2
  const width = Math.max(availWidth, Math.round(basePadding.left + basePadding.right + maxDistance * PX_PER_NM))
  const scrollable = width > availWidth + 1
  const provisionalPlotWidth = width - basePadding.left - basePadding.right
  const provisionalX = (distanceNm) => basePadding.left + (distanceNm / maxDistance) * provisionalPlotWidth
  const visibleMarkers = markers
    .filter((marker) => Number.isFinite(marker.distanceNm) && marker.distanceNm >= 0 && marker.distanceNm <= maxDistance)
    .map((marker, index) => ({ ...marker, key: `${marker.label}-${index}` }))
  const markerLabels = assignMarkerLanes(visibleMarkers, provisionalX)
  const markerLaneCount = Math.max(1, ...markerLabels.map((marker) => marker.lane + 1))
  const railEnabled = Boolean(onSetWaypointNwpOffset && visibleMarkers.length > 1)
  // 시간선의 44px 클릭 영역과 기존 웨이포인트 이름 블록은 겹치면 안 된다.
  // 이름표는 클릭 영역이 끝나는 바로 다음 행에서 시작한다.
  const waypointLabelBandOffset = railEnabled ? 36 : 0
  const padding = { ...basePadding, bottom: 36 + markerLaneCount * 16 + (railEnabled ? 28 : 0) }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const terrainMaxFt = Math.max(...terrainPoints.map((point) => point.elevationFt), 0)
  const procedurePoints = (flightProfile?.points ?? [])
    .filter((point) => Number.isFinite(point.distanceNm) && Number.isFinite(point.altitudeFt))
  const candidateProfileLines = candidateProfiles
    .map((candidate) => ({
      altitudeFt: candidate?.plannedCruiseAltitudeFt,
      points: (candidate?.profile?.points ?? [])
        .filter((point) => Number.isFinite(point.distanceNm) && Number.isFinite(point.altitudeFt)),
    }))
    .filter((candidate) => candidate.points.length > 1)
  const allFlightProfiles = candidateProfileLines.length > 0
    ? candidateProfileLines
    : [{ altitudeFt: cruiseAltitudeFt, points: procedurePoints }]
  const profileCeilingFt = Math.max(
    terrainMaxFt,
    ...allFlightProfiles.flatMap((candidate) => candidate.points.map((point) => point.altitudeFt)),
    0,
  )
  const headroomFt = Number.isFinite(cruiseAltitudeFt) ? getAltitudeHeadroomFt(cruiseAltitudeFt) : 5000
  const yMax = Math.max(1000, Math.ceil((profileCeilingFt + headroomFt) / 1000) * 1000)
  const xFor = (distanceNm) => padding.left + (distanceNm / maxDistance) * plotWidth
  const nwpRail = railEnabled
    ? buildNwpTimeRail(visibleMarkers, nwpTimeSelection ?? { waypointOverrides: [] }).map((segment) => ({
      ...segment,
      startWaypointLabel: visibleMarkers.find((marker) => marker.id === segment.startWaypointId)?.label ?? segment.startWaypointId,
    }))
    : []
  const nwpBaseTimeLabel = formatBriefingTime(nwpTimeSelection?.baseTime ?? crossSection?.run?.validTime, tz)
  const yFor = (altitudeFt) => padding.top + plotHeight - (altitudeFt / yMax) * plotHeight
  const terrainSvgPoints = terrainPoints.map((point) => ({ x: xFor(point.distanceNm), y: yFor(point.elevationFt) }))
  const terrainLine = buildPath(terrainSvgPoints)
  const terrainArea = `${terrainLine} L ${xFor(terrainPoints[terrainPoints.length - 1].distanceNm).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(terrainPoints[0].distanceNm).toFixed(1)} ${yFor(0).toFixed(1)} Z`
  const selectedProfile = candidateProfiles.find((candidate) => candidate.plannedCruiseAltitudeFt === selectedCandidateAltitudeFt)
    ?? profile.flightPlan
  const selectedProcedure = selectedProfile?.profile ?? flightProfile
  const selectedCruiseAltitudeFt = selectedProfile?.plannedCruiseAltitudeFt ?? cruiseAltitudeFt
  const tod = selectedProcedure?.tod
  const todMarker = tod && Number.isFinite(tod.distanceNm) && tod.distanceNm >= 0 && tod.distanceNm <= maxDistance
    ? { ...tod, x: xFor(tod.distanceNm), y: yFor(selectedCruiseAltitudeFt) }
    : null
  const todOffsetText = todMarker && Number.isFinite(todMarker.distanceFromEnrouteEndNm)
    ? `TOD: ${todMarker.referenceFixLabel ?? 'ENROUTE'} ${formatNm(todMarker.distanceFromEnrouteEndNm)} ${todMarker.distanceFromEnrouteEndNm >= 0 ? '\uc804' : '\ud6c4'}`
    : null
  const climbGradient = selectedProcedure?.model?.climbGradientFtPerNm
  const descentGradient = selectedProcedure?.model?.descentGradientFtPerNm
  const todLabelY = todMarker ? Math.max(padding.top + 14, todMarker.y - 30) : 0
  const todArrowTopY = todMarker ? Math.max(todLabelY + 7, todMarker.y - 21) : 0
  const todArrowTipY = todMarker ? Math.min(todMarker.y - 7, todArrowTopY + 10) : 0
  // NAVLOG 구간 강조 — 양끝을 세로 점선으로 긋고 사이를 옅게 덮는다. 거리축이 같으므로
  // 표의 한 줄이 단면도의 어느 폭인지 바로 보인다. 축 밖으로 나가지 않게 잘라 준다.
  const legBand = (() => {
    const start = Number(highlightRangeNm?.startNm)
    const end = Number(highlightRangeNm?.endNm)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    const left = xFor(Math.max(0, Math.min(start, maxDistance)))
    const right = xFor(Math.max(0, Math.min(end, maxDistance)))
    if (!(right > left)) return null
    return { left, right, pinned: Boolean(highlightRangeNm.pinned) }
  })()
  const yTickInterval = yMax <= 10000 ? 2000 : yMax <= 20000 ? 3000 : yMax <= 40000 ? 5000 : 10000
  const yTicks = Array.from({ length: Math.floor(yMax / yTickInterval) + 1 }, (_, i) => i * yTickInterval)
    .filter(v => v <= yMax && (!Number.isFinite(selectedCruiseAltitudeFt) || Math.abs(v - selectedCruiseAltitudeFt) > yTickInterval * 0.4))
  const cruiseTick = Number.isFinite(selectedCruiseAltitudeFt) && selectedCruiseAltitudeFt > 0 && selectedCruiseAltitudeFt < yMax
    ? selectedCruiseAltitudeFt
    : null
  const csLevels = crossSection?.levels ?? []
  const ktgRuleSummary = [...new Set((crossSection?.timeRules?.segments ?? []).map((segment) => segment.ktg?.validTime).filter(Boolean))]
  const missingNwpWaypointIds = crossSection?.timeRules?.missingWaypointIds ?? []
  const unavailableNwpOffsets = crossSection?.timeRules?.unavailableOffsets
    ?? crossSection?.nwpTimeAvailability?.unavailableOffsets
    ?? []
  const cldCoverage = crossSection?.coverage?.byVariable?.cld
  const cldLevels = Number.isFinite(cldCoverage?.topPressure)
    ? csLevels.filter((level) => Number(level.pressure) >= Number(cldCoverage.topPressure)) : []
  const cloudContour = Number.isFinite(cldCoverage?.threshold)
    ? buildCloudContourModel(cldLevels, cldCoverage.threshold)
    : { status: 'unavailable', partial: false, threshold: null, chains: [] }
  const cloudPaths = layers.cloud ? cloudContour.chains.map((chain) => buildPath(chain.map((point) => ({ x: xFor(point.distanceNm), y: yFor(point.altFt) })))).filter(Boolean) : []
  const altFor = (lvl) => Number.isFinite(lvl.altFt) ? lvl.altFt : pressureToFallbackFt(lvl.pressure)
  const turbulenceCells = (() => {
    const turb = crossSection?.turbulence
    if (!turb?.available || !layers.turbulence || !turb.levels?.length) return []
    const cells = []
    for (const lvl of turb.levels) {
      const yTop = yFor(lvl.altFt + 500)
      const yBot = yFor(Math.max(0, lvl.altFt - 500))
      for (let vi = 0; vi < lvl.values.length - 1; vi++) {
        const color = ktgColor(lvl.values[vi].ktg)
        if (!color) continue
        cells.push({
          key: `turb-${lvl.altFt}-${vi}`,
          x: xFor(lvl.values[vi].distanceNm),
          y: yTop,
          w: xFor(lvl.values[vi + 1].distanceNm) - xFor(lvl.values[vi].distanceNm),
          h: yBot - yTop,
          fill: color,
        })
      }
    }
    return cells
  })()
  const shadingCells = (() => {
    if (!crossSection || (!layers.icing && !layers.moisture)) return []
    const cells = []
    for (let li = 0; li < csLevels.length - 1; li += 1) {
      const lvl = csLevels[li]
      const lvlNext = csLevels[li + 1]
      const yA = yFor(altFor(lvl))
      const yB = yFor(altFor(lvlNext))
      const yTop = Math.min(yA, yB)
      const yBot = Math.max(yA, yB)
      for (let vi = 0; vi < lvl.values.length - 1; vi += 1) {
        const v = lvl.values[vi]
        const vNext = lvl.values[vi + 1]
        const xLeft = xFor(v.distanceNm)
        const xRight = xFor(vNext.distanceNm)
        const maxSpread = lvl.pressure === 500 ? 6 : 4
        // 착빙을 켠 구간은 착빙만 칠한다. 착빙 값이 없는 면을 습수 색으로 메우면
        // 착빙 없음과 습윤이 같은 색으로 보여 단면을 오독하게 된다.
        const fill = layers.icing
          ? (v.icing != null ? icingColor(v.icing) : null)
          : layers.moisture && v.spread != null
            ? moistureColor(v.spread, maxSpread)
            : null
        if (fill && fill !== 'rgba(0,0,0,0)') {
          cells.push({ key: `${li}-${vi}`, x: xLeft, y: yTop, w: xRight - xLeft, h: yBot - yTop, fill })
        }
      }
    }
    return cells
  })()
  const tempIsotherms = (() => {
    if (!crossSection || csLevels.length < 2) return []
    const sampleCount = csLevels[0]?.values?.length ?? 0
    if (sampleCount < 2) return []
    const xs = csLevels[0].values.map((v) => xFor(v.distanceNm))
    const ys = csLevels.map((lvl) => yFor(altFor(lvl)))
    const values = csLevels.flatMap((lvl) => lvl.values.map((v) => v.t))
    const cells = { nx: sampleCount, ny: csLevels.length, values, xs, ys }
    const finiteTs = values.filter(Number.isFinite)
    if (finiteTs.length === 0) return []
    const minT = Math.min(...finiteTs)
    const maxT = Math.max(...finiteTs)
    const result = []
    for (let t = Math.ceil(minT / 10) * 10; t <= maxT; t += 10) {
      if (!layers.temp && t !== 0) continue
      result.push({ level: t, bold: t === 0, chains: chainSegments(isothermSegments(cells, t)) })
    }
    return result
  })()
  const isothermlabels = (() => {
    if (!crossSection) return []
    const seen = new Set()
    return tempIsotherms.flatMap(({ level, bold, chains }) => {
      const labels = []
      for (const chain of chains) {
        let bestX = -Infinity; let bestY = null
        for (const pt of chain) { if (pt.x > bestX) { bestX = pt.x; bestY = pt.y } }
        if (bestY === null || bestX < padding.left + plotWidth * 0.4) continue
        // Deduplicate labels at very close y positions (within 8px)
        const yKey = Math.round(bestY / 8)
        const key = `${level}-${yKey}`
        if (seen.has(key)) continue
        seen.add(key)
        labels.push({ level, y: bestY, bold })
      }
      return labels
    })
  })()

  function startDrag(event) {
    if (!enableDragScroll || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function drag(event) {
    const state = dragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = state.scrollLeft - (event.clientX - state.startX)
  }

  function endDrag(event) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }
  const windBarbs = (() => {
    if (!crossSection || !layers.wind || csLevels.length < 2) return []
    const MIN_PX = 13
    const BARB_PX_W = 32
    // Sort levels ascending by altitude, then thin out levels that are too close in pixel space
    const levelsByAlt = [...csLevels].sort((a, b) => altFor(a) - altFor(b))
    const kept = []
    let lastY = null
    for (const lvl of levelsByAlt) {
      const y = yFor(altFor(lvl))
      if (lastY === null || Math.abs(y - lastY) >= MIN_PX) {
        kept.push(lvl)
        lastY = y
      }
    }
    const sampleCount = kept[0]?.values?.length ?? 0
    const colStep = Math.max(1, Math.round(BARB_PX_W / (plotWidth / Math.max(sampleCount, 1))))
    const result = []
    for (const lvl of kept) {
      const cy = yFor(altFor(lvl))
      for (let vi = 0; vi < lvl.values.length; vi += colStep) {
        const v = lvl.values[vi]
        const cx = xFor(v.distanceNm)
        result.push({ key: `w-${lvl.pressure}-${vi}`, cx, cy, u: v.u, v: v.v })
      }
    }
    return result
  })()

  const advisoryBands = (() => {
    if (!layers.advisories || !advisories.length || samples.length < 2) return []
    const bands = []
    for (const item of advisories) {
      if (!item?.geometry) continue
      if (item.phenomenon_code === 'SFC_VIS') continue
      const kind = item.kind ?? 'sigmet'
      const alt = item.altitude ?? {}
      const lowerFt = alt.lower_fl != null ? alt.lower_fl * 100 : 0
      const upperFt = alt.upper_fl != null ? alt.upper_fl * 100 : (kind === 'airmet' ? 18000 : 45000)
      // Find contiguous runs of samples inside this advisory
      let runStart = null
      for (let i = 0; i <= samples.length; i++) {
        const inside = i < samples.length && pointInGeometry(samples[i].lon, samples[i].lat, item.geometry)
        if (inside && runStart === null) {
          runStart = i
        } else if (!inside && runStart !== null) {
          const sLeft = samples[runStart]
          const sRight = samples[i - 1]
          const xLeft = xFor(sLeft.distanceNm)
          const xRight = xFor(sRight.distanceNm)
          const clampedUpper = Math.min(upperFt, yMax)
          const clampedLower = Math.max(lowerFt, 0)
          if (clampedUpper > clampedLower && xRight > xLeft) {
            bands.push({
              key: `adv-${item.mapKey ?? item.id ?? bands.length}-${runStart}`,
              x: xLeft,
              y: yFor(clampedUpper),
              w: xRight - xLeft,
              h: yFor(clampedLower) - yFor(clampedUpper),
              label: phenLabel(item.phenomenon_code),
              code: item.phenomenon_code,
              kind,
              color: ADVISORY_COLORS[kind] ?? '#888',
            })
          }
          runStart = null
        }
      }
    }
    return bands
  })()

  return (
    <div className="vertical-profile-chart">
      {!hideMeta && <div className="vertical-profile-meta">
        <span className="vertical-profile-meta-item">
          <span>{'\uc9c0\ud615\uace0\ub3c4'}</span>
          <strong>{formatFt(terrainMaxFt)}</strong>
        </span>
        {!onSelectCandidateAltitude && <span className="vertical-profile-meta-item">
          <span>{'\uc120\ud0dd \uc21c\ud56d\uace0\ub3c4'}</span>
          <strong>{formatFt(selectedCruiseAltitudeFt)}</strong>
        </span>}
        {layers.cloud && crossSection && <span className="vertical-profile-meta-item cs-cloud-meta">
          <span>구름 윤곽</span>
          <strong>{cloudContour.status === 'detected'
            ? `KIM CLD ≥ ${cloudContour.threshold} 윤곽${cloudContour.partial ? ' · 일부 결측' : ''}`
            : cloudContour.status === 'not_detected'
              ? cloudContour.partial ? 'KIM CLD 일부 결측' : `KIM CLD ≥ ${cloudContour.threshold} 없음`
              : 'KIM CLD 자료 없음'}</strong>
        </span>}
        {ktgRuleSummary.length > 0 && <span className="vertical-profile-meta-item">
          <span>KTG 적용</span>
          <strong>{ktgRuleSummary.map((value) => formatBriefingTime(value, tz)).join(', ')}</strong>
        </span>}
        {todOffsetText && (
          <span className="vertical-profile-tod-summary">{todOffsetText}</span>
        )}
        {Number.isFinite(climbGradient) && Number.isFinite(descentGradient) && (
          <details className="vertical-profile-model-info">
            <summary aria-label="\uace0\ub3c4 \ud504\ub85c\ud30c\uc77c \uacc4\uc0b0 \uae30\uc900">i</summary>
            <div>
              <strong>{'\uacc4\uc0b0 \uae30\uc900'}</strong>
              <span>{`\uc0c1\uc2b9 ${climbGradient} ft/NM, \ud558\uac15 ${descentGradient} ft/NM \uae30\uc900\uc758 \ub2e8\uc21c \uc120\ud615 \ud504\ub85c\ud30c\uc77c\uc785\ub2c8\ub2e4.`}</span>
              <span>{'SID \uc0c1\ud55c\uace0\ub3c4\ub294 \ucd94\uac00 \uc0c1\uc2b9\uc744 \uc81c\ud55c\ud558\uace0, STAR/IAP \ud558\ud55c\uace0\ub3c4\ub294 \ucd94\uac00 \ud558\uac15\uc744 \uc81c\ud55c\ud569\ub2c8\ub2e4.'}</span>
              <span>{'\uc2e4\uc81c \ud56d\uacf5\uae30 \uc131\ub2a5, \uc911\ub7c9, ATC \uc9c0\uc2dc, \uae30\uc0c1\uc740 \ubc18\uc601\ud558\uc9c0 \uc54a\uc740 \uae30\uc220\uc2e4\uc99d\uc6a9 \uacc4\ud68d\uc120\uc785\ub2c8\ub2e4.'}</span>
            </div>
          </details>
        )}
        {onSelectCandidateAltitude && selectableAltitudes.length > 1 && (
          <span className="vertical-profile-altitude-nav" aria-label="비교 고도 선택">
            <button type="button" onClick={() => onSelectCandidateAltitude(previousAltitude)} disabled={!Number.isFinite(previousAltitude)} aria-label="이전 비교 고도">‹</button>
            <strong>{formatFlightLevel(selectedCandidateAltitudeFt)}</strong>
            <button type="button" onClick={() => onSelectCandidateAltitude(nextAltitude)} disabled={!Number.isFinite(nextAltitude)} aria-label="다음 비교 고도">›</button>
          </span>
        )}
        {metaTrailing}
      </div>}
      <div className="vertical-profile-chart-body" ref={containerRef}>
      <div className="vertical-profile-plot-scroll" onPointerDown={startDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <svg
        className="vertical-profile-plot-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{ width: `${width}px`, height: `${height}px`, maxWidth: 'none' }}
        role="img"
        aria-label="Vertical profile"
      >
        <defs>
          <clipPath id="cs-clip">
            <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
          </clipPath>
          <filter id="cs-blur" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <rect className="vertical-profile-plot" x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
        <g clipPath="url(#cs-clip)">
          {turbulenceCells.map((cell) => (
            <rect key={cell.key} x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={cell.fill} />
          ))}
          <g filter={layers.moisture && shadingCells.length > 0 ? 'url(#cs-blur)' : undefined}>
            {shadingCells.map((cell) => (
              <rect key={cell.key} x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={cell.fill} />
            ))}
          </g>
          {tempIsotherms.flatMap(({ level, bold, chains }) =>
            chains.map((pts, ci) => (
              <path key={`t${level}-${ci}`} d={catmullRomPath(pts)} className={bold ? 'cs-isotherm cs-isotherm-zero' : 'cs-isotherm'} />
            ))
          )}
          {layers.cloud && cloudPaths.length > 0 && <g data-testid="kim-cloud-contours" aria-label="KIM CLD 구름 윤곽">
            {cloudPaths.map((path, index) => <path key={`cld-${index}`} d={path} className="cs-cloud-contour" fill="none"><title>{`KIM CLD ${cloudContour.threshold} 구름 윤곽`}</title></path>)}
          </g>}
          {windBarbs.map((wb) => <WindBarb key={wb.key} cx={wb.cx} cy={wb.cy} u={wb.u} v={wb.v} />)}
          {advisoryBands.map((band) => (
            <rect
              key={band.key}
              x={band.x} y={band.y} width={band.w} height={band.h}
              fill="none"
              stroke={band.color}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.85}
            />
          ))}
        </g>
        {isothermlabels.map(({ level, y, bold }) => (
          <text
            key={`tl-${level}-${y.toFixed(0)}`}
            x={padding.left + plotWidth + 4}
            y={y}
            className={`cs-isotherm-label${bold ? ' cs-isotherm-label-zero' : ''}`}
          >
            {level}°
          </text>
        ))}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line className="vertical-profile-grid" x1={padding.left} x2={padding.left + plotWidth} y1={yFor(tick)} y2={yFor(tick)} />
            <text className="vertical-profile-axis-label" x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end">{Math.round(tick)}</text>
          </g>
        ))}
        {cruiseTick != null && (
          <g>
            <line className="vertical-profile-cruise-tick" x1={padding.left - 6} x2={padding.left} y1={yFor(cruiseTick)} y2={yFor(cruiseTick)} />
            <text className="vertical-profile-cruise-axis-label" x={padding.left - 8} y={yFor(cruiseTick) + 4} textAnchor="end">
              {formatFt(cruiseTick)}
            </text>
          </g>
        )}
        {markerLabels.map((marker) => (
          <line
            key={`${marker.key}-connector`}
            className="vertical-profile-marker-tick"
            x1={marker.x}
            x2={marker.x}
            y1={padding.top + plotHeight}
            y2={padding.top + plotHeight + waypointLabelBandOffset + 6 + marker.lane * 10}
          />
        ))}
        {nwpRail.length > 0 && <g className="vertical-profile-nwp-rail" aria-label="NWP 시간 규칙">
          {nwpRail.map((segment) => {
            const x1 = xFor(segment.startDistanceNm)
            const x2 = xFor(segment.endDistanceNm)
            const y = padding.top + plotHeight + 13
            return <g key={segment.startWaypointId}>
              <line className={`vertical-profile-nwp-rail-line is-offset-${segment.offsetHours}`} x1={x1} x2={x2} y1={y} y2={y} />
              <rect x={x1} y={y - 22} width={Math.max(1, x2 - x1)} height={44} fill="transparent" role="button" tabIndex={0}
                aria-label={`${segment.startWaypointLabel}부터 NWP 시간 설정`}
                onClick={(event) => { event.stopPropagation(); setEditingNwpSegment(segment) }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditingNwpSegment(segment) } }} />
              <circle cx={x1} cy={y} r={4} className="vertical-profile-nwp-rail-point" />
              {segment.showLabel && <text x={x1 + 4} y={y - 5} className="vertical-profile-nwp-rail-label" pointerEvents="none">{segment.offsetHours === 0 ? `기준 ${nwpBaseTimeLabel}` : `+${segment.offsetHours}h`}</text>}
            </g>
          })}
        </g>}
        {markerLabels.map((marker, index) => (
          <g key={marker.key}>
            <text
              className="vertical-profile-marker-label"
              pointerEvents="none"
              x={marker.x}
              y={padding.top + plotHeight + waypointLabelBandOffset + 18 + marker.lane * 16}
              textAnchor={index === 0 ? 'end' : index === markerLabels.length - 1 ? 'start' : 'middle'}
            >
              {fitMarkerLabel(marker.label)}
            </text>
          </g>
        ))}
        <path className="vertical-profile-terrain-area" d={terrainArea} />
        <path className="vertical-profile-terrain-line" d={terrainLine} />
        {allFlightProfiles.map((candidate) => {
          const selected = candidate.altitudeFt === selectedCandidateAltitudeFt
          const line = buildPath(candidate.points.map((point) => ({ x: xFor(point.distanceNm), y: yFor(point.altitudeFt) })))
          return line ? (
            <path
              key={candidate.altitudeFt}
              className={`vertical-profile-procedure-line${allFlightProfiles.length > 1 ? ' is-candidate' : ''}${selected ? ' is-selected' : ''}`}
              d={line}
            />
          ) : null
        })}
        {legBand && (
          <g className={`vertical-profile-leg-band${legBand.pinned ? ' is-pinned' : ''}`} aria-hidden="true">
            <rect x={legBand.left} y={padding.top} width={legBand.right - legBand.left} height={plotHeight} />
            <line x1={legBand.left} x2={legBand.left} y1={padding.top} y2={padding.top + plotHeight} />
            <line x1={legBand.right} x2={legBand.right} y1={padding.top} y2={padding.top + plotHeight} />
          </g>
        )}
        {todMarker && (
          <g>
            <text
              className="vertical-profile-tod-label"
              x={todMarker.x}
              y={todLabelY}
              textAnchor="middle"
            >
              TOD
            </text>
            <path
              className="vertical-profile-tod-arrow"
              d={`M ${todMarker.x.toFixed(1)} ${todArrowTopY.toFixed(1)} L ${todMarker.x.toFixed(1)} ${todArrowTipY.toFixed(1)} M ${(todMarker.x - 4).toFixed(1)} ${(todArrowTipY - 4).toFixed(1)} L ${todMarker.x.toFixed(1)} ${todArrowTipY.toFixed(1)} L ${(todMarker.x + 4).toFixed(1)} ${(todArrowTipY - 4).toFixed(1)}`}
            />
          </g>
        )}
        {/* SIGMET/AIRMET 기호 — 맨 앞(다른 요소 위)에 평면도와 같은 아이콘으로, 2배 크기. */}
        {advisoryBands.map((band) => {
          const url = advisorySymbolUrl(band.kind, band.code)
          const cx = band.x + band.w / 2
          const cy = band.y + band.h / 2
          return url ? (
            <image
              key={`sym-${band.key}`}
              href={url}
              x={cx - ADVISORY_ICON_PX / 2}
              y={cy - ADVISORY_ICON_PX / 2}
              width={ADVISORY_ICON_PX}
              height={ADVISORY_ICON_PX}
              preserveAspectRatio="xMidYMid meet"
            />
          ) : (
            <text key={`sym-${band.key}`} x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fontWeight="bold" fill={band.color}>
              {band.label}
            </text>
          )
        })}
      </svg>
      </div>
      {missingNwpWaypointIds.length > 0 && !nwpMissingNoticeDismissed && <div className="vertical-profile-nwp-missing-notice" role="alert">
        <span>{'\uc800\uc7a5\ub41c NWP \uc2dc\uac04 \uc124\uc815 \uc911 \ud604\uc7ac \uacbd\ub85c\uc5d0 \uc5c6\ub294 \uc6e8\uc774\ud3ec\uc778\ud2b8 \uc124\uc815\uc740 \uc801\uc6a9\ud558\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.'}</span>
        <button type="button" onClick={() => setNwpMissingNoticeDismissed(true)} aria-label="NWP 시간 설정 경고 닫기">{'\ub2eb\uae30'}</button>
      </div>}
      {editingNwpSegment && <div className="vertical-profile-nwp-popover" role="dialog" aria-label={`${editingNwpSegment.startWaypointLabel}부터 NWP 시간 설정`}>
        <strong>{editingNwpSegment.startWaypointLabel}부터 적용</strong>
        <div>{Array.from({ length: 13 }, (_, offsetHours) => <button key={offsetHours} type="button"
          disabled={unavailableNwpOffsets.includes(offsetHours)}
          title={unavailableNwpOffsets.includes(offsetHours) ? '수집된 NWP 시간 범위 밖' : undefined}
          onClick={() => { onSetWaypointNwpOffset(editingNwpSegment.startWaypointId, offsetHours === 0 ? null : offsetHours); setEditingNwpSegment(null) }}>{offsetHours === 0 ? '기준' : `+${offsetHours}h`}</button>)}</div>
        <button type="button" onClick={() => setEditingNwpSegment(null)}>닫기</button>
      </div>}
      {railEnabled && <p className="vertical-profile-nwp-hint">{'\uc544\ub798 \ud0c0\uc784\ub77c\uc778\uc758 \uad6c\uac04\uc744 \ub20c\ub7ec \ud574\ub2f9 \uc9c0\uc810\ubd80\ud130 NWP \uc2dc\uac04\ub300\ub97c \ubcc0\uacbd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.'}</p>}
      {scrollable && (
        <svg
          className="vertical-profile-axis-overlay"
          viewBox={`0 0 ${padding.left} ${height}`}
          style={{ width: `${padding.left}px`, height: `${height}px` }}
          aria-hidden="true"
        >
          <rect className="vertical-profile-axis-overlay-bg" x="0" y="0" width={padding.left} height={height} />
          {yTicks.map((tick) => (
            <text key={`oy-${tick}`} className="vertical-profile-axis-label" x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end">{Math.round(tick)}</text>
          ))}
          {cruiseTick != null && (
            <text className="vertical-profile-cruise-axis-label" x={padding.left - 8} y={yFor(cruiseTick) + 4} textAnchor="end">{formatFt(cruiseTick)}</text>
          )}
        </svg>
      )}
      </div>
    </div>
  )
}
