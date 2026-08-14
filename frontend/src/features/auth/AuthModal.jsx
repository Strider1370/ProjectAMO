import { useState } from 'react'
import { X, LogOut } from 'lucide-react'
import { useAuth, ROLE_LABEL_KO } from './AuthContext.jsx'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import './AuthModal.css'

const ERROR_KO = {
  login_failed: '아이디 또는 비밀번호가 올바르지 않습니다.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  register_failed: '가입에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  invalid_input: '아이디는 3~32자 영문·숫자·_, 비밀번호는 8자 이상이어야 합니다.',
  forecaster_approval_required: '예보관 계정은 관리자에게 문의해 주세요.',
  pending_approval: '가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.',
  account_rejected: '가입이 거절되었습니다. 관리자에게 문의해 주세요.',
  network: '서버에 연결할 수 없습니다.',
}

export default function AuthModal({ onClose }) {
  useCloseOnBackButton(true, onClose)
  const { user, login, register, logout } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'register') {
        const r = await register(username, password)
        if (!r.ok) { setError(ERROR_KO[r.error] || ERROR_KO.register_failed); return }
        // 가입 성공 → 바로 로그인
      }
      const r = await login(username, password)
      if (!r.ok) { setError(ERROR_KO[r.error] || ERROR_KO.login_failed); return }
      onClose()
    } catch {
      setError(ERROR_KO.network)
    } finally {
      setSubmitting(false)
    }
  }

  // 바깥을 눌러도 닫지 않는다 — 아이디·비밀번호를 입력하던 중 실수로 옆을 누르면
  // 입력한 것이 통째로 날아간다. 닫기는 X 버튼(과 모바일 뒤로가기)으로만.
  return (
    <div className="auth-overlay">
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="계정">
        <button className="auth-close-btn" onClick={onClose} aria-label="닫기"><X size={18} /></button>

        {user ? (
          <div className="auth-account">
            <div className="auth-title">계정</div>
            <div className="auth-account-name">{user.display_name || user.username}</div>
            <div className="auth-role-badge" data-role={user.role}>{ROLE_LABEL_KO[user.role] || user.role}</div>
            <button className="auth-submit auth-logout" onClick={async () => { await logout(); onClose() }}>
              <LogOut size={16} /> 로그아웃
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-title">{mode === 'login' ? '로그인' : '회원가입'}</div>

            <label className="auth-field">
              <span>아이디</span>
              <input
                type="text" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} autoFocus
                placeholder="영문·숫자·_ 3~32자"
              />
            </label>
            <label className="auth-field">
              <span>비밀번호</span>
              <input
                type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="8자 이상"
              />
            </label>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button className="auth-submit" type="submit" disabled={submitting || !username || !password}>
              {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 로그인'}
            </button>

            <button
              type="button" className="auth-switch"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            >
              {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
            </button>
            <p className="auth-note">예보관 계정은 관리자에게 문의하세요. 로그인 없이도 지도·날씨는 이용할 수 있습니다.</p>
          </form>
        )}
      </div>
    </div>
  )
}
