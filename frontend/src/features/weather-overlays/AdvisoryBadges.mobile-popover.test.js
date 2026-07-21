import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const badges = readFileSync(new URL('./AdvisoryBadges.jsx', import.meta.url), 'utf8')

test('advisory badges use the below-anchor popover on mobile too', () => {
  assert.doesNotMatch(badges, /MobileSheet/)
  assert.doesNotMatch(badges, /if \(isMobile\)/)
  assert.match(badges, /positioning=\{\{ position: 'below', offset: 8 \}\}/)
})
