// suncalc 2.x ESM 진입점은 named export만 내보낸다 (default 없음).
import { getPosition, getMoonPosition, getMoonIllumination, getTimes, getMoonTimes } from 'suncalc'

// 야간 지면 조도 — USNO Circular 171 (Janiczek & DeYoung 1987).
// 계수는 원문 부록 BASIC 리스팅에서 전사(행 1030 / 1090-1120 / 1130 / 2160-2250).
// 독립 검증: Krisciunas & Schaefer 1991 (PASP 103, 1033)과 보름달 0.5% 차이.
// 설계 스펙: docs/superpowers/specs/2026-07-14-moonlight-illuminance.md
//
// ⚠️ suncalc 2.x는 getPosition·getMoonPosition 모두 고도/방위각을 **도(°)** 로 반환한다.
//    1.x는 라디안이었고 웹 예제 대부분이 1.x 기준이라 rad→deg 변환을 덧붙이기 쉬운데,
//    그러면 고도가 1096° 같은 값이 되어 조도가 음수·수백만으로 튄다. 변환하지 말 것.

const DEG = Math.PI / 180

export const SKY = { CLEAR: 1, THIN_CLOUD: 2, AVERAGE_CLOUD: 3, DARK_STRATUS: 10 }

/** 대기 굴절 보정: 참고도(°) → 겉보기 고도(°). USNO 2160-2190 */
function apparentAlt(h) {
  if (h < -5 / 6) return h
  return h + 1 / Math.tan((h + 8.59 / (h + 4.42)) * DEG) / 60
}

/** 대기 감쇠 계수. 태양·달이 공유한다. USNO 2200-2250 */
function attenuation(haDeg) {
  const u = Math.sin(haDeg * DEG)
  const x = 753.6616
  const s = Math.asin((x * Math.cos(haDeg * DEG)) / (x + 1))
  const m = x * (Math.cos(s) - u) + Math.cos(s)
  return (
    Math.exp(-0.21 * m) * u +
    0.0289 * Math.exp(-0.042 * m) * (1 + ((haDeg + 90) * u) / 57.29578)
  )
}

/** 태양 조도 (lux). 133775 lx = 대기권 밖 태양 조도. USNO 1030 */
export function sunIlluminance(altDeg, sk = SKY.CLEAR) {
  return (133775 * attenuation(apparentAlt(altDeg))) / sk
}

/**
 * 달 조도 (lux). USNO 1090-1120
 * @param psiRad 이각(elongation) = π − 위상각. 보름 π, 삭 0.
 *   ⚠️ 위상각을 그대로 넣으면 보름달에서 0이 나온다.
 */
export function moonIlluminance(altDeg, psiRad, sk = SKY.CLEAR) {
  if (altDeg <= 0) return 0
  const p0 =
    0.892 * Math.exp(-3.343 / Math.pow(Math.tan(psiRad / 2), 0.632)) +
    0.0344 * (Math.sin(psiRad) - psiRad * Math.cos(psiRad))
  const p = (0.418 * p0) / (1 - 0.005 * Math.cos(psiRad) - 0.03 * Math.sin(altDeg * DEG))
  return (p * attenuation(apparentAlt(altDeg))) / sk
}

/** 야간 배경광(별빛) — lux. USNO 1130 */
export const nightSkyIlluminance = (sk = SKY.CLEAR) => 0.0005 / sk

/** 한 시점의 지면 조도 일체. */
export function illuminanceAt(date, lat, lon, sk = SKY.CLEAR) {
  const sunPos = getPosition(date, lat, lon) // 도(°)
  const moonPos = getMoonPosition(date, lat, lon) // 도(°)
  const ill = getMoonIllumination(date)

  const fraction = ill.fraction
  const phaseAngle = Math.acos(Math.min(1, Math.max(-1, 2 * fraction - 1))) // rad, 0=보름
  const sun = sunIlluminance(sunPos.altitude, sk)
  const moon = moonIlluminance(moonPos.altitude, Math.PI - phaseAngle, sk)
  const sky = nightSkyIlluminance(sk)

  return {
    sun,
    moon,
    sky,
    total: sun + moon + sky,
    sunAlt: sunPos.altitude,
    moonAlt: moonPos.altitude,
    fraction,
    phase: ill.phase, // 0 삭 · 0.5 망 · 1 삭 (차오름/이지러짐 판별)
    phaseAngle: phaseAngle / DEG,
  }
}

const LUX_TO_MLX = 1000
const SAMPLE_MS = 10 * 60 * 1000 // 10분. 1시간이면 충효과 급등·박명 급락을 놓친다.
const ms = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null)

/** 조도 등급. 임계값은 밀리럭스. 스펙 §5-B */
export function grade(peakMlx) {
  if (peakMlx >= 100) return 'bright'
  if (peakMlx >= 20) return 'medium'
  if (peakMlx >= 2) return 'dim'
  return 'moonless'
}

export const GRADE_LABEL = { bright: '밝음', medium: '보통', dim: '어두움', moonless: '무월광' }

/**
 * 하룻밤 요약 — 차트와 달력이 공유한다.
 * "하룻밤" = 그날 일몰 ~ 다음날 일출. 자정~자정이 아니다.
 * 달은 자정을 넘겨 뜨고 지므로 자정에서 자르면 어두운 밤을 못 찾는다.
 */
export function nightSummary(eveningDate, lat, lon, sk = SKY.CLEAR) {
  const t0 = getTimes(eveningDate, lat, lon)
  const next = new Date(eveningDate.getTime() + 24 * 3600 * 1000)
  const t1 = getTimes(next, lat, lon)
  const sunset = ms(t0.sunset)
  const sunrise = ms(t1.sunrise)
  if (sunset == null || sunrise == null || sunrise <= sunset) return null // 백야/극야 방어

  const samples = []
  let peakMoonLux = 0
  let peakAt = null
  for (let t = sunset; t <= sunrise; t += SAMPLE_MS) {
    const r = illuminanceAt(new Date(t), lat, lon, sk)
    samples.push({ t, moon: r.moon, total: r.total })
    if (r.moon > peakMoonLux) {
      peakMoonLux = r.moon
      peakAt = t
    }
  }

  const mid = new Date((sunset + sunrise) / 2)
  const midIll = getMoonIllumination(mid)
  const moonTimes = getMoonTimes(eveningDate, lat, lon)
  const peakMlx = peakMoonLux * LUX_TO_MLX

  return {
    date: eveningDate,
    peakMoonLux,
    peakMoonMlx: peakMlx,
    peakAt,
    grade: grade(peakMlx),
    fraction: midIll.fraction,
    phase: midIll.phase,
    sunset,
    sunrise,
    moonrise: ms(moonTimes.rise),
    moonset: ms(moonTimes.set),
    // 박명 경계. 고위도에서는 null이 될 수 있다 → 밴드만 생략하고 곡선은 그린다.
    dusk: ms(t0.dusk),
    nauticalDusk: ms(t0.nauticalDusk),
    night: ms(t0.night),
    nightEnd: ms(t1.nightEnd),
    nauticalDawn: ms(t1.nauticalDawn),
    dawn: ms(t1.dawn),
    samples,
  }
}

/**
 * 한 달치 하룻밤 요약. 달력이 쓴다.
 * 날짜 기준을 브라우저 로컬 시각에 맡기면 시간대가 UTC인 환경에서 하루가 밀린다.
 * 공항 현지 정오(UTC+utcOffsetHours)로 못박아 결정론적으로 만든다. 국내 공항 = KST(+9).
 */
export function monthSummaries(year, month, lat, lon, sk = SKY.CLEAR, utcOffsetHours = 9) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const out = []
  for (let d = 1; d <= days; d += 1) {
    const localNoon = new Date(Date.UTC(year, month, d, 12 - utcOffsetHours))
    const s = nightSummary(localNoon, lat, lon, sk)
    if (s) out.push({ ...s, day: d })
  }
  return out
}
