import { useCallback, useEffect, useState } from 'react'

import { approve, getUsers, reject } from '../adminApi.js'
import CreateForecasterDialog from '../CreateForecasterDialog.jsx'

// 계정 관리 — 승인 대기와 전체 사용자. 내용은 기존 화면 그대로이고 자리만 옮겼다.
// 승인 대기는 시간에 민감해서 메뉴 배지로도 항상 보인다(AdminShell).
const ROLE_KO = { pilot: '조종사', forecaster: '예보관', admin: '관리자' }
const STATUS_KO = { pending: '대기', active: '활성', rejected: '거절' }
const STATUS_TONE = { pending: 'warn', active: 'ok', rejected: 'bad' }

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('ko-KR') : '—')

export default function AccountsScreen({ pending = [], onChanged }) {
  const [users, setUsers] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(() => { getUsers().then(setUsers).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const act = async (fn, id) => {
    await fn(id)
    load()
    onChanged?.()
  }

  return (
    <>
      <section className="ac-sec ac-flush">
        <h2>가입 승인 대기<em>{pending.length}건</em></h2>
        {pending.length === 0 ? (
          <p className="ac-sub" style={{ padding: '0 22px 16px' }}>대기 중인 가입 요청이 없습니다.</p>
        ) : (
          <table className="ac-t">
            <tbody>
              {pending.map((user) => (
                <tr key={user.id}>
                  <td className="ac-nm">{user.username}</td>
                  <td className="ac-r ac-muted n">{fmtDate(user.created_at)}</td>
                  <td className="ac-r">
                    <button type="button" className="ac-btn-approve" onClick={() => act(approve, user.id)}>승인</button>
                    <button type="button" className="ac-btn-reject" onClick={() => act(reject, user.id)}>거절</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ac-sec ac-flush">
        <h2>
          전체 사용자<em>{users.length}명</em>
          <button type="button" className="ac-btn" style={{ marginLeft: 12 }} onClick={() => setDialogOpen(true)}>예보관 추가</button>
        </h2>
        <table className="ac-t">
          <thead>
            <tr>
              <th>아이디</th>
              <th>역할</th>
              <th>상태</th>
              <th className="ac-r">가입일</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="ac-nm">{user.username}</td>
                <td><span className="ac-chip ac-quiet">{ROLE_KO[user.role] || user.role}</span></td>
                <td><span className={`ac-chip ac-${STATUS_TONE[user.status] || 'quiet'}`}>{STATUS_KO[user.status] || user.status}</span></td>
                <td className="ac-r ac-muted n">{fmtDate(user.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {dialogOpen && (
        <CreateForecasterDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => { load(); onChanged?.() }}
        />
      )}
    </>
  )
}
