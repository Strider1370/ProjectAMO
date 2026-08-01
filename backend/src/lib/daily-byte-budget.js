function kstDayKey(date) {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000)
  return `${kst.getUTCFullYear()}-${kst.getUTCMonth() + 1}-${kst.getUTCDate()}`
}

/**
 * 하루 누적 다운로드 바이트를 세고 한도에 닿으면 막는다.
 * 이 수집기가 폭주해도 같은 API 키를 쓰는 METAR·TAF까지 죽지 않게 하는 backstop.
 */
export function createDailyByteBudget({ limitBytes, now = () => new Date() }) {
  let day = kstDayKey(now())
  let used = 0
  const roll = () => {
    const today = kstDayKey(now())
    if (today !== day) { day = today; used = 0 }
  }
  return {
    canSpend() { roll(); return used < limitBytes },
    add(bytes) { roll(); used += Number(bytes) || 0 },
    spent() { roll(); return used },
  }
}
