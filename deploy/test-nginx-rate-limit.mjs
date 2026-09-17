import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = readFileSync(new URL('./nginx/projectamo.conf.example', import.meta.url), 'utf8')

function regexLocationContaining(fragment) {
  const line = config.split('\n').find((value) => value.includes(fragment))
  assert.ok(line, `nginx location containing ${fragment} is required`)
  const matched = /location ~\* "(.+)" \{/.exec(line)
  assert.ok(matched, `nginx regex location containing ${fragment} must parse`)
  return { line, matcher: new RegExp(matched[1], 'i') }
}

function locationBlock(line) {
  const start = config.indexOf(line)
  assert.notEqual(start, -1)
  const end = config.indexOf('\n  }', start)
  assert.notEqual(end, -1)
  return config.slice(start, end + 5)
}

test('public API permits a 60-request initial-load burst per client IP', () => {
  assert.match(config, /limit_req_zone \$binary_remote_addr zone=projectamo_api:10m rate=5r\/s;/)
  assert.match(config, /limit_req zone=projectamo_api burst=60 nodelay;/)
})

test('direct data alias preserves the backend CTPS and Echo Top raw-binary boundary', () => {
  const { line, matcher } = regexLocationContaining('ctps_\\d{12}|radar/echotop')
  const block = locationBlock(line)

  for (const pathname of [
    '/data/satellite/convective/ctps_202607231200.bin',
    '/data/radar/echotop/echotop_202607252035.bin',
  ]) assert.match(pathname, matcher)

  for (const pathname of [
    '/data/satellite/convective/ctps_202607231200_all.webp',
    '/data/radar/echotop/echotop_202607252035.webp',
    '/data/terrain/tiles/E128_N37.bin',
  ]) assert.doesNotMatch(pathname, matcher)

  assert.match(block, /return 404;/)
  assert.ok(config.indexOf(line) < config.indexOf('location /data/'), 'deny rule must precede the generic /data alias')
})

test('direct data alias gives published CTPS, Echo Top, WISSDOM and QPF frames the backend cache contract', () => {
  const { line, matcher } = regexLocationContaining('wissdom/wissdom_')
  const block = locationBlock(line)

  for (const pathname of [
    '/data/radar/echotop/echotop_202607252035.webp',
    '/data/radar/wissdom/wissdom_1829_202608172300.webp',
    '/data/radar/wissdom/wissdom_1829_202608172300_legend.webp',
    '/data/radar/qpf/qpf_202608172300_p10.webp',
    '/data/radar/qpf/qpf_202608172300_p10_legend.webp',
    '/data/satellite/convective/ci_202607231200.geojson',
    '/data/satellite/convective/ctps_202607231200_all.webp',
    '/data/satellite/convective/ctps_202607231200_fl550.webp',
  ]) assert.match(pathname, matcher)

  assert.match(block, /alias \/opt\/projectamo\/shared\/data\/\.active-data\/\$1;/)
  assert.match(block, /add_header Cache-Control "public, max-age=10800, immutable";/)
})

test('metadata remains revalidated rather than inheriting immutable frame caching', () => {
  const { line, matcher } = regexLocationContaining('convective/convective_meta')
  const block = locationBlock(line)

  for (const pathname of [
    '/data/radar/echotop/echotop_meta.json',
    '/data/radar/wissdom/wissdom_meta.json',
    '/data/radar/qpf/qpf_meta.json',
    '/data/satellite/convective/convective_meta.json',
  ]) assert.match(pathname, matcher)

  assert.match(block, /add_header Cache-Control "no-cache";/)
})
