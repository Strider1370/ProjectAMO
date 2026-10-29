import test from 'node:test'
import assert from 'node:assert/strict'
import { createNotificationStore, getNotificationStore } from './notificationStore.js'

const feed = () => ({ notifications: [
  { id: 'airport:1', active: true, readAt: null },
  { id: 'route:2', active: false, readAt: null },
  { id: 'organization:3', active: true, readAt: '2026-10-29T01:00:00Z' },
], unreadCount: 1 })
const response = (data) => ({ ok: true, json: async () => data })

test('종과 목록 구독자 모두 읽음 직후 갱신되고 종료 알림 읽기는 숫자를 줄이지 않는다', async () => {
  const store = createNotificationStore(async () => response(feed()))
  await store.refresh()
  const bell = [], inbox = []
  store.subscribe(() => bell.push(store.getSnapshot().unreadCount))
  store.subscribe(() => inbox.push(store.getSnapshot().unreadCount))
  await store.markRead('route:2')
  assert.equal(store.getSnapshot().unreadCount, 1)
  const reading = store.markRead('airport:1')
  assert.equal(store.getSnapshot().unreadCount, 0)
  assert.ok(store.getSnapshot().notifications[0].readAt)
  await reading
  await store.markRead('airport:1')
  assert.deepEqual(bell, [1, 0])
  assert.deepEqual(inbox, bell)
})

test('읽음 처리 전에 시작한 폴링이 나중에 도착해도 미확인 숫자를 되돌리지 않는다', async () => {
  let finishPoll
  let calls = 0
  const store = createNotificationStore(async (_url, options) => {
    if (options.method || calls++ === 0) return response(feed())
    return new Promise((resolve) => { finishPoll = resolve })
  })
  await store.refresh()
  const polling = store.refresh()
  await store.markRead('airport:1')
  finishPoll(response(feed()))
  await polling
  assert.equal(store.getSnapshot().unreadCount, 0)
  assert.ok(store.getSnapshot().notifications[0].readAt)
})

test('모두 읽음은 지난 알림도 읽음으로 바꾸면서 종 숫자를 즉시 비운다', async () => {
  const store = createNotificationStore(async () => response(feed()))
  await store.refresh()
  const reading = store.markAllRead()
  assert.equal(store.getSnapshot().unreadCount, 0)
  assert.ok(store.getSnapshot().notifications.every((item) => item.readAt))
  await reading
})

test('읽음 저장 실패 시 서버 상태로 복구한다', async () => {
  const store = createNotificationStore(async (_url, options) => options.method ? { ok: false } : response(feed()))
  await store.refresh()
  await store.markRead('airport:1')
  assert.equal(store.getSnapshot().unreadCount, 1)
  assert.equal(store.getSnapshot().notifications[0].readAt, null)
})

test('목록 밖의 푸시 알림도 읽음 처리하고 서버 숫자로 갱신한다', async () => {
  const calls = []
  const store = createNotificationStore(async (url, options) => {
    calls.push([url, options.method])
    return response({ notifications: [], unreadCount: 0 })
  })
  await store.markRead('airport:900')
  assert.deepEqual(calls, [['/api/me/notifications/airport:900/read', 'PATCH'], ['/api/me/notifications', undefined]])
  assert.equal(store.getSnapshot().unreadCount, 0)
})

test('로그아웃·계정 전환 시 다른 사용자의 알림 상태를 재사용하지 않는다', async () => {
  const alice = getNotificationStore(1)
  assert.equal(getNotificationStore(1), alice)
  const loggedOut = getNotificationStore(undefined)
  assert.notEqual(loggedOut, alice)
  await loggedOut.refresh()
  assert.equal(loggedOut.getSnapshot().unreadCount, 0)
  assert.notEqual(getNotificationStore(2), alice)
  assert.notEqual(getNotificationStore(1), alice)
})
