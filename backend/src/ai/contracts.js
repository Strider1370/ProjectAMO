import { z } from 'zod'

export const ERROR_CODES = [
  'INVALID_INPUT',
  'AIRPORT_NOT_FOUND',
  'AMBIGUOUS_AIRPORT',
  'DATA_UNAVAILABLE',
  'READ_FAILED',
  'INVALID_SOURCE',
  'INTERNAL_ERROR',
]

export const ISSUE_CODES = [
  ...ERROR_CODES,
  'COLLECTION_FAILED',
  'COLLECTION_PARTIAL',
  'TAF_OUTSIDE_WINDOW',
  'TAF_PARTIAL_COVERAGE',
  'TIMELINE_EMPTY',
  'MISSING_FIELD',
  'UNKNOWN_WARNING_VALIDITY',
  'RAW_UNAVAILABLE',
  'NON_PROJECTED_SIGNIFICANT_DATA',
]

export const CATEGORY_VALUES = ['VFR', 'MVFR', 'IFR', 'LIFR', 'UNKNOWN']
export const DERIVED_CATEGORY_VALUES = ['VFR', 'IFR', 'LIFR', 'UNKNOWN']
export const TAF_CHANGE_TYPES = [
  'BECMG',
  'TEMPO',
  'PROB30',
  'PROB40',
  'PROB30_TEMPO',
  'PROB40_TEMPO',
  'FM',
]

const ABSOLUTE_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/

export function isAbsoluteIsoInstant(value) {
  if (typeof value !== 'string') return false

  const match = ABSOLUTE_INSTANT_PATTERN.exec(value)
  if (!match) return false

  const [
    , yearText, monthText, dayText, hourText, minuteText, secondText,
    zone, , offsetHourText, offsetMinuteText,
  ] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)

  if (month < 1 || month > 12) return false
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false
  if (hour > 23 || minute > 59 || second > 59) return false

  if (zone !== 'Z') {
    const offsetHour = Number(offsetHourText)
    const offsetMinute = Number(offsetMinuteText)
    if (offsetHour > 23 || offsetMinute > 59) return false
  }

  return Number.isFinite(Date.parse(value))
}

export function isCanonicalIsoInstant(value) {
  if (!isAbsoluteIsoInstant(value)) return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

const absoluteInstant = z.string().refine(isAbsoluteIsoInstant, 'absolute ISO instant required')
const canonicalInstant = z.string().refine(isCanonicalIsoInstant, 'canonical UTC ISO instant required')
const nullableString = z.string().nullable()
const nullableInstant = canonicalInstant.nullable()
const numberOrNull = z.number().finite().nullable()
const booleanOrNull = z.boolean().nullable()
const categoryValue = z.enum(CATEGORY_VALUES)
const derivedCategoryValue = z.enum(DERIVED_CATEGORY_VALUES)
const visibilityQualifier = z.enum(['at_least', 'reported', 'unknown'])

export const AirportWeatherInputSchema = z.object({
  airports: z
    .array(z.string().transform((value) => value.trim()).pipe(z.string().min(1).max(80)))
    .min(1)
    .max(15),
  window: z.object({
    start: absoluteInstant,
    end: absoluteInstant,
  }).strict(),
  includeRaw: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  const start = Date.parse(value.window.start)
  const end = Date.parse(value.window.end)

  if (!(start < end)) {
    context.addIssue({
      code: 'custom',
      path: ['window'],
      message: 'start must precede end',
    })
  }
  if (end - start > 48 * 60 * 60 * 1000) {
    context.addIssue({
      code: 'custom',
      path: ['window'],
      message: 'window exceeds 48 hours',
    })
  }
})

const sourceSchema = z.object({
  id: z.string(),
  icao: z.string(),
  kind: z.enum(['metar', 'taf', 'warning']),
  provider: nullableString,
  snapshotId: nullableString,
  publicationId: nullableString,
  runId: nullableString,
  contentHash: nullableString,
  hashBasis: z.enum(['reader', 'canonical-snapshot']).nullable(),
  observedAt: nullableInstant,
  issuedAt: nullableInstant,
  fetchedAt: nullableInstant,
  validStart: nullableInstant,
  validEnd: nullableInstant,
  availability: z.enum(['available', 'missing', 'failed', 'invalid']),
  collectionStatus: z.enum(['complete', 'empty', 'partial', 'failed', 'unknown']),
  collectionReason: nullableString,
  retainedLastGood: z.boolean(),
  freshness: z.object({
    status: z.literal('unknown'),
    reason: z.literal('NO_FRESHNESS_POLICY'),
  }).strict(),
}).strict()

const issueSchema = z.object({
  code: z.enum(ISSUE_CODES),
  icao: nullableString,
  kind: z.enum(['metar', 'taf', 'warning']).nullable(),
  path: z.string(),
  reason: z.string(),
}).strict()

const intervalSchema = z.object({
  start: canonicalInstant,
  end: canonicalInstant,
}).strict()

const coverageSchema = z.object({
  icao: z.string(),
  kind: z.literal('taf'),
  requested: intervalSchema,
  validity: intervalSchema.nullable(),
  intersection: intervalSchema.nullable(),
  state: z.enum(['full', 'partial', 'none', 'unknown']),
  uncovered: z.array(intervalSchema),
}).strict()

const windSchema = z.object({
  direction: numberOrNull,
  speed: numberOrNull,
  gust: numberOrNull,
  unit: nullableString,
  variable: booleanOrNull,
  calm: booleanOrNull,
}).strict().nullable()

const cloudSchema = z.object({
  amount: nullableString,
  baseFt: numberOrNull,
  type: nullableString,
  raw: nullableString,
}).strict()

const rawLinesSchema = z.array(z.array(z.object({ text: z.string(), role: z.string() }).strict())).nullable()

const metarDigestSchema = z.object({
  sourceId: z.string(),
  reportType: nullableString,
  observationTime: nullableInstant,
  issueTime: nullableInstant,
  wind: windSchema,
  visibility: z.object({
    value: numberOrNull,
    minimumValue: numberOrNull,
    minimumDirectionDegrees: numberOrNull,
    cavok: booleanOrNull,
    qualifier: visibilityQualifier,
    unit: z.literal('m'),
  }).strict(),
  clouds: z.array(cloudSchema),
  weather: z.array(z.string()),
  temperature: z.object({
    air: numberOrNull,
    dewpoint: numberOrNull,
    unit: z.literal('C'),
  }).strict(),
  qnh: z.object({
    value: numberOrNull,
    unit: nullableString,
  }).strict(),
  ceilingFt: numberOrNull,
  rvr: z.object({
    status: z.enum(['reported', 'not_reported']),
    entries: z.array(z.object({
      runway: nullableString,
      mean: numberOrNull,
      minimum: numberOrNull,
      maximum: numberOrNull,
      tendency: nullableString,
      operator: nullableString,
      unit: z.literal('m'),
    }).strict()),
  }).strict(),
  category: z.object({
    sourceValue: categoryValue.nullable(),
    sourcePath: nullableString,
    derivedValue: derivedCategoryValue,
    derivedPolicy: z.literal('airport-minima-3-level'),
  }).strict(),
  rawKind: z.enum(['original', 'reconstructed', 'unavailable']),
  raw: nullableString,
  rawLines: rawLinesSchema,
  missingFields: z.array(z.string()),
}).strict()

const forecastStateSchema = z.object({
  wind: windSchema,
  visibilityM: numberOrNull,
  visibilityQualifier,
  cavok: booleanOrNull,
  clouds: z.array(cloudSchema).nullable(),
  weather: z.array(z.string()).nullable(),
  weatherTouched: booleanOrNull,
  cloudsTouched: booleanOrNull,
  nsw: booleanOrNull,
  nsc: booleanOrNull,
}).strict()

const tafDigestSchema = z.object({
  sourceId: z.string(),
  issuedAt: nullableInstant,
  validity: intervalSchema,
  base: forecastStateSchema,
  changes: z.array(z.object({
    index: z.number().int().nonnegative(),
    type: z.enum(TAF_CHANGE_TYPES),
    start: nullableInstant,
    end: nullableInstant,
    probability: numberOrNull,
    semantics: z.enum(['transition', 'from', 'temporary', 'probabilistic']),
    state: forecastStateSchema,
  }).strict()),
  samples: z.array(z.object({
    time: canonicalInstant,
    visibilityM: numberOrNull,
    cavok: booleanOrNull,
    visibilityQualifier,
    ceilingFt: numberOrNull,
    derivedCategory: derivedCategoryValue,
    weather: z.array(z.string()),
  }).strict()),
  sampleSemantics: z.literal('parser-merged-samples'),
  rawKind: z.enum(['original', 'reconstructed', 'unavailable']),
  raw: nullableString,
  rawLines: rawLinesSchema,
  missingFields: z.array(z.string()),
}).strict()

const warningsDigestSchema = z.object({
  sourceId: z.string(),
  status: z.enum(['present', 'none', 'unknown', 'unavailable', 'failed']),
  items: z.array(z.object({
    id: z.string(),
    type: nullableString,
    key: nullableString,
    name: nullableString,
    issuedAt: nullableInstant,
    validStart: nullableInstant,
    validEnd: nullableInstant,
    relation: z.enum(['overlap', 'unknown']),
  }).strict()),
  unassessedCount: z.number().int().nonnegative(),
}).strict()

export const AirportWeatherOutputSchema = z.object({
  schemaVersion: z.literal('1'),
  status: z.enum(['ok', 'partial', 'error']),
  reference: z.object({
    effectiveNow: canonicalInstant,
    generatedAt: canonicalInstant,
    clockMode: z.enum(['live', 'fixture']),
    displayTimezone: z.string(),
  }).strict(),
  data: z.object({
    airports: z.array(z.object({
      icao: z.string(),
      nameKo: z.string(),
      metar: metarDigestSchema.nullable(),
      taf: tafDigestSchema.nullable(),
      warnings: warningsDigestSchema,
    }).strict()),
  }).strict(),
  sources: z.array(sourceSchema),
  coverage: z.array(coverageSchema),
  issues: z.array(issueSchema),
  truncation: z.object({
    omittedCount: z.literal(0),
    nextCursor: z.null(),
  }).strict(),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    candidates: z.array(z.object({
      icao: z.string(),
      nameKo: z.string(),
    }).strict()),
  }).strict().nullable(),
}).strict()

export const SOURCE_META_KEYS = new Set([
  'snapshotId',
  'contentHash',
  'publicationId',
  'runId',
  'collectionStatus',
  'collectionReason',
  'sourceCategories',
])
