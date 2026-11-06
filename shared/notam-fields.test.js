import test from 'node:test'
import assert from 'node:assert/strict'
import { splitNotamFields, notamInstant, parseNotamHeight } from './notam-fields.js'

test('field splitting keeps prose parentheses and only removes the enclosing NOTAM bracket', () => {
  const body = 'A)RKRR B)2611060000 C)2611070000\nE)CALL OFFICE(1234)'
  assert.equal(splitNotamFields(body).E, 'CALL OFFICE(1234)')
  assert.equal(splitNotamFields(`(A0001/26 NOTAMN\n${body})`).E, 'CALL OFFICE(1234)')
  assert.equal(splitNotamFields(`${body}\nBOARD) AND ETD) ARE TEXT`).D, undefined)
})

test('source UTC dates cannot silently roll an invalid day into the next month', () => {
  assert.equal(notamInstant('2602310000'), null)
  assert.equal(notamInstant('2611062460'), null)
  assert.equal(notamInstant('2611060000EST'), '2026-11-06T00:00:00.000Z')
})

test('invalid height values stay unknown instead of serializing NaN as a valid bound', () => {
  assert.equal(parseNotamHeight('1..2FT AMSL'), null)
  assert.deepEqual(parseNotamHeight('1,200FT MSL'), {value:1200,unit:'FT',ref:'AMSL'})
})
