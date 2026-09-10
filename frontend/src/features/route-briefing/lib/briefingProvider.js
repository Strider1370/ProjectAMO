import { fetchOrganizationBriefing } from '../../organization-lounge/api.js'
import { fetchRouteBriefing, fetchVerticalProfile, fetchCrossSection } from '../../../api/briefingApi.js'

// Selection is explicit: organization failures never retry through personal APIs.
export function createBriefingProvider(context, dependencies = {}) {
  if (context?.kind === 'organization') {
    return { load: ({ overrides, signal }) => (dependencies.organization ?? fetchOrganizationBriefing)({
      ...context, overrides, signal,
    }) }
  }
  return {
    async load({ request, profileRequest, crossSectionRequest, signal }) {
      const briefing = await (dependencies.briefing ?? fetchRouteBriefing)(request, { signal })
      const [profile, section] = await Promise.allSettled([
        (dependencies.profile ?? fetchVerticalProfile)(profileRequest, { signal }),
        (dependencies.crossSection ?? fetchCrossSection)(crossSectionRequest, { signal }),
      ])
      return { briefing, verticalProfile: profile.status === 'fulfilled' ? profile.value : null,
        crossSection: section.status === 'fulfilled' ? section.value : null }
    },
  }
}

// Abort is best effort; the monotonically increasing identity also rejects transports
// that finish after cancellation, including a switch to another organization.
export function createBriefingRequestGate() {
  let sequence = 0
  let controller = null
  return {
    cancel() { sequence += 1; controller?.abort(); controller = null },
    begin() {
      controller?.abort()
      controller = new AbortController()
      const id = ++sequence
      const signal = controller.signal
      return { id, signal, isCurrent: () => id === sequence && !signal.aborted }
    },
  }
}
