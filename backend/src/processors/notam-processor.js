import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import store from '../store.js'
import config from '../config.js'
import { crawlNotamKml } from '../notam/notam-crawler.js'
import { parseNotamKml, parseNotamText } from '../parsers/notam-parser.js'

// Q-code 2nd/3rd letter (subject) → category. Facility-family subject codes are listed
// explicitly (spec Q-code table); genuinely unmapped/malformed codes → 'other'.
const SUBJECT_CATEGORY = {
  RP: 'prohibited',
  WM: 'firing',
  RD: 'danger',
  RR: 'restricted', RT: 'restricted', RA: 'restricted',
  OB: 'obstacle', PO: 'obstacle',
  // 항행안전시설(GNSS/ILS/VOR/레이더/무선국) + 공항시설(활주로/유도로/계기접근절차 등)
  GA: 'facility', GW: 'facility', IC: 'facility', IL: 'facility', IN: 'facility', IG: 'facility', ID: 'facility',
  NT: 'facility', CT: 'facility', CP: 'facility', CA: 'facility',
  MR: 'facility', MX: 'facility', MP: 'facility', MD: 'facility', MB: 'facility', MA: 'facility', LX: 'facility',
  FA: 'facility', PI: 'facility', PF: 'facility',
}
const KOREA_FIR_CODES = config.notam.fir_codes

export function categorize(qcode) {
  if (!qcode || !/^Q[A-Z]{4}$/.test(qcode)) return 'other'
  return SUBJECT_CATEGORY[qcode.slice(1, 3)] || 'other'
}

export function deriveScope(location) {
  return KOREA_FIR_CODES.includes(location) ? 'fir' : 'airport'
}

// Operational hint only: a conservative sorting aid, never an official safety grade.
export function classifyOperationalNotam(qcode, summary) {
  const text = String(summary || '').replace(/\s+/g, ' ').toUpperCase()
  const subject = /^Q[A-Z]{4}$/.test(qcode || '') ? qcode.slice(1, 3) : ''
  const information = /^(TRIGGER NOTAM|REF\s+AIP|AD OPS HR CHG)/.test(text)
  const target = information ? 'information'
    : subject === 'MR' ? 'runway'
      : subject === 'MX' ? 'taxiway'
        : ['PI', 'PF'].includes(subject) ? 'procedure'
          : ['GA', 'GW', 'IC', 'IL', 'IN', 'IG', 'ID', 'NT'].includes(subject) ? 'navigation'
            : subject === 'LX' ? 'lighting'
              : subject === 'MP' ? 'stand'
                : subject === 'CP' && /\bPAR\b/.test(text) ? 'navigation'
                  : ['CT', 'CP', 'CA'].includes(subject) ? 'communication'
                  : ['prohibited', 'firing', 'danger', 'restricted'].includes(categorize(qcode)) || /\b(DRONE|CONDITIONAL ROUTE)\b/.test(text) ? 'airspace'
                    : categorize(qcode) === 'obstacle' ? 'obstacle'
                      : /\b(SID|STAR|IAP|APPROACH|PROCEDURE|FLOW CTL)\b/.test(text) ? 'procedure'
                        : /\b(ILS|LOC|GLIDE PATH|GP|VOR|DME|NDB|GNSS|GPS|PAR)\b/.test(text) ? 'navigation'
                          : /\b(TORA|TODA|ASDA|LDA|DECLARED DISTANCE|RWY)\b/.test(text) ? 'runway'
                            : /\bTWY\b/.test(text) ? 'taxiway'
                              : /\b(LGT|LIGHTING|PAPI|RCLL|CLL)\b/.test(text) ? 'lighting'
                                : /\b(APRON|ACFT STAND|STAND|GATE|RAMP)\b/.test(text) ? 'stand'
                                  : /\b(FREQ|TWR|ATIS|RADIO|COMM)\b/.test(text) ? 'communication' : 'unknown'
  const action = /\b(CLSD|CLOSED)\b/.test(text) ? 'closure'
    : /\b(NOT AVBL|U\/S|UNSERVICEABLE|SUSPENDED|WITHDRAWN)\b/.test(text) ? 'unavailable'
      : /\b(PROHIBITED|RESTRICTED|LIMITED|AVBL FOR|\bACT\b|FLOW CTL|CONDITIONAL ROUTE)\b/.test(text) ? 'restricted'
        : /\bWIP\b/.test(text) ? 'work'
          : /\b(TORA|TODA|ASDA|LDA|DECLARED DISTANCE)\b/.test(text) ? 'degraded'
            : information ? 'information' : 'unknown'
  const priority = (target === 'runway' && ['closure', 'unavailable', 'restricted'].includes(action)) ||
    (target === 'procedure' && ['unavailable', 'restricted'].includes(action)) ||
    (target === 'navigation' && ['unavailable', 'restricted'].includes(action) && /\b(ILS|LOC|GLIDE PATH|GP|PAR)\b/.test(text)) ? 'critical'
      : ['taxiway', 'stand', 'lighting', 'obstacle', 'communication', 'airspace'].includes(target) || action === 'work' || action === 'degraded' || target === 'navigation' ? 'warning'
        : target === 'information' || action === 'information' ? 'info' : 'unclassified'
  const confidence = target === 'unknown' ? 'review' : (information || subject ? 'high' : 'medium')
  return { target, action, priority, confidence, reason: `${target}:${action}` }
}

export function reconcileNotamSources(kml, searchItems) {
  const { items, placemarks, dropped } = parseNotamKml(kml)
  if (dropped) throw new Error(`KML parse dropped ${dropped}/${placemarks}`)
  const byId = new Map(items.map(item => [item.id, item]))
  if (byId.size !== items.length) throw new Error('duplicate KML NOTAM ids')
  if (searchItems) {
    const sourceIds = new Set(searchItems.map(row => row.NOTAM_NO))
    if (sourceIds.size !== searchItems.length) throw new Error('duplicate search NOTAM ids')
    if (items.some(item => !sourceIds.has(item.id))) throw new Error('KML/search identity mismatch')
    for (const row of searchItems) {
      // Search text is the lossless source; KML contributes geometry only.
      const parsed = parseNotamText(row.FULL_TEXT, row.NOTAM_NO, byId.get(row.NOTAM_NO)?.geometry || null)
      if (!parsed) throw new Error(`unparsed search NOTAM ${row.NOTAM_NO}`)
      const kmlItem = byId.get(row.NOTAM_NO)
      if (kmlItem && ['qcode', 'location', 'validFrom', 'validTo'].some(key => kmlItem[key] !== parsed[key])) {
        throw new Error(`KML/search fields disagree for ${row.NOTAM_NO}`)
      }
      byId.set(row.NOTAM_NO, kmlItem ? { ...parsed, geometry: kmlItem.geometry, bufferNm: kmlItem.bufferNm,
        geometrySource: kmlItem.geometrySource, approximated: kmlItem.approximated } : parsed)
    }
  }
  return { items: [...byId.values()], audit: { searchCount: searchItems?.length ?? null, kmlCount: placemarks,
    parsedCount: byId.size, supplementedCount: byId.size - items.length, dropped } }
}

function archiveSource(crawled, audit) {
  const dir = path.join(config.storage.base_path, 'notam', 'source')
  fs.mkdirSync(dir, { recursive: true })
  const record = { ...crawled, audit, parser_version: 2 }
  const bytes = Buffer.from(JSON.stringify(record))
  const hash = createHash('sha256').update(bytes).digest('hex')
  const name = `${crawled.fetchedAt.replace(/[^0-9TZ]/g, '')}-${hash.slice(0, 12)}.json.gz`
  fs.writeFileSync(path.join(dir, `${name}.tmp`), gzipSync(bytes))
  fs.renameSync(path.join(dir, `${name}.tmp`), path.join(dir, name))
  for (const old of fs.readdirSync(dir).filter(name => name.endsWith('.json.gz')).sort().slice(0, -12)) fs.rmSync(path.join(dir, old))
  return { path: `notam/source/${name}`, sha256: hash }
}

export async function process({ crawl = crawlNotamKml, save = store.save, archive = archiveSource } = {}) {
  let crawled, reconciled, archived
  try {
    crawled = await crawl()
    reconciled = reconcileNotamSources(crawled.kml, crawled.searchItems)
    archived = archive(crawled, reconciled.audit)
  } catch (err) {
    return { type: 'notam', saved: false, reason: `crawl_failed: ${err.message}`, items: 0 }
  }
  const parsed = reconciled.items
  const items = parsed.map((r) => ({
    id: r.id,
    series: r.series,
    location: r.location,
    qcode: r.qcode,
    category: categorize(r.qcode),
    scope: deriveScope(r.location),
    valid_from: r.validFrom,
    valid_to: r.validTo,
    validity_end: r.validityEnd,
    schedule_text: r.scheduleText,
    altitude: r.altitude,
    operational: classifyOperationalNotam(r.qcode, r.summary),
    summary: r.summary,
    rawText: r.rawText,
    geometry: r.geometry,
    bufferNm: r.bufferNm,
    geometrySource: r.geometrySource,
    approximated: r.approximated,
    geographicExclusions: r.geographicExclusions,
    coverage: deriveScope(r.location) === 'fir' && ['prohibited', 'restricted', 'danger', 'firing'].includes(categorize(r.qcode)) ? 'area' : deriveScope(r.location),
  }))
  if (items.length === 0) {
    return { type: 'notam', saved: false, reason: 'empty', items: 0 }
  }
  const result = { fetched_at: crawled.fetchedAt, horizon_hours: config.notam.horizon_hours, parser_version: 2, audit: reconciled.audit, source: archived, items }
  const saveResult = save('notam', result)
  return { type: 'notam', saved: saveResult.saved, items: items.length }
}

export default { process, categorize, deriveScope }
