import { AlertTriangle, Check } from 'lucide-react'
import { NOTAM_CATEGORIES, formatAltitude } from '../notam/lib/notamViewModel.js'

// Go/No-go 배너: 최악 카테고리(3레벨) + 공항 + 이유(운고/시정) + 역할별 범주 체인.
// §2.2 정상=차분(무채/연녹), 위험(IFR/LIFR)만 솔리드 채색.
// 색 = 심각도(level): VFR/MVFR=green / IFR=amber / LIFR=red (BriefingView와 동일 체계).
const LEVEL_COLOR = { green: 'var(--level-green)', amber: 'var(--level-amber)', red: 'var(--level-red)' }
const ROLE_LABEL = { departure: '출발', arrival: '도착', alternate: '교체' }
const DRIVER_LABEL = { ceiling: '운고', visibility: '시정', both: '운고·시정' }
const NOTAM_CAT_LABEL = Object.fromEntries(NOTAM_CATEGORIES.map((c) => [c.id, c.label]))

export default function BriefingBanner({ banner, routeConflicts = [], unresolved = [], onJump }) {
  const worst = banner?.worst
  const hasConflict = routeConflicts.length > 0
  const hasUnresolved = unresolved.length > 0
  if (!worst && !hasConflict && !hasUnresolved) return null
  const good = worst?.category === 'VFR'
  const catColor = LEVEL_COLOR[worst?.level] || 'var(--text-3)'

  const reason = good
    ? '전 구간 시정·운고 여유'
    : worst ? `${ROLE_LABEL[worst.role]}공항 ${DRIVER_LABEL[worst.driver] || '기상'} 기준 ${worst.category}` : ''

  return (
    <>
      {worst && (
        <div className="bv-banner" data-bvid="banner" data-good={good ? 'true' : 'false'} style={{ borderColor: catColor }}>
          <div className="bv-banner-cat" style={good ? undefined : { background: catColor }}>
            <span className="bv-banner-cat-role">{good ? '전 구간' : `${ROLE_LABEL[worst.role]}공항 ${worst.icao}`}</span>
            <span className="bv-banner-cat-val">{worst.category}</span>
          </div>
          <div className="bv-banner-body">
            <div className="bv-banner-reason" style={{ color: catColor }}>
              {good ? <Check size={16} /> : <AlertTriangle size={16} />} {reason}
            </div>
            <div className="bv-banner-chain">
              {banner.airports.map((a) => (
                <span key={a.role} className="bv-banner-chain-item">
                  <span className="bv-banner-chain-role">{ROLE_LABEL[a.role]}</span>
                  <b>{a.icao}</b>
                  <b style={{ color: LEVEL_COLOR[a.level] || 'var(--text-3)' }}>{a.category}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {hasConflict && (
        // 사실 고지 — 명령 아님. 최종 go/no-go는 파일럿.
        <div className="bv-banner bv-banner-notam" data-good="false" style={{ borderColor: 'var(--level-red)' }}>
          <div className="bv-banner-cat" style={{ background: 'var(--level-red)' }}>
            <span className="bv-banner-cat-role">경로 저촉</span>
            <span className="bv-banner-cat-val">{routeConflicts.length}</span>
          </div>
          <div className="bv-banner-body">
            <div className="bv-banner-reason" style={{ color: 'var(--level-red)' }}>
              <AlertTriangle size={16} /> 발효 중 공역 제한이 경로에 걸립니다 — 확인 필요
            </div>
            {/* 분류 이름과 번호만으로는 무엇인지 알 수 없다 — 내용·구간·고도·시간을 한 항목에. */}
            <ul className="bv-banner-conflicts">
              {routeConflicts.map((n) => {
                const where = n.routeIntervalNm ? `출발 후 ${n.routeIntervalNm.startNm}–${n.routeIntervalNm.endNm}NM` : null
                const alt = formatAltitude(n.altitude)
                const time = n.scheduleState === 'unknown' ? '시간 조건 확인' : null
                const meta = [where, alt, time].filter(Boolean).join(' · ')
                return (
                  <li key={n.id}>
                    <button type="button" className="bv-banner-conflict" onClick={() => onJump?.('notam')} disabled={!onJump}>
                      <span className="bv-banner-conflict-head">
                        <span className="bv-banner-chain-role">{NOTAM_CAT_LABEL[n.category] || n.category}</span>
                        <b>{n.id}</b>
                        {n.approximated && <span className="bv-banner-approx">구역 형태 근사</span>}
                      </span>
                      <span className="bv-banner-conflict-sum">{n.summary || '내용 미상 — 원문 확인'}</span>
                      {meta && <span className="bv-banner-conflict-meta">{meta}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
      {hasUnresolved && (
        // 저촉으로 단정하지 않는다. 빨간 목록과 섞지 않고 회색으로 따로 낸다.
        <div className="bv-banner bv-banner-unresolved" data-good="false">
          <div className="bv-banner-cat bv-banner-cat-muted">
            <span className="bv-banner-cat-role">위치 미확인</span>
            <span className="bv-banner-cat-val">{unresolved.length}</span>
          </div>
          <div className="bv-banner-body">
            <div className="bv-banner-reason" style={{ color: 'var(--text-2)' }}>
              위치를 확인하지 못한 제한 — 직접 확인 필요
            </div>
            <ul className="bv-banner-conflicts">
              {unresolved.map((n) => (
                <li key={n.id}>
                  <button type="button" className="bv-banner-conflict" onClick={() => onJump?.('notam')} disabled={!onJump}>
                    <span className="bv-banner-conflict-head">
                      <span className="bv-banner-chain-role">{NOTAM_CAT_LABEL[n.category] || n.category}</span>
                      <b>{n.id}</b>
                    </span>
                    <span className="bv-banner-conflict-sum">{n.summary || n.id}</span>
                    <span className="bv-banner-conflict-meta">구역 좌표 없음</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
