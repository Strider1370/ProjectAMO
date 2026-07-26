import { AVIATION_WFS_LAYERS } from '../aviationWfsLayers.js'

// Tile symbology for the mobile layer grid. Colors mirror the live map
// (aviationWfsLayers.js is the single source) so the grid reads as a legend:
//  - area:   boundary-color square (CTR uses a dashed border like the map line)
//  - symbol: the real ICAO SVG already shipped under public/Symbols/
//  - line:   a line sample (ATS solid, RNAV dashed) — matches the airway paint
const colorById = Object.fromEntries(AVIATION_WFS_LAYERS.map((l) => [l.id, l.color]))

export const AVIATION_TILE_META = {
  fir: { kind: 'area', color: colorById.fir },
  sector: { kind: 'area', color: colorById.sector },
  ctr: { kind: 'area', color: colorById.ctr, dashed: true },
  tma: { kind: 'area', color: colorById.tma },
  restricted: { kind: 'area', color: colorById.restricted },
  prohibited: { kind: 'area', color: colorById.prohibited },
  danger: { kind: 'area', color: colorById.danger },
  moa: { kind: 'area', color: colorById.moa, dashed: true },
  waypoint: { kind: 'symbol', symbolUrl: '/Symbols/waypoint-rnav-flyby.svg' },
  navaid: { kind: 'symbol', symbolUrl: '/Symbols/navaid-vor-dme.svg' },
  airport: { kind: 'symbol', symbolUrl: '/Symbols/airport-civil.svg' },
  'ats-route': { kind: 'line', color: colorById['ats-route'] },
  'rnav-route': { kind: 'line', color: colorById['rnav-route'], dashed: true },
  'overseas-route': { kind: 'line', color: colorById['overseas-route'] },
  'overseas-waypoint': { kind: 'symbol', symbolUrl: '/Symbols/waypoint-rnav-flyby.svg' },
  'overseas-navaid': { kind: 'symbol', symbolUrl: '/Symbols/navaid-vor-dme.svg' },
  'overseas-airport': { kind: 'symbol', symbolUrl: '/Symbols/airport-civil.svg' },
  'overseas-fir': { kind: 'area', color: colorById['overseas-fir'], dashed: true },
}
