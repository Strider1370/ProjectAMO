function unavailableAviationCredential() {
  const error = new Error('kim_18z_aviation_credential_unavailable')
  error.code = 'kim_18z_aviation_credential_unavailable'
  return error
}

export function selectKimRunCredential({ tmfc, kimCredential, aviationCredential, radarCredential }) {
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
