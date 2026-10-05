import { useState } from 'react'
import { advisorySymbolUrl } from '../weather-overlays/lib/advisoryLayers.js'

export default function ProfileAdvisorySymbol({ band }) {
  const url = advisorySymbolUrl(band.kind, band.code)
  const [failedUrl, setFailedUrl] = useState(null)
  const cx = band.x + band.w / 2
  const cy = band.y + band.h / 2
  const size = band.code === 'SFC_WIND' ? 64 : 32
  const showImage = url && failedUrl !== url
  const label = band.code === 'SFC_WIND'
    ? band.windLabel || '풍속 미상'
    : band.label

  return (
    <g data-testid="profile-advisory-symbol" data-phenomenon={band.code}
      role="img" aria-label={`${band.kind.startsWith('sigmet') ? 'SIGMET' : 'AIRMET'} ${band.label}${band.windLabel ? ` ${band.windLabel}` : ''}`}>
      <title>{`${band.label}${band.windLabel ? ` ${band.windLabel}` : ''}`}</title>
      {showImage && <image href={url} x={cx - size / 2} y={cy - size / 2}
        width={size} height={size} preserveAspectRatio="xMidYMid meet"
        onError={() => setFailedUrl(url)} />}
      {(!showImage || band.code === 'SFC_WIND') && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={11} fontWeight="bold" fill={band.color}
          stroke="var(--bg-1)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
          {label}
        </text>
      )}
    </g>
  )
}
