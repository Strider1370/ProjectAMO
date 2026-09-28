import { useEffect, useRef, useState } from 'react'
import { fetchCrossSection, fetchVerticalProfile } from '../../api/briefingApi.js'

function geometryForLine(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.some((point) => !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null
  return { type: 'LineString', coordinates: coordinates.map(([lon, lat]) => [lon, lat]) }
}

function markersForLine(coordinates) {
  return coordinates.map(([lon, lat], index) => ({
    id: `drawn-point-${index}`,
    label: index === 0 ? '시작' : index === coordinates.length - 1 ? '끝' : `WP${index}`,
    lon, lat, kind: 'WAYPOINT',
  }))
}

export function useMapLineProfile() {
  const [profile, setProfile] = useState(null)
  const [crossSection, setCrossSection] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hourLoading, setHourLoading] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [referenceAltitudeFt, setReferenceAltitudeFt] = useState(null)
  const geometryRef = useRef(null)
  const requestRef = useRef(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  async function openLine(coordinates, altitudeFt = null) {
    const routeGeometry = geometryForLine(coordinates)
    if (!routeGeometry) { setError('지도에서 두 점 이상을 이어 선을 완성해 주세요.'); return false }
    if (altitudeFt !== null && (!Number.isInteger(altitudeFt) || altitudeFt < 500 || altitudeFt > 50000)) {
      setError('500~50,000 ft 사이의 고도를 입력해 주세요.'); return false
    }
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    geometryRef.current = routeGeometry
    setLoading(true)
    setError(null)
    setWarning(null)
    setIsOpen(false)

    const [terrainResult, weatherResult] = await Promise.allSettled([
      fetchVerticalProfile({ routeGeometry, terrainOnly: true, routeMarkers: markersForLine(routeGeometry.coordinates) }, { signal: controller.signal }),
      fetchCrossSection({ routeGeometry }, { signal: controller.signal }),
    ])
    if (controller.signal.aborted) return false
    setLoading(false)
    if (terrainResult.status === 'rejected') {
      setError(`연직단면도를 열 수 없습니다: ${terrainResult.reason?.message || '지형 자료 조회 실패'}`)
      return false
    }
    setProfile(terrainResult.value)
    setReferenceAltitudeFt(altitudeFt)
    setCrossSection(weatherResult.status === 'fulfilled' ? weatherResult.value : null)
    if (weatherResult.status === 'rejected') setWarning('기상 단면 자료를 불러오지 못해 지형 단면만 표시합니다.')
    setIsOpen(true)
    return true
  }

  async function selectForecastHour(hf) {
    if (!geometryRef.current || !crossSection?.run?.tmfc) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setHourLoading(true)
    setWarning(null)
    try {
      const next = await fetchCrossSection({ routeGeometry: geometryRef.current, tmfc: crossSection.run.tmfc, hf }, { signal: controller.signal })
      if (!controller.signal.aborted) setCrossSection(next)
    } catch {
      if (!controller.signal.aborted) setWarning('선택한 예보시각의 기상 단면 자료를 불러오지 못했습니다.')
    } finally {
      if (!controller.signal.aborted) setHourLoading(false)
    }
  }

  return { profile, crossSection, referenceAltitudeFt, isOpen, setIsOpen, loading, hourLoading, error, warning, openLine, selectForecastHour }
}
