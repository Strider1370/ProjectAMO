import { copilotRequest } from './copilotApi.js'

// Live accessors are intentional: editor/auth can change during either read.
export function createSavedRouteHandoff({ current, read = (ref) => copilotRequest(`/saved-routes/${ref}`) }) {
  const check = (owner) => {
    const value = current()
    if (!value.owner || (owner != null && value.owner !== owner)) throw new Error('AUTH_CHANGED')
    if (value.mapEditing) throw new Error('MAP_EDIT_ACTIVE')
    return value
  }
  return {
    async prepare(ref) {
      if (!/^saved_route_[a-f0-9-]{36}$/.test(ref ?? '')) throw new Error('INVALID_SAVED_ROUTE')
      const initial = check()
      const revision = initial.actions.getCopilotEditorRevision()
      const bundle = await read(ref)
      if (bundle.reference?.savedRouteRef !== ref) throw new Error('INVALID_SAVED_ROUTE')
      const prepared = await check(initial.owner).actions.previewCopilotSavedRoute(bundle, revision)
      check(initial.owner)
      return { ...prepared, owner: initial.owner }
    },
    async apply(prepared) {
      check(prepared.owner)
      // Recheck deletion/modification with the server immediately before commit.
      const latest = await read(prepared.bundle.reference.savedRouteRef)
      const value = check(prepared.owner)
      if (latest.status !== 'ok' || latest.routeHash !== prepared.bundle.routeHash
        || latest.entry?.id !== prepared.bundle.entry.id
        || latest.reference?.savedRouteRef !== prepared.bundle.reference.savedRouteRef) throw new Error('SAVED_ROUTE_CHANGED')
      return value.actions.applyCopilotSavedRoute(prepared)
    },
  }
}
