import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dialog = fs.readFileSync(new URL('./ShareFlightDialog.jsx', import.meta.url), 'utf8')
const flights = fs.readFileSync(new URL('./screens/FlightsScreen.jsx', import.meta.url), 'utf8')
const account = fs.readFileSync(new URL('../account/AccountPanel.jsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('./api.js', import.meta.url), 'utf8')

test('계정과 기관 비행 목록은 같은 개인 비행 공유 다이얼로그를 사용한다', () => {
  assert.match(account, /<ShareFlightDialog source=\{sharing\} memberships=\{memberships\}/)
  assert.match(flights, /<ShareFlightDialog orgId=\{orgId\}/)
  assert.match(flights, /내 비행 공유/)
  assert.match(flights, /관리자 직접 등록/)
})

test('공유 다이얼로그는 경로와 브리핑을 함께 읽고 전용 서버 계약을 호출한다', () => {
  assert.match(dialog, /listSavedRoutes\(\)/)
  assert.match(dialog, /entryKind\(item\) === 'briefing'/)
  assert.match(dialog, /shareSavedFlight\(selectedOrgId, body\)/)
  assert.match(api, /organizationRequest\(orgId, '\/flights\/share'/)
  assert.match(dialog, /개인 저장 자료를 삭제해도 기관 비행은 유지됩니다/)
})

test('본인 작성 비행만 회원 계획편집을 제공하고 회원 PATCH는 담당자를 변경하지 않는다', () => {
  assert.match(flights, /String\(flight\.createdBy\) === String\(user\.id\)/)
  assert.match(flights, /const canEdit = canPlan \|\| isCreator/)
  assert.match(flights, /\.\.\.\(canPlan \? \{ assignedUserId: Number\(values\.get\('assignedUserId'\)\) \} : \{\}\)/)
  assert.match(flights, /flight\.assignedDisplayName \|\| assignee\?\.displayName/)
})
