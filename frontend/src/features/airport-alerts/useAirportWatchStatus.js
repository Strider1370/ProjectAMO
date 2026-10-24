import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { WATCHES_CHANGED } from './useAlertWatches.js'

// 공항 패널의 알림 버튼에 "감시 중"을 보여 주려고 이 공항의 감시 여부만 읽는다.
// 로그인 전이면 null(버튼은 "알림 설정"). 알림 패널에서 저장·삭제하면 다시 읽는다.
export default function useAirportWatchStatus(icao) {
  const { user } = useAuth()
  const [watching, setWatching] = useState(null)
  useEffect(() => {
    if (!user || !icao) { setWatching(null); return undefined }
    let alive = true
    const load = () => fetch('/api/me/airport-watches', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive) setWatching(Boolean(data?.watches?.some((w) => w.icao === icao && w.enabled))) })
      .catch(() => {})
    load()
    window.addEventListener(WATCHES_CHANGED, load)
    return () => { alive = false; window.removeEventListener(WATCHES_CHANGED, load) }
  }, [user, icao])
  return watching
}
