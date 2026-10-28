import { TROP_BANDS, TROP_EDGE_LEVELS } from '../../../shared/weather/tropopauseJetPresentation.js'
import { buildTropDisplayFl, buildTropEdges, buildTropJetRaster, buildTropopauseJetModel, pickJetBarbs, pressureToFl, sampleField } from '../lib/tropopauseJetModel.js'

export const CANDIDATE_LEVELS = TROP_EDGE_LEVELS
export const CANDIDATE_BANDS = TROP_BANDS
const LEGACY_LEVELS = [300, 340, 380, 420, 450]
const LEGACY_BANDS = TROP_BANDS.map((band, i) => ({ ...band,
  from: i === 0 ? -Infinity : LEGACY_LEVELS[i - 1], to: LEGACY_LEVELS[i],
  label: i === 0 ? '<300' : String(LEGACY_LEVELS[i - 1]),
}))
const prepareJet = (field, jet, candidate) => ({ ...jet,
  barbs: pickJetBarbs(field, jet, candidate ? { endKm: 0 } : undefined).filter(barb => barb.core),
  samples: jet.coordinates.map(point => ({ kt: sampleField(field, 'vmax', ...point), fl: pressureToFl(sampleField(field, 'pmax', ...point)) })),
})

export function buildComparisonModels(field, { fiveThousand = true, cleanJets = true, showHidden = false } = {}) {
  const display = buildTropDisplayFl(field)
  const production = buildTropopauseJetModel(field, { rasterScale: 2 })
  const selection = production.selection
  const checked = field.jets.filter(jet => jet.axisShown)
  const base = { grid: field.grid, checks: field.checks }
  const current = { ...base, key: `${field.revision}:current`, raster: buildTropJetRaster(field, display, 2, LEGACY_BANDS),
    edges: buildTropEdges(field, display, LEGACY_LEVELS), jets: checked.map(jet => prepareJet(field, jet, false)) }
  const proposed = { ...production, key: `${field.revision}:proposed:${fiveThousand}:${cleanJets}:${showHidden}`,
    raster: fiveThousand ? production.raster : current.raster,
    edges: fiveThousand ? production.edges : current.edges,
    jets: cleanJets ? production.jets : current.jets,
    declutter: cleanJets, cores: [],
    hiddenJets: cleanJets && showHidden ? selection.rejected.filter(item => item.jet.axisShown).map(item => item.jet) : [],
  }
  return { current, proposed, selection, currentBands: LEGACY_BANDS, proposedBands: fiveThousand ? CANDIDATE_BANDS : LEGACY_BANDS,
    currentLevels: LEGACY_LEVELS, proposedLevels: fiveThousand ? CANDIDATE_LEVELS : LEGACY_LEVELS }
}
