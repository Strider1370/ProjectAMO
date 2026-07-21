import { useState } from 'react'
import { Card, Subtitle2, Caption1, Button } from '../../shared/ui/fluent.js'

// ③ 개황 — 브리핑 내 일기도 뷰어 (설계 §5-C). 종류(1차)→기압면/공항(2차)→시간(3차).
// ⚠ 이미지는 현재 KMA 샘플(실시간 fetch·아카이빙 파이프라인은 백엔드 예정, plan §4-1).
const B = '/briefing-charts/'
const CHARTS = {
  surface: { img: B + 'surf_2026070112.png', cap: '유효 01일 12Z · KMA 종관 지상분석', summary: true, slider: true },
  upper: {
    cap: '유효 02일 00Z · 상층', slider: true, def: '500',
    levels: [
      { id: '850', label: '850', dis: true }, { id: '700', label: '700', dis: true },
      { id: '500', label: '500', img: B + 'kim_up50_anlmod_pa4_2026070200.gif' }, { id: '300', label: '300', dis: true },
    ],
  },
  wind: {
    cap: '유효 02일 00Z · 바람/기온', slider: true, def: '700',
    levels: [
      { id: 'sfc', label: '지상', img: B + 'kim_gdps_lc40_wtem_wsfc_s000_2026070200.png' },
      { id: '700', label: '700', img: B + 'kim_gdps_lc40_wtem_wt70_s000_2026070200.png' },
    ],
  },
  skewt: { img: B + 'kim_gdps_skew_47163_s000_2026070200.png', cap: '무안 47163(도착) · 02일 00Z · Skew-T', point: true },
  meteogram: { img: B + 'kim_gdps_erly_city_47163_t072_2026070200.png', cap: '무안 47163(도착) · 예보 시계열', point: true },
}
const TYPES = [['surface', '지상'], ['upper', '상층'], ['wind', '상세바람'], ['skewt', '단열선도'], ['meteogram', '연직시계열']]

export default function BriefingSynopsis() {
  const [type, setType] = useState('surface')
  const [level, setLevel] = useState('500')
  const [lightbox, setLightbox] = useState(null)
  const c = CHARTS[type]
  const activeLevel = c.levels ? (c.levels.find((l) => l.id === level && !l.dis) || c.levels.find((l) => !l.dis)) : null
  const img = c.levels ? activeLevel?.img : c.img
  const cap = c.cap + (c.levels && activeLevel ? ` · ${activeLevel.label}${type === 'upper' ? 'hPa' : ''}` : '') + (type === 'surface' ? ' · ETD 기준' : '')

  const pickType = (t) => { setType(t); const d = CHARTS[t]; if (d.def) setLevel(d.def) }

  return (
    <section data-bvid="synopsis" className="bv-section">
      <Card className="bv-syn">
        <details className="bv-syn-fold">
          <summary className="bv-syn-fold-summary">
            <Subtitle2 as="h3">③ 일기도</Subtitle2>
            <Caption1 style={{ color: 'var(--text-3)' }}>샘플 데이터</Caption1>
          </summary>
          <div className="bv-syn-fold-body">

        <div className="bv-syn-types">
          {TYPES.map(([id, label]) => (
            <button key={id} type="button" className={`bv-chip${type === id ? ' bv-chip-on' : ''}`} onClick={() => pickType(id)}>{label}</button>
          ))}
        </div>

        {c.levels && (
          <div className="bv-syn-levels">
            <Caption1 style={{ color: 'var(--text-3)' }}>기압면</Caption1>
            {c.levels.map((l) => (
              <button key={l.id} type="button" disabled={l.dis}
                className={`bv-chip${l.id === level && !l.dis ? ' bv-chip-on' : ''}${l.dis ? ' bv-chip-dis' : ''}`}
                onClick={() => !l.dis && setLevel(l.id)}>
                {l.label}{l.dis ? ' 준비중' : ''}
              </button>
            ))}
            {type !== 'wind' && <Caption1 style={{ color: 'var(--text-3)' }}>계획고도 근접</Caption1>}
          </div>
        )}

        {c.slider && (
          <div className="bv-syn-slider" aria-hidden>
            <div className="bv-syn-track"><span style={{ width: '33%' }} /><i style={{ left: '33%' }} /></div>
            <div className="bv-syn-ticks tnum"><span>06Z</span><span className="on">09Z · ETD</span><span>12Z</span><span>15Z</span><span>18Z</span></div>
          </div>
        )}

        <div className="bv-syn-chartwrap">
          {img ? (
            <>
              <img className="bv-syn-chart" src={img} alt={cap} onClick={() => setLightbox(img)} />
              <span className="bv-syn-sample">샘플 · 실시간 연동 예정</span>
            </>
          ) : (
            <div className="bv-syn-placeholder"><Caption1>내부망 소스 연동 예정 (준비중)</Caption1></div>
          )}
        </div>
        <Caption1 style={{ color: 'var(--text-3)', display: 'block', marginTop: 'var(--space-xs)' }}>{cap}</Caption1>

        {c.summary && (
          <>
            <div className="bv-syn-summary">한랭전선 <b>서해상~남해상</b> · 저기압 <b>남해상</b> 996hPa</div>
            <Button appearance="secondary" size="small" style={{ marginTop: 'var(--space-s)' }}>지도에서 전선·기압 보기</Button>
          </>
        )}
          </div>
        </details>
      </Card>

      {lightbox && (
        <div className="bv-syn-lb" role="dialog" aria-label="일기도 확대" onClick={() => setLightbox(null)}>
          <button type="button" className="bv-xfull-close" onClick={() => setLightbox(null)} aria-label="닫기">×</button>
          <img src={lightbox} alt="일기도 확대" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </section>
  )
}
