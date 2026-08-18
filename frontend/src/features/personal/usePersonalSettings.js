import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'
import { listSavedRoutes } from '../route-briefing/lib/routeStore.js'

const MINIMA = '/api/me/minima'
const ALERTS = '/api/me/alerts'

const ERROR_KO = {
  etd_must_be_future: 'ETD는 미래 시각이어야 합니다.',
  eta_after_etd: 'ETA는 ETD 이후여야 합니다.',
  too_many_routes: '저장된 경로가 너무 많습니다.',
  template_not_found: '선택한 브리핑을 찾을 수 없습니다.',
  too_many_briefings: '저장한 브리핑이 5개입니다. 계정에서 하나를 지우고 다시 시도하세요.',
  invalid_input: '입력값을 확인하세요.',
}

// #13 개인설정 패널 데이터 훅 — 미니마(탭A) + 경로 템플릿·예정 비행 알림(탭B). 로그인 사용자만.
export default function usePersonalSettings() {
  const { user } = useAuth()
  const [minima, setMinima] = useState(null)
  const [templates, setTemplates] = useState([])
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshMinima = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(MINIMA, { credentials: 'include' })
      if (res.ok) setMinima((await res.json()).minima)
    } catch { /* 오프라인/401 → 유지 */ }
  }, [user])

  // 감시 대상은 저장된 브리핑이다 — 순항고도가 확정돼 있어야 착빙·난류 판정이 맞는다.
  // 경로만으로는 고도를 몰라 스케줄러가 9000ft로 가정한다(scheduler.js DEFAULT_CRUISE_ALT_FT).
  const refreshTemplates = useCallback(async () => {
    if (!user) return
    try { setTemplates(await listSavedRoutes({ kind: 'briefing' })) }
    catch { /* best-effort */ }
  }, [user])

  const refreshFlights = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(ALERTS, { credentials: 'include' })
      if (res.ok) setFlights((await res.json()).flights || [])
    } catch { /* best-effort */ }
  }, [user])

  useEffect(() => {
    if (!user) { setMinima(null); setTemplates([]); setFlights([]); return }
    setLoading(true)
    Promise.all([refreshMinima(), refreshTemplates(), refreshFlights()]).finally(() => setLoading(false))
  }, [user, refreshMinima, refreshTemplates, refreshFlights])

  async function saveMinima(ceilingFt, visibilityM) {
    const res = await fetch(MINIMA, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ceilingFt, visibilityM }),
    })
    if (!res.ok) return { ok: false, error: '저장에 실패했습니다.' }
    setMinima({ ceilingFt, visibilityM })
    return { ok: true }
  }

  async function registerAlert(body) {
    try {
      const res = await fetch(ALERTS, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: ERROR_KO[data.error] || '등록에 실패했습니다.' }
      await refreshFlights()
      return { ok: true, id: data.id }
    } catch {
      return { ok: false, error: '네트워크 오류로 등록하지 못했습니다.' }
    }
  }

  async function deleteAlert(id) {
    setFlights((fs) => fs.filter((f) => f.id !== id))
    try { await fetch(`${ALERTS}/${id}`, { method: 'DELETE', credentials: 'include' }) } catch { /* best-effort */ }
    refreshFlights()
  }

  return {
    minima, templates, flights, loading,
    saveMinima, registerAlert, deleteAlert, refreshFlights,
  }
}
