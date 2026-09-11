import { Router } from 'express'

import { requireAuth, requireRole } from '../auth/middleware.js'
import { getDb } from '../db/index.js'
import { buildOrganizationBriefingBundle } from './briefing.js'
import {
  OrganizationError,
  PLANNING_ROLES,
  assertVersion,
  handleOrganizationError,
} from './common.js'
import { requireOrganizationMember, requireTrustedMutationOrigin } from './middleware.js'
import {
  createFlight,
  createOrganization,
  currentBriefingRunSnapshot,
  getFlight,
  getOrganization,
  listFlights,
  listMembers,
  listUserOrganizations,
  putMember,
  updateFlight,
  updateOrganization,
  createNotice,
  listNotices,
  updateNotice,
  deleteNotice,
  createInterest,
  listInterests,
  updateInterest,
  deleteInterest,
  createBriefing,
  listBriefings,
  getBriefing,
  updateBriefing,
  startBriefingRun,
  getBriefingRun,
  saveBriefingRunCandidate,
  shareSavedRoute,
  applyBriefingRun,
  endBriefingRun,
  listAlerts,
  updateAlertState,
} from './repository.js'
import { createMaterialsHandlers } from './materials.js'
import { evaluateAndStoreOrganizationSituation } from './situation.js'

const asyncRoute = (handler) => (req, res) => Promise.resolve().then(() => handler(req, res)).catch((error) => handleOrganizationError(res, error))

function requirePlanning(req) {
  if (!PLANNING_ROLES.includes(req.organizationMember?.role)) throw new OrganizationError(403, 'organization_forbidden')
}

function requireOrganizationAdmin(req) {
  if (req.organizationMember?.role !== 'admin') throw new OrganizationError(403, 'organization_forbidden')
}

function ensureCanEditFlight(req, flight) {
  if (PLANNING_ROLES.includes(req.organizationMember.role)) return
  if (Number(flight.createdBy) === Number(req.session.userId)) return
  if (Number(flight.assignedUserId) !== Number(req.session.userId)) throw new OrganizationError(403, 'organization_forbidden')
}

function ensureCanPatchFlight(req, flight, body) {
  if (PLANNING_ROLES.includes(req.organizationMember.role)) return
  const callerId = Number(req.session.userId)
  if (Number(flight.createdBy) === callerId) {
    if (Object.prototype.hasOwnProperty.call(body, 'assignedUserId')
      && Number(body.assignedUserId) !== Number(flight.assignedUserId)) throw new OrganizationError(403, 'organization_forbidden')
    return
  }
  ensureCanEditFlight(req, flight)
  const unknown = Object.keys(body).filter((key) => !['expectedVersion', 'blocks', 'materialRefs'].includes(key))
  if (unknown.length) throw new OrganizationError(403, 'organization_forbidden')
}

export function createMeOrganizationsRouter({ db = null, trustedMutationOrigin = requireTrustedMutationOrigin() } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireAuth)
  router.get('/', (req, res) => res.json({ organizations: listUserOrganizations(database(), req.session.userId) }))
  router.post('/', trustedMutationOrigin, asyncRoute((req, res) => {
    // 라운지를 만든 사람은 즉시 관리자다. 기관 서비스 관리자가 별도로
    // 구성원을 등록해야만 시험할 수 있던 초기 진입 장벽을 없앤다.
    const organization = createOrganization(database(), {
      name: req.body?.name,
      settings: req.body?.settings,
      adminUserId: req.session.userId,
      actorUserId: req.session.userId,
    })
    res.status(201).json({ organization: { ...organization, role: 'admin' } })
  }))
  return router
}

export function createAdminOrganizationsRouter({ db = null, trustedMutationOrigin = requireTrustedMutationOrigin() } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireRole('admin'))
  router.use(trustedMutationOrigin)
  router.post('/', asyncRoute((req, res) => {
    const organization = createOrganization(database(), {
      ...req.body,
      actorUserId: req.session.userId,
    })
    res.status(201).json({ organization })
  }))
  return router
}

export function createOrganizationRouter({
  db = null,
  trustedMutationOrigin = requireTrustedMutationOrigin(),
  briefingDependencies = {},
  situationDependencies = {},
  filesPath,
  runOperation = (operation) => operation(),
} = {}) {
  const router = Router()
  const asyncRoute = (handler) => (req, res) => Promise.resolve()
    .then(() => runOperation(() => handler(req, res)))
    .catch((error) => handleOrganizationError(res, error))
  const database = () => db || getDb()
  const member = requireOrganizationMember({ db })
  const materials = createMaterialsHandlers({ database, filesPath })

  router.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    trustedMutationOrigin(req, res, next)
  })
  router.use('/:orgId', member)

  router.get('/:orgId', asyncRoute((req, res) => {
    res.json({ organization: { ...getOrganization(database(), req.organization.id), role: req.organizationMember.role } })
  }))

  router.patch('/:orgId/settings', asyncRoute((req, res) => {
    requireOrganizationAdmin(req)
    res.json({ organization: updateOrganization(database(), req.organization.id, req.body ?? {}) })
  }))

  router.get('/:orgId/members', asyncRoute((req, res) => res.json({ members: listMembers(database(), req.organization.id) })))
  router.put('/:orgId/members/:userId', asyncRoute((req, res) => {
    requireOrganizationAdmin(req)
    const memberResult = putMember(database(), req.organization.id, req.params.userId, req.body ?? {})
    res.json({ member: memberResult })
  }))

  router.get('/:orgId/flights', asyncRoute((req, res) => {
    res.json({ flights: listFlights(database(), req.organization.id, req.query) })
  }))
  router.post('/:orgId/flights', asyncRoute((req, res) => {
    requirePlanning(req)
    const flight = createFlight(database(), req.organization.id, req.body ?? {}, req.session.userId)
    res.status(201).json({ flight })
  }))
  router.post('/:orgId/flights/share', asyncRoute((req, res) => {
    const flight = shareSavedRoute(database(), req.organization.id, req.body ?? {}, req.session.userId)
    res.status(201).json({ flight })
  }))
  router.get('/:orgId/flights/:flightId', asyncRoute((req, res) => {
    res.json({ flight: getFlight(database(), req.organization.id, req.params.flightId, req.query.version) })
  }))
  router.patch('/:orgId/flights/:flightId', asyncRoute((req, res) => {
    const flight = getFlight(database(), req.organization.id, req.params.flightId)
    ensureCanPatchFlight(req, flight, req.body ?? {})
    res.json({ flight: updateFlight(database(), req.organization.id, req.params.flightId, req.body ?? {}, req.session.userId) })
  }))

  router.post('/:orgId/flights/:flightId/weather-briefing', asyncRoute(async (req, res) => {
    const flight = getFlight(database(), req.organization.id, req.params.flightId)
    assertVersion(flight.version, req.body?.flightVersion)
    const overrides = req.body?.overrides ?? {}
    const unknown = Object.keys(overrides).filter((key) => !['etd', 'cruiseAltitudeFt', 'nwpTimeSelection'].includes(key))
    if (unknown.length) throw new OrganizationError(400, 'invalid_input', { field: `overrides.${unknown[0]}` })
    res.json(await buildOrganizationBriefingBundle(flight, overrides, briefingDependencies))
  }))

  router.post('/:orgId/flights/:flightId/annotations', asyncRoute((req, res) => {
    const flight = getFlight(database(), req.organization.id, req.params.flightId)
    ensureCanEditFlight(req, flight)
    res.status(201).json({ flight: materials.mutateAnnotation(req, flight, 'create') })
  }))
  router.patch('/:orgId/flights/:flightId/annotations/:annotationId', asyncRoute((req, res) => {
    const flight = getFlight(database(), req.organization.id, req.params.flightId)
    ensureCanEditFlight(req, flight)
    res.json({ flight: materials.mutateAnnotation(req, flight, 'update') })
  }))
  router.delete('/:orgId/flights/:flightId/annotations/:annotationId', asyncRoute((req, res) => {
    const flight = getFlight(database(), req.organization.id, req.params.flightId)
    ensureCanEditFlight(req, flight)
    res.json({ flight: materials.mutateAnnotation(req, flight, 'delete') })
  }))

  router.get('/:orgId/interests', asyncRoute((req, res) => res.json({ interests: listInterests(database(), req.organization.id) })))
  router.post('/:orgId/interests', asyncRoute((req, res) => {
    requireOrganizationAdmin(req)
    res.status(201).json({ interest: createInterest(database(), req.organization.id, req.body ?? {}, req.session.userId) })
  }))
  router.patch('/:orgId/interests/:interestId', asyncRoute((req, res) => {
    requireOrganizationAdmin(req)
    res.json({ interest: updateInterest(database(), req.organization.id, req.params.interestId, req.body ?? {}) })
  }))
  router.delete('/:orgId/interests/:interestId', asyncRoute((req, res) => {
    requireOrganizationAdmin(req)
    deleteInterest(database(), req.organization.id, req.params.interestId, req.body ?? {})
    res.json({ ok: true })
  }))

  router.get('/:orgId/notices', asyncRoute((req, res) => res.json({ notices: listNotices(database(), req.organization.id, req.query) })))
  router.post('/:orgId/notices', asyncRoute((req, res) => {
    requirePlanning(req)
    res.status(201).json({ notice: createNotice(database(), req.organization.id, req.body ?? {}, req.session.userId) })
  }))
  router.patch('/:orgId/notices/:noticeId', asyncRoute((req, res) => {
    requirePlanning(req)
    res.json({ notice: updateNotice(database(), req.organization.id, req.params.noticeId, req.body ?? {}, req.session.userId) })
  }))
  router.delete('/:orgId/notices/:noticeId', asyncRoute((req, res) => {
    requirePlanning(req)
    deleteNotice(database(), req.organization.id, req.params.noticeId, req.body ?? {})
    res.json({ ok: true })
  }))

  router.get('/:orgId/materials', asyncRoute(materials.list))
  router.post('/:orgId/materials', materials.readUpload, asyncRoute(materials.create))
  router.get('/:orgId/materials/:materialId', asyncRoute(materials.get))
  router.patch('/:orgId/materials/:materialId', materials.readUpload, asyncRoute(materials.update))
  router.delete('/:orgId/materials/:materialId', asyncRoute(materials.remove))
  router.get('/:orgId/materials/:materialId/versions/:version/original', asyncRoute(materials.original))
  router.get('/:orgId/materials/:materialId/versions/:version/thumbnail', asyncRoute(materials.thumbnail))

  router.get('/:orgId/briefings', asyncRoute((req, res) => res.json({ briefings: listBriefings(database(), req.organization.id) })))
  router.post('/:orgId/briefings', asyncRoute((req, res) => {
    requirePlanning(req)
    res.status(201).json({ briefing: createBriefing(database(), req.organization.id, req.body ?? {}, req.session.userId) })
  }))
  router.get('/:orgId/briefings/:briefingId', asyncRoute((req, res) => {
    res.json({ briefing: getBriefing(database(), req.organization.id, req.params.briefingId, req.query.version) })
  }))
  router.patch('/:orgId/briefings/:briefingId', asyncRoute((req, res) => {
    requirePlanning(req)
    res.json({ briefing: updateBriefing(database(), req.organization.id, req.params.briefingId, req.body ?? {}, req.session.userId) })
  }))
  router.post('/:orgId/briefings/:briefingId/runs', asyncRoute((req, res) => {
    res.status(201).json({ run: startBriefingRun(database(), req.organization.id, req.params.briefingId, req.body ?? {}, req.session.userId) })
  }))
  router.get('/:orgId/briefings/:briefingId/runs/:runId', asyncRoute((req, res) => {
    res.json({ run: getBriefingRun(database(), req.organization.id, req.params.briefingId, req.params.runId) })
  }))
  router.post('/:orgId/briefings/:briefingId/runs/:runId/candidates', asyncRoute(async (req, res) => {
    const run = getBriefingRun(database(), req.organization.id, req.params.briefingId, req.params.runId)
    if (Number(run.startedBy) !== Number(req.session.userId)) throw new OrganizationError(403, 'run_owner_required')
    if (run.status !== 'active') throw new OrganizationError(409, 'run_ended')
    const pinnedFlightRef = run.flightRefs.find((ref) => Number(ref.id) === Number(req.body?.flightId))
    if (!pinnedFlightRef || (!req.body?.refreshOrganization
      && Number(pinnedFlightRef.version) !== Number(req.body?.flightVersion))) {
      throw new OrganizationError(409, 'flight_not_pinned_in_run')
    }
    const organizationSnapshot = req.body?.refreshOrganization
      ? currentBriefingRunSnapshot(database(), req.organization.id, req.params.briefingId)
      : run.pinnedSnapshot
    const flightSnapshot = (organizationSnapshot.flights ?? []).find((item) => Number(item.id) === Number(req.body?.flightId))
    if (!flightSnapshot) throw new OrganizationError(409, 'flight_not_pinned_in_run')
    const flight = getFlight(database(), req.organization.id, flightSnapshot.id, flightSnapshot.version)
    const bundle = await buildOrganizationBriefingBundle({
      ...flight, organizationSnapshot,
      briefingBlocks: organizationSnapshot.briefing?.blocks ?? [],
      briefingMaterialRefs: organizationSnapshot.materialRefs ?? [],
    }, req.body?.overrides ?? {}, briefingDependencies)
    saveBriefingRunCandidate(database(), req.organization.id, req.params.briefingId, req.params.runId, bundle, req.session.userId)
    res.status(201).json({ bundle })
  }))
  router.post('/:orgId/briefings/:briefingId/runs/:runId/apply', asyncRoute((req, res) => {
    res.json({ run: applyBriefingRun(database(), req.organization.id, req.params.briefingId, req.params.runId, req.body ?? {}, req.session.userId) })
  }))
  router.post('/:orgId/briefings/:briefingId/runs/:runId/end', asyncRoute((req, res) => {
    res.json({ run: endBriefingRun(database(), req.organization.id, req.params.briefingId, req.params.runId, req.body ?? {}, req.session.userId) })
  }))

  router.get('/:orgId/situation', asyncRoute(async (req, res) => {
    const situation = await evaluateAndStoreOrganizationSituation(database(), req.organization.id, situationDependencies)
    res.json({ situation })
  }))
  router.get('/:orgId/alerts', asyncRoute((req, res) => res.json({ alerts: listAlerts(database(), req.organization.id, req.session.userId, req.query) })))
  router.post('/:orgId/alerts/:alertId/state', asyncRoute((req, res) => {
    res.json({ alert: updateAlertState(database(), req.organization.id, req.params.alertId, req.session.userId, req.body ?? {}) })
  }))

  return router
}

export default createOrganizationRouter
