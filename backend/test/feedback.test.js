import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import sharp from 'sharp'

import { createDb } from '../src/db/index.js'
import { createUser } from '../src/db/users.js'
import { sessionMiddleware } from '../src/auth/session.js'
import { createAuthRouter } from '../src/auth/router.js'
import { createAdminFeedbackRouter, createFeedbackRouter, pruneExpiredImages } from '../src/feedback/router.js'
import { feedbackFilesRoot } from '../src/feedback/storage.js'
import config from '../src/config.js'

function makeServer({ now = () => new Date() } = {}) {
  const db = createDb(':memory:')
  const filesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-files-'))
  const notes = []
  const app = express()
  app.use(cookieParser())
  app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
  app.use('/api/auth', express.json(), createAuthRouter({ db }))
  app.use('/api/feedback', createFeedbackRouter({ db, filesPath, now, notify: async (text) => { notes.push(text) } }))
  app.use('/api/admin/feedback', createAdminFeedbackRouter({ db, filesPath, now }))
  return { db, app, filesPath, notes }
}

const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
const at = (server, p) => `http://127.0.0.1:${server.address().port}${p}`
const json = (method, body, cookie) => ({ method, headers: { 'content-type': 'application/json', connection: 'close', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })

async function adminCookie(db, server) {
  createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
  const response = await fetch(at(server, '/api/auth/login'), json('POST', { username: 'boss', password: 'password1' }))
  return response.headers.get('set-cookie').split(';')[0]
}

const photo = () => sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#4080c0' } })
  .withMetadata({ exif: { IFD0: { Copyright: 'secret-place' } } }).jpeg().toBuffer()

test('feedback with photos is stored re-encoded and readable only by admins', async () => {
  const { db, app, filesPath, notes } = makeServer()
  const server = await listen(app)
  try {
    const created = await fetch(at(server, '/api/feedback'), json('POST', {
      kind: 'inconvenience', message: '단면도 확대가 안 됨', imageCount: 1,
      context: { path: '/', airport: 'RKSI', layers: ['radar'], viewport: { width: 390, height: 844 }, version: '0.6.0' },
    }))
    assert.equal(created.status, 201)
    const { id, uploadToken } = await created.json()
    assert.match(uploadToken, /^[a-f0-9]{48}$/)
    assert.match(notes[0], /새 의견 · 불편 · 사진 1장/)

    // 토큰 없이·틀린 토큰으로는 올릴 수 없다.
    const image = await photo()
    const upload = (token, body = image, type = 'image/jpeg') => fetch(at(server, `/api/feedback/${id}/images`), {
      method: 'POST', headers: { 'content-type': type, 'x-feedback-upload': token, connection: 'close' }, body })
    assert.equal((await upload('wrong')).status, 404)
    assert.equal((await upload(uploadToken)).status, 201)
    // 예고한 장수를 채우면 토큰이 사라진다.
    assert.equal((await upload(uploadToken)).status, 404)

    const row = db.prepare('SELECT images, image_bytes FROM feedback WHERE id=?').get(id)
    const [key] = JSON.parse(row.images)
    assert.match(key, /^[a-f0-9]{32}\.webp$/)
    const stored = fs.readFileSync(path.join(filesPath, key.slice(0, 2), key))
    const meta = await sharp(stored).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, 1920)
    assert.equal(meta.exif, undefined)
    assert.equal(row.image_bytes, stored.length)

    assert.equal((await fetch(at(server, '/api/admin/feedback'))).status, 401)
    const cookie = await adminCookie(db, server)
    const list = await (await fetch(at(server, '/api/admin/feedback'), { headers: { cookie } })).json()
    assert.equal(list.counts.new, 1)
    assert.equal(list.items[0].context.airport, 'RKSI')
    assert.deepEqual(list.items[0].images, [key])

    const served = await fetch(at(server, `/api/admin/feedback/${id}/images/${key}`), { headers: { cookie } })
    assert.equal(served.status, 200)
    assert.equal(served.headers.get('content-type'), 'image/webp')
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff')
    assert.equal((await fetch(at(server, `/api/admin/feedback/${id}/images/..%2F..%2Fsecret.webp`), { headers: { cookie } })).status, 404)

    assert.equal((await fetch(at(server, `/api/admin/feedback/${id}`), json('PATCH', { status: 'done' }, cookie))).status, 200)
    const done = await (await fetch(at(server, '/api/admin/feedback?status=done'), { headers: { cookie } })).json()
    assert.equal(done.items.length, 1)
  } finally {
    server.close()
  }
})

test('feedback rejects files that are not images and invalid input', async () => {
  const { db, app } = makeServer()
  const server = await listen(app)
  try {
    assert.equal((await fetch(at(server, '/api/feedback'), json('POST', { kind: 'other', message: 'x' }))).status, 400)
    assert.equal((await fetch(at(server, '/api/feedback'), json('POST', { kind: 'error', message: '   ' }))).status, 400)
    assert.equal((await fetch(at(server, '/api/feedback'), json('POST', { kind: 'error', message: 'x', imageCount: 4 }))).status, 400)
    // 형식이 맞지 않는 화면 정보는 버리고 의견은 받는다.
    const loose = await fetch(at(server, '/api/feedback'), json('POST', { kind: 'error', message: 'x', context: { cookie: 'x' } }))
    assert.equal(loose.status, 201)
    const looseId = (await loose.json()).id
    assert.deepEqual(Object.keys(JSON.parse(db.prepare('SELECT context FROM feedback WHERE id=?').get(looseId).context)), ['userAgent'])

    const { id, uploadToken } = await (await fetch(at(server, '/api/feedback'), json('POST', { kind: 'error', message: 'x', imageCount: 1 }))).json()
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('<script>alert(1)</script>')])
    const response = await fetch(at(server, `/api/feedback/${id}/images`), {
      method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-feedback-upload': uploadToken, connection: 'close' }, body: fake })
    assert.equal(response.status, 415)
    const svg = await fetch(at(server, `/api/feedback/${id}/images`), {
      method: 'POST', headers: { 'content-type': 'image/svg+xml', 'x-feedback-upload': uploadToken, connection: 'close' }, body: '<svg/>' })
    assert.equal(svg.status, 415)
  } finally {
    server.close()
  }
})

test('feedback upload window closes and old photos are pruned', async () => {
  let clock = new Date('2026-10-24T00:00:00Z')
  const { db, app, filesPath } = makeServer({ now: () => clock })
  const server = await listen(app)
  try {
    const { id, uploadToken } = await (await fetch(at(server, '/api/feedback'), json('POST', { kind: 'suggestion', message: 'x', imageCount: 2 }))).json()
    const send = () => fetch(at(server, `/api/feedback/${id}/images`), {
      method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-feedback-upload': uploadToken, connection: 'close' } , body: photoBuffer })
    const photoBuffer = await photo()
    assert.equal((await send()).status, 201)
    clock = new Date('2026-10-24T00:11:00Z')
    assert.equal((await send()).status, 410)

    const [key] = JSON.parse(db.prepare('SELECT images FROM feedback WHERE id=?').get(id).images)
    const file = path.join(filesPath, key.slice(0, 2), key)
    assert.ok(fs.existsSync(file))
    assert.equal(pruneExpiredImages(db, filesPath, new Date('2027-01-23T00:00:00Z')), 1)
    assert.equal(fs.existsSync(file), false)
    assert.equal(db.prepare('SELECT images FROM feedback WHERE id=?').get(id).images, '[]')
    assert.equal(db.prepare('SELECT message FROM feedback WHERE id=?').get(id).message, 'x')
  } finally {
    server.close()
  }
})

test('feedback files must live outside public weather data', () => {
  assert.throws(() => feedbackFilesRoot(path.join(config.storage.base_path, 'feedback-files')), /outside public/)
})
