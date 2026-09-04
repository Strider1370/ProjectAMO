import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = readFileSync(new URL('../../deploy/nginx/projectamo.conf.example', import.meta.url), 'utf8')

test('revalidates every KMA radar graphics metadata document at nginx', () => {
  const line = config.split('\n').find((value) => value.includes('radar/(?:hsr/hsr_meta'))
  assert.ok(line)
  const pattern = line.match(/location ~\* "(.+)" \{/)
  assert.ok(pattern)
  const matcher = new RegExp(pattern[1])

  for (const path of [
    '/data/radar/hsr/hsr_meta.json',
    '/data/radar/hci/hci_meta.json',
    '/data/radar/wissdom/wissdom_meta.json',
    '/data/radar/qpf/qpf_meta.json',
  ]) assert.match(path, matcher)

  const blockStart = config.indexOf(line)
  const block = config.slice(blockStart, config.indexOf('\n  }', blockStart) + 5)
  assert.match(block, /add_header Cache-Control "no-cache"/)
})
