import { test } from 'node:test'
import assert from 'node:assert/strict'
import { certificateExpiry, deploymentInfo } from '../src/admin/deployment.js'

test('인증서 파일이 없으면 null이고 던지지 않는다', () => {
  assert.equal(certificateExpiry('/nowhere/fullchain.pem'), null)
})

test('인증서를 못 읽어도 배포 정보는 나온다', () => {
  const info = deploymentInfo({ certPath: '/nowhere/fullchain.pem' })
  assert.equal(info.cert, null)
  assert.ok('commit' in info)
})

test('커밋 해시는 짧은 형태다', () => {
  const { commit } = deploymentInfo({ certPath: '/nowhere/fullchain.pem' })
  if (commit) assert.match(commit, /^[0-9a-f]{7,40}$/)
})
