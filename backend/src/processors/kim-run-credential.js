function unavailableAviationCredential() {
  const error = new Error('kim_18z_aviation_credential_unavailable')
  error.code = 'kim_18z_aviation_credential_unavailable'
  return error
}

function bulkUnavailable(code) {
  const error = new Error(code)
  error.code = code
  return error
}

// 대용량 키 사용 가능 여부(KST 사용시간·승인 기간). now는 epoch ms.
export function kimBulkWindowOpen({ now = Date.now(), validUntilKst, startHourKst = 15, endHourKst = 24 } = {}) {
  const kst = new Date(now + 9 * 3600000)
  const day = kst.toISOString().slice(0, 10)
  const hour = kst.getUTCHours()
  return (!validUntilKst || day <= validUntilKst) && hour >= startHourKst && hour < endHourKst
}

// config에서 대용량 키 선택 인자를 만든다. 쓰지 않으면 빈 객체라 기존 키 배분이 그대로다.
// required: 확대 영역처럼 대용량 키로만 받아야 하는 영역(kim-domain.js bulkOnly)은 설정과 관계없이 그 키만 쓴다.
export function kimBulkCredentialOptions(config, now = Date.now(), { required = false } = {}) {
  if (!config?.kim_bulk?.use && !required) return {}
  return { bulkCredential: config.api?.kma_bulk_auth_key || null, bulkRequired: true, now,
    bulkWindow: { validUntilKst: config.kim_bulk.valid_until_kst, startHourKst: config.kim_bulk.window_start_hour_kst, endHourKst: config.kim_bulk.window_end_hour_kst } }
}

export function selectKimRunCredential({ tmfc, kimCredential, aviationCredential, radarCredential, bulkCredential, bulkRequired = false, bulkWindow, now = Date.now() }) {
  // 대용량 키를 쓰기로 했으면 발표회차와 관계없이 그 키만 쓴다. 쓸 수 없는 시간에는 일반 키로 넘어가지 않는다.
  if (bulkRequired) {
    if (!bulkCredential) throw bulkUnavailable('kim_bulk_credential_unavailable')
    if (!kimBulkWindowOpen({ now, ...bulkWindow })) throw bulkUnavailable('kim_bulk_credential_outside_window')
    return bulkCredential
  }
  if (String(tmfc).slice(-2) === '12') {
    if (!radarCredential || radarCredential === kimCredential || radarCredential === aviationCredential) {
      const error = new Error('kim_12z_radar_credential_unavailable')
      error.code = 'kim_12z_radar_credential_unavailable'
      throw error
    }
    return radarCredential
  }
  if (String(tmfc).slice(-2) !== '18') return kimCredential
  if (!aviationCredential || aviationCredential === kimCredential) throw unavailableAviationCredential()
  return aviationCredential
}
