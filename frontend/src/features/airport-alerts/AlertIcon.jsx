import { CloudLightning, Cloud, Eye, FileText, Snowflake, Thermometer, TriangleAlert, Wind, Zap } from 'lucide-react'
import { advisorySymbolUrl } from '../weather-overlays/lib/advisoryLayers.js'

// 알림 종류 아이콘. SIGMET은 지도·단면도와 같은 현상 기호 그림을 쓰고, 나머지는 앱의 lucide 아이콘.
const LUCIDE = { vis: Eye, ceiling: Cloud, metar: Cloud, wind: Wind, temp: Thermometer, ice: Snowflake, taf: FileText,
  warning: TriangleAlert, lightning: Zap, sigmet: CloudLightning, other: TriangleAlert }

export default function AlertIcon({ kind, code = null, size = 18, framed = false }) {
  const symbol = kind === 'sigmet' ? advisorySymbolUrl('sigmet', code) : null
  const Icon = LUCIDE[kind] ?? LUCIDE.other
  const glyph = symbol
    ? <img src={symbol} alt="" aria-hidden="true" style={{ width: framed ? size * 1.5 : size, height: framed ? size * 1.5 : size, objectFit: 'contain' }} />
    : <Icon size={size} aria-hidden="true" />
  return framed ? <span className="aa-icon-frame" aria-hidden="true">{glyph}</span> : glyph
}
