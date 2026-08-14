import AirportInfoDocument, { BulletText, fmtBulletinTime } from '../AirportInfoDocument.jsx'
import { Spinner } from '../../../shared/ui/fluent.js'

export default function AirportInfoTab({ info, loading = false }) {
  // 오는 중과 원래 없는 것이 같은 회색 글자 한 줄이면 구분할 수 없다. 기상 브리핑에서
  // '자료 없음'과 '아직 안 옴'을 섞으면 판단이 달라진다 — 대기는 도는 표시로 못박는다.
  if (!info) {
    return loading
      ? <div className="ap-empty ap-empty--busy" role="status"><Spinner size="tiny" /><span>기상정보 불러오는 중…</span></div>
      : <div className="ap-empty">기상정보 데이터 없음</div>
  }

  const showSel3 = info.sel_val3 && info.sel_val3.trim()
  const hasWarn = info.warn && info.warn.trim() // ▶경보현황 섹션 표시용(원문 "○ 없음"도 표시)
  const warnActive = hasWarn && !/없음/.test(info.warn) // 배지용 — "없음"은 발효로 보지 않음
  const hasForecast = info.forecast && info.forecast.trim()
  // 배지가 "위험기상 예보 있음"이면 요약도 위험 기상예보 내용을 보여줘야 함(일기개황 아님)
  const peekText = hasForecast ? info.forecast : info.outlook
  const defaultOpen = false

  return (
    <div className="ap-info-doc">
      <div className={`ap-info-hazard-badge${warnActive ? ' ap-info-hazard-badge--warn' : ''}`}>
        {warnActive ? '경보 발효 중' : hasForecast ? '위험기상 예보 있음' : '경보·위험기상 없음'}
      </div>

      {/* 모바일 접힘 기본 상태에서 빈 화면 대신 핵심 요약(발표시각·개황) 선두 노출 (§6-B) */}
      {!defaultOpen && (info.tm || peekText) && (
        <div className="ap-info-peek">
          <div className="ap-info-peek-head">
            {info.summary && <p className="ap-info-peek-title">{info.summary}</p>}
            <p className="ap-info-peek-time">[ {fmtBulletinTime(info.tm)} 발표 ]</p>
          </div>
          {hasForecast && <h3 className="ap-info-section-head">▶ 위험 기상예보</h3>}
          <BulletText text={peekText} className="ap-info-peek-outlook" />
          {showSel3 && <p className="ap-info-peek-precip">예상 강수량 <strong>{info.sel_val3}</strong></p>}
        </div>
      )}

      <details className="ap-info-raw" open={defaultOpen}>
        <summary className="ap-info-raw-summary">공식 문서 원문 보기</summary>
        <AirportInfoDocument info={info} />
      </details>
    </div>
  )
}
