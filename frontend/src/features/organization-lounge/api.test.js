import assert from 'node:assert/strict'
import test from 'node:test'
import { organizationApiUrl, organizationResourceUrl } from './api.js'

test('미리보기 조직 API는 숫자 조직 ID 대신 sandbox sentinel 경로를 사용한다', () => {
  assert.equal(
    organizationApiUrl('preview', '/materials/4/versions/2/original'),
    '/api/lounge-preview/organizations/1/materials/4/versions/2/original',
  )
  assert.equal(organizationApiUrl(7, '/flights'), '/api/organizations/7/flights')
})

test('미리보기 자료 URL은 서버 응답의 실제 조직 경로도 sandbox로 치환한다', () => {
  assert.equal(
    organizationResourceUrl('preview', '/api/organizations/1/materials/4/versions/2/original', '/unused'),
    '/api/lounge-preview/organizations/1/materials/4/versions/2/original',
  )
  assert.equal(
    organizationResourceUrl('preview', null, '/materials/4/versions/2/thumbnail'),
    '/api/lounge-preview/organizations/1/materials/4/versions/2/thumbnail',
  )
})
