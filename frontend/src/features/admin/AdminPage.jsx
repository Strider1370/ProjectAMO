import { useAuth } from '../auth/AuthContext.jsx'
import AdminShell from './AdminShell.jsx'
import './AdminPage.css'

// 관리자 콘솔 입구 — 권한만 보고 껍데기에 넘긴다.
// 실제 차단은 서버(requireRole)가 한다. 여기선 UI 노출만 관리자로 제한하고,
// 세션이 만료돼 API가 401/403을 주면 AdminShell의 각 요청이 조용히 실패한 채 값이 비어 있게 된다.
export default function AdminPage() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user?.role !== 'admin') {
    return (
      <div className="admin-denied">
        <p>관리자 전용 페이지입니다.</p>
        <a href="/">← 메인으로</a>
      </div>
    )
  }
  return <AdminShell />
}
