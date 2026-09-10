import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')

test('기관 라운지는 실제 기관 API와 기관 브리핑 딥링크를 사용한다', () => {
  const page = read('./OrganizationLoungePage.jsx')
  const flights = read('./screens/FlightsScreen.jsx')
  assert.match(page, /listOrganizations/)
  assert.match(page, /import Sidebar from '\.\.\/\.\.\/app\/layout\/Sidebar\.jsx'/)
  assert.match(page, /<Sidebar activePanel="lounge"/)
  assert.match(page, /organizationRequest\(route\.orgId, '\/situation'/)
  assert.match(flights, /listSavedRoutes\(\{ kind: 'route' \}\)/)
  assert.match(flights, /\?orgId=\$\{encodeURIComponent\(orgId\)\}&orgFlightId=/)
  assert.doesNotMatch(flights, /\/api\/route-briefing/)
})

test('자료 뷰어는 PDF.js와 권한 확인 원본 경로를 사용한다', () => {
  const viewer = read('./PdfViewer.jsx')
  assert.match(viewer, /from 'pdfjs-dist'/)
  assert.match(viewer, /setDocument\(null\); setPage\(1\); setError\(''\)/)
  const materials = read('./screens/MaterialsScreen.jsx')
  assert.match(materials, /\/versions\/\$\{encodeURIComponent\(shown\.version\)\}\/original/)
  assert.match(materials, /metadata\?\.geojson/)
  assert.match(materials, /\?version=\$\{encodeURIComponent\(version\)\}/)
})

test('데스크톱과 iPad 가로 밀도 및 44px 조작 계약이 CSS에 있다', () => {
  const css = read('./OrganizationLounge.css')
  assert.match(css, /min-height:var\(--touch-min\)/)
  assert.match(css, /@media\(max-width:1199px\)/)
  assert.match(css, /@media\(max-width:979px\)/)
  assert.match(css, /grid-template-columns:minmax\(0,1\.75fr\) minmax\(320px,1fr\)/)
})

test('저장 폼은 명시적 submit 버튼을 사용하고 역할별 편집 경계를 둔다', () => {
  const flights = read('./screens/FlightsScreen.jsx')
  const settings = read('./screens/SettingsScreen.jsx')
  assert.match(flights, /<Button type="submit"/)
  assert.match(flights, /\['admin', 'planner'\]\.includes\(data\.organization\?\.role\)/)
  assert.match(settings, /const canAdmin = organization\.role === 'admin'/)
})

test('알림 상태 탭은 서버의 acknowledgedAt과 hiddenUntil 계약을 따른다', () => {
  const alerts = read('./screens/AlertsScreen.jsx')
  assert.match(alerts, /alert\.acknowledgedAt/)
  assert.match(alerts, /Date\.parse\(alert\.hiddenUntil\) > now/)
  assert.doesNotMatch(alerts, /alert\.status === 'snoozed'/)
})

test('브리핑 작성공간은 회차 blocks에서 비행별 발표 메모를 복원한다', () => {
  const briefings = read('./screens/BriefingsScreen.jsx')
  assert.match(briefings, /briefing\.blocks\?\.find/)
  assert.match(briefings, /String\(block\.flightId\) === String\(flightId\)/)
})
