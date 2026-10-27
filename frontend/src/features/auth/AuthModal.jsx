import { useState } from 'react'
import { X, LogOut } from 'lucide-react'
import { useAuth, ROLE_LABEL_KO } from './AuthContext.jsx'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import { DISCLAIMER, DISCLAIMER_ACTION, DISCLAIMER_LIABILITY } from '../about/disclaimer.js'
import './AuthModal.css'

// 회원가입 전에 보여 주는 안내와 개인정보 처리방침. 받는 항목이 바뀌면(예: 이메일 추가) 처리방침도 함께 고친다.

function PrivacyPolicy() {
  return (
    <div className="auth-policy" tabIndex={0} aria-label="개인정보 처리방침">
      <b>개인정보 처리방침</b>
      <p>ProjectAMO(이하 "서비스")는 시범 운영 중인 테스트용 사이트로, 서비스 제공에 필요한 최소한의 개인정보만을 수집합니다.</p>
      <b>1. 수집하는 개인정보 항목</b>
      <ul>
        <li>회원가입 시: 아이디, 비밀번호(암호화하여 저장)</li>
        <li>서비스 이용 시: 저장한 경로, 알림 설정, 내 지도, 최근 로그인 일시</li>
        <li>휴대폰 푸시 알림 설정 시: 기기의 푸시 수신 정보</li>
        <li>의견 보내기 이용 시: 의견 내용, 첨부 사진, 이용 중이던 화면 및 브라우저 정보</li>
        <li>로그인 유지 및 방문 통계를 위한 쿠키(성명, 연락처 등은 포함하지 않음)</li>
      </ul>
      <b>2. 개인정보의 수집 및 이용 목적</b>
      <p>수집한 개인정보는 회원 식별 및 로그인, 저장한 설정과 알림의 제공, 서비스 개선 및 오류 확인의 목적으로만 이용하며, 이용자의 동의 없이 제3자에게 제공하지 않습니다.</p>
      <b>3. 개인정보의 보유 및 이용 기간</b>
      <ul>
        <li>회원 정보와 이용자가 저장한 자료는 회원 탈퇴 시까지 보유하며, 탈퇴 시 지체 없이 파기합니다.</li>
        <li>의견에 첨부된 사진은 접수일로부터 90일이 지나면 파기합니다.</li>
      </ul>
      <b>4. 개인정보의 파기 및 삭제 요청</b>
      <p>회원 탈퇴 및 개인정보 삭제는 서비스 내 "의견 보내기"를 통해 요청하실 수 있습니다.</p>
      <b>5. 문의처</b>
      <p>개인정보 처리에 관한 문의는 서비스 내 "의견 보내기"를 이용해 주시기 바랍니다.</p>
      <p>이 방침은 2026년 10월 25일부터 시행합니다.</p>
    </div>
  )
}

const ERROR_KO = {
  login_failed: '아이디 또는 비밀번호가 올바르지 않습니다.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  register_failed: '가입에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  invalid_input: '아이디는 3~32자 영문·숫자·_, 비밀번호는 8자 이상이어야 합니다.',
  username_taken: '이미 사용 중인 아이디입니다.',
  account_rejected: '가입이 거절되었습니다. 관리자에게 문의해 주세요.',
  network: '서버에 연결할 수 없습니다.',
}

export default function AuthModal({ onClose }) {
  useCloseOnBackButton(true, onClose)
  const { user, login, register, logout } = useAuth()
  // 로그인 → (회원가입 누름) 안내 창 → 가입 양식 → 완료 창 → 로그인
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [dialog, setDialog] = useState(null) // null | 'notice' | 'done'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const switchTo = (next) => {
    setMode(next)
    setPassword('')
    setPasswordAgain('')
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (mode === 'register' && password !== passwordAgain) { setError('비밀번호가 서로 다릅니다.'); return }
    setSubmitting(true)
    try {
      if (mode === 'register') {
        const r = await register(username, password)
        if (!r.ok) { setError(ERROR_KO[r.error] || ERROR_KO.register_failed); return }
        setDialog('done')
        return
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
            {ROLE_LABEL_KO[user.role] && <div className="auth-role-badge" data-role={user.role}>{ROLE_LABEL_KO[user.role]}</div>}
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
            {mode === 'register' && (
              <label className="auth-field">
                <span>비밀번호 확인</span>
                <input
                  type="password" autoComplete="new-password"
                  value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)}
                  placeholder="한 번 더 입력"
                />
              </label>
            )}

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button className="auth-submit" type="submit"
              disabled={submitting || !username || !password || (mode === 'register' && !passwordAgain)}>
              {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
            </button>

            <button
              type="button" className="auth-switch"
              onClick={() => (mode === 'login' ? setDialog('notice') : switchTo('login'))}
            >
              {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
            </button>
            {mode === 'login' && <p className="auth-note">로그인 없이도 지도·날씨는 이용할 수 있습니다. 알림·경로 저장은 로그인 후 이용할 수 있습니다.</p>}
          </form>
        )}
      </div>

      {dialog === 'notice' && (
        <div className="auth-subdialog" role="alertdialog" aria-modal="true" aria-labelledby="auth-notice-title">
          <div className="auth-subdialog__box">
            <div className="auth-subdialog__title" id="auth-notice-title">회원가입 안내</div>
            <div className="auth-subdialog__text">
              <p>{DISCLAIMER}</p>
              <p><strong>{DISCLAIMER_ACTION}</strong></p>
              <p>{DISCLAIMER_LIABILITY}</p>
            </div>
            <PrivacyPolicy />
            <div className="auth-subdialog__actions">
              <button type="button" className="auth-secondary" onClick={() => setDialog(null)}>취소</button>
              <button type="button" className="auth-submit" autoFocus onClick={() => { setDialog(null); switchTo('register') }}>동의하고 가입</button>
            </div>
          </div>
        </div>
      )}
      {dialog === 'done' && (
        <div className="auth-subdialog" role="alertdialog" aria-modal="true" aria-labelledby="auth-done-title">
          <div className="auth-subdialog__box is-small">
            <div className="auth-subdialog__title" id="auth-done-title">회원가입이 완료되었습니다</div>
            <p className="auth-subdialog__text">가입한 아이디로 로그인해 주시기 바랍니다.</p>
            <div className="auth-subdialog__actions">
              <button type="button" className="auth-submit" autoFocus onClick={() => { setDialog(null); switchTo('login') }}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
