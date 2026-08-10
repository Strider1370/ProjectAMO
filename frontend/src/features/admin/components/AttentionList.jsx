import { STATUS_TONE, STATUS_WORD, formatAge, formatInterval } from '../lib/adminFormat.js'

// 확인 필요 — 화면이 결론을 문장으로 말한다.
//
// 숫자를 해석하는 일을 사람에게 맡기지 않는다. "지상바람 64일 전"이라는 타일을 눈으로 찾아
// 무슨 뜻인지 따지는 대신, "64일째 수집 없음 · 마지막 6/7 21:12 · 정상 주기 6시간"이라고 적는다.
// 이상이 하나도 없으면 이 상자가 통째로 초록 한 줄로 바뀐다 — 그게 정기 점검의 끝이다.
function whyLine(row, now) {
  const parts = []
  if (row.lastSuccessAt) {
    const when = new Date(row.lastSuccessAt)
    parts.push(`${formatAge(now - when.getTime())}째 수집 없음`)
    parts.push(`마지막 ${when.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
  } else {
    parts.push('한 번도 수집되지 않았습니다')
  }
  if (Number.isFinite(row.normalMs)) parts.push(`정상 주기 ${formatInterval(row.normalMs)}`)
  if (row.lastError) parts.push(row.lastError)
  return parts.join(' · ')
}

export default function AttentionList({ items, now = Date.now(), onGo }) {
  if (!items || items.length === 0) {
    return <div className="ac-allclear">확인이 필요한 항목이 없습니다 — 모두 정상입니다.</div>
  }
  return (
    <section className="ac-attn">
      <h3>확인 필요 {items.length}건</h3>
      {items.map((row) => {
        const tone = STATUS_TONE[row.status] || 'warn'
        return (
          <div className="ac-item" key={row.key}>
            <i style={{ background: tone === 'bad' ? 'var(--ac-bad)' : 'var(--ac-warn)' }} />
            <div>
              <div className="ac-t">
                {row.label}
                <span className={`ac-tag ac-${tone}`}>{STATUS_WORD[row.status]}</span>
              </div>
              <div className="ac-w">{whyLine(row, now)}</div>
            </div>
            <button type="button" className="ac-go" onClick={() => onGo?.('data')}>자료 수집</button>
          </div>
        )
      })}
    </section>
  )
}
