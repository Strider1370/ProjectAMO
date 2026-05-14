import { classifySigwxLowItem } from './sigwx-low-classifier.js'

function groupKeyFor(item, classification, index) {
  if (classification.semanticRole === 'strong-surface-wind-speed') return 'sfc-wind'
  if (classification.semanticRole === 'strong-surface-wind-area') return 'sfc-wind'
  if (classification.semanticRole === 'pressure' || classification.semanticRole === 'front') return 'pressure-front'
  return `${classification.semanticRole}-${item?.id || index}`
}

function makePhenomenon(item, classification, index) {
  return {
    id: `sigwx-low-phenomenon-${index}`,
    semanticRole: classification.semanticRole,
    renderRole: classification.renderRole,
    filterKey: classification.filterKey,
    visibleLabel: classification.visibleLabel,
    sourceItem: item,
    items: [item],
    children: [],
    render: {
      labelLines: classification.labelLines,
    },
  }
}

export function buildSigwxLowPhenomena(payload) {
  const phenomena = []
  const groups = new Map()

  ;(payload?.items || []).forEach((item, index) => {
    const classification = classifySigwxLowItem(item)
    const key = groupKeyFor(item, classification, index)
    const existing = groups.get(key)

    if (existing && classification.semanticRole === 'strong-surface-wind-area') {
      const replacement = makePhenomenon(item, classification, phenomena.indexOf(existing))
      replacement.children = existing.children.length > 0
        ? existing.children
        : [{
            id: existing.sourceItem?.id || `${replacement.id}-child-0`,
            semanticRole: existing.semanticRole,
            renderRole: existing.renderRole,
            visibleLabel: existing.visibleLabel,
            filterKey: existing.filterKey,
            sourceItem: existing.sourceItem,
          }]
      replacement.items.push(...existing.items)
      const existingIndex = phenomena.indexOf(existing)
      phenomena[existingIndex] = replacement
      groups.set(key, replacement)
      return
    }

    if (existing && classification.semanticRole === 'strong-surface-wind-speed') {
      const child = {
        id: item?.id || `${existing.id}-child-${existing.children.length}`,
        semanticRole: classification.semanticRole,
        renderRole: classification.renderRole,
        visibleLabel: classification.visibleLabel,
        filterKey: classification.filterKey,
        sourceItem: item,
      }
      existing.children.push(child)
      existing.items.push(item)
      return
    }

    const phenomenon = makePhenomenon(item, classification, phenomena.length)
    groups.set(key, phenomenon)
    phenomena.push(phenomenon)
  })

  return phenomena
}

export function enrichSigwxLowWithPhenomena(payload) {
  return {
    ...payload,
    phenomena: buildSigwxLowPhenomena(payload),
  }
}
