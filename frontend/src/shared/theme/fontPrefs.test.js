import assert from 'node:assert/strict'
import test from 'node:test'

import { getFontPref, loadStoredFont } from './fontPrefs.js'

function withStorage(storage, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try { run() } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
}

test('저장된 유효 글꼴은 유지하고 unknown 값은 저장소를 수정하지 않은 채 정책 기본값을 쓴다', () => {
  let writes = 0
  withStorage({
    getItem: () => 'gov',
    setItem: () => { writes += 1 },
  }, () => assert.equal(getFontPref(), 'gov'))
  withStorage({
    getItem: () => 'unknown-font',
    setItem: () => { writes += 1 },
  }, () => assert.equal(getFontPref(), 'wanted'))
  assert.equal(writes, 0)
})

test('글꼴 저장소 읽기 예외도 pre-root 기본 선택을 막지 않는다', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousWarn = console.warn
  globalThis.document = {
    documentElement: { style: { setProperty() {} } },
    body: { style: {} },
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild() {} },
  }
  console.warn = () => {}
  try {
    withStorage({ getItem: () => { throw new Error('read blocked') } }, () => {
      assert.equal(getFontPref(), 'wanted')
      assert.doesNotThrow(() => loadStoredFont())
    })
    await new Promise(resolve => setImmediate(resolve))
  } finally {
    console.warn = previousWarn
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else delete globalThis.document
  }
})
