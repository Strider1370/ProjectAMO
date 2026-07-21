import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseCloudLayer } from './parse-utils.js'

describe('parseCloudLayer', () => {
  it('preserves an IWXXM cumulonimbus cloud type in the TAC token', () => {
    const cloud = parseCloudLayer({
      'iwxxm:CloudLayer': {
        'iwxxm:amount': { '@_xlink:href': 'https://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/FEW' },
        'iwxxm:base': { '#text': '213', '@_uom': 'm' },
        'iwxxm:cloudType': { '@_xlink:href': 'https://codes.wmo.int/49-2/SigConvectiveCloudType/CB' },
      },
    })

    assert.equal(cloud.raw, 'FEW007CB')
  })
})
