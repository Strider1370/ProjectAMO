import { useCallback, useEffect, useState } from 'react'

// 감시 대상(공항·경로) 목록. 알림 패널의 여러 화면이 같은 목록을 보고, 저장·삭제 뒤에는 refresh로 다시 읽는다.
// 공항 패널의 종 버튼도 이 이벤트로 감시 상태를 새로 읽는다.
export const WATCHES_CHANGED = 'alert-watches-changed'

export default function useAlertWatches(user) {
  const [airport, setAirport] = useState({ defaults: null, watches: [] })
  const [route, setRoute] = useState({ watches: [], routes: [] })
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const [a, r] = await Promise.all([
        fetch('/api/me/airport-watches', { credentials: 'include' }),
        fetch('/api/me/route-alert-watches', { credentials: 'include' }),
      ])
      if (!a.ok || !r.ok) throw new Error('감시 대상을 불러오지 못했습니다.')
      const [aData, rData] = await Promise.all([a.json(), r.json()])
      setAirport({ defaults: aData.defaults, watches: aData.watches ?? [] })
      setRoute({ watches: rData.watches ?? [], routes: rData.routes ?? [] })
      setError('')
    } catch (reason) { setError(reason.message) } finally { setLoaded(true) }
  }, [user])

  useEffect(() => { refresh() }, [refresh])
  const changed = useCallback(async () => {
    await refresh()
    window.dispatchEvent(new CustomEvent(WATCHES_CHANGED))
  }, [refresh])

  return { airport, route, error, loaded, refresh, changed }
}
