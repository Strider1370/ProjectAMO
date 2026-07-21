import area from '@turf/area'
import polylabel from 'polylabel'
import { phenomenonKo } from '../../../shared/weather/phenomenonKo.js'

export const ADVISORY_LAYER_DEFS = {
  sigmet: {
    sourceId: 'kma-sigmet-advisories',
    fillLayerId: 'kma-sigmet-advisories-fill',
    lineLayerId: 'kma-sigmet-advisories-line',
    iconLayerId: 'kma-sigmet-advisories-icon',
    arrowLayerId: 'kma-sigmet-advisories-arrow',
    textLayerId: 'kma-sigmet-advisories-text',
    color: '#dc2626',
    label: 'SIGMET',
  },
  // 해외(NOAA) SIGMET — 국내와 별도 소스/레이어라 독립 토글. 렌더는 SIGMET과 동일(빨강 실선).
  sigmet_intl: {
    sourceId: 'noaa-sigmet-advisories',
    fillLayerId: 'noaa-sigmet-advisories-fill',
    lineLayerId: 'noaa-sigmet-advisories-line',
    iconLayerId: 'noaa-sigmet-advisories-icon',
    arrowLayerId: 'noaa-sigmet-advisories-arrow',
    textLayerId: 'noaa-sigmet-advisories-text',
    color: '#dc2626',
    label: 'SIGMET(해외)',
  },
  airmet: {
    sourceId: 'kma-airmet-advisories',
    fillLayerId: 'kma-airmet-advisories-fill',
    lineLayerId: 'kma-airmet-advisories-line',
    iconLayerId: 'kma-airmet-advisories-icon',
    arrowLayerId: 'kma-airmet-advisories-arrow',
    textLayerId: 'kma-airmet-advisories-text',
    color: '#f59e0b',
    label: 'AIRMET',
  },
}

export const MOTION_ARROW_ICON_ID = 'advisory-motion-arrow'

// airportStationImages.js의 캔버스 아이콘 패턴과 동일 — 회전은 icon-rotate로 런타임에 적용하니
// 방향별 이미지를 미리 만들 필요 없이 위(0도, 북쪽)를 가리키는 화살표 하나만 등록하면 된다.
function createMotionArrowImage() {
  const size = 28
  const pixelRatio = Math.max(1, Math.round(window.devicePixelRatio || 1))
  const canvas = document.createElement('canvas')
  canvas.width = size * pixelRatio
  canvas.height = size * pixelRatio
  const context = canvas.getContext('2d', { alpha: true })
  context.scale(pixelRatio, pixelRatio)
  context.translate(size / 2, size / 2)
  context.strokeStyle = '#0f172a'
  context.lineWidth = 2
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(0, 12)
  context.lineTo(0, -12)
  context.moveTo(-5, -6)
  context.lineTo(0, -12)
  context.lineTo(5, -6)
  context.stroke()
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  return { data, width, height, pixelRatio }
}

export function ensureMotionArrowImage(map) {
  if (map.hasImage(MOTION_ARROW_ICON_ID) || typeof document === 'undefined') return
  const image = createMotionArrowImage()
  map.addImage(MOTION_ARROW_ICON_ID, image, { pixelRatio: image.pixelRatio })
}

export function advisorySymbolUrl(kind, phenomenonCode) {
  const code = String(phenomenonCode || '').trim().toUpperCase()
  if (!code) return null
  const folder = kind.startsWith('sigmet') ? 'icon_SIGMET' : 'icon_AIRMET'
  const file = `${code}.png`
  return `/Symbols/Reference%20Symbols/${folder}/${encodeURIComponent(file)}`
}

// SIGMET/AIRMET 참조기호 PNG 원본 크기가 파일마다 제각각(21x12 ~ 243x48)이라 그대로 쓰면
// 아이콘마다 화면에 보이는 크기가 들쭉날쭉하다 — 고정 캔버스에 종횡비 유지한 채(contain)
// 다시 그려서 등록하면 전부 같은 시각적 크기로 통일된다.
const PHENOMENON_ICON_SIZE = 40

function ensureMapImage(map, id, url) {
  if (!id || !url || map.hasImage(id)) return
  map.loadImage(url, (error, image) => {
    if (error || !image || map.hasImage(id)) return
    if (typeof document === 'undefined') { map.addImage(id, image); return }

    const canvas = document.createElement('canvas')
    canvas.width = PHENOMENON_ICON_SIZE
    canvas.height = PHENOMENON_ICON_SIZE
    const context = canvas.getContext('2d', { alpha: true })
    const scale = Math.min(PHENOMENON_ICON_SIZE / image.width, PHENOMENON_ICON_SIZE / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    context.drawImage(
      image,
      (PHENOMENON_ICON_SIZE - drawWidth) / 2,
      (PHENOMENON_ICON_SIZE - drawHeight) / 2,
      drawWidth,
      drawHeight,
    )
    map.addImage(id, context.getImageData(0, 0, PHENOMENON_ICON_SIZE, PHENOMENON_ICON_SIZE))
  })
}

function formatAltitude(item) {
  const altitude = item?.altitude

  if (!altitude) {
    return ''
  }

  const lower = altitude.lower_fl ? `FL${altitude.lower_fl}` : ''
  const upper = altitude.upper_fl ? `FL${altitude.upper_fl}` : ''

  if (lower && upper) {
    return `${lower}-${upper}`
  }

  return upper || lower
}

function formatMotion(item) {
  const motion = item?.motion

  if (!motion || !Number.isFinite(motion.speed_kt) || motion.speed_kt <= 0) {
    return ''
  }

  return Number.isFinite(motion.direction_deg)
    ? `${Math.round(motion.direction_deg)}deg ${Math.round(motion.speed_kt)}KT`
    : `${Math.round(motion.speed_kt)}KT`
}

// 표준 SIGMET 차트 표기("TOP FL350", 상한만 있을 때) — formatAltitude(팝업용, "FL240-FL350")와는 별도.
function formatAltitudeChart(item) {
  const lower = item?.altitude?.lower_fl
  const upper = item?.altitude?.upper_fl
  if (Number.isFinite(upper) && !Number.isFinite(lower)) return `TOP FL ${upper}`
  if (Number.isFinite(lower) && Number.isFinite(upper)) return `FL ${lower}-${upper}`
  if (Number.isFinite(lower)) return `FL ${lower}+`
  return ''
}

function formatSpeedChart(item) {
  const speed = item?.motion?.speed_kt
  return Number.isFinite(speed) && speed > 0 ? `${Math.round(speed)}KT` : ''
}

// 고도·이동속도가 없는 지상시정(SFC_VIS) 계열은 이게 본론 — "VIS 5000M RA/FG/BR" 식으로.
function formatVisibilityChart(item) {
  const vis = item?.surface_visibility_m
  if (!Number.isFinite(vis)) return ''
  const causes = (item?.surface_visibility_causes || []).join('/')
  return `VIS ${vis}M${causes ? ` ${causes}` : ''}`
}

// 백엔드가 소스마다 스펠링이 제각각(NO_CHANGE/INTENSIFY/INTENSIFYING/NC/INTSF...) —
// 정확히 일치하는 값만 잡으면 놓치는 게 생겨서 접두어로 느슨하게 매칭.
function formatIntensityChart(item) {
  const raw = String(item?.intensity_change || '').toUpperCase()
  if (!raw) return ''
  if (raw === 'NC' || raw.startsWith('NO_CHANGE') || raw.startsWith('NOCHANGE')) return 'NC'
  if (raw.startsWith('INTSF') || raw.startsWith('INTENSIF')) return 'INTSF'
  if (raw.startsWith('WKN') || raw.startsWith('WEAK')) return 'WKN'
  return raw
}

// 지도 라벨은 공간이 좁아 한글명만(코드 생략). 없으면 영문 라벨→코드.
function formatLabel(item, kind) {
  const base = kind.startsWith('sigmet') ? 'SIGMET' : 'AIRMET'
  const phenomenon = phenomenonKo(item?.phenomenon_code)
    || item?.phenomenon_label || item?.phenomenon_code || ''
  const sequence = item?.sequence_number ? ` ${item.sequence_number}` : ''
  return `${base}${sequence}${phenomenon ? ` ${phenomenon}` : ''}`
}

// ponytail: weatherOverlayModel.formatSigwxStamp와 동일한 분단위 포맷. 순환참조 피하려 로컬.
function fmtMinute(iso, tz = 'KST') {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms + (tz === 'KST' ? 9 * 3600000 : 0))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${tz}`
}

function formatDescription(item, kind, tz = 'KST') {
  const parts = [
    formatLabel(item, kind),
    item?.valid_from && item?.valid_to ? `${fmtMinute(item.valid_from, tz)} ~ ${fmtMinute(item.valid_to, tz)}` : '',
    formatAltitude(item),
    formatMotion(item),
  ].filter(Boolean)

  return parts.join('\n')
}

// bbox/vertex-average 중심, turf point-on-feature(경계 스냅) 전부 대각선으로 길쭉한
// SIGMET 구역에서 도형 가장자리에 걸침 — polylabel(pole of inaccessibility, mapbox가
// 라벨 배치용으로 만든 알고리즘)은 도형 안에서 가장자리로부터 가장 먼 점을 찾아 진짜 "안쪽 중앙"을 보장한다.
function largestPolygonRing(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates
  if (geometry?.type !== 'MultiPolygon' || !geometry.coordinates?.length) return null
  return geometry.coordinates.reduce((largest, coords) => (
    area({ type: 'Polygon', coordinates: coords }) > area({ type: 'Polygon', coordinates: largest })
      ? coords
      : largest
  ))
}

function geometryCenter(geometry) {
  const rings = largestPolygonRing(geometry)
  if (!rings?.length) {
    return null
  }

  try {
    const [lon, lat] = polylabel(rings, 0.001)
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
  } catch {
    return null
  }
}

export function advisoryItemsToFeatureCollection(payload, kind, tz = 'KST') {
  const items = Array.isArray(payload?.items) ? payload.items : []

  return {
    type: 'FeatureCollection',
    features: items
      .filter((item) => item?.geometry?.type && item?.geometry?.coordinates)
      .map((item, index) => ({
        type: 'Feature',
        id: item.id || `${kind}-${index}`,
        properties: {
          id: item.id || `${kind}-${index}`,
          kind,
          label: formatLabel(item, kind),
          phenomenon: item.phenomenon_code || '',
          phenomenonLabel: item.phenomenon_label || '',
          sequence: item.sequence_number || '',
          validFrom: item.valid_from || '',
          validTo: item.valid_to || '',
          altitude: formatAltitude(item),
          motion: formatMotion(item),
          description: formatDescription(item, kind, tz),
        },
        geometry: item.geometry,
      })),
  }
}

export function advisoryItemsToLabelFeatureCollection(payload, kind, tz = 'KST') {
  const items = Array.isArray(payload?.items) ? payload.items : []

  return {
    type: 'FeatureCollection',
    features: items
      .map((item, index) => {
        const center = geometryCenter(item.geometry)

        if (!center) {
          return null
        }

        return {
          type: 'Feature',
          id: item.id || `${kind}-label-${index}`,
          properties: {
            id: item.id || `${kind}-${index}`,
          kind,
          label: formatLabel(item, kind),
          iconKey: item.phenomenon_code ? `${kind}-${item.phenomenon_code}` : '',
          iconUrl: advisorySymbolUrl(kind, item.phenomenon_code) || '',
          description: formatDescription(item, kind, tz),
          chartLine1: [formatAltitudeChart(item), formatSpeedChart(item)].filter(Boolean).join('   ') || formatVisibilityChart(item),
          chartLine2: formatIntensityChart(item),
          motionDirection: Number.isFinite(item?.motion?.direction_deg) ? item.motion.direction_deg : null,
        },
          geometry: {
            type: 'Point',
            coordinates: center,
          },
        }
      })
      .filter(Boolean),
  }
}

// 아이콘·화살표·텍스트는 전부 같은 지점(anchor)에서 그려지므로, 이 지점 자체를 화면
// 픽셀 기준으로 밀어내면 세트 전체(아이콘+화살표+글자)가 한 덩어리로 같이 벌어진다.
// SIGMET(국내/해외)·AIRMET처럼 서로 다른 소스라도 화면에서 겹치면 같이 밀어내야 해서,
// 세 종류를 한 번에 모아 계산한다. 지도를 움직이면(zoom/pan) 화면상 겹침이 달라지므로
// 매번 다시 계산해야 한다 — 원본(raw, 실제 지리좌표) 데이터는 그대로 두고 화면에 낼 좌표만 조정.
const LABEL_MIN_SEPARATION_PX = 100
const LABEL_COLLISION_PASSES = 6

export function resolveAdvisoryLabelCollisions(map, groups) {
  if (!map || typeof map.project !== 'function' || typeof map.unproject !== 'function') {
    return groups
  }

  const points = []
  groups.forEach((group, groupIndex) => {
    group.labelData.features.forEach((feature, featureIndex) => {
      const projected = map.project(feature.geometry.coordinates)
      points.push({ groupIndex, featureIndex, x: projected.x, y: projected.y })
    })
  })

  for (let pass = 0; pass < LABEL_COLLISION_PASSES; pass += 1) {
    let moved = false
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]
        const b = points[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        if (dist >= LABEL_MIN_SEPARATION_PX) continue
        if (dist < 0.01) { dx = 1; dy = 0; dist = 1 } // 완전히 같은 지점 — 임의 방향으로 갈라놓기
        const push = (LABEL_MIN_SEPARATION_PX - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
        moved = true
      }
    }
    if (!moved) break
  }

  const byKey = new Map(points.map((p) => [`${p.groupIndex}:${p.featureIndex}`, p]))

  return groups.map((group, groupIndex) => ({
    kind: group.kind,
    labelData: {
      type: 'FeatureCollection',
      features: group.labelData.features.map((feature, featureIndex) => {
        const point = byKey.get(`${groupIndex}:${featureIndex}`)
        if (!point) return feature
        const { lng, lat } = map.unproject([point.x, point.y])
        return { ...feature, geometry: { ...feature.geometry, coordinates: [lng, lat] } }
      }),
    },
  }))
}

export function addAdvisoryLayers(map, kind, featureData, labelData) {
  const def = ADVISORY_LAYER_DEFS[kind]

  if (!def) {
    return
  }

  if (!map.getSource(def.sourceId)) {
    map.addSource(def.sourceId, {
      type: 'geojson',
      data: featureData,
    })
  }

  const labelSourceId = `${def.sourceId}-labels`

  if (!map.getSource(labelSourceId)) {
    map.addSource(labelSourceId, {
      type: 'geojson',
      data: labelData,
    })
  }

  if (!map.getLayer(def.fillLayerId)) {
    map.addLayer({
      id: def.fillLayerId,
      type: 'fill',
      source: def.sourceId,
      slot: 'top',
      paint: {
        'fill-color': def.color,
        'fill-opacity': kind.startsWith('sigmet') ? 0.16 : 0.12,
      },
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
    })
  }

  if (!map.getLayer(def.lineLayerId)) {
    map.addLayer({
      id: def.lineLayerId,
      type: 'line',
      source: def.sourceId,
      slot: 'top',
      paint: {
        'line-color': def.color,
        'line-opacity': 0.9,
        'line-width': kind.startsWith('sigmet') ? 2.4 : 2,
        'line-dasharray': kind.startsWith('sigmet') ? [1, 0] : [2, 1.5],
      },
    })
  }

  labelData.features.forEach((feature) => {
    ensureMapImage(map, feature.properties?.iconKey, feature.properties?.iconUrl)
  })
  ensureMotionArrowImage(map)

  if (!map.getLayer(def.iconLayerId)) {
    map.addLayer({
      id: def.iconLayerId,
      type: 'symbol',
      source: labelSourceId,
      slot: 'top',
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': 1.0,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-offset': [0, -22],
      },
      filter: ['!=', ['get', 'iconKey'], ''],
    })
  }

  // 이동방향 화살표 — 아이콘 옆에, 실제 나침반 방위로 회전.
  if (!map.getLayer(def.arrowLayerId)) {
    map.addLayer({
      id: def.arrowLayerId,
      type: 'symbol',
      source: labelSourceId,
      slot: 'top',
      layout: {
        'icon-image': MOTION_ARROW_ICON_ID,
        'icon-size': 1.6,
        'icon-rotate': ['get', 'motionDirection'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      // icon-offset은 icon-rotate와 같이 회전해버려서 방향에 따라 텍스트 쪽으로 튐 —
      // icon-translate(paint)는 회전과 무관한 화면 기준 고정 이동이라 위치가 안정적.
      paint: {
        'icon-translate': [42, -26],
      },
      filter: ['!=', ['get', 'motionDirection'], null],
    })
  }

  // 고도/속도 한 줄 + 강화·약화 추세 한 줄 — 표준 SIGMET 차트 표기.
  if (!map.getLayer(def.textLayerId)) {
    map.addLayer({
      id: def.textLayerId,
      type: 'symbol',
      source: labelSourceId,
      slot: 'top',
      layout: {
        'text-field': [
          'case',
          ['==', ['get', 'chartLine1'], ''],
          ['get', 'chartLine2'],
          ['==', ['get', 'chartLine2'], ''],
          ['get', 'chartLine1'],
          ['concat', ['get', 'chartLine1'], '\n', ['get', 'chartLine2']],
        ],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 12,
        'text-anchor': 'top-left',
        'text-offset': [-1.4, 0.6],
        'text-justify': 'left',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#1d4ed8',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
      // 고도/속도/시정 줄, 강화·약화 추세 줄 — 둘 중 하나라도 있으면 표시.
      filter: ['any', ['!=', ['get', 'chartLine1'], ''], ['!=', ['get', 'chartLine2'], '']],
    })
  }

  // 공항 기호·이름 레이어 위로 올려 가려지지 않게(데이터 갱신마다 최상단 재확정).
  for (const layerId of [def.iconLayerId, def.arrowLayerId, def.textLayerId]) {
    if (map.getLayer(layerId) && typeof map.moveLayer === 'function') map.moveLayer(layerId)
  }
}

export function updateAdvisoryLayerData(map, kind, featureData, labelData) {
  const def = ADVISORY_LAYER_DEFS[kind]

  if (!def) {
    return
  }

  addAdvisoryLayers(map, kind, featureData, labelData)
  map.getSource(def.sourceId)?.setData(featureData)
  map.getSource(`${def.sourceId}-labels`)?.setData(labelData)
}

export function setAdvisoryVisibility(map, kind, isVisible) {
  const def = ADVISORY_LAYER_DEFS[kind]

  if (!def) {
    return
  }

  const visibility = isVisible ? 'visible' : 'none'

  for (const layerId of [def.fillLayerId, def.lineLayerId, def.iconLayerId, def.arrowLayerId, def.textLayerId]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visibility)
    }
  }
}
