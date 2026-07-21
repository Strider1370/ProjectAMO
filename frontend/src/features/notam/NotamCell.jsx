import { Ban, Crosshair, AlertTriangle, ShieldHalf, RadioTower, Radio, MoreHorizontal, ChevronDown } from 'lucide-react'
import { NOTAM_CATEGORIES, TIME_STATE } from './lib/notamViewModel.js'
import './NotamCell.css'

// 밀도형 NOTAM 셀 — 공항탭·브리핑 공용(동일 룩). 좌: 카테고리 아이콘+라벨, 중: 요약, 우: 고도+시간상태 배지, 끝: 펼침.
// 펼치면(네이티브 details, 키보드 접근) 유효기간 + 원문.
const CAT_ICON = {
  prohibited: Ban, firing: Crosshair, danger: AlertTriangle, restricted: ShieldHalf,
  obstacle: RadioTower, facility: Radio, other: MoreHorizontal,
}
const catLabelOf = (id) => (NOTAM_CATEGORIES.find((c) => c.id === id) || { label: '기타' }).label

export default function NotamCell({ category, timeState, summary, metaText, altitude, rawText, validText, conflict = false, priority }) {
  const t = TIME_STATE[timeState] || TIME_STATE.upcoming
  const Icon = CAT_ICON[category] || MoreHorizontal
  const isBand = altitude && altitude !== '전고도' // 실제 밴드만 진하게, "전고도"는 흐리게
  return (
    <details className="notam-cell" data-priority={priority} data-conflict={conflict ? 'true' : undefined}>
      <summary className="notam-cell-summary">
        <span className="notam-cell-catcol">
          <Icon size={26} strokeWidth={1.75} className="notam-cell-ic" aria-hidden="true" />
          <span className="notam-cell-catlabel">{catLabelOf(category)}</span>
        </span>
        <span className="notam-cell-body">
          <span className="notam-cell-title">{conflict ? <b className="notam-cell-conf">저촉 · </b> : null}{summary}</span>
          <span className="notam-cell-meta">{metaText}</span>
        </span>
        <span className="notam-cell-right">
          <span className={`notam-cell-alt${isBand ? ' is-band' : ''}`}>{altitude || '—'}</span>
          <span className={`notam-cell-ts ts-${t.key}`}>{t.label}</span>
        </span>
        <ChevronDown size={16} className="notam-cell-chev" aria-hidden="true" />
      </summary>
      <div className="notam-cell-expand">
        {validText ? <div className="notam-cell-valid"><span className="notam-cell-valid-lbl">유효</span>{validText}</div> : null}
        {rawText ? <pre className="notam-cell-raw">{rawText}</pre> : null}
      </div>
    </details>
  )
}
