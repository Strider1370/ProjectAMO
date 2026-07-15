// 브리핑 신뢰도 경고 — "날씨가 얼마나 나쁜가"(배너 색)와 분리된 "그 판정을 얼마나 믿을 수 있는가" 축.
// 침묵(자료 없음/낡음)을 소리로 바꾸는 층. 판정 로직은 한 줄도 건드리지 않는다.
// 스펙: docs/superpowers/specs/2026-07-15-briefing-confidence-warnings.md
// 전부 순수 함수 — 시각은 now(ms) 주입, Date.now() 직접 호출 금지(테스트 가능성).

const STALE_METAR_MS = 60 * 60 * 1000 // ICAO 정시 관측 주기 1시간
const STALE_SPECI_MS = 30 * 60 * 1000 // SPECI는 급변 상황 → 더 짧게

const ROLE_LABEL = { departure: '출발', arrival: '도착', alternate: '교체' }

// 화면 칩이 나중에 우선순위대로 보이도록: error 먼저, 그다음 역할(출발→도착→교체) 순.
const SEVERITY_RANK = { error: 0, warning: 1 }
const ROLE_RANK = { departure: 0, arrival: 1, alternate: 2 }

function fmtHHMMZ(ms) {
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`
}

// airports: composeBriefing의 current.airports (summarizeAirport 결과 — role/icao/category/observationTime/reportType).
// destination: buildDestination 결과 (category == null 이면 ETA 미포함). arrivalTaf: 도착지 TAF payload(없으면 null).
// now: epoch ms. kimRun(optional): { validTime, lastForecastHour } — 있을 때만 ETD 지평선 판정.
export function buildConfidenceWarnings({ airports, destination, arrivalTaf, request, now, kimRun } = {}) {
  const warnings = []
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  const roleName = (role, icao) => `${ROLE_LABEL[role] ?? role} ${icao ?? '?'}`

  for (const a of airports ?? []) {
    const isAlternate = a.role === 'alternate'

    // METAR_MISSING — 판정 불가. 출발·도착은 error, 교체는 warning.
    if (!a.category || a.category === 'UNKNOWN') {
      warnings.push({
        severity: isAlternate ? 'warning' : 'error',
        code: 'METAR_MISSING',
        scope: { role: a.role, icao: a.icao ?? null },
        label: `${roleName(a.role, a.icao)} METAR 없음 — 상태 판정 불가`,
        detail: null,
      })
      continue // 자료가 없으면 낡음 판정도 의미 없다
    }

    // METAR_STALE — 판정은 했으나 정확도를 보증할 수 없다. 관측시각·현재시각 모두 유효할 때만.
    const obsMs = a.observationTime ? Date.parse(a.observationTime) : NaN
    if (Number.isFinite(obsMs) && Number.isFinite(nowMs)) {
      const ageMs = nowMs - obsMs
      const limit = a.reportType === 'SPECI' ? STALE_SPECI_MS : STALE_METAR_MS
      if (ageMs > limit) {
        warnings.push({
          severity: 'warning',
          code: 'METAR_STALE',
          scope: { role: a.role, icao: a.icao ?? null },
          label: `${roleName(a.role, a.icao)} METAR 낡음 (${Math.round(ageMs / 60000)}분 전)`,
          detail: `관측 ${fmtHHMMZ(obsMs)} · 현재 ${fmtHHMMZ(nowMs)}`,
        })
      }
    }
  }

  // 도착지 TAF — 없음(TAF_MISSING)과 있으나 ETA 미포함(TAF_NOT_COVERING_ETA)을 반드시 구분한다.
  // 전자는 ETD를 당겨도 안 풀리고, 후자는 풀린다(사용자 대응이 다르다).
  const arrivalIcao = request?.arrivalAirport ?? null
  if (!arrivalTaf) {
    warnings.push({
      severity: 'warning',
      code: 'TAF_MISSING',
      scope: { role: 'arrival', icao: arrivalIcao },
      label: `${roleName('arrival', arrivalIcao)} TAF 없음`,
      detail: null,
    })
  } else if (destination && destination.category == null) {
    warnings.push({
      severity: 'warning',
      code: 'TAF_NOT_COVERING_ETA',
      scope: { role: 'arrival', icao: arrivalIcao },
      label: `${roleName('arrival', arrivalIcao)} TAF가 도착예정시각(ETA)을 포함하지 않음`,
      detail: null,
    })
  }

  // ETD_BEYOND_FORECAST — KIM run 정보가 주입됐을 때만(없으면 조용히 건너뛴다: 지어내지 않는다).
  if (kimRun && Number.isFinite(nowMs) && request?.etd) {
    const etdMs = Date.parse(request.etd)
    const runMs = Date.parse(kimRun.validTime)
    const horizonH = Number(kimRun.lastForecastHour)
    if (Number.isFinite(etdMs) && Number.isFinite(runMs) && Number.isFinite(horizonH)) {
      const horizonMs = runMs + horizonH * 3600 * 1000
      if (etdMs > horizonMs) {
        warnings.push({
          severity: 'warning',
          code: 'ETD_BEYOND_FORECAST',
          scope: null,
          label: '출발예정시각(ETD)이 예보 지평선을 벗어남 — 상층 예보 신뢰도 낮음',
          detail: `예보 지평선 ${fmtHHMMZ(horizonMs)} · ETD ${fmtHHMMZ(etdMs)}`,
        })
      }
    }
  }

  warnings.sort((a, b) => {
    const s = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
    if (s !== 0) return s
    return (ROLE_RANK[a.scope?.role] ?? 9) - (ROLE_RANK[b.scope?.role] ?? 9)
  })

  return warnings
}

export default { buildConfidenceWarnings }
