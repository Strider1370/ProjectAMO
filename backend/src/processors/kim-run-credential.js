function unavailableAviationCredential() {
  const error = new Error('kim_18z_aviation_credential_unavailable')
  error.code = 'kim_18z_aviation_credential_unavailable'
  return error
}

export function selectKimRunCredential({ tmfc, kimCredential, aviationCredential }) {
  if (String(tmfc).slice(-2) !== '18') return kimCredential
  if (!aviationCredential || aviationCredential === kimCredential) throw unavailableAviationCredential()
  return aviationCredential
}
