// 소개 페이지 첫 화면의 "지금 관측" 한 줄. /api/metar 응답에서 한 공항의 최신 METAR를 요약한다.
import { getFlightCategory } from '../../../shared/weather/helpers.js'

const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// 운고: 가장 낮은 BKN·OVC 구름 밑면(공항 패널과 같은 기준).
function ceilingFt(clouds) {
  const layer = (clouds || [])
    .filter((cloud) => cloud.amount === 'BKN' || cloud.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]
  return layer?.base ?? null
}

export function buildLiveObservation(payload, icao = 'RKSI') {
  const metar = payload?.airports?.[icao]
  const obs = metar?.observation
  const observedAt = Date.parse(metar?.header?.observation_time || metar?.header?.issue_time || '')
  if (!obs || !Number.isFinite(observedAt)) return null

  const category = getFlightCategory(obs.visibility?.value, ceilingFt(obs.clouds), icao)
  const wind = obs.wind
  const windText = !wind ? null
    : wind.calm ? '바람 고요'
      : `바람 ${wind.variable ? '가변' : `${wind.direction}°`} ${wind.speed}kt${Number.isFinite(wind.gust) ? ` 돌풍 ${wind.gust}kt` : ''}`
  const visibility = obs.visibility?.cavok ? 'CAVOK'
    : Number.isFinite(obs.visibility?.value) ? (obs.visibility.value >= 9999 ? '시정 10km 이상' : `시정 ${obs.visibility.value.toLocaleString('ko-KR')}m`) : null
  const temperature = Number.isFinite(obs.temperature?.air) ? `${Math.round(obs.temperature.air)}°C` : null

  return {
    category: category.category,
    color: category.color,
    observed: `${KST_TIME.format(new Date(observedAt))} KST 관측`,
    details: [windText, visibility, temperature].filter(Boolean),
  }
}
