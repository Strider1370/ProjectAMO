import { useEffect, useState } from 'react'
import { advisorySymbolUrl } from '../weather-overlays/lib/advisoryLayers.js'

// 불러오지 못한 아이콘 주소. 단면도가 다시 그려져 기호가 새로 붙으면 SVG <image>의 실패 알림이 사라질 때가 있어
// (깨진 그림만 남는다) 주소마다 한 번 따로 불러 보고 결과를 모듈에 기억한다 — 실패면 처음부터 글자로 낸다.
const failedUrls = new Set()
const probes = new Map()
function probeIcon(url) {
  if (!probes.has(url)) {
    probes.set(url, new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => { failedUrls.add(url); resolve(false) }
      img.src = url
    }))
  }
  return probes.get(url)
}

export default function ProfileAdvisorySymbol({ band, dimmed = false }) {
  const url = advisorySymbolUrl(band.kind, band.code)
  const [failedUrl, setFailedUrl] = useState(() => (failedUrls.has(url) ? url : null))
  const cx = band.x + band.w / 2
  const cy = band.y + band.h / 2
  const size = band.code === 'SFC_WIND' ? 64 : 32
  useEffect(() => {
    if (!url || typeof Image === 'undefined') return undefined
    let alive = true
    probeIcon(url).then((ok) => { if (alive && !ok) setFailedUrl(url) })
    return () => { alive = false }
  }, [url])
  const showImage = url && failedUrl !== url && !failedUrls.has(url)
  const label = band.code === 'SFC_WIND'
    ? band.windLabel || '풍속 미상'
    : band.label

  return (
    <g data-testid="profile-advisory-symbol" data-phenomenon={band.code} opacity={dimmed ? 0.25 : undefined}
      role="img" aria-label={`${band.kind.startsWith('sigmet') ? 'SIGMET' : 'AIRMET'} ${band.label}${band.windLabel ? ` ${band.windLabel}` : ''}`}>
      <title>{`${band.label}${band.windLabel ? ` ${band.windLabel}` : ''}`}</title>
      {showImage && <image href={url} x={cx - size / 2} y={cy - size / 2}
        width={size} height={size} preserveAspectRatio="xMidYMid meet"
        onError={() => { failedUrls.add(url); setFailedUrl(url) }} />}
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
