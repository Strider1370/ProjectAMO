import { EXPERIMENT_COLORS, GKTG_BANDS, gktgBand } from './lib/turbulenceExperimentOverlay.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './lib/weatherOverlayModel.js'
import './TurbulenceExperiment.css'

const number = (value) => value == null ? '자료 없음' : value === 0 ? '0' : value.toExponential(2)

export default function TurbulenceExperimentControls({ model, visible }) {
  if (!visible) return null
  const { index, selection, select, field, status, sample, tz } = model
  const diagnostic = index?.diagnostics.find((d) => d.id === selection.diagnostic)
  const frame = index?.times.find((t) => t.hf === selection.hf)
  const usesOriginal = index?.algorithm === 'kim-gktg-original-fortran-v4'
  const usesPython = index?.algorithm === 'kim-gktg-python-v5'
  const change = (key) => (e) => select(key, key === 'hf' ? Number(e.target.value) : e.target.value)
  return <section className="turbulence-experiment" aria-label="KIM 난류 시험" data-status={status}>
    <strong>GKTG · 24종 결합 시험</strong>
    <p>{usesPython ? '과거 KIM 자료 · TURB Python 이식 계산' : usesOriginal ? '과거 KIM 자료 · 원본 TURB 계산 적용' : '과거 KIM 자료 · 원본 계수로 시험 이식'}<br />
      {usesPython || usesOriginal ? '21개 기압층 · KIM 재보정·강도 등급 미검증' : 'KIM 재보정·Fortran 수치 일치 미검증'}</p>
    {index && <>
      <label>결과 / 진단지수<select aria-label="난류 시험 진단지수" value={selection.diagnostic} onChange={change('diagnostic')}>
        {index.diagnostics.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select></label>
      <div className="turbulence-experiment__selections">
        <label>기압층<select aria-label="난류 시험 기압층" value={selection.level} onChange={change('level')}>
          {index.levels.map((l) => <option key={l.id} value={l.id}>{l.value} hPa</option>)}
        </select></label>
        <label>시험 시각<select aria-label="난류 시험 예보시간" value={selection.hf} onChange={change('hf')}>
          {index.times.map((t) => <option key={t.hf} value={t.hf}>발표 +{t.hf}시간</option>)}
        </select></label>
      </div>
      <p>발표 {formatUtcTmfcStamp(index.tmfc, tz)}<br />유효 {formatSigwxStamp(frame?.validTime, tz)}</p>
      {diagnostic?.combined ? <>
        <div className="turbulence-experiment__bands" aria-label="원본 GKTG 강도 범례">
          {GKTG_BANDS.map((band) => <div key={band.label}>
            <span className="turbulence-experiment__swatch" style={{ background: band.color }} aria-hidden="true" />
            <strong>{band.label}</strong><span>{band.range}</span>
          </div>)}
        </div>
        <p>TURB 원본 임계값·색상 적용 · 강도 등급 미검증<br />무색: NIL / 경계 / 자료 없음</p>
      </> : <>
        <div className="turbulence-experiment__ramp" aria-hidden="true">{EXPERIMENT_COLORS.map((color) => <span key={color} style={{ background: color }} />)}</div>
        <div className="turbulence-experiment__scale"><span>0</span><span>≥{number(diagnostic?.colorMax)} {diagnostic?.unit}</span></div>
        <p>색상 상한: 전 층·시각 공통 99백분위<br />무색: 경계 / 자료 없음</p>
      </>}
    </>}
    <div role="status" aria-live="polite">{status === 'outside' ? '선택 시각의 자료가 없습니다. 시험 시각을 선택하세요.' : status === 'loading' ? '시험 자료 불러오는 중…' : status === 'unavailable' ? '시험 자료를 불러올 수 없습니다.' : status === 'unsupported' ? '고정 브리핑에서는 시험 레이어를 사용할 수 없습니다.' : field ? `유효 격자 ${field.stats.valid.toLocaleString()} / ${field.stats.total.toLocaleString()}` : '시험 자료 대기'}</div>
    {field && <output className="turbulence-experiment__sample">
      {sample ? `${sample.lat.toFixed(2)}°N ${sample.lng.toFixed(2)}°E · ${number(sample.value)} ${sample.value === null ? '' : diagnostic?.unit}${diagnostic?.combined && gktgBand(sample.value) ? ` · ${gktgBand(sample.value).label}(시험)` : ''}` : '지도에 마우스를 올리면 격자값을 표시합니다.'}
    </output>}
  </section>
}
