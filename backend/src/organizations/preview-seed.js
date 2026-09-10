import fs from 'node:fs'
import { createOrganization, createFlight, createInterest, createNotice, createBriefing, putMember } from './repository.js'
import { createMaterialsHandlers } from './materials.js'

// Deliberately published examples only. Never read/copy a real organization's DB.
const samples = JSON.parse(fs.readFileSync(new URL('./preview-samples.json', import.meta.url), 'utf8'))
const pdf = fs.readFileSync(new URL('./preview-briefing.pdf', import.meta.url))
export const PREVIEW_USER = Object.freeze({ id: 1, username: 'preview_pilot', display_name: '체험 조종사' })

export async function seedOrganizationPreview(db, filesPath, now = Date.now()) {
  const created = new Date(now).toISOString()
  for (const [username, displayName] of [['preview_pilot', '체험 조종사'], ['preview_colleague', '동료 조종사']]) {
    db.prepare('INSERT INTO users (username,password_hash,display_name,created_at) VALUES (?,?,?,?)')
      .run(username, '!preview-no-login', displayName, created)
  }
  const organization = createOrganization(db, { name: '기관 라운지 미리보기', adminUserId: 1, actorUserId: 1 })
  putMember(db, organization.id, 2, { role: 'member', status: 'active' })
  const handlers = createMaterialsHandlers({ database: () => db, filesPath })
  const material = async (body, headers = {}) => {
    let result
    await handlers.create({ body, headers, organization: { id: organization.id }, session: { userId: 1 } }, {
      status() { return this }, json(data) { result = data.material },
    })
    return result
  }
  const briefPdf = await material(pdf, {
    'content-type': 'application/pdf', 'x-file-name': 'domestic-briefing-preview.pdf',
    'x-material-title': encodeURIComponent('국내 노선 브리핑 예시 PDF'),
    'x-material-source': encodeURIComponent('체험용 예시 자료'),
  })
  const notes = await material({ kind: 'document', title: '운항 인계 메모', description: '내용을 직접 편집해 보세요.', blocks: [
    { kind: 'heading', text: '출발 전 함께 확인할 사항' },
    { kind: 'text', text: '출발·도착 공항의 기상, 계획고도와 항공로를 확인하고 다음 조에 전달할 내용을 여기에 작성합니다. 이 문서는 미리보기용 예시입니다.' },
  ] })
  const kstDay = new Date(now + 9 * 3600_000).toISOString().slice(0, 10)
  const dayStart = Date.parse(`${kstDay}T00:00:00+09:00`)
  const startHour = Math.min(19, Math.max(8, new Date(now + 9 * 3600_000).getUTCHours() + 1))
  const flights = samples.flights.map((example, index) => {
    const etd = new Date(dayStart + (startHour + index) * 3600_000).toISOString()
    const eta = new Date(Date.parse(etd) + example.durationMinutes * 60_000).toISOString()
    const snapshot = { ...structuredClone(example.snapshot), etd, eta, nwpTimeSelection: null }
    const flight = createFlight(db, organization.id, {
      name: example.name, assignedUserId: index === 1 ? 2 : 1, etd, eta, snapshot,
      profileRequest: structuredClone(example.profileRequest),
      blocks: [{ kind: 'text', text: '공유된 비행계획의 시각·고도와 운항 참고사항을 편집해 보세요.' }],
      materialRefs: [{ id: briefPdf.id, version: 1 }, { id: notes.id, version: 1 }],
    }, 1)
    const form = snapshot.base.routeForm
    db.prepare('INSERT INTO routes (user_id,name,dep,dest,payload,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(1, example.name, form.departureAirport, form.arrivalAirport, JSON.stringify(snapshot), created, created)
    return flight
  })
  for (const interest of samples.interests) createInterest(db, organization.id, interest, 1)
  for (const notice of samples.notices) createNotice(db, organization.id, notice, 1)
  for (const example of samples.briefings) createBriefing(db, organization.id, {
    name: example.name, scheduledAt: flights[example.flightIndexes[0]].etd,
    flightRefs: example.flightIndexes.map((index) => ({ id: flights[index].id, version: flights[index].version })),
    materialRefs: [{ id: briefPdf.id, version: 1 }], blocks: example.blocks,
  }, 1)
  return { ...organization, role: 'admin' }
}
