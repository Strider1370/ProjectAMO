import { createMapWriteGuard } from './request-guard.js'
import express, { Router } from 'express'

import { getDb } from '../db/index.js'
import { handleOrganizationError } from '../organizations/common.js'
import { requireOrganizationMember, requireTrustedMutationOrigin } from '../organizations/middleware.js'
import {
  createOrganizationMap,
  createOrganizationMapVersion,
  deleteOrganizationMap,
  getOrganizationMap,
  listOrganizationMaps,
} from './organization-repository.js'

const asyncRoute = (handler) => (req, res) => Promise.resolve().then(() => handler(req, res)).catch((error) => handleOrganizationError(res, error))

// Body에는 개인 지도 ID·revision·note만 들어가므로 대형 snapshot parser가 필요 없다.
// membership/origin 검사를 먼저 실행해 미인증 큰 본문을 파싱하지 않는다.
export function createOrganizationMapsRouter({ db = null, trustedMutationOrigin = requireTrustedMutationOrigin() } = {}) {
  const router = Router()
  const database = () => db || getDb()
  const member = requireOrganizationMember({ db })
  router.use('/:orgId/maps', member)
  router.use('/:orgId/maps', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    return trustedMutationOrigin(req, res, next)
  })
  router.use('/:orgId/maps', createMapWriteGuard({maxBodyBytes:1024*1024}))
  const parseBody = express.json({ limit: '1mb', strict: true, inflate: false })
  router.use('/:orgId/maps', (req,res,next) => ['GET','HEAD','OPTIONS'].includes(req.method) ? next() : parseBody(req,res,next))

  router.get('/:orgId/maps', asyncRoute((req, res) => {
    res.json({ maps: listOrganizationMaps(database(), req.organizationId) })
  }))
  router.post('/:orgId/maps', asyncRoute((req, res) => {
    const map = createOrganizationMap(database(), req.organizationId, req.session.userId, req.body ?? {})
    res.status(201).json({ map })
  }))
  router.get('/:orgId/maps/:id/versions/:version', asyncRoute((req, res) => {
    res.json({ map: getOrganizationMap(database(), req.organizationId, req.params.id, Number(req.params.version)) })
  }))
  router.post('/:orgId/maps/:id/versions', asyncRoute((req, res) => {
    const map = createOrganizationMapVersion(database(), req.organizationId, req.params.id, req.session.userId, req.organizationMember.role, req.body ?? {})
    res.status(201).json({ map })
  }))
  router.get('/:orgId/maps/:id', asyncRoute((req, res) => {
    res.json({ map: getOrganizationMap(database(), req.organizationId, req.params.id) })
  }))
  router.delete('/:orgId/maps/:id', asyncRoute((req, res) => {
    deleteOrganizationMap(database(), req.organizationId, req.params.id, req.session.userId, req.organizationMember.role)
    res.json({ ok: true })
  }))
  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' })
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' })
    return handleOrganizationError(res, error)
  })
  return router
}

export default createOrganizationMapsRouter
