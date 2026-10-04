import { GKTG_BANDS } from '../../../../shared/gktg.js'
import { cloudSpreadColor, icingPatternStyle } from '../../shared/weather/cloudIcingPresentation.js'

const ADVISORY = [['SIGMET', '#EF4444'], ['AIRMET', '#F59E0B']]

// 연직단면도 범례: 켜진 레이어 중 보고 해석이 필요한 것만, 버튼 순서대로 한 줄.
// 등온선·바람깃·설정 고도·지형·자료 없음·등풍속선 숫자는 그림에 직접 적혀 있어 넣지 않는다.
export default function ProfileLegend({ layers, inline = false }) {
  const items = []
  if (layers.moisture) items.push(<span key="moisture" title="기온과 이슬점 차이가 작은(포화에 가까운) 층"><i style={{ backgroundColor: cloudSpreadColor(1.5) }} />구름</span>)
  if (layers.cloud) items.push(<span key="cloud" title="KIM 모델 구름량 윤곽"><i className="is-line" style={{ borderColor: '#0369a1' }} />모델 구름량</span>)
  if (layers.icing) items.push(<span key="icing" title="착빙 등급. 전 등급의 최외곽만 윤곽 표시">착빙{[1, 2, 3].map(grade => <b key={grade}><i style={icingPatternStyle(grade)} />{['', 'LGT', 'MOD', 'SEV'][grade]}</b>)}</span>)
  if (layers.tropopause) items.push(
    <span key="strat" title="권계면 위(성층권). 권계면이 갑자기 높아지는 곳은 끊어 그린다"><i className="is-strat" />권계면 위</span>,
    <span key="core" title="닫힌 80 kt 영역의 최대 풍속 지점과 고도"><i className="is-core">J</i>제트 핵</span>)
  if (layers.turbulence) items.push(<span key="turb" title="KIM GKTG 난류 등급">난류{GKTG_BANDS.slice(1).map(band => <b key={band.label}><i style={{ backgroundColor: band.color }} />{band.label}</b>)}</span>)
  if (layers.advisories) items.push(...ADVISORY.map(([label, color]) => <span key={label}><i className="is-box" style={{ borderColor: color }} />{label}</span>))
  if (!items.length) return null
  return <div className={`profile-legend${inline ? ' is-inline' : ''}`} aria-label="연직단면도 범례">{items}</div>
}
