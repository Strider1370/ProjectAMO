import { AVIATION_WFS_LAYERS } from './aviationWfsLayers.js'
import { addLazyGeoJsonSource } from '../map/lib/mapLayerUtils.js'

const POLYGON_FILTER = ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']]
const LINE_FILTER = ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']]
const POINT_FILTER = ['==', ['geometry-type'], 'Point']

function roleFilter(role, geometryFilter) {
  return ['all', ['==', ['get', 'role'], role], geometryFilter]
}

function layerFilter(role, geometryFilter) {
  return role ? roleFilter(role, geometryFilter) : geometryFilter
}

function combineFilter(baseFilter, extraFilter) {
  return extraFilter ? ['all', baseFilter, extraFilter] : baseFilter
}

// FIR 경계 틱은 symbol이 아니라 지오메트리로 렌더한다(스크롤 후 틱 이탈 방지). useFirTickOverlay 참조.

function ensureIconImages(map, layer) {
  if (!layer.iconImageByProperty) {
    return
  }

  Object.values(layer.iconImageByProperty.values).forEach((icon) => {
    if (map.hasImage(icon.imageId)) {
      return
    }

    const image = new Image()

    image.onload = () => {
      if (map.hasImage(icon.imageId)) {
        return
      }

      map.addImage(icon.imageId, image)
    }

    image.src = icon.url
  })
}

function addFirLabelLayer(map, layer, labelLayerId, role, textOffset, visibility) {
  if (map.getLayer(labelLayerId)) {
    return
  }

  map.addLayer({
    id: labelLayerId,
    type: 'symbol',
    source: layer.sourceId,
    slot: 'top',
    filter: roleFilter(role, POINT_FILTER),
    layout: {
      visibility,
      'text-field': [
        'format',
        ['get', 'code'],
        { 'font-scale': 1.35 },
        '\n',
        {},
        ['get', 'label'],
        { 'font-scale': 0.82 },
      ],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        9,
        7,
        12,
        10,
        15,
      ],
      'text-font': ['Noto Sans CJK JP Bold'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-line-height': 1.25,
      'text-max-width': 14,
      'text-offset': textOffset,
      'text-rotation-alignment': 'viewport',
    },
    paint: {
      'text-color': layer.color,
    },
  })
}

function addPolygonLabelLayer(map, layer, visibility) {
  if (!layer.labelLayerId || map.getLayer(layer.labelLayerId)) {
    return
  }

  // labelTextField(완전한 MapLibre 표현식)이 있으면 그대로 사용 — 구역별 한글 카테고리명·코드·고도밴드
  // 조합처럼 커스텀 포맷이 필요한 경우. 없으면 기존 primary/secondary 필드 조합, 그마저 없으면 sector 기본값.
  const textField = layer.labelTextField
    ?? (layer.labelPrimaryField
      ? [
          'format',
          ['get', layer.labelPrimaryField],
          { 'font-scale': 1.1 },
          ...(layer.labelSecondaryField ? ['\n', {}, ['get', layer.labelSecondaryField], { 'font-scale': 0.8 }] : []),
        ]
      : ['coalesce', ['get', 'displayName'], ['get', 'name']])

  // 밀집 폴리곤(제한/금지/위험구역)은 NOTAM 구역 라벨과 같은 디클러터 방식(minzoom + 겹치면 생략).
  // 나머지(sector, TMA)는 기존처럼 항상 표시.
  const strict = layer.labelAllowOverlap === false

  map.addLayer({
    id: layer.labelLayerId,
    type: 'symbol',
    source: layer.sourceId,
    slot: 'top',
    minzoom: layer.labelMinzoom ?? 0,
    filter: POLYGON_FILTER,
    layout: {
      visibility,
      'text-field': textField,
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        9,
        8,
        12,
        10,
        14,
      ],
      'text-font': ['Noto Sans CJK JP Bold'],
      'text-allow-overlap': !strict,
      'text-ignore-placement': !strict,
      'text-optional': strict,
      'text-max-width': 10,
    },
    paint: {
      'text-color': layer.color,
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
      'text-halo-blur': 0,
    },
  })
}

function addHoverLayer(map, layer, visibility) {
  if (!layer.hoverLayerId || map.getLayer(layer.hoverLayerId)) {
    return
  }

  map.addLayer({
    id: layer.hoverLayerId,
    type: 'fill',
    source: layer.sourceId,
    slot: 'top',
    filter: ['in', ['get', 'sectorId'], ['literal', []]],
    paint: {
      'fill-color': layer.color,
      'fill-opacity': 0.12,
    },
    layout: {
      visibility,
    },
  })
}

function addPointLayer(map, layer, visibility) {
  if (!layer.pointLayerId || map.getLayer(layer.pointLayerId)) {
    return
  }

  if (layer.iconImageByProperty) {
    const { property, fallback, values } = layer.iconImageByProperty
    const fallbackImage = values[fallback].imageId
    const iconMatch = ['match', ['get', property]]

    Object.entries(values).forEach(([value, icon]) => {
      iconMatch.push(value, icon.imageId)
    })

    iconMatch.push(fallbackImage)

    // iconAllowOverlap:false면 겹치는 아이콘을 자동 생략(충돌 감지) → 줌아웃할수록 듬성듬성.
    // 미지정 레이어는 기존 동작(항상 표시) 유지. pointMinzoom으로 아주 넓은 줌에선 숨김.
    const iconOverlap = layer.iconAllowOverlap ?? true
    // inlineLabelField가 있으면 아이콘과 글자를 같은 심볼로(별도 라벨 레이어와 충돌 방지).
    // 글자는 text-optional이라 아이콘이 항상 우선, 자리 있을 때만 이름 표시. pointLabelMinzoom부터 노출.
    const inlineLabel = layer.inlineLabelField
    map.addLayer({
      id: layer.pointLayerId,
      type: 'symbol',
      source: layer.sourceId,
      slot: 'top',
      minzoom: layer.pointMinzoom ?? 0,
      filter: POINT_FILTER,
      layout: {
        visibility,
        'icon-image': iconMatch,
        'icon-size': layer.iconSize ?? 1,
        'icon-allow-overlap': iconOverlap,
        'icon-ignore-placement': iconOverlap,
        ...(inlineLabel ? {
          'text-field': ['step', ['zoom'], '', layer.pointLabelMinzoom ?? 0, ['get', inlineLabel]],
          'text-font': ['Noto Sans CJK JP Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9, 11, 12],
          'text-anchor': 'top',
          'text-offset': [0, 0.7],
          'text-optional': true,
        } : {}),
      },
      ...(inlineLabel ? {
        paint: {
          'text-color': layer.color,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      } : {}),
    })
    return
  }

  map.addLayer({
    id: layer.pointLayerId,
    type: 'circle',
    source: layer.sourceId,
    slot: 'top',
    filter: POINT_FILTER,
    paint: {
      'circle-color': layer.color,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        Math.max(1.8, layer.pointRadius - 1),
        9,
        layer.pointRadius,
        12,
        layer.pointRadius + 1,
      ],
      'circle-stroke-color': 'rgba(255, 255, 255, 0.85)',
      'circle-stroke-width': 1,
    },
    layout: {
      visibility,
    },
  })
}

function addPointLabelLayer(map, layer, visibility) {
  if (!layer.pointLabelLayerId || map.getLayer(layer.pointLabelLayerId)) {
    return
  }

  // 밀집 레이어(해외 웨이포인트 등)는 pointLabelAllowOverlap:false로 겹치면 생략(디클러터).
  // pointLabelMinzoom으로 일정 줌 이상에서만 라벨 표시. 미지정 레이어는 기존 동작(0, 항상 표시) 유지.
  const declutter = layer.pointLabelAllowOverlap === false

  map.addLayer({
    id: layer.pointLabelLayerId,
    type: 'symbol',
    source: layer.sourceId,
    slot: 'top',
    minzoom: layer.pointLabelMinzoom ?? 0,
    filter: POINT_FILTER,
    layout: {
      visibility,
      'text-field': ['get', layer.labelField ?? 'ident'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        8,
        8,
        10,
        11,
        12,
      ],
      'text-font': ['Noto Sans CJK JP Bold'],
      'text-anchor': 'top',
      'text-offset': [0, 0.75],
      'text-allow-overlap': !declutter,
      'text-ignore-placement': !declutter,
      'text-optional': declutter,
    },
    paint: {
      'text-color': layer.color,
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  })
}



function addRouteLabelLayer(map, layer, visibility) {
  if (!layer.routeLabelLayerId || map.getLayer(layer.routeLabelLayerId)) {
    return
  }

  map.addLayer({
    id: layer.routeLabelLayerId,
    type: 'symbol',
    source: layer.sourceId,
    slot: 'top',
    filter: combineFilter(LINE_FILTER, layer.routePrefixFilter),
    layout: {
      visibility,
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'text-field': ['get', 'ident_txt'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        9,
        8,
        11,
        11,
        13,
      ],
      'text-font': ['Noto Sans CJK JP Bold'],
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'map',
      'text-keep-upright': true,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-padding': 2,
    },
    paint: {
      'text-color': layer.color,
      'text-halo-color': '#eef6ed',
      'text-halo-width': 1.5,
      'text-halo-blur': 0,
    },
  })
}

function movePointLayersToTop(map) {
  AVIATION_WFS_LAYERS.forEach((layer) => {
    if (layer.pointLayerId && map.getLayer(layer.pointLayerId)) {
      map.moveLayer(layer.pointLayerId)
    }
  })

  AVIATION_WFS_LAYERS.forEach((layer) => {
    if (layer.pointLabelLayerId && map.getLayer(layer.pointLabelLayerId)) {
      map.moveLayer(layer.pointLabelLayerId)
    }
  })
}

export function addAviationWfsLayers(map) {
  AVIATION_WFS_LAYERS.forEach((layer) => {
    ensureIconImages(map, layer)

    // 기본으로 꺼진 레이어는 데이터를 바로 받지 않는다 — 사용자가 실제로 켤 때
    // setLayerVisibility(mapLayerUtils.js)가 그때서야 dataUrl로 소스를 채운다.
    addLazyGeoJsonSource(map, layer.sourceId, layer.dataUrl, {
      eager: layer.defaultVisible,
      // 데이터 출처 표기(레이어 켜졌을 때만 Mapbox attribution에 노출). VAT-Spy FIR = CC-BY-SA-4.0.
      ...(layer.attribution ? { attribution: layer.attribution } : {}),
    })

    const visibility = layer.defaultVisible ? 'visible' : 'none'

    if (layer.maskLayerId && !map.getLayer(layer.maskLayerId)) {
      map.addLayer({
        id: layer.maskLayerId,
        type: 'fill',
        source: layer.sourceId,
        slot: 'top',
        filter: roleFilter('outside-mask', POLYGON_FILTER),
        paint: {
          'fill-color': '#1f78a8',
          'fill-opacity': 0.22,
          'fill-outline-color': 'rgba(0,0,0,0)',
        },
        layout: {
          visibility,
        },
      })
    }

    if (layer.fillLayerId && !map.getLayer(layer.fillLayerId)) {
      map.addLayer({
        id: layer.fillLayerId,
        type: 'fill',
        source: layer.sourceId,
        slot: 'top',
        filter: layerFilter(layer.fillRole, POLYGON_FILTER),
        paint: {
          'fill-color': layer.color,
          'fill-opacity': layer.fillOpacity,
        },
        layout: {
          visibility,
        },
      })
    }

    addPointLayer(map, layer, visibility)
    addPointLabelLayer(map, layer, visibility)
    addHoverLayer(map, layer, visibility)

    if (layer.lineLayerId && !map.getLayer(layer.lineLayerId)) {
      map.addLayer({
        id: layer.lineLayerId,
        type: 'line',
        source: layer.sourceId,
        slot: 'top',
        filter: combineFilter(
          layer.lineRole ? layerFilter(layer.lineRole, LINE_FILTER) : layer.fillLayerId ? POLYGON_FILTER : LINE_FILTER,
          layer.routePrefixFilter,
        ),
        paint: {
          'line-color': layer.color,
          'line-width': layer.lineWidth,
          'line-opacity': layer.lineOpacity,
          ...(layer.lineDasharray ? { 'line-dasharray': layer.lineDasharray } : {}),
        },
        layout: {
          visibility,
        },
      })
    }

    addRouteLabelLayer(map, layer, visibility)

    // FIR 경계 틱은 useFirTickOverlay가 지오메트리(wfs-fir-ticks line 레이어)로 렌더한다.

    if (layer.externalLabelLayerId) {
      addFirLabelLayer(map, layer, layer.externalLabelLayerId, 'external-label', [0, 0], visibility)
    }

    if (layer.internalLabelLayerId) {
      addFirLabelLayer(map, layer, layer.internalLabelLayerId, 'internal-label', [0, 0], visibility)
    }

    addPolygonLabelLayer(map, layer, visibility)
  })

  movePointLayersToTop(map)
}
