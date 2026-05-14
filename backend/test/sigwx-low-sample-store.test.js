import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildSigwxLowSamplePaths,
  writeSigwxLowSampleManifest,
} from '../src/sigwx-low/sigwx-low-sample-store.js'

test('buildSigwxLowSamplePaths resolves the tmfc sample directory', () => {
  const root = path.join(os.tmpdir(), 'sigwx-low-sample-test')
  assert.deepEqual(buildSigwxLowSamplePaths(root, '2026051411'), {
    dir: path.join(root, '2026051411'),
    sourceXml: path.join(root, '2026051411', 'source.xml'),
    parsedJson: path.join(root, '2026051411', 'parsed.json'),
    targetPng: path.join(root, '2026051411', 'target.png'),
    manifestJson: path.join(root, '2026051411', 'manifest.json'),
  })
})

test('writeSigwxLowSampleManifest writes stable relative paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sigwx-low-manifest-'))
  const manifestPath = writeSigwxLowSampleManifest(root, {
    tmfc: '2026051411',
    imageUrl: 'https://global.amo.go.kr/WEBDATA/JUN/ETC/IMG/202605/14/SIGWX_LOW_2026051411.png',
    imageStatus: 'ok',
    xmlStatus: 'ok',
    parsedStatus: 'ok',
    captureMethod: 'direct-image-url',
  })
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.tmfc, '2026051411')
  assert.equal(manifest.sourceXmlPath, 'source.xml')
  assert.equal(manifest.parsedJsonPath, 'parsed.json')
  assert.equal(manifest.targetImagePath, 'target.png')
})
