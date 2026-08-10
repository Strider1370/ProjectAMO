// 자료 신선도 판정. 순수 함수 — 시각과 기준만 받는다(파일·store 접근 없음).
//
// 판정은 "마지막으로 수집이 성공한 시각"으로 한다. 내용이 언제 바뀌었는지가 아니다.
// SIGMET·AIRMET은 위험기상이 없으면 내용이 비어 있는 게 정상이라, 내용으로 판정하면
// 날씨가 평온한 날마다 멈춤으로 잘못 뜬다.
const KST_OFFSET_MS = 9 * 3_600_000

export function kstHour(ms) {
  return new Date(ms + KST_OFFSET_MS).getUTCHours()
}

// 쉬는 시간인가 — 안 받는 것이 정상인 시간대.
export function isQuiet(quiet, nowMs, { sunsetMs = null, sunriseMs = null } = {}) {
  if (!quiet) return false
  if (quiet.kind === 'hours') {
    const hour = kstHour(nowMs)
    const { fromHourKst: from, toHourKst: to } = quiet
    // to는 제외(04시면 04:00부터는 다시 판정한다). from > to면 자정을 넘는 구간.
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to
  }
  if (quiet.kind === 'night') {
    // 일몰·일출을 모르면 판정을 건너뛰지 않는다 — 조용히 봐주는 것보다 오탐이 낫다.
    if (sunsetMs == null || sunriseMs == null) return false
    return nowMs >= sunsetMs && nowMs < sunriseMs
  }
  return false
}

export function judge({ row, lastSuccessMs, nowMs, sunsetMs = null, sunriseMs = null }) {
  if (isQuiet(row.quiet, nowMs, { sunsetMs, sunriseMs })) return 'quiet'
  if (!Number.isFinite(lastSuccessMs)) return 'never'
  const age = nowMs - lastSuccessMs
  if (age >= row.stoppedMs) return 'stopped'
  if (age >= row.lateMs) return 'late'
  return 'ok'
}

export default { judge, isQuiet, kstHour }
