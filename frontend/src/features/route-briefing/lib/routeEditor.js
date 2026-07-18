function copy(value) {
  return structuredClone(value ?? null)
}

function emptyEnroute() {
  return { terms: [], legIntents: [], userWaypoints: [], nextWaypointNumber: 1 }
}

export function createRouteEditor({ routeForm = {}, procedures = {}, enroute = emptyEnroute(), rawText = '', preview = null, pendingIntent = null } = {}) {
  return {
    routeForm: copy(routeForm) ?? {},
    procedures: {
      sid: procedures.sid ?? null,
      star: procedures.star ?? null,
      iapKey: procedures.iapKey ?? null,
    },
    enroute: copy(enroute) ?? emptyEnroute(),
    rawText,
    preview,
    pendingIntent,
  }
}

export function emptyEditorForContext(routeForm) {
  return createRouteEditor({ routeForm })
}

export function editorFromBase(base) {
  return createRouteEditor({
    routeForm: base?.routeForm,
    procedures: base?.procedures,
    enroute: base?.enroute,
    rawText: base?.routeString ?? '',
  })
}

export function replaceEditorEnroute(editor, enroute, updates = {}) {
  return createRouteEditor({ ...editor, ...updates, enroute })
}

export function replaceEditorProcedures(editor, procedures) {
  return createRouteEditor({ ...editor, procedures: { ...editor.procedures, ...procedures } })
}

export function updateEditorContext(editor, { routeForm = {}, procedures = {}, resetDraft = false } = {}) {
  return createRouteEditor({
    ...editor,
    routeForm: { ...editor.routeForm, ...routeForm },
    procedures: { ...editor.procedures, ...procedures },
    ...(resetDraft ? { enroute: emptyEnroute(), rawText: '' } : {}),
    preview: null,
    pendingIntent: null,
  })
}
