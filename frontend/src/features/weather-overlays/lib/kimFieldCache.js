// KIM 레이어(바람·기온·구름·착빙·난류·권계면)가 함께 쓰는 필드 캐시.
//
// 시각·고도를 넘길 때마다 받은 필드를 레이어별 Map에 무한히 쌓으면 확대 영역에서 브라우저 메모리가 계속 늘었다.
// 모든 레이어가 하나의 바이트 상한을 나눠 쓰고, 가장 오래 안 쓴 필드부터 지운다. 지금 화면에 그리는 필드는
// 각 훅의 상태에 따로 있으므로 캐시에서 빠져도 그림은 남는다.
export const KIM_FIELD_CACHE_MAX_BYTES = 64 * 1024 * 1024

// 숫자 배열·문자열의 대략적인 크기. 정확한 힙 크기가 아니라 필드끼리 비교할 수 있는 추정치다.
export function estimateFieldBytes(value, depth = 0) {
  if (value === null || value === undefined || depth > 8) return 0
  if (typeof value === 'number' || typeof value === 'boolean') return 8
  if (typeof value === 'string') return value.length * 2
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (Array.isArray(value)) {
    if (value.length > 64 && (typeof value[0] === 'number' || value[0] === null)) return value.length * 8
    let total = 16
    for (const item of value) total += estimateFieldBytes(item, depth + 1)
    return total
  }
  if (typeof value === 'object') {
    let total = 32
    for (const key of Object.keys(value)) total += key.length * 2 + estimateFieldBytes(value[key], depth + 1)
    return total
  }
  return 0
}

export function createKimFieldCache({ maxBytes = KIM_FIELD_CACHE_MAX_BYTES } = {}) {
  // Map은 넣은 순서를 지킨다. 꺼낼 때 지우고 다시 넣어 맨 뒤(최근)로 보낸다.
  const entries = new Map()
  let totalBytes = 0

  function remove(fullKey) {
    const entry = entries.get(fullKey)
    if (!entry) return
    entries.delete(fullKey)
    totalBytes -= entry.bytes
  }

  function view(namespace) {
    const fullKey = (key) => `${namespace}\u0000${key}`
    return {
      has: (key) => entries.has(fullKey(key)),
      get(key) {
        const entry = entries.get(fullKey(key))
        if (!entry) return undefined
        entries.delete(fullKey(key))
        entries.set(fullKey(key), entry)
        return entry.value
      },
      set(key, value) {
        remove(fullKey(key))
        const bytes = estimateFieldBytes(value)
        // 상한보다 큰 필드 하나는 담지 않는다(그리기는 훅 상태로 계속된다).
        if (bytes > maxBytes) return
        entries.set(fullKey(key), { value, bytes })
        totalBytes += bytes
        for (const oldest of entries.keys()) {
          if (totalBytes <= maxBytes) break
          remove(oldest)
        }
      },
      clear() {
        for (const key of [...entries.keys()]) if (key.startsWith(`${namespace}\u0000`)) remove(key)
      },
    }
  }

  return {
    view,
    get totalBytes() { return totalBytes },
    get size() { return entries.size },
  }
}

export const kimFieldCache = createKimFieldCache()
