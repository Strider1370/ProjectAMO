import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BarChart3, BellRing, Cloud, Clock, Gauge, FileText, Info, Moon, ChevronDown } from 'lucide-react'
import { AIRPORT_NAME_KO } from '../../api/weatherApi.js'
import { MODEL_COMPARISON_AIRPORTS } from '../../api/modelComparisonApi.js'
import { fmtKstShort, formatElevationFt } from './lib/formatters.js'
import { formatAmosTime } from '../../shared/weather/amosViewModel.js'
import { computeSunTimes } from '../../shared/weather/helpers.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { useDemoNowMs } from '../../shared/demoMode/useDemoMode.js'
import MetarTab from './tabs/MetarTab.jsx'
import { buildMetarViewModel, countMetarHazards } from './lib/metarViewModel.js'
import EnhancedTafTab from './tabs/TafTab.jsx'
import { buildTafViewModel, countTafHazardPeriods } from './lib/tafViewModel.js'
import AmosBoardTab from './tabs/AmosTab.jsx'
import AirportInfoTab from './tabs/AirportInfoTab.jsx'
import NotamTab from './tabs/NotamTab.jsx'
import MoonSection from './tabs/MoonSection.jsx'
import WarningCarousel from './WarningCarousel.jsx'
import WarningLightningCarousel from './WarningLightningCarousel.jsx'
import { buildAirportLightningModel } from './lib/airportLightningModel.js'
import { resolveAirportBanner } from './lib/airportBanner.js'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import { AirportModelComparisonSection } from '../airport-model-comparison/ModelComparisonSummary.jsx'
import useAirportWatchStatus from '../airport-alerts/useAirportWatchStatus.js'
import { useAirportHistory } from '../../shared/weather/useAirportHistory.js'
import ReportHistoryBadges from './tabs/ReportHistoryBadges.jsx'
import './AirportPanel.css'

const AIRPORT_HEADER_NAME_KO = {
  RKSI: '인천국제공항',
  RKSS: '김포국제공항',
  RKPC: '제주국제공항',
  RKPK: '김해국제공항',
  RKJB: '무안국제공항',
  RKNY: '양양국제공항',
  RKPU: '울산공항',
  RKJY: '여수공항',
}

const FULL_FEATURE_AIRPORTS = new Set(MODEL_COMPARISON_AIRPORTS)

// 섹션·레일 공용 아이콘(§12 — 레일과 제목바가 같은 아이콘으로 묶임)
const SECTION_ICON = { warn: AlertTriangle, metar: Cloud, taf: Clock, amos: Gauge, 'model-analysis': BarChart3, notam: FileText, info: Info, moon: Moon }

function AirportOperationsStrip({ airport, tz, now = new Date() }) {
  if (airport?.overseas) return null

  const { sunrise, sunset } = computeSunTimes(airport?.lat, airport?.lon, now, tz, 'KST')
  const elevation = formatElevationFt(airport?.elevation_ft)

  return (
    <div className="ap-operations-strip" role="group" aria-label="공항 운항정보">
      <span className="ap-operations-item">표고 {elevation}</span>
      <span className="ap-operations-item">
        <span aria-hidden="true">☀ </span>일출 {sunrise} · 일몰 {sunset}
      </span>
    </div>
  )
}

// Phase 1: 탭 → 단일 스크롤 + 스크롤스파이 레일. 섹션 순서 = 위험도/시급성(스펙 §4).
// 각 섹션은 기존 탭 컴포넌트를 그대로 감쌈(§12 세부 표시는 Phase 2~4에서). 현재날씨는 해체(렌더 제외).
function AirportPanel({ airport, weatherData, nowMs, onClose, onRequestDeferredWeatherData, onAlertsOpen }) {
  const { tz } = useTimeZone()
  const icao = airport?.icao
  const watching = useAirportWatchStatus(icao)
  const isFullFeature = FULL_FEATURE_AIRPORTS.has(icao)
  const airportInfo = weatherData?.airportInfo?.airports?.[icao] || null
  const bodyRef = useRef(null)
  const tabsRef = useRef(null)
  const [activeSection, setActiveSection] = useState('warn')
  const [infoRequested, setInfoRequested] = useState(false)
  const [headerUsesWeather, setHeaderUsesWeather] = useState(false)

  // 공항 전환 시 스크롤 상단 리셋
  useEffect(() => {
    bodyRef.current?.scrollTo?.(0, 0)
    setActiveSection('warn')
    setInfoRequested(false)
    setHeaderUsesWeather(false)
  }, [icao])

  // Escape → 드로어 닫기 (외장 키보드 iPad·데스크톱)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 모바일 뒤로가기 → 드로어만 닫기 (앱 자체를 벗어나지 않게)
  useCloseOnBackButton(!!airport, onClose)

  // 기상정보는 지연 로드 대상인데, info 섹션이 맨 아래라 스크롤 감지(IntersectionObserver)
  // 트리거가 안 걸려 fetch가 영영 안 불리는 문제가 있었다. 풀피처 공항 패널이 열리면(공항 변경 포함)
  // 곧바로 요청한다. requestDeferredWeatherData가 이미 로드된 키는 걸러내므로 중복 호출은 안전.
  useEffect(() => {
    if (isFullFeature && !airportInfo) onRequestDeferredWeatherData?.(['airportInfo'])
  }, [icao, isFullFeature, airportInfo, onRequestDeferredWeatherData])

  // 모바일 하단 탭 줄은 옆으로 넘어가므로, 현재 섹션 탭이 가려지면 보이는 자리로 민다.
  useEffect(() => {
    const nav = tabsRef.current
    const tab = nav?.querySelector('.airport-panel-tab.is-active')
    if (!tab || nav.scrollWidth <= nav.clientWidth) return
    const left = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft
    const right = left + tab.offsetWidth
    if (left < nav.scrollLeft || right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo?.({ left: left - (nav.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' })
    }
  }, [activeSection])

  // 스크롤스파이: 현재 섹션 레일 하이라이트 + 기상정보 섹션 진입 시 지연 로드
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return undefined
    const secEls = Array.from(root.querySelectorAll('.ap-sec'))
    if (!secEls.length) return undefined
    const order = secEls.map((el) => el.id.replace('sec-', ''))
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const id = e.target.id.replace('sec-', '')
          if (e.isIntersecting) {
            visible.add(id)
            if (id === 'info' && !airportInfo) {
              setInfoRequested(true)
              onRequestDeferredWeatherData?.(['airportInfo'])
            }
          } else {
            visible.delete(id)
          }
        })
        // 섹션 순서상 가장 위쪽(먼저 나오는) 보이는 섹션을 활성으로
        const first = order.find((id) => visible.has(id))
        if (first) setActiveSection(first)
      },
      { root, rootMargin: '0px 0px -75% 0px' },
    )
    secEls.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [icao, isFullFeature, airportInfo, onRequestDeferredWeatherData])

  // 시연 중이면 TAF 배지·NOTAM 유효 판단을 시연 기준시각으로 한다(TAF 탭 자체는 TafTab이 따로 맞춘다).
  const demoNowMs = useDemoNowMs()

  const airportWeatherSource = airport?.overseas ? 'overseas' : 'domestic'
  const metarPayload = airportWeatherSource === 'overseas' ? weatherData?.metarOverseas : weatherData?.metar
  const tafPayload = airportWeatherSource === 'overseas' ? weatherData?.tafOverseas : weatherData?.taf
  const metar = metarPayload?.airports?.[icao] || null
  const taf = tafPayload?.airports?.[icao] || null
  const metarHistory = useAirportHistory(icao, 'metar', { latest: metar, latestTime: metar?.header?.observation_time, latestKind: metar?.header?.report_type })
  const tafHistory = useAirportHistory(icao, 'taf', { latest: taf, latestTime: taf?.header?.issued, latestKind: taf?.header?.report_status === 'AMENDMENT' ? 'AMD' : 'TAF' })

  if (!airport) return null

  const headerNameKo = AIRPORT_HEADER_NAME_KO[icao] || airport.nameKo || airport.name || icao
  const headerNameEn = airport.name || AIRPORT_NAME_KO[icao] || icao

  const displayedMetar = metarHistory.selected?.report ?? metar
  const displayedTaf = tafHistory.selected?.report ?? taf
  const weatherBanner = resolveAirportBanner(metar, airport)
  const headerImageSrc = headerUsesWeather
    ? `/images/weather-${weatherBanner}.png`
    : `/images/${String(icao || 'RKSI').toLowerCase()}_banner.webp`
  const amos = weatherData?.amos?.airports?.[icao] || null
  const warning = weatherData?.warning?.airports?.[icao] || null
  const warnCount = warning?.warnings?.length || 0
  const lightning = buildAirportLightningModel(weatherData?.lightning, airport, demoNowMs ?? nowMs ?? Date.now())

  const metarTime = displayedMetar?.header?.observation_time || displayedMetar?.header?.issue_time
  const tafValid = displayedTaf?.header?.valid_start
    // 한 줄에 들어가도록 연도를 떼고 시간대 표기는 끝에 한 번만 (07-30 17:00 – 07-31 23:00 KST)
    ? `${fmtKstShort(displayedTaf.header.valid_start, tz).slice(5, 16)} – ${fmtKstShort(displayedTaf.header.valid_end, tz).slice(5)}`
    : ''
  const metarSpeci = displayedMetar?.header?.report_type === 'SPECI' // 특별관측 → 제목을 SPECI로
  const tafAmd = displayedTaf?.header?.report_status === 'AMENDMENT' // 정정 → 제목을 TAF AMD로

  // 탭 배지(스펙 §10 / 프로토타입 badges() 이식): 숫자 = 주의 필요 항목 수, 색 = 최악 심각도. 0/null이면 배지 없음.
  const warnBadge = warnCount
    ? { count: warnCount + (lightning.active ? 1 : 0), severity: 'red' }
    : lightning.active ? { count: 1, severity: 'amber' } : null
  const metarViewModel = displayedMetar ? buildMetarViewModel({ metar: displayedMetar, amosData: amos, icao, airportMeta: airport }) : null
  const metarBadge = metarViewModel ? countMetarHazards(metarViewModel) : null
  const tafBadge = displayedTaf ? countTafHazardPeriods(buildTafViewModel(displayedTaf, icao, demoNowMs).slots) : null

  // 기상정보 지연 로딩 상태: 요청은 했으나 airportInfo 페이로드가 아직 안 온 상태
  const infoLoading = infoRequested && !weatherData?.airportInfo

  const sections = [
    { id: 'warn', label: lightning.active ? '경보·낙뢰' : '공항경보', titleText: lightning.active ? '공항경보 / 낙뢰관측' : '공항경보', badge: warnBadge, node: lightning.active
      ? <WarningLightningCarousel warning={warning} lightning={lightning} airportKey={icao} />
      : <WarningCarousel warning={warning} /> },
    { id: 'metar', label: 'METAR', titleText: metarSpeci ? 'SPECI' : 'METAR', special: metarSpeci, meta: metarTime ? fmtKstShort(metarTime, tz) : '', flightCategory: metarViewModel?.flightCat?.category, badge: metarBadge, history: metarHistory, node: <MetarTab metar={metar} history={metarHistory} amosData={amos} icao={icao} airportMeta={airport} /> },
    { id: 'taf', label: 'TAF', titleText: tafAmd ? 'TAF AMD' : 'TAF', special: tafAmd, meta: tafValid, badge: tafBadge, history: tafHistory, node: <EnhancedTafTab taf={taf} history={tafHistory} icao={icao} /> },
    isFullFeature && { id: 'amos', label: 'AMOS', meta: amos ? formatAmosTime(amos?.daily_rainfall?.observed_tm_kst || amos?.observation?.observed_tm_kst, tz) : '', node: <AmosBoardTab amos={amos} metar={metar} airportMeta={airport} /> },
    isFullFeature && { id: 'model-analysis', label: '상세 예보 분석', node: <AirportModelComparisonSection icao={icao} /> },
    { id: 'notam', label: 'NOTAM', node: <NotamTab notam={weatherData?.notam || null} icao={icao} nowMs={demoNowMs} /> },
    isFullFeature && { id: 'info', label: '기상정보', node: <AirportInfoTab info={airportInfo} loading={infoLoading} tz={tz} /> },
    // 달빛은 위험이 아니라 계획용 참고값 → 위험도 순서상 맨 끝.
    // 국내 공항만(해외는 KST 앵커·고위도 가드가 검증되지 않음). 상류 데이터는 불필요 — 좌표만 쓴다.
    !airport?.overseas && Number.isFinite(airport?.lat) && Number.isFinite(airport?.lon)
      && { id: 'moon', label: '달빛', node: <MoonSection airport={airport} /> },
  ].filter(Boolean)

  const goTo = (id) =>
    bodyRef.current?.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <aside className="airport-panel">
      <header className="airport-panel-head">
        <img
          className="airport-panel-head-image"
          src={headerImageSrc}
          alt=""
          aria-hidden="true"
          onError={headerUsesWeather ? undefined : () => setHeaderUsesWeather(true)}
        />
        <div className="airport-panel-head-overlay" aria-hidden="true" />
        <div className="airport-panel-info">
          <span className="airport-panel-title">
            {headerNameKo}
            <span className="airport-panel-title-code"> · {icao}</span>
          </span>
          <span className="airport-panel-name">{headerNameEn}</span>
        </div>
        <AirportOperationsStrip airport={airport} tz={tz} />
        {/* 사진 위 오른쪽 위, 닫기 옆: 무엇을 하는 버튼인지 글자로, 이 공항을 감시 중인지 함께 보인다. */}
        <button type="button" className={`airport-panel-alerts${watching ? ' is-watching' : ''}`} onClick={onAlertsOpen}
          aria-label={`${headerNameKo} 알림 설정${watching ? ' · 감시 중' : ''}`} title={watching ? '이 공항 알림 감시 중 · 설정 열기' : '이 공항 알림 설정'}>
          <BellRing size={16} aria-hidden="true" />{watching && <i className="airport-panel-alerts-dot" aria-hidden="true" />}
          <span className="airport-panel-alerts-text is-full">{watching ? '알림 감시 중' : '알림 설정'}</span>
          <span className="airport-panel-alerts-text is-short">{watching ? '감시 중' : '알림'}</span>
        </button>
        <button className="airport-panel-close" onClick={onClose} aria-label="닫기">×</button>
      </header>

      <div className="airport-panel-main">
        <nav className="airport-panel-tabs" aria-label="섹션 이동" ref={tabsRef}>
          {sections.map((s) => {
            const Icon = SECTION_ICON[s.id]
            return (
              <button
                key={s.id}
                className={`airport-panel-tab${activeSection === s.id ? ' is-active' : ''}`}
                onClick={() => goTo(s.id)}
                aria-current={activeSection === s.id ? 'true' : undefined}
              >
                {Icon && <Icon size={18} strokeWidth={2} aria-hidden="true" />}
                <span>{s.label}</span>
                {s.badge && (
                  <span className={`ap-tab-badge ap-tab-badge--${s.badge.severity}`} aria-label={`${s.label} ${s.badge.count}건`}>{s.badge.count}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="airport-panel-body" ref={bodyRef}>
          {sections.map((s) => {
            const Icon = SECTION_ICON[s.id]
            return (
              <details key={s.id} id={`sec-${s.id}`} className="ap-sec" open>
                <summary className={`ap-sec-head${s.history?.entries.length ? ' has-history' : ''}`}>
                  {Icon && <Icon className="ap-sec-icon" size={20} strokeWidth={2} aria-hidden="true" />}
                  <span role="heading" aria-level="2" className={`ap-sec-title${s.special ? ' ap-sec-title--special' : ''}`}>{s.titleText || s.label}</span>
                  {s.meta && <span className="ap-sec-meta">{s.meta}</span>}
                  {s.flightCategory && <span className={`ap-metar-tac-chip ap-metar-tac-chip--${s.flightCategory}`}>{s.flightCategory}</span>}
                  {s.badge && (
                    <span className={`ap-tab-badge ap-sec-badge ap-tab-badge--${s.badge.severity}`} aria-label={`${s.label} ${s.badge.count}건`}>{s.badge.count}</span>
                  )}
                  {!!s.history?.entries.length && <ReportHistoryBadges history={s.history} type={s.id} tz={tz} />}
                  <ChevronDown className="ap-sec-fold" size={18} aria-hidden="true" />
                </summary>
                <div className="ap-sec-body">{s.node}</div>
              </details>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

export default AirportPanel
