const DEFAULT_SIGWX_LOW_IMAGE_BASE_URL = 'https://global.amo.go.kr/WEBDATA/JUN/ETC/IMG'

function assertTwoDigitRange(value, min, max, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Invalid SIGWX_LOW tmfc: ${label} out of range`)
  }
}

export function parseSigwxLowTmfc(tmfc) {
  const text = String(tmfc || '').trim()
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/)
  if (!match) throw new Error('Invalid SIGWX_LOW tmfc: expected YYYYMMDDHH')

  const [, yyyy, mm, dd, hh] = match
  assertTwoDigitRange(mm, 1, 12, 'month')
  assertTwoDigitRange(dd, 1, 31, 'day')
  assertTwoDigitRange(hh, 0, 23, 'hour')

  return {
    tmfc: text,
    yyyy,
    mm,
    dd,
    hh,
    yyyymm: `${yyyy}${mm}`,
  }
}

export function buildSigwxLowTargetImageUrl(tmfc, baseUrl = DEFAULT_SIGWX_LOW_IMAGE_BASE_URL) {
  const parts = parseSigwxLowTmfc(tmfc)
  return `${String(baseUrl).replace(/\/$/, '')}/${parts.yyyymm}/${parts.dd}/SIGWX_LOW_${parts.tmfc}.png`
}
