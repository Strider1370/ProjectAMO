// 관리자 콘솔 계약용 계정 준비.
//
// 계약은 로그인한 뒤에야 화면을 볼 수 있는데 검증용 DB에는 계정이 없다. 이 스크립트를 한 번
// 돌려 관리자와 "승인 대기" 사용자를 하나씩 만든다 — 대기자가 있어야 계정 관리 화면의
// 배지와 승인 버튼이 실제로 그려지는지 볼 수 있다.
//
// 백엔드 모듈을 직접 부른다(CLI를 자식 프로세스로 돌리지 않고) — 실패했을 때 원인이
// 그대로 보이고, 이미 있는 계정을 건너뛰는 판단도 여기서 한다.
//
// 사용: node verification/admin-fixture.mjs   (frontend/ 에서)
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const backendDir = path.resolve(import.meta.dirname, '..', '..', 'backend')
const { getDb } = await import(pathToFileURL(path.join(backendDir, 'src/db/index.js')).href)
const { createUser } = await import(pathToFileURL(path.join(backendDir, 'src/db/users.js')).href)

const ACCOUNTS = [
  { username: process.env.CONTRACT_ADMIN_USER || 'contract_admin', password: process.env.CONTRACT_ADMIN_PASS || 'contract-pass-1', role: 'admin', status: 'active' },
  { username: 'contract_pending', password: 'contract-pass-1', role: 'pilot', status: 'pending' },
]

const db = getDb()
for (const account of ACCOUNTS) {
  try {
    const user = createUser(db, account)
    console.log(`만듦: ${user.role} '${user.username}' (id ${user.id}, ${account.status})`)
  } catch (error) {
    // 여러 번 돌려도 같은 상태가 되어야 한다.
    if (error.message === 'username_taken') console.log(`이미 있음: ${account.username}`)
    else throw error
  }
}
console.log('계약용 계정 준비 완료.')
