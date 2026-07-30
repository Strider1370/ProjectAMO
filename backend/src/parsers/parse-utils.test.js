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
    assert.equal(cloud.type, 'CB') // 표시단(호버창 운고)이 쓰는 구조 필드
  })

  it('exposes TCU as a cloud type', () => {
    const cloud = parseCloudLayer({
      'iwxxm:CloudLayer': {
        'iwxxm:amount': { '@_xlink:href': 'https://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/SCT' },
        'iwxxm:base': { '#text': '3000', '@_uom': '[ft_i]' },
        'iwxxm:cloudType': { '@_xlink:href': 'https://codes.wmo.int/49-2/SigConvectiveCloudType/TCU' },
      },
    })

    assert.equal(cloud.type, 'TCU')
    assert.equal(cloud.raw, 'SCT030TCU')
  })

  it('type is null when no convective cloud is reported', () => {
    const cloud = parseCloudLayer({
      'iwxxm:CloudLayer': {
        'iwxxm:amount': { '@_xlink:href': 'https://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/BKN' },
        'iwxxm:base': { '#text': '800', '@_uom': '[ft_i]' },
      },
    })

    assert.equal(cloud.type, null)
    assert.equal(cloud.raw, 'BKN008')
  })
})
