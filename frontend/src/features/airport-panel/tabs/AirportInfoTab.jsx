import { useState } from 'react'

function fmtBulletinTime(tm) {
  if (!tm) return '—'
  // "2026-05-07 06:00:00.0" → "2026년 05월 07일 06시"
  const m = tm.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})/)
  if (!m) return tm
  return `${m[1]}년 ${m[2]}월 ${m[3]}일 ${m[4]}시`
}

export default function AirportInfoTab({ info, loading = false }) {
  if (!info) return <div className="ap-empty">{loading ? '기상정보 불러오는 중…' : '기상정보 데이터 없음'}</div>

  const showSel3 = info.sel_val3 && info.sel_val3.trim()
  const hasWarn = info.warn && info.warn.trim() // ▶경보현황 섹션 표시용(원문 "○ 없음"도 표시)
  const warnActive = hasWarn && !/없음/.test(info.warn) // 배지용 — "없음"은 발효로 보지 않음
  const hasForecast = info.forecast && info.forecast.trim()
  const [defaultOpen] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia('(max-width: 719px)').matches,
  )

  return (
    <div className="ap-info-doc">
      <div className={`ap-info-hazard-badge${warnActive ? ' ap-info-hazard-badge--warn' : ''}`}>
        {warnActive ? '경보 발효 중' : hasForecast ? '위험기상 예보 있음' : '경보·위험기상 없음'}
      </div>

      {/* 모바일 접힘 기본 상태에서 빈 화면 대신 핵심 요약(발표시각·개황) 선두 노출 (§6-B) */}
      {!defaultOpen && (info.tm || info.outlook) && (
        <div className="ap-info-peek">
          <p className="ap-info-peek-time">[ {fmtBulletinTime(info.tm)} 발표 ]</p>
          {info.outlook && <p className="ap-info-peek-outlook">{info.outlook}</p>}
        </div>
      )}

      <details className="ap-info-raw" open={defaultOpen}>
        <summary className="ap-info-raw-summary">공식 문서 원문 보기</summary>

        <div className="ap-info-logo-row">
          <img src="/logo3_01.png" alt="항공기상청" className="ap-info-logo" />
        </div>

        <h2 className="ap-info-title">{info.title || '—'}</h2>

        <p className="ap-info-date">[ {fmtBulletinTime(info.tm)} 발표 ]</p>

        {info.summary && (
          <p className="ap-info-summary">{info.summary}</p>
        )}

        <div className="ap-info-section">
          <h3 className="ap-info-section-head">▶ 일기개황</h3>
          <p className="ap-info-body-text">{info.outlook || '—'}</p>
        </div>

        {(info.sel_val1 || info.sel_val2) && (
          <table className="ap-info-table">
            <thead>
              <tr>
                <th>예상 최저/최고기온 (℃)</th>
                <th>예상 강수량(mm)</th>
                {showSel3 && <th></th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{info.sel_val1 || '—'}</td>
                <td>{info.sel_val2 || '—'}</td>
                {showSel3 && <td>{info.sel_val3}</td>}
              </tr>
            </tbody>
          </table>
        )}

        {hasForecast && (
          <div className="ap-info-section">
            <h3 className="ap-info-section-head">▶ 위험 기상예보</h3>
            <p className="ap-info-body-text">{info.forecast}</p>
          </div>
        )}

        {hasWarn && (
          <div className="ap-info-section">
            <h3 className="ap-info-section-head">▶ 경보현황</h3>
            <p className="ap-info-body-text">{info.warn}</p>
          </div>
        )}

        <div className="ap-info-footnote">
          <p>※ 공항기상 및 경보에 대한 자세한 사항은 항공기상청 홈페이지(amo.kma.go.kr)에서 확인할 수 있습니다.</p>
          <p>※ 수신기관의 담당자, 전화번호 및 FAX번호가 변경되었을 때는 예보과로 알려주시기 바랍니다.</p>
        </div>
      </details>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────


