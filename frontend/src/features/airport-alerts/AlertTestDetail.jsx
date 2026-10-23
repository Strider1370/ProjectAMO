import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import './alertTestDetail.css'

const formatTime = (value, tz) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul',
  }).format(date) : ''
}

function TestContent({ test, tz }) {
  const payload = test.payload ?? {}
  if (test.kind === 'metar') return <>
    <p className="alert-test-observed">모의 관측 {formatTime(payload.observedAt, tz)} {tz}</p>
    <div className="alert-test-metrics">{(payload.metrics ?? []).map((metric) => <div key={metric.key}>
      <span>{metric.label}</span>
      <strong>{metric.direction === 'event' ? '보고' : `${metric.value}${metric.unit}`}</strong>
      <small>{metric.direction === 'event' ? '발생 여부' : `설정 기준 ${metric.threshold}${metric.unit} ${metric.direction === 'below' ? '미만' : '이상'}`}</small>
    </div>)}</div>
  </>
  if (test.kind === 'airport_warning') return <div className="alert-test-summary">
    <strong>{payload.warning?.wrng_type_name ?? '공항경보'}</strong>
    <span>발효 {formatTime(payload.validFrom, tz)} {tz}</span><span>종료 {formatTime(payload.validTo, tz)} {tz}</span>
  </div>
  if (test.kind === 'taf') return <div className="alert-test-summary">
    <strong>{payload.reportType === 'AMD' ? 'TAF AMD' : '새 TAF'} · {payload.textSource === 'raw' ? '원문' : '재구성 전문'}</strong>
    <span>발표 {formatTime(payload.issuedAt, tz)} · 유효 {formatTime(payload.validFrom, tz)} – {formatTime(payload.validTo, tz)} {tz}</span>
    <pre className="alert-test-report">{payload.text}</pre>
  </div>
  if (test.kind === 'sigmet') return <div className="alert-test-summary">
    <strong>{payload.phenomenon ?? 'SIGMET'}</strong>
    <span>유효 {formatTime(payload.validFrom, tz)} – {formatTime(payload.validTo, tz)} {tz}</span>
    <span>경로 교차 {payload.intersectFromNm == null ? '확인됨' : `${payload.intersectFromNm.toFixed(1)}–${payload.intersectToNm.toFixed(1)} NM`}</span>
    {payload.encounterFrom && <span>예상 통과 {formatTime(payload.encounterFrom, tz)} – {formatTime(payload.encounterTo, tz)} {tz}</span>}
    <span>고도 {payload.altitudeStatus === 'matched' ? '계획 고도와 겹침' : '고도 정보 확인 불가'}</span>
  </div>
  if (test.kind === 'lightning') return <div className="alert-test-summary">
    <strong>{payload.radiusKm}km 이내 {payload.count}건</strong>
    <span>최근 {payload.windowMinutes}분 · 관측 {formatTime(payload.observedAt, tz)} {tz}</span>
  </div>
  return <p>시험 결과를 표시할 수 없습니다.</p>
}

export default function AlertTestDetail({ id, eventId, onClose, onAirport, onRoute, onLogin }) {
  const { user, loading } = useAuth()
  const { tz } = useTimeZone()
  const [test, setTest] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if ((!id && !eventId) || !user) return undefined
    let cancelled = false
    const path = eventId ? eventId.startsWith('route:')
      ? `/api/me/route-alert-events/${encodeURIComponent(eventId.slice(6))}`
      : `/api/me/airport-alert-events/${encodeURIComponent(eventId.slice(8))}`
      : `/api/me/alert-tests/${encodeURIComponent(id)}`
    fetch(path, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? '시험 알림이 만료됐거나 볼 권한이 없습니다.' : '시험 알림을 불러오지 못했습니다.')
        return response.json()
      })
      .then((data) => { if (!cancelled) { const next = data.test ?? data.event; setTest(next); setError('');
        if (next?.targetType === 'airport' || next?.airportIcao) onAirport?.(next.targetId ?? next.airportIcao)
        const linkedRouteId = next.routeId ?? Number(next.targetId)
        if ((next?.targetType === 'route' || next?.routeId) && linkedRouteId > 0) onRoute?.(linkedRouteId) } })
      .catch((reason) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [id, eventId, user, onAirport, onRoute])

  return <div className="alert-test-shade"><section className="alert-test-detail" role="dialog" aria-modal="true" aria-label={eventId ? '공항 알림 상세' : '시험 알림 상세'}>
    <header><div><span className="alert-test-tag">{eventId ? eventId.startsWith('route:') ? '경로 알림' : '공항 알림' : '테스트 · 모의 자료'}</span><h2>{test?.airportName ?? test?.payload?.routeName ?? '알림'}</h2></div><button type="button" aria-label="알림 닫기" onClick={onClose}><X size={20} /></button></header>
    {!loading && !user ? <div className="alert-test-copy"><p>알림을 받은 계정으로 로그인하면 시험 내용을 확인할 수 있습니다.</p><button type="button" onClick={onLogin}>로그인</button></div>
      : error ? <p className="alert-test-copy" role="alert">{error}</p>
        : !test ? <p className="alert-test-copy" role="status">시험 알림을 불러오는 중…</p>
          : <div className="alert-test-copy">{!eventId && <p className="alert-test-notice">아래 값은 수신·판정 시험용입니다. 현재 공항 실황과 다릅니다.</p>}
            <TestContent test={test} tz={tz} />
            <p className="alert-test-foot">{eventId ? '발생' : '시험 발송'} {formatTime(test.createdAt, tz)} {tz}{!eventId && ' · 이 알림은 실제 감시 이력에 포함되지 않습니다.'}</p>
            {(test.targetType === 'airport' || test.airportIcao) && <button type="button" className="alert-test-open" onClick={onClose}>현재 실황 공항 패널 보기</button>}
            {(test.targetType === 'route' || test.routeId) && (test.routeId ?? Number(test.targetId)) > 0
              ? <button type="button" className="alert-test-open" onClick={onClose}>경로 브리핑 보기</button>
              : eventId?.startsWith('route:') && <p>저장 경로는 삭제됐습니다. 발생 당시 SIGMET 정보는 위에 남아 있습니다.</p>}
          </div>}
  </section></div>
}
