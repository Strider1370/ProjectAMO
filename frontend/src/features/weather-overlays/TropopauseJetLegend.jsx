import { TROP_BANDS, TROP_CAP_FL, TROP_LABEL } from '../../shared/weather/tropopauseJetPresentation.js'
import { LegendKeyRow, LegendScale } from './MapLegend.jsx'
import { MAP_LAYER_OPACITY } from './lib/mapLayerOpacity.js'
import './TropopauseJet.css'

const SEASON = { 12: '겨울', 1: '겨울', 2: '겨울', 3: '봄', 4: '봄', 5: '봄', 6: '여름', 7: '여름', 8: '여름', 9: '가을', 10: '가을', 11: '가을' }
const caseLabel = c => `${SEASON[Number(c.tmfc.slice(4, 6))]} ${c.tmfc.slice(4, 6)}/${c.tmfc.slice(6, 8)} ${c.tmfc.slice(8)}Z${c.hf ? ` +${c.hf}h` : ''}`

// 권계면 색 단계와 제트 표기 열쇠. 숫자는 FL(100 ft), 제트 값은 KIM 원 격자 최대풍이다.
// cases가 있으면(개발 서버) 저장된 사례를 버튼으로 바꿔 볼 수 있다.
export default function TropopauseJetLegend({ enabled, cases = [], caseKey = null, onSelectCase }) {
  if (!enabled) return null
  // 경계값(250…450)을 칸 경계에 단다. 마지막 흰 칸은 상한(FL450) 이상이다.
  const entries = [...TROP_BANDS.map((band, index) => ({ color: band.color, label: index ? band.label : '' })), { color: '#ffffff', label: String(TROP_CAP_FL) }]
  return <LegendScale ariaLabel="권계면·제트 범례" unit="권계면 FL" labels="edge" entries={entries} opacity={MAP_LAYER_OPACITY.tropopause}
    title={<>권계면·제트 · FL <span className="tropopause-jet-legend__trop"
      style={{ '--trop-fill': TROP_LABEL.fill, '--trop-stroke': TROP_LABEL.stroke, '--trop-text': TROP_LABEL.text }}>TROP 350</span></>}
    note="깃·FL = 가장 센 지점의 풍속과 고도">
    <LegendKeyRow items={[{ key: 'axis', label: '제트 축(최대풍 80 kt 이상)', line: true, style: { color: 'var(--text-1)', borderTopWidth: 3 } }]} />
    {cases.length > 1 && onSelectCase && <div className="tropopause-jet-legend__cases" role="group" aria-label="저장된 사례 선택(개발용)">
      <button type="button" aria-pressed={!caseKey} onClick={() => onSelectCase(null)}>최신</button>
      {cases.map(c => { const key = `${c.tmfc}:${c.hf}:${c.revision}`
        return <button type="button" key={key} aria-pressed={caseKey === key} onClick={() => onSelectCase(key)}>{caseLabel(c)}</button> })}
    </div>}
    {caseKey && <span className="tropopause-jet-legend__case-note" role="note">사례는 지도에만 적용됩니다. 연직단면도는 최신 KIM 회차를 씁니다.</span>}
  </LegendScale>
}
