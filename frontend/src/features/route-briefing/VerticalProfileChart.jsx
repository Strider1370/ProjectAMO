const M_TO_FT = 3.28084

function formatFt(value) {
  if (!Number.isFinite(value)) return '--'
  return `${Math.round(value).toLocaleString()} ft`
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
  return markers.map((marker, index) => {
    const x = xFor(marker.distanceNm)
    return { ...marker, x, lane: index % 2 }
  })
}

export default function VerticalProfileChart({ profile }) {
  const samples = profile?.axis?.samples ?? []
  const terrainValues = profile?.terrain?.values ?? []
  const cruiseAltitudeFt = profile?.flightPlan?.plannedCruiseAltitudeFt
  const markers = profile?.markers ?? []
  const flightProfile = profile?.flightPlan?.profile ?? null

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

  const width = 960
  const height = 380
  const padding = { top: 26, right: 26, bottom: 96, left: 58 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const maxDistance = Math.max(profile.axis.totalDistanceNm || 0, samples[samples.length - 1].distanceNm || 0.1)
  const terrainMaxFt = Math.max(...terrainPoints.map((point) => point.elevationFt), 0)
  const procedurePoints = (flightProfile?.points ?? [])
    .filter((point) => Number.isFinite(point.distanceNm) && Number.isFinite(point.altitudeFt))
  const procedureMaxFt = procedurePoints.length > 0 ? Math.max(...procedurePoints.map((point) => point.altitudeFt)) : 0
  const profileCeilingFt = Math.max(terrainMaxFt, cruiseAltitudeFt || 0, procedureMaxFt)
  const headroomFt = Number.isFinite(cruiseAltitudeFt) ? getAltitudeHeadroomFt(cruiseAltitudeFt) : 5000
  const yMax = Math.max(1000, Math.ceil((profileCeilingFt + headroomFt) / 1000) * 1000)
  const xFor = (distanceNm) => padding.left + (distanceNm / maxDistance) * plotWidth
  const yFor = (altitudeFt) => padding.top + plotHeight - (altitudeFt / yMax) * plotHeight
  const terrainSvgPoints = terrainPoints.map((point) => ({ x: xFor(point.distanceNm), y: yFor(point.elevationFt) }))
  const terrainLine = buildPath(terrainSvgPoints)
  const terrainArea = `${terrainLine} L ${xFor(terrainPoints[terrainPoints.length - 1].distanceNm).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(terrainPoints[0].distanceNm).toFixed(1)} ${yFor(0).toFixed(1)} Z`
  const procedureLine = buildPath(procedurePoints.map((point) => ({ x: xFor(point.distanceNm), y: yFor(point.altitudeFt) })))
  const tod = flightProfile?.tod
  const todMarker = tod && Number.isFinite(tod.distanceNm) && tod.distanceNm >= 0 && tod.distanceNm <= maxDistance
    ? { ...tod, x: xFor(tod.distanceNm), y: yFor(cruiseAltitudeFt) }
    : null
  const todOffsetText = todMarker && Number.isFinite(todMarker.distanceFromEnrouteEndNm)
    ? `TOD: ${todMarker.referenceFixLabel ?? 'ENROUTE'} ${formatNm(todMarker.distanceFromEnrouteEndNm)} ${todMarker.distanceFromEnrouteEndNm >= 0 ? '\uc804' : '\ud6c4'}`
    : null
  const climbGradient = flightProfile?.model?.climbGradientFtPerNm
  const descentGradient = flightProfile?.model?.descentGradientFtPerNm
  const todLabelY = todMarker ? Math.max(padding.top + 14, todMarker.y - 30) : 0
  const todArrowTopY = todMarker ? Math.max(todLabelY + 7, todMarker.y - 21) : 0
  const todArrowTipY = todMarker ? Math.min(todMarker.y - 7, todArrowTopY + 10) : 0
  const yTicks = [0, yMax / 2, yMax]
  const cruiseTick = Number.isFinite(cruiseAltitudeFt) && cruiseAltitudeFt > 0 && cruiseAltitudeFt < yMax
    ? cruiseAltitudeFt
    : null
  const visibleMarkers = markers
    .filter((marker) => Number.isFinite(marker.distanceNm) && marker.distanceNm >= 0 && marker.distanceNm <= maxDistance)
    .map((marker, index) => ({ ...marker, key: `${marker.label}-${index}` }))
  const markerLabels = assignMarkerLanes(visibleMarkers, xFor)

  return (
    <div className="vertical-profile-chart">
      <div className="vertical-profile-meta">
        <span className="vertical-profile-meta-item">
          <span>{'\uc9c0\ud615\uace0\ub3c4'}</span>
          <strong>{formatFt(terrainMaxFt)}</strong>
        </span>
        <span className="vertical-profile-meta-item">
          <span>{'\uc21c\ud56d\uace0\ub3c4'}</span>
          <strong>{formatFt(cruiseAltitudeFt)}</strong>
        </span>
        {procedurePoints.length > 1 && (
          <span className="vertical-profile-procedure-badge">{flightProfile.label}</span>
        )}
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
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vertical profile">
        <rect className="vertical-profile-plot" x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
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
        {markerLabels.map((marker, index) => (
          <g key={marker.key}>
            <line
              className="vertical-profile-marker-tick"
              x1={marker.x}
              x2={marker.x}
              y1={padding.top + plotHeight}
              y2={padding.top + plotHeight + 10 + marker.lane * 18}
            />
            <text
              className="vertical-profile-marker-label"
              x={marker.x}
              y={height - 34 + marker.lane * 22}
              textAnchor={index === 0 ? 'start' : index === visibleMarkers.length - 1 ? 'end' : 'middle'}
            >
              {fitMarkerLabel(marker.label)}
            </text>
          </g>
        ))}
        <path className="vertical-profile-terrain-area" d={terrainArea} />
        <path className="vertical-profile-terrain-line" d={terrainLine} />
        {procedureLine && <path className="vertical-profile-procedure-line" d={procedureLine} />}
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
      </svg>
    </div>
  )
}
