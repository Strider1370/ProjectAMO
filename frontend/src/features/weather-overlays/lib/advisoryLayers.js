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

export function advisorySymbolUrl(kind, phenomenonCode) {
  const code = String(phenomenonCode || '').trim().toUpperCase()
  if (!code) return null
  const folder = kind.startsWith('sigmet') ? 'icon_SIGMET' : 'icon_AIRMET'
  // FRQ는 뇌우의 발생 빈도 수식어이며 별도 ICAO 기호 파일이 없다.
  const symbolCode = code === 'FRQ_TS' ? 'TS' : code
  return `/Symbols/Reference%20Symbols/${folder}/${encodeURIComponent(`${symbolCode}.png`)}`
}
const PHENOMENON_ICON_SIZE = 40
const ADVISORY_MARKER_WIDTH = 176
const ADVISORY_MARKER_HEIGHT = 52
const ADVISORY_ICON_CENTER_X = ADVISORY_MARKER_WIDTH / 2

function ensureAdvisoryMarkerImage(map, feature) {
  const props = feature.properties || {}
  const direction = Number.isFinite(props.motionDirection) ? props.motionDirection : null
  const speed = props.motionLabel || ''
  const markerKey = `${props.iconKey || 'advisory'}-${direction ?? 'none'}-${speed || 'none'}`
  props.markerKey = markerKey
  if (!props.iconUrl || map.hasImage(markerKey)) return

  map.loadImage(props.iconUrl, (error, image) => {
    if (error || !image || map.hasImage(markerKey) || typeof document === 'undefined') return

    const canvas = document.createElement('canvas')
    canvas.width = ADVISORY_MARKER_WIDTH
    canvas.height = ADVISORY_MARKER_HEIGHT
    const context = canvas.getContext('2d', { alpha: true })
    const scale = Math.min(PHENOMENON_ICON_SIZE / image.width, PHENOMENON_ICON_SIZE / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    context.drawImage(image, ADVISORY_ICON_CENTER_X - drawWidth / 2, 6 + (PHENOMENON_ICON_SIZE - drawHeight) / 2, drawWidth, drawHeight)

    if (direction != null) {
      context.save()
      context.translate(ADVISORY_ICON_CENTER_X + 34, 22)
      context.rotate((direction * Math.PI) / 180)
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
      context.restore()
    }

    if (speed) {
      context.fillStyle = '#1d4ed8'
      context.font = '700 13px sans-serif'
      context.textBaseline = 'middle'
      context.fillText(speed, ADVISORY_ICON_CENTER_X + 52, 35)
    }

    map.addImage(markerKey, context.getImageData(0, 0, ADVISORY_MARKER_WIDTH, ADVISORY_MARKER_HEIGHT))
  })
}

function formatAltitude(item) {
  const altitude = item?.altitude

  if (!altitude) {
    return ''
  }

  const lower = altitude.lower_ref === 'SFC' || altitude.lower_fl === 0
    ? 'SFC'
    : Number.isFinite(altitude.lower_fl) ? `FL${altitude.lower_fl}` : ''
  const upper = Number.isFinite(altitude.upper_fl) ? `FL${altitude.upper_fl}` : ''

  if (lower && upper) {
    return `${lower}-${upper}`
  }

  if (upper) return `상한 ${upper} · 하한 미제공`
  if (lower) return `하한 ${lower} · 상한 미제공`
  return ''
}

function formatMotion(item) {
  const motion = item?.motion

  if (!motion || !Number.isFinite(motion.speed_kt) || motion.speed_kt <= 0) {
    return ''
  }

  if (motion.direction_text) return `${motion.direction_text} ${Math.round(motion.speed_kt)}KT`
  return Number.isFinite(motion.direction_deg)
    ? `${motion.direction_deg}deg ${Math.round(motion.speed_kt)}KT`
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
const FIR_KO_NAMES = {
  RJJJ: '후쿠오카', RCAA: '타이베이', VHHK: '홍콩', ZMUB: '울란바토르', ZBPE: '베이징',
  ZSHA: '상하이', ZGZU: '광저우', ZYSH: '선양', ZHWH: '우한', ZJSA: '싼야', ZLHW: '란저우',
  VVHN: '하노이', VVHM: '호찌민', VDPF: '프놈펜', VTBB: '방콕', WMFC: '쿠알라룸푸르',
  WSJC: '싱가포르', WIIF: '자카르타', WAAF: '우중판당', RPHI: '마닐라', ZPKM: '쿤밍',
  VLVT: '비엔티안', WBFC: '코타키나발루',
}

export function formatAdvisoryFir(item) {
  if (item?.source !== 'NOAA' || !item?.fir) return ''
  const code = item.fir.toUpperCase()
  const name = FIR_KO_NAMES[code] || item.fir_name?.replace(new RegExp('^' + code + '\\s*', 'i'))
  return name ? `${code} (${name} FIR)` : code
}

function formatPhenomenon(item) {
  return phenomenonKo(item?.phenomenon_code)
    || item?.phenomenon_label || item?.phenomenon_code || ''
}

function formatLabel(item, kind) {
  const base = kind.startsWith('sigmet') ? 'SIGMET' : 'AIRMET'
  const phenomenon = formatPhenomenon(item)
  const sequence = item?.sequence_number ? ` ${item.sequence_number}` : ''
  const fir = formatAdvisoryFir(item)
  const firLabel = fir ? ` · ${fir}` : ''
  return `${base}${sequence}${firLabel}${phenomenon ? ` ${phenomenon}` : ''}`
}

// ponytail: weatherOverlayModel.formatSigwxStamp와 동일한 분단위 포맷. 순환참조 피하려 로컬.
function fmtMinute(iso, tz = 'KST') {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms + (tz === 'KST' ? 9 * 3600000 : 0))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${tz}`
}

function formatValidity(item, tz = 'KST') {
  return item?.valid_from && item?.valid_to
    ? `${fmtMinute(item.valid_from, tz)} ~ ${fmtMinute(item.valid_to, tz)}`
    : ''
}

function formatDescription(item, kind, tz = 'KST') {
  const parts = [
    formatLabel(item, kind),
    formatValidity(item, tz),
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
          phenomenonLabel: formatPhenomenon(item),
          sequence: item.sequence_number || '',
          fir: formatAdvisoryFir(item),
          validFrom: item.valid_from || '',
          validTo: item.valid_to || '',
          altitude: formatAltitude(item),
          motion: formatMotion(item),
          validity: formatValidity(item, tz),
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
          chartLine1: formatAltitudeChart(item) || formatVisibilityChart(item),
          chartLine2: formatIntensityChart(item),
          motionLabel: formatSpeedChart(item),
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

  labelData.features.forEach((feature) => ensureAdvisoryMarkerImage(map, feature))

  if (map.getLayer(def.arrowLayerId)) map.removeLayer(def.arrowLayerId)

  if (!map.getLayer(def.iconLayerId)) {
    map.addLayer({
      id: def.iconLayerId,
      type: 'symbol',
      source: labelSourceId,
      slot: 'top',
      layout: {
        'icon-image': ['get', 'markerKey'],
        'icon-size': 1.0,
        'icon-anchor': 'center',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      filter: ['!=', ['get', 'markerKey'], ''],
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
        'text-anchor': 'top',
        'text-offset': [0, 2.3],
        'text-justify': 'center',
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
  for (const layerId of [def.iconLayerId, def.textLayerId]) {
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
