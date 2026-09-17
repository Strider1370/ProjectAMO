// 브라우저 저장소는 private mode, quota, 정책 등으로 언제든 예외를 던질 수 있다.
// 호출자는 실패 여부를 확인해 메모리 상태를 계속 쓸 수 있어야 한다.
function getStorage() {
  try {
    return { storage: globalThis.localStorage ?? null, error: null }
  } catch (error) {
    return { storage: null, error }
  }
}

function unavailableResult(result) {
  return { ok: false, value: null, error: result.error ?? new Error('localStorage is unavailable') }
}

export function readStoredValue(key) {
  const result = getStorage()
  if (!result.storage) return unavailableResult(result)
  try {
    return { ok: true, value: result.storage.getItem(key), error: null }
  } catch (error) {
    return { ok: false, value: null, error }
  }
}

export function writeStoredValue(key, value) {
  const result = getStorage()
  if (!result.storage) return unavailableResult(result)
  try {
    result.storage.setItem(key, value)
    return { ok: true, value, error: null }
  } catch (error) {
    return { ok: false, value: null, error }
  }
}

export function removeStoredValue(key) {
  const result = getStorage()
  if (!result.storage) return unavailableResult(result)
  try {
    result.storage.removeItem(key)
    return { ok: true, value: null, error: null }
  } catch (error) {
    return { ok: false, value: null, error }
  }
}

export function readStoredJson(key, fallback = null) {
  const result = readStoredValue(key)
  if (!result.ok || result.value == null) return { ...result, value: fallback }
  try {
    return { ok: true, value: JSON.parse(result.value), error: null }
  } catch (error) {
    return { ok: false, value: fallback, error }
  }
}
