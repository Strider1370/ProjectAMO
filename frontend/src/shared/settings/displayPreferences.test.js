import assert from 'node:assert/strict'
import test from 'node:test'

import { readDisplayPreferences, saveDisplayPreferences } from './displayPreferences.js'
import { readStoredJson, removeStoredValue } from './storage.js'

function installStorage(initial = {}, { getThrows = false, setThrows = false, removeThrows = false } = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const entries = new Map(Object.entries(initial))
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        if (getThrows) throw new Error('read blocked')
        return entries.get(key) ?? null
      },
      setItem(key, value) {
        if (setThrows) throw new Error('write blocked')
        entries.set(key, String(value))
      },
      removeItem(key) {
        if (removeThrows) throw new Error('remove blocked')
        entries.delete(key)
      },
    },
  })
  return {
    entries,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
      else delete globalThis.localStorage
    },
  }
}

test('정상 저장값은 보존하고 remount 읽기에서도 같은 표시 설정을 복원한다', () => {
  const storage = installStorage({ time_zone: 'UTC', language: 'en' })
  try {
    assert.deepEqual(readDisplayPreferences(), { timeZone: 'UTC', language: 'en', ok: true, error: null })
    assert.deepEqual(readDisplayPreferences(), { timeZone: 'UTC', language: 'en', ok: true, error: null })
    assert.deepEqual([...storage.entries], [['time_zone', 'UTC'], ['language', 'en']])
  } finally {
    storage.restore()
  }
})

test('unknown 및 부분 설정은 필드별 정책 기본값으로만 메모리 복구하고 재기록하지 않는다', () => {
  const storage = installStorage({ time_zone: 'Mars', language: 'en' })
  try {
    assert.deepEqual(readDisplayPreferences(), { timeZone: 'KST', language: 'en', ok: true, error: null })
    assert.equal(storage.entries.get('time_zone'), 'Mars')
    assert.equal(storage.entries.get('language'), 'en')
  } finally {
    storage.restore()
  }
})

test('storage get 및 invalid JSON은 기본값을 반환하며 예외를 밖으로 내보내지 않는다', () => {
  const brokenRead = installStorage({}, { getThrows: true })
  try {
    assert.deepEqual(readDisplayPreferences(), { timeZone: 'KST', language: 'ko', ok: false, error: new Error('read blocked') })
  } finally {
    brokenRead.restore()
  }
  const invalidJson = installStorage({ settings: '{not json' })
  try {
    const result = readStoredJson('settings', { safe: true })
    assert.equal(result.ok, false)
    assert.deepEqual(result.value, { safe: true })
  } finally {
    invalidJson.restore()
  }
})

test('저장 실패에도 적용할 정규화 상태를 돌려주고 재시도하면 정상 저장한다', () => {
  const blocked = installStorage({}, { setThrows: true })
  try {
    const result = saveDisplayPreferences({ timeZone: 'UTC', language: 'en' })
    assert.equal(result.ok, false)
    assert.equal(result.timeZone, 'UTC')
    assert.equal(result.language, 'en')
  } finally {
    blocked.restore()
  }
  const writable = installStorage()
  try {
    assert.deepEqual(saveDisplayPreferences({ timeZone: 'UTC', language: 'en' }), { timeZone: 'UTC', language: 'en', ok: true, error: null })
    assert.deepEqual(readDisplayPreferences(), { timeZone: 'UTC', language: 'en', ok: true, error: null })
  } finally {
    writable.restore()
  }
})

test('removeItem 예외도 저장 경계 밖으로 새지 않는다', () => {
  const storage = installStorage({ time_zone: 'UTC' }, { removeThrows: true })
  try {
    assert.equal(removeStoredValue('time_zone').ok, false)
    assert.equal(storage.entries.get('time_zone'), 'UTC')
  } finally {
    storage.restore()
  }
})
