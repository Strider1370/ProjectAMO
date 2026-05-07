import { XMLParser } from 'fast-xml-parser'
import { toArray, text } from './parse-utils.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item',
  parseTagValue: false,
})

function getItems(doc) {
  return toArray(doc?.response?.body?.items?.item || doc?.body?.items?.item)
}

function getResultCode(doc) {
  return String(doc?.response?.header?.resultCode || doc?.header?.resultCode || '').trim()
}

function str(val) {
  if (val == null) return null
  const s = String(val).trim()
  return s || null
}

export function parse(xmlString, icao) {
  const doc = parser.parse(xmlString)
  if (getResultCode(doc) !== '00') return null

  const items = getItems(doc)
  if (!items.length) return null

  const item = items[0]
  return {
    icao,
    tm: str(text(item.tm)),
    title: str(text(item.title)),
    summary: str(text(item.summary)),
    outlook: str(text(item.outlook)),
    sel_val1: str(text(item.sel_val1)),
    sel_val2: str(text(item.sel_val2)),
    sel_val3: str(text(item.sel_val3)),
    forecast: str(text(item.forecast)),
    warn: str(text(item.warn)),
  }
}

export default { parse }
