export const MAX_ROUTE_DESIGNS = 4

function copyEditable(value) {
  return structuredClone(value ?? {})
}

function nextDesignId(designs) {
  let number = 1
  let id = `route-design-${number}`
  const ids = new Set(designs.map((design) => design.id))

  while (ids.has(id)) {
    number += 1
    id = `route-design-${number}`
  }

  return id
}

export function createRouteDesign({
  id = 'base',
  name = '기본 경로',
  kind = id === 'base' ? 'base' : 'alternative',
  routeForm,
  procedures,
  routeResult,
  routeModel,
  routeExposure,
  viaFixes = [],
  enroute = null,
  routeString = '',
  undoStack = [],
  draftEditor = null,
  pendingEdit = null,
}) {
  return {
    id,
    name,
    kind,
    routeForm: copyEditable(routeForm),
    procedures: copyEditable(procedures),
    routeResult,
    routeModel,
    routeExposure,
    viaFixes: [...viaFixes],
    enroute: copyEditable(enroute),
    routeString,
    undoStack: [...undoStack],
    draftEditor: draftEditor ? copyEditable(draftEditor) : null,
    pendingEdit: pendingEdit ? copyEditable(pendingEdit) : null,
  }
}

export function snapshotRouteDesign(design) {
  return {
    routeForm: copyEditable(design.routeForm),
    procedures: copyEditable(design.procedures),
    routeResult: design.routeResult,
    routeModel: design.routeModel,
    routeExposure: design.routeExposure,
    viaFixes: [...design.viaFixes],
    enroute: copyEditable(design.enroute),
    routeString: design.routeString,
  }
}

export function duplicateRouteDesign(designs, selectedId) {
  const selected = designs.find((design) => design.id === selectedId)
  if (!selected || designs.length >= MAX_ROUTE_DESIGNS) return { designs, selectedId }

  const copy = createRouteDesign({
    ...snapshotRouteDesign(selected),
    id: nextDesignId(designs),
    name: `경로 ${String.fromCharCode(64 + designs.length)}`,
    kind: 'alternative',
    undoStack: [],
  })
  const nextDesigns = [...designs, copy]

  return { designs: nextDesigns, selectedId: copy.id }
}

export function renameRouteDesign(designs, id, name) {
  const trimmedName = String(name ?? '').trim()
  if (!trimmedName || designs.find((design) => design.id === id)?.kind === 'base') return designs

  return designs.map((design) => (design.id === id ? { ...design, name: trimmedName } : design))
}

export function removeRouteDesign(designs, id, selectedId) {
  const index = designs.findIndex((design) => design.id === id)
  if (designs.length <= 1 || index < 0 || designs[index].kind === 'base') return { designs, selectedId }

  const nextDesigns = designs.filter((design) => design.id !== id)
  if (id !== selectedId) return { designs: nextDesigns, selectedId }

  return {
    designs: nextDesigns,
    selectedId: nextDesigns[Math.max(0, index - 1)].id,
  }
}
