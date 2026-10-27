import { createContext, useContext, useEffect, useState, useCallback } from 'react'

import { forgetThisDevicePush } from '../notifications/pushDevice.js'

// #7-③ 인증 상태 컨텍스트. 백엔드 /api/auth/*(세션쿠키). Vite 프록시로 같은 origin.
const AuthContext = createContext(null)
const JSON_HEADERS = { 'content-type': 'application/json' }

async function authApi(path, options = {}) {
  const res = await fetch(`/api/auth${path}`, { credentials: 'include', ...options })
  let data = null
  try { data = await res.json() } catch { /* 빈 응답 */ }
  return { ok: res.ok, status: res.status, data }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // {id, username, role, display_name} | null
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { ok, data } = await authApi('/me')
    setUser(ok ? data : null)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 휴대폰(홈 화면 앱이거나 손가락으로 쓰는 화면)이면 서버가 로그인을 30일 유지한다.
  const login = useCallback(async (username, password) => {
    const persistent = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(pointer: coarse)').matches || false
    const { ok, data } = await authApi('/login', {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, password, persistent }),
    })
    if (ok) { setUser(data); return { ok: true } }
    return { ok: false, error: data?.error || 'login_failed' }
  }, [])

  const register = useCallback(async (username, password) => {
    const { ok, data } = await authApi('/register', {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, password }),
    })
    return ok ? { ok: true } : { ok: false, error: data?.error || 'register_failed' }
  }, [])

  const logout = useCallback(async () => {
    // 로그아웃 요청보다 먼저 — 서버의 등록 해제는 로그인된 상태에서만 된다.
    await forgetThisDevicePush()
    await authApi('/logout', { method: 'POST' })
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// 일반 계정(내부 역할 pilot)은 따로 표시하지 않는다. 예보관·관리자만 이름 옆에 붙인다.
export const ROLE_LABEL_KO = { forecaster: '예보관', admin: '관리자' }
