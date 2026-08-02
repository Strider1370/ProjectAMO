import { useEffect, useRef, useState } from 'react'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

/** 백엔드 꾸러미를 화면이 쓰는 조각들로 가른다. 자료가 없으면 빈 도형을 준다. */
export function splitOverlayPayload(data) {
  if (!data) {
    return { visibility: EMPTY_FC, ceiling: EMPTY_FC, stations: [], trend: null, sources: null, computedAt: null, hasData: false }
  }
  return {
    visibility: data.visibility?.geojson ?? EMPTY_FC,
    ceiling: data.ceiling?.geojson ?? EMPTY_FC,
    stations: data.stations ?? [],
    trend: data.trend ?? null,
    sources: data.sources ?? null,
    computedAt: data.computed_at ?? null,
    hasData: true,
  }
}

export function useFlightCategory() {
  const [state, setState] = useState(() => splitOverlayPayload(null))
  const etagRef = useRef(null)
  const snapshot = useKimSnapshotMeta(true)
  const fcHash = snapshot?.flightCategory?.hash ?? null
  const hasSnapshot = snapshot !== null

  useEffect(() => {
    if (!hasSnapshot) return
    let cancelled = false
    async function fetchData() {
      try {
        const headers = {}
        if (etagRef.current) headers['If-None-Match'] = etagRef.current
        const res = await fetch('/api/weather/flight-category-overlay', { headers })
        if (cancelled) return
        if (res.status === 304) return
        if (!res.ok) return
        const etag = res.headers.get('ETag')
        if (etag) etagRef.current = etag
        const data = await res.json()
        if (!cancelled) setState(splitOverlayPayload(data))
      } catch {
        // transient network error — retain last known data
      }
    }
    fetchData()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSnapshot, fcHash])

  return state
}
