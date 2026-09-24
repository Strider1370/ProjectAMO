import { composeBriefing } from './briefing-composer.js'
import { captureAltitudeInputs } from './altitude-service.js'

export const BRIEFING_DATASETS = Object.freeze({
  metar: 'metar', metarOverseas: 'metar_overseas', taf: 'taf', tafOverseas: 'taf_overseas',
  sigmet: 'sigmet', sigmetOverseas: 'sigmet_overseas', airmet: 'airmet', warning: 'warning',
  amos: 'amos', takeoff_fcst: 'takeoff_fcst', notam: 'notam', typhoon: 'typhoon',
})

// Preserve the existing REST validation and error messages. Untrusted AI context
// registration has a separate, stricter boundary; the model never supplies geometry.
export function validateBriefingRequest(body = {}) {
  let message
  if (!body.departureAirport || !body.arrivalAirport || !body.routeGeometry?.coordinates?.length) {
    message = 'departureAirport, arrivalAirport, routeGeometry are required'
  } else if (!body.etd || !body.eta) {
    message = 'etd and eta are required'
  } else if (!Number.isFinite(Date.parse(body.etd)) || !Number.isFinite(Date.parse(body.eta))) {
    message = 'etd and eta must be valid ISO timestamps'
  } else if (Date.parse(body.eta) <= Date.parse(body.etd)) {
    message = 'eta must be later than etd'
  }
  if (message) throw Object.assign(new Error(message), { status: 400 })
}

// Injection keeps this service independent of Express, the store and collection.
// Capture each dataset once, then compose synchronously from that same selection.
export function executeBriefing(request, {
  readCached, weatherNow = Date.now, readAirspaceZones = () => [], dataRoot,
  enrouteCrossSection, captureComparison = false, terrainSampler, loadModel, loadConstraints,
}) {
  validateBriefingRequest(request)
  const data = Object.fromEntries(Object.entries(BRIEFING_DATASETS)
    .map(([key, dataset]) => [key, readCached(dataset)]))
  data.airspaceZones = readAirspaceZones()
  data.now = weatherNow()
  if (dataRoot) data.dataRoot = dataRoot
  if (enrouteCrossSection) data.enrouteCrossSection = enrouteCrossSection
  const comparisonInputs = captureComparison ? captureAltitudeInputs(request, data, { terrainSampler, loadModel, loadConstraints }) : null
  if (comparisonInputs) {
    data.enrouteCrossSection = comparisonInputs.model
    data.aipConstraints = comparisonInputs.aip
  }
  return { briefing: composeBriefing(request, data), data, comparisonInputs }
}
