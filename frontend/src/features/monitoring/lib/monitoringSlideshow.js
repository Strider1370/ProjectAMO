const CONFIG_STORAGE_KEY = 'monitoring_slideshow_config_v1'
const IMAGE_DB_NAME = 'monitoring-slideshow'
const IMAGE_STORE_NAME = 'image'
const IMAGE_RECORD_KEY = 'current'

export const MONITORING_SLIDESHOW_TARGETS = ['whole-screen', 'map-panel']
export const MONITORING_SLIDESHOW_TRANSITIONS = ['fade', 'slide']
export const MONITORING_SLIDE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export const DEFAULT_MONITORING_SLIDESHOW_CONFIG = Object.freeze({
  enabled: false,
  target: 'whole-screen',
  transitionEffect: 'fade',
  transitionDurationMs: 350,
  intervalSeconds: 30,
  startTime: '00:00',
  endTime: '23:59',
})

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidTimeString(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

function clampInterval(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_MONITORING_SLIDESHOW_CONFIG.intervalSeconds
  return Math.min(3600, Math.max(5, Math.round(n)))
}

const MIN_TRANSITION_DURATION_MS = 100
const MAX_TRANSITION_DURATION_MS = 2000

function clampTransitionDuration(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_MONITORING_SLIDESHOW_CONFIG.transitionDurationMs
  return Math.min(MAX_TRANSITION_DURATION_MS, Math.max(MIN_TRANSITION_DURATION_MS, Math.round(n)))
}

export function normalizeMonitoringSlideshowConfig(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    enabled: Boolean(source.enabled),
    target: MONITORING_SLIDESHOW_TARGETS.includes(source.target)
      ? source.target
      : DEFAULT_MONITORING_SLIDESHOW_CONFIG.target,
    transitionEffect: MONITORING_SLIDESHOW_TRANSITIONS.includes(source.transitionEffect)
      ? source.transitionEffect
      : DEFAULT_MONITORING_SLIDESHOW_CONFIG.transitionEffect,
    intervalSeconds: clampInterval(
      source.intervalSeconds ?? DEFAULT_MONITORING_SLIDESHOW_CONFIG.intervalSeconds
    ),
    transitionDurationMs: clampTransitionDuration(
      source.transitionDurationMs ?? DEFAULT_MONITORING_SLIDESHOW_CONFIG.transitionDurationMs
    ),
    startTime: isValidTimeString(source.startTime)
      ? source.startTime
      : DEFAULT_MONITORING_SLIDESHOW_CONFIG.startTime,
    endTime: isValidTimeString(source.endTime)
      ? source.endTime
      : DEFAULT_MONITORING_SLIDESHOW_CONFIG.endTime,
  }
}

export function validateMonitoringSlideshowConfig(config) {
  const errors = {}
  const interval = Number(config?.intervalSeconds)

  if (!Number.isFinite(interval) || interval < 5 || interval > 3600) {
    errors.intervalSeconds = '전환 간격은 5초에서 3,600초 사이여야 합니다.'
  }
  const durationMs = Number(config?.transitionDurationMs)
  if (!Number.isFinite(durationMs) || durationMs < MIN_TRANSITION_DURATION_MS || durationMs > MAX_TRANSITION_DURATION_MS) {
    errors.transitionDurationMs = `전환 애니메이션 속도는 ${MIN_TRANSITION_DURATION_MS}ms에서 ${MAX_TRANSITION_DURATION_MS}ms 사이여야 합니다.`
  }
  if (!MONITORING_SLIDESHOW_TARGETS.includes(config?.target)) {
    errors.target = '전환 대상을 선택하세요.'
  }
  if (!MONITORING_SLIDESHOW_TRANSITIONS.includes(config?.transitionEffect)) {
    errors.transitionEffect = '전환 효과를 선택하세요.'
  }
  if (!isValidTimeString(config?.startTime) || !isValidTimeString(config?.endTime)) {
    errors.time = '시작/종료 시간을 올바르게 입력하세요.'
  } else if (config.startTime === config.endTime) {
    errors.time = '시작 시간과 종료 시간은 같을 수 없습니다.'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

function timeStringToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

// Daily schedule, no persisted "day" concept: a same-day range (start < end) has three
// phases per day (waiting, active, ended); an overnight range (start > end) only ever
// toggles between active and waiting since the window spans midnight.
export function getMonitoringSlideshowStatus(config, now = new Date()) {
  if (!config?.enabled) return 'off'
  if (!validateMonitoringSlideshowConfig(config).valid) return 'off'

  const start = timeStringToMinutes(config.startTime)
  const end = timeStringToMinutes(config.endTime)
  const current = now.getHours() * 60 + now.getMinutes()

  if (start < end) {
    if (current < start) return 'waiting'
    if (current < end) return 'active'
    return 'ended'
  }

  return current >= start || current < end ? 'active' : 'waiting'
}

export function nextMonitoringSlide(currentSlide) {
  return currentSlide === 'image' ? 'live' : 'image'
}

function hasLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadMonitoringSlideshowConfig() {
  if (!hasLocalStorage()) {
    return { ok: false, config: { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG } }
  }
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return { ok: true, config: { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG } }
    const parsed = JSON.parse(raw)
    return { ok: true, config: normalizeMonitoringSlideshowConfig(parsed?.config ?? parsed) }
  } catch (error) {
    return { ok: false, config: { ...DEFAULT_MONITORING_SLIDESHOW_CONFIG }, error }
  }
}

export function saveMonitoringSlideshowConfig(config) {
  if (!hasLocalStorage()) {
    return { ok: false, error: new Error('localStorage unavailable') }
  }
  try {
    const normalized = normalizeMonitoringSlideshowConfig(config)
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ version: 1, config: normalized }))
    return { ok: true, config: normalized }
  } catch (error) {
    return { ok: false, error }
  }
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IMAGE_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runTransaction(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, mode)
    const result = run(tx.objectStore(IMAGE_STORE_NAME))
    tx.oncomplete = () => resolve(result?.result)
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveMonitoringSlideImage(file) {
  if (!file || !MONITORING_SLIDE_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: new Error('PNG, JPEG, WebP 이미지만 사용할 수 있습니다.') }
  }
  if (!hasIndexedDb()) return { ok: false, error: new Error('IndexedDB unavailable') }
  try {
    const db = await openImageDb()
    await runTransaction(db, 'readwrite', (store) => store.put(file, IMAGE_RECORD_KEY))
    db.close()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function loadMonitoringSlideImage() {
  if (!hasIndexedDb()) return { ok: false, blob: null }
  try {
    const db = await openImageDb()
    const blob = await runTransaction(db, 'readonly', (store) => store.get(IMAGE_RECORD_KEY)) || null
    db.close()
    return { ok: true, blob }
  } catch (error) {
    return { ok: false, blob: null, error }
  }
}

export async function clearMonitoringSlideImage() {
  if (!hasIndexedDb()) return { ok: false }
  try {
    const db = await openImageDb()
    await runTransaction(db, 'readwrite', (store) => store.delete(IMAGE_RECORD_KEY))
    db.close()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
