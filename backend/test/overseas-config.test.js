import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import config from '../src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('NOAA overseas airport collection list is derived from navdata airports-overseas.json', () => {
  const navdataPath = path.resolve(__dirname, '../../frontend/public/data/navdata/airports-overseas.json')
  const navdata = JSON.parse(fs.readFileSync(navdataPath, 'utf8'))
  const expectedIds = Object.keys(navdata).sort()

  assert.deepEqual([...config.noaa.overseas_airports].sort(), expectedIds)
})
