import assert from 'node:assert/strict'
import test from 'node:test'
import { AIRLINE_NAMES, airlineLogoFile, airlineLogoId, isKoreanAirline } from './airlines.js'

test('new Korean carriers have ADS-B names, logos, and route lookup', () => {
  for (const [code, name, logo] of [
    ['XUM', '섬에어', 'XUM.svg'],
    ['PTA', '파라타항공', 'PTA.svg'],
    ['AIH', '에어제타', 'AIH.png'],
  ]) {
    assert.equal(AIRLINE_NAMES[code], name)
    assert.equal(airlineLogoId(`${code}123`), code)
    assert.equal(airlineLogoFile(code), logo)
    assert.equal(isKoreanAirline(`${code}123`), true)
  }
})
