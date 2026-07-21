import store from '../store.js'
import config from '../config.js'
import { crawlNotamKml } from '../notam/notam-crawler.js'
import { parseNotamKml } from '../parsers/notam-parser.js'

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

export async function process() {
  let crawled
  try {
    crawled = await crawlNotamKml()
  } catch (err) {
    return { type: 'notam', saved: false, reason: `crawl_failed: ${err.message}`, items: 0 }
  }
  const raw = parseNotamKml(crawled.kml)
  const items = raw.map((r) => ({
    id: r.id,
    series: r.series,
    location: r.location,
    qcode: r.qcode,
    category: categorize(r.qcode),
    scope: deriveScope(r.location),
    valid_from: r.validFrom,
    valid_to: r.validTo,
    schedule_text: r.scheduleText,
    altitude: r.altitude,
    operational: classifyOperationalNotam(r.qcode, r.summary),
    summary: r.summary,
    rawText: r.rawText,
    geometry: r.geometry,
  }))
  if (items.length === 0) {
    return { type: 'notam', saved: false, reason: 'empty', items: 0 }
  }
  const result = { fetched_at: crawled.fetchedAt, horizon_hours: config.notam.horizon_hours, items }
  const saveResult = store.save('notam', result)
  return { type: 'notam', saved: saveResult.saved, items: items.length }
}

export default { process, categorize, deriveScope }
