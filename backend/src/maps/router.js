import express, { Router } from 'express'

import { requireAuth } from '../auth/middleware.js'
import { getDb } from '../db/index.js'
import { requireTrustedMutationOrigin } from '../organizations/middleware.js'
import { assertExpectedRevision, createMyMap, deleteMyMap, getMyMap, listMyMaps, MapRepositoryError, updateMyMap } from './repository.js'
import { MapSchemaError, MAX_DOCUMENT_BYTES, validateMapDocument } from './schema.js'

export const mapsJsonParser = express.json({ limit: MAX_DOCUMENT_BYTES, strict: true })

function sendError(res, error) {
  if (error instanceof MapSchemaError || error instanceof MapRepositoryError) {
    return res.status(error.status ?? 400).json({ error: error.code, ...(error.details ? error.details : {}) })
  }
  return res.status(500).json({ error: 'map_operation_failed' })
}

function activeAccount(database, req, res, next) {
  const user = database().prepare("SELECT id FROM users WHERE id=? AND status='active'").get(req.session.userId)
  if (!user) return res.status(403).json({ error: 'account_inactive' })
  return next()
}

function mapId(value) {
  if (typeof value !== 'string' || !value || value.length > 200) throw new MapSchemaError('invalid_map', { field: 'id' })
  return value
}

// server.js는 이 경로만 전역 1MiB JSON parser에서 건너뛰고 세션 뒤에 마운트한다.
// 따라서 인증·활성 계정 검사를 통과한 요청에만 5MiB 전용 parser가 실행된다.
export function createMyMapsRouter({ db = null, trustedMutationOrigin = requireTrustedMutationOrigin() } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireAuth)
  router.use((req, res, next) => activeAccount(database, req, res, next))
  router.use(mapsJsonParser)

  router.get('/', (req, res) => {
    try { res.json({ maps: listMyMaps(database(), req.session.userId) }) } catch (error) { sendError(res, error) }
  })

  router.post('/', trustedMutationOrigin, (req, res) => {
    try {
      const validated = validateMapDocument(req.body?.snapshot)
      const document = createMyMap(database(), req.session.userId, validated)
      res.status(201).json({ document })
    } catch (error) { sendError(res, error) }
  })

  router.get('/:id', (req, res) => {
    try { res.json({ document: getMyMap(database(), req.session.userId, mapId(req.params.id)) }) } catch (error) { sendError(res, error) }
  })

  router.put('/:id', trustedMutationOrigin, (req, res) => {
    try {
      const id = mapId(req.params.id)
      const expectedRevision = assertExpectedRevision(req.body?.expectedRevision)
      const validated = validateMapDocument(req.body?.snapshot)
      if (validated.document.id !== id) throw new MapSchemaError('invalid_map', { field: 'snapshot.id' })
      const document = updateMyMap(database(), req.session.userId, id, expectedRevision, validated)
      res.json({ document })
    } catch (error) { sendError(res, error) }
  })

  router.delete('/:id', trustedMutationOrigin, (req, res) => {
    try {
      deleteMyMap(database(), req.session.userId, mapId(req.params.id))
      res.json({ ok: true })
    } catch (error) { sendError(res, error) }
  })

  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'map_too_large', limit: 'request_bytes' })
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' })
    return sendError(res, error)
  })
  return router
}

export default createMyMapsRouter
