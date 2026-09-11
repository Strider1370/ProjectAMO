const USABLE = new Set(['available', 'partial', 'out_of_range'])

function finiteInteger(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function modelFrom(selection, key) {
  return selection?.models?.[key] ?? selection?.[key] ?? null
}

export function pinnedModel(mapDataSelection, key) {
  return modelFrom(mapDataSelection, key)
}

export function pinnedKimLevels(mapDataSelection) {
  const model = modelFrom(mapDataSelection, 'kim')
  return (model?.levelIds || model?.levels?.map((item) => item.id || item.level || item) || []).map(String)
}

export function pinnedKtgLevels(mapDataSelection) {
  const model = modelFrom(mapDataSelection, 'ktg')
  return (model?.altLevelsFt || model?.levels || []).map(Number).filter(Number.isFinite)
}

function resourceEntries(resources, variable) {
  if (!resources) return []
  if (Array.isArray(resources)) return resources
  const resourceKey = variable === 'temperature' ? 'temp' : variable
  const scoped = resources[resourceKey] ?? resources.levels ?? resources.altitudes ?? resources
  if (Array.isArray(scoped)) return scoped
  return Object.entries(scoped || {}).map(([key, value]) => ({
    ...(typeof value === 'object' && value ? value : {}),
    level: value?.level ?? value?.levelId ?? key,
    altFt: value?.altFt ?? (Number.isFinite(Number(key)) ? Number(key) : undefined),
    revision: value?.revision ?? (typeof value === 'string' ? value : undefined),
  }))
}

export function pinnedKimSelection(mapDataSelection, { level = null, variable = 'wind' } = {}) {
  const model = modelFrom(mapDataSelection, 'kim')
  if (!model || !USABLE.has(model.status || 'available')) return null
  const levels = model.levelIds || model.levels?.map((item) => item.id || item.level || item) || []
  const selectedLevel = levels.includes(level) ? level : levels[0] || model.level || null
  const resources = resourceEntries(model.resources || model.availability, variable)
  const resource = resources.find((item) => String(item.levelId ?? item.level) === String(selectedLevel))
    ?? resources.find((item) => item.variable === variable && !item.level && !item.levelId)
  const revision = resource?.revision ?? model.resourceRevision ?? model.revision
  const hf = finiteInteger(model.hf)
  if (!mapDataSelection?.bundleId || !model.tmfc || hf == null || !selectedLevel || !revision) return null
  return {
    mode: 'pinned',
    bundleId: mapDataSelection.bundleId,
    tmfc: String(model.tmfc),
    hf,
    level: String(selectedLevel),
    validTime: model.validTime || null,
    revision: String(revision),
    resourceId: resource?.resourceId || resource?.url || null,
  }
}

export function pinnedKtgSelection(mapDataSelection, { altFt = null } = {}) {
  const model = modelFrom(mapDataSelection, 'ktg')
  if (!model || !USABLE.has(model.status || 'available')) return null
  const levels = (model.altLevelsFt || model.levels || []).map(Number).filter(Number.isFinite)
  const requested = finiteInteger(altFt)
  const selectedAltFt = requested != null && levels.includes(requested) ? requested : levels[0] ?? finiteInteger(model.altFt)
  const resources = resourceEntries(model.resources || model.availability, 'turbulence')
  const resource = resources.find((item) => Number(item.altFt ?? item.level) === selectedAltFt)
  const revision = resource?.revision ?? model.resourceRevision ?? model.revision
  const hf = finiteInteger(model.hf)
  if (!mapDataSelection?.bundleId || !model.tmfc || hf == null || selectedAltFt == null || !revision) return null
  return {
    mode: 'pinned',
    bundleId: mapDataSelection.bundleId,
    tmfc: String(model.tmfc),
    hf,
    altFt: selectedAltFt,
    validTime: model.validTime || null,
    revision: String(revision),
    resourceId: resource?.resourceId || resource?.url || null,
  }
}

export function pinnedModelStatus(mapDataSelection, key) {
  const model = modelFrom(mapDataSelection, key)
  if (!model) return { status: 'unsupported', reason: 'selection_missing' }
  if (!USABLE.has(model.status || 'available')) return { status: model.status, reason: model.reason || null }
  const selected = key === 'kim' ? pinnedKimSelection(mapDataSelection) : pinnedKtgSelection(mapDataSelection)
  return selected ? { status: model.status || 'available', reason: null } : {
    status: 'unsupported',
    reason: 'immutable_resource_revision_missing',
  }
}

export function pinnedFrameDescriptors(mapDataSelection) {
  const frames = mapDataSelection?.frames ?? {
    radar: mapDataSelection?.radar,
    satellite: mapDataSelection?.satellite,
  }
  return ['radar', 'satellite'].flatMap((kind) => {
    const frame = frames?.[kind]
    if (frame?.status !== 'available' || !frame?.revision || !(frame.url || frame.resourceId) || !frame.bounds) return []
    return [{ kind, ...frame, url: frame.url || frame.resourceId }]
  })
}

export function pinnedFrameStatus(mapDataSelection, kind) {
  const frame = mapDataSelection?.frames?.[kind] ?? mapDataSelection?.[kind]
  if (!frame) return { status: 'unsupported', reason: 'selection_missing' }
  if (frame.status !== 'available') return { status: frame.status || 'unavailable', reason: frame.reason || null }
  const available = pinnedFrameDescriptors({ frames: { [kind]: frame } }).length > 0
  return available ? { status: 'available', reason: null } : {
    status: 'unsupported', reason: 'immutable_frame_revision_missing',
  }
}
