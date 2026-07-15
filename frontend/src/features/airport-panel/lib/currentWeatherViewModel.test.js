import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildCurrentWarningModel } from './currentWeatherViewModel.js'

describe('current warning model', () => {
  it('builds an ok warning model when there are no active warnings', () => {
    const model = buildCurrentWarningModel({ warnings: [] })

    assert.equal(model.active, false)
    assert.equal(model.count, 0)
    assert.equal(model.label, '\uacf5\ud56d\uacbd\ubcf4 \uc5c6\uc74c')
    assert.deepEqual(model.items, [])
  })

  it('maps warning key to Korean name and formats time as fmtKstShort', () => {
    const model = buildCurrentWarningModel({
      warnings: [{
        wrng_type_key: 'LOW_VISIBILITY',
        wrng_type_name: 'Low Visibility Warning',
        valid_start: '2026-06-06T01:00:00Z',
        valid_end: '2026-06-06T04:30:00Z',
      }],
    })

    assert.equal(model.active, true)
    assert.equal(model.count, 1)
    assert.equal(model.items[0].name, '\uc800\uc2dc\uc815\uacbd\ubcf4')
    assert.equal(model.items[0].timeText, '2026-06-06 01:00 UTC \u2013 2026-06-06 04:30 UTC')
  })

  it('falls back through warning type fields in priority order', () => {
    const model = buildCurrentWarningModel({
      warnings: [
        { type_label: '\uac15\ud48d', valid_start: null, valid_end: null },
        { type: 'THUNDERSTORM', valid_start: null, valid_end: null },
      ],
    })

    assert.equal(model.items[0].name, '\uac15\ud48d')
    assert.equal(model.items[1].name, 'THUNDERSTORM')
  })

  it('exports only the live warning model', async () => {
    const module = await import('./currentWeatherViewModel.js')
    assert.deepEqual(Object.keys(module), ['buildCurrentWarningModel'])
  })
})
