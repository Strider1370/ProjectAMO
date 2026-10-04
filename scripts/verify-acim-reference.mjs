import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadAcimReference, calculateAcim, seasonForTmfc, topFeetForAcim, altitudeBand } from './lib/acim-reference.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const reference = loadAcimReference(repo)
// Independent high-precision evaluator reads the original Fortran assignments.
// This verifies the expression, not binary parity with the unavailable Intel build.
const python = String.raw`
from pathlib import Path
from decimal import Decimal as D, getcontext
import json, re
getcontext().prec=40
out=[]
for season in ['DJF','MAM','JJA','SON']:
 source=Path(f'reference/ACIM/_SRC/src_ACI_{season}/ACI_Indices.f90').read_text()
 c={key:D(value) for key,value in re.findall(r'\b(OLR[12]|APCP[12]|cOLR[0-6]|cAPCP[0-6]|a|b)\s*=\s*([+\-\d.eE]+)', source)}
 def poly(prefix,x): return sum(c[f'{prefix}{i}']*(D(1) if i==0 else x**i) for i in range(7))
 for k in range(101):
  olr=c['OLR1']+(c['OLR2']-c['OLR1'])*D(k)/100
  p=c['APCP1']+(c['APCP2']-c['APCP1'])*D((k*37)%101)/100
  molr=D(1) if olr<=c['OLR1'] else D(0) if olr>c['OLR2'] else poly('cOLR',olr)
  mapcp=D(0) if p<=c['APCP1'] else D(1) if p>c['APCP2'] else poly('cAPCP',p)
  expected=max(D(0),min(D(1),c['a']*molr+c['b']*mapcp))
  out.append(dict(season=season,olr=float(olr),precc=float(p),expected=float(expected)))
print(json.dumps(out))
`
const result = spawnSync('python3', ['-c', python], { cwd: repo, encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr)
const cases = JSON.parse(result.stdout)
let maxError = 0
for (const test of cases) {
  const value = calculateAcim(test.olr, test.precc, reference.seasons[test.season])
  const error = Math.abs(value - test.expected)
  maxError = Math.max(maxError, error)
  assert.ok(error < 1e-8, JSON.stringify({ ...test, value, error }))
}
for (const c of Object.values(reference.seasons)) {
  assert.equal(calculateAcim(c.OLR1, c.APCP1, c), .5)
  assert.equal(calculateAcim(c.OLR1 - 1, c.APCP2 + 1, c), 1)
  assert.equal(calculateAcim(c.OLR2 + 1, c.APCP1, c), 0)
  assert.equal(calculateAcim(c.OLR2 + 1, c.APCP2 + 1, c), .5)
  for (const [olr, rain] of [[null, 0], [NaN, 1], [-99999, 1], [200, -99999], [200, -1], [Infinity, 1]]) assert.equal(calculateAcim(olr, rain, c), null)
}
for (const [month, expected] of [[1,'DJF'],[2,'DJF'],[3,'MAM'],[5,'MAM'],[6,'JJA'],[8,'JJA'],[9,'SON'],[11,'SON'],[12,'DJF']]) assert.equal(seasonForTmfc(`2026${String(month).padStart(2, '0')}0100`), expected)
assert.throws(() => seasonForTmfc('2026130100'))
for (let i = 0; i < reference.table.length; i++) {
  const [fl, threshold] = reference.table[i]
  assert.equal(topFeetForAcim(threshold, reference.table), fl * 100)
  assert.equal(topFeetForAcim(threshold - 1e-9, reference.table), i ? reference.table[i - 1][0] * 100 : 0)
}
assert.equal(topFeetForAcim(1, reference.table), 35000)
assert.equal(topFeetForAcim(null, reference.table), null)
assert.equal(altitudeBand(null), null)
assert.equal(altitudeBand(2500), -1)
for (let i = 0; i < 7; i++) assert.equal(altitudeBand((i + 1) * 5000), i)
const report = { decimalCases: cases.length, maxAbsoluteError: maxError, checks: ['all seasons', 'threshold equality', 'missing/invalid values', 'all height table boundaries', '5000ft bands'], compiledFortranParity: 'pending: Intel/NetCDF runtime libraries absent', sourceHashes: reference.sources }
await fs.mkdir(path.join(repo, 'artifacts/acim-preview'), { recursive: true })
await fs.writeFile(path.join(repo, 'artifacts/acim-preview/calculation-verification.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
