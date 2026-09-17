import { readStoredValue, writeStoredValue } from './storage.js'

export const DEFAULT_TIME_ZONE = 'KST'
export const DEFAULT_LANGUAGE = 'ko'

const TIME_ZONES = new Set(['KST', 'UTC'])
const LANGUAGES = new Set(['ko', 'en'])

export function normalizeTimeZone(value) {
  return TIME_ZONES.has(value) ? value : DEFAULT_TIME_ZONE
}

export function normalizeLanguage(value) {
  return LANGUAGES.has(value) ? value : DEFAULT_LANGUAGE
}

// 오래된/수동 수정 값은 메모리에서만 필드별 기본값으로 복구한다. 읽기 중에는 저장하지 않는다.
export function readDisplayPreferences() {
  const timeZone = readStoredValue('time_zone')
  const language = readStoredValue('language')
  return {
    timeZone: normalizeTimeZone(timeZone.value),
    language: normalizeLanguage(language.value),
    ok: timeZone.ok && language.ok,
    error: timeZone.error ?? language.error ?? null,
  }
}

export function saveDisplayPreferences(preferences) {
  const normalized = {
    timeZone: normalizeTimeZone(preferences?.timeZone),
    language: normalizeLanguage(preferences?.language),
  }
  const writes = [
    writeStoredValue('time_zone', normalized.timeZone),
    writeStoredValue('language', normalized.language),
  ]
  const failed = writes.find(result => !result.ok)
  return { ...normalized, ok: !failed, error: failed?.error ?? null }
}
