import assert from 'node:assert/strict'
import test from 'node:test'

import { parseKimGridText, parseKimGridTextReference, scanKimNumericRows } from '../src/parsers/kim-grid-parser.js'

const same = (a, b) => a.values.length === b.values.length
  && a.values.every((value, index) => Object.is(value, b.values[index]))
  && a.rowLengths.join() === b.rowLengths.join()

test('the single-pass scan matches the line-by-line reference bit for bit', () => {
  const cases = [
    '# header\n1 2 3\n',
    ' 2.53140e+02  -1.5E-03 +7 .5 5. -0 \r\n',
    '1 2 x\n3 4\n',
    '1e 2\n3 4\n',
    '1.2.3 4\n5 6\n',
    '1e400 1\n2 3\n',
    '--1 2\n3\n',
    ' 1 2　\n',
    '0.000000000000000000001234 123456789012345678 1e-30 9.999999999999999e22\n',
    '﻿1 2\n',
    '\n\n  \n# c\n7\n',
    '00000000000000012.5 4e+0022 1e-22 1e23\n',
    '+.5 -.25e1 . e5 5e+\n1\n',
  ]
  for (const text of cases) assert.ok(same(scanKimNumericRows(text), parseKimGridTextReference(text)), JSON.stringify(text))

  const formats = [(v) => v.toExponential(5), (v) => v.toExponential(10), (v) => v.toFixed(3), (v) => String(v), (v) => v.toPrecision(17)]
  let seed = 7
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const rows = []
  for (let r = 0; r < 200; r += 1) {
    const row = []
    for (let c = 0; c < 100; c += 1) row.push(formats[(r + c) % formats.length]((random() - 0.5) * 10 ** (Math.floor(random() * 40) - 20)))
    rows.push(row.join(' '))
  }
  const text = rows.join('\n')
  assert.ok(same(scanKimNumericRows(text), parseKimGridTextReference(text)))
})

test('parseKimGridText keeps its header checks and shape', () => {
  const text = '# 변수명 = T, unit = K, level = 500, i = 3, j = 2, map = S\n2.5e+02 2.51e+02 2.52e+02\n2.53e+02 2.54e+02 2.55e+02\n'
  const parsed = parseKimGridText(text, { variable: 'T', level: 500 })
  assert.equal(parsed.nx, 3)
  assert.equal(parsed.ny, 2)
  assert.deepEqual(parsed.values, [250, 251, 252, 253, 254, 255])
  assert.throws(() => parseKimGridText('# i = 3, j = 2\n1 2 3\n', { variable: 'T' }), /value count mismatch/)
  assert.throws(() => parseKimGridText('1 2\n3\n', { variable: 'T' }), /inconsistent width/)
  assert.throws(() => parseKimGridText('# file is not exist\n'), (error) => error.code === 'KIM_FILE_NOT_AVAILABLE')
})
