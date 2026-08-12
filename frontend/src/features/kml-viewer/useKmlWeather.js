import { useEffect, useRef, useState } from 'react'
import { loadWeatherData } from '../../api/weatherApi.js'
import { buildWeatherOverlayModel } from '../weather-overlays/lib/weatherOverlayModel.js'
import {
  MET_LAYERS,
  installWeatherOverlayLayers,
  syncRasterAndSigwxLayers,
  syncAdvisoryLayers,
  syncLightningLayers,
} from '../weather-overlays/lib/weatherOverlayLayers.js'

// 이 스파이크가 켜는 것: 관측 래스터(레이더·위성) + 위험기상(SIGMET/AIRMET/SIGWX) + 낙뢰.
// 본 화면과 같은 자료·같은 그리기 코드를 그대로 쓴다 — 다시 만들지 않는다.
//
// 빠진 것: 수치모델 격자(바람·기온·습도·착빙·난류·시정·운고)와 태풍. 각자 별도 동기화
// 모듈과 고도·시각 상태를 들고 있어 MapView 본체를 통째로 가져와야 한다. 이 스파이크의
// 질문은 "이용자 KML 위에 우리 기상이 겹쳐지는가"이고, 래스터 하나만 겹쳐도 답이 나온다.
const SUPPORTED = [
  'radar', 'radarHsr', 'radarHci', 'radarOverseas', 'echoTop',
  'satellite', 'satelliteVisible', 'ci', 'ctps', 'lightning',
  'sigmet', 'sigmet_intl', 'airmet', 'sigwx',
]

export const WEATHER_LAYERS = MET_LAYERS.filter((l) => SUPPORTED.includes(l.id))

export default function useKmlWeather(mapRef, ready) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loadMs, setLoadMs] = useState(null)
  const [visibility, setVisibility] = useState({})
  const installedRef = useRef(false)

  useEffect(() => {
    let alive = true
    const started = performance.now()
    loadWeatherData()
      .then((d) => {
        if (!alive) return
        setData(d)
        setLoadMs(Math.round(performance.now() - started))
      })
      .catch((e) => { if (alive) setError(e?.message ?? '기상 자료를 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    if (!installedRef.current) {
      installWeatherOverlayLayers(map)
      installedRef.current = true
    }
    // loadWeatherData가 주는 이름과 모델이 받는 이름이 달라 여기서 맞춰준다.
    const model = buildWeatherOverlayModel({
      ...data,
      lightningData: data.lightning,
      sigwxLowData: data.sigwxLow,
      sigwxLowHistoryData: data.sigwxLowHistory,
      sigmetData: data.sigmet,
      airmetData: data.airmet,
      visibility,
      nowMs: Date.now(),
    })
    syncRasterAndSigwxLayers(map, model)
    syncAdvisoryLayers(map, model)
    syncLightningLayers(map, model)
  }, [mapRef, ready, data, visibility])

  const toggle = (id) => setVisibility((v) => ({ ...v, [id]: !v[id] }))
  const clearAll = () => setVisibility({})

  return { visibility, toggle, clearAll, error, loadMs, loaded: !!data }
}
