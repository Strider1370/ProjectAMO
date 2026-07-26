// The 항공기상청 "공항 기상정보" bulletin, rendered as the official document.
// Extracted from AirportInfoTab so the airport panel (inside a <details>) and the monitoring
// slideshow (always expanded, scaled to fill a wall screen) render the same markup — the bulletin
// format only has to be maintained in one place.

import './AirportPanel.css'

export function fmtBulletinTime(tm) {
  if (!tm) return '—'
  // "2026-05-07 06:00:00.0" → "2026년 05월 07일 06시"
  const m = tm.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})/)
  if (!m) return tm
  return `${m[1]}년 ${m[2]}월 ${m[3]}일 ${m[4]}시`
}

// 원문이 "○ ... ○ ..."를 줄바꿈 없이 이어 붙여 보내는 경우가 있어, ○ 항목 단위로 줄을 분리하고
// "○ (주제어)" 형식의 괄호 부분(항상 같은 형식)을 굵게 강조한다.
export function BulletText({ text, className }) {
  if (!text) return null
  if (!text.includes('○')) return <p className={className}>{text}</p>
  const bullets = text.trim().split(/\s*○\s*/).filter(Boolean).map((s) => s.trim())
  return (
    <p className={className}>
      {bullets.map((bullet, i) => {
        const m = bullet.match(/^(\([^)]*\))\s*(.*)$/s)
        return (
          <span className="ap-bullet-line" key={i}>
            {'○ '}
            {m ? <><strong>{m[1]}</strong> {m[2]}</> : bullet}
          </span>
        )
      })}
    </p>
  )
}

export default function AirportInfoDocument({ info }) {
  if (!info) return null

  const showSel3 = info.sel_val3 && info.sel_val3.trim()
  const hasWarn = info.warn && info.warn.trim() // ▶경보현황 섹션 표시용(원문 "○ 없음"도 표시)
  const hasForecast = info.forecast && info.forecast.trim()

  return (
    <>
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
        {info.outlook ? <BulletText text={info.outlook} className="ap-info-body-text" /> : <p className="ap-info-body-text">—</p>}
      </div>

      {(info.sel_val1 || info.sel_val2) && (
        <table className="ap-info-table">
          <thead>
            <tr>
              {/* 상류(sel_val1~3)는 값만 주고 라벨이 없다. 실제 순서: 기온 → 체감온도 → 강수량 */}
              <th>예상 최저/최고기온 (℃)</th>
              <th>예상 최고체감온도 (℃)</th>
              {showSel3 && <th>예상 강수량(mm)</th>}
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
          <BulletText text={info.forecast} className="ap-info-body-text" />
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
    </>
  )
}
