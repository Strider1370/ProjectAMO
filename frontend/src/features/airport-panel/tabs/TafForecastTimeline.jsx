import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { MoveUp } from 'lucide-react'
import { formatTafHour, formatTafPeriodRange } from '../lib/tafViewModel.js'
import { bindTafForecastHighlight, layoutTafForecast } from './tafForecastLayout.js'
import './TafForecastTimeline.css'

// 색은 두 가지 뜻만 가진다: 비행조건, 그리고 기준을 넘은 값(IFR·LIFR 시정/운고, 강풍, 강수·특이현상).
// TEMPO/PROB라는 표시 자체는 무채색이다(TafForecastTimeline.css).
const TONE = {
  none: { bg: 'var(--bg-2)', fg: 'var(--text-1)' },
  'cat-vfr': { bg: 'var(--level-green)', fg: '#fff' },
  'cat-ifr': { bg: 'var(--level-amber)', fg: '#fff' },
  'cat-lifr': { bg: 'var(--level-red)', fg: '#fff' },
  ifr: { bg: 'var(--level-amber-bg)', fg: 'var(--level-amber)' },
  lifr: { bg: 'var(--level-red-bg)', fg: 'var(--level-red)' },
  wind: { bg: 'var(--level-red-bg)', fg: 'var(--level-red)' },
  special: { bg: 'var(--level-red-bg)', fg: 'var(--level-red)' },
  precip: { bg: 'rgba(186, 230, 253, 0.72)', fg: '#0c4a6e' },
}
const tone = (cell) => TONE[cell?.tone] ?? TONE.none
// TEMPO 표의 열: 줄 순서 그대로. TEMPO가 바꾸지 않은 요소는 '–'
const TABLE_COLS = [
  { key: 'cat', label: '비행조건' },
  { key: 'wx', label: '날씨' },
  { key: 'wind', label: '바람' },
  { key: 'vis', label: '시정' },
  { key: 'cloud', label: '구름' },
]

function CloudLayers({ layers }) {
  // 띄어쓰기는 밑줄(실링 표시) 밖에 둔다
  return layers.map((layer, i) => (
    <Fragment key={`${layer}-${i}`}>
      {i > 0 ? ' ' : ''}
      <span className={`ap-tafx-tok${/CB$/.test(layer) ? ' ap-tafx-cb' : /^(BKN|OVC|VV)/.test(layer) ? ' ap-tafx-ceil' : ''}`}>{layer}</span>
    </Fragment>
  ))
}

// 값 토큰(-RA, 14018G35KT …)은 중간에서 줄이 바뀌지 않게 하나씩 묶는다. 두 줄로 감쌀 때도 토큰 사이에서만 바뀐다.
function Tokens({ text }) {
  return String(text).split(/\s+/).map((token, i) => (
    <Fragment key={`${token}-${i}`}>{i > 0 ? ' ' : ''}<span className="ap-tafx-tok">{token}</span></Fragment>
  ))
}

function FullValue({ cell }) {
  return cell.layers ? <CloudLayers layers={cell.layers} /> : <Tokens text={cell.text} />
}

function ShortValue({ cell }) {
  if (!cell.short) return null
  if (Array.isArray(cell.short)) return <span className="ap-tafx-w2"><span>{cell.short[0]}</span><span>{cell.short[1]}</span></span>
  return <><CloudLayers layers={[cell.short.lowest]} /> <span className="ap-tafx-more">+{cell.short.more}</span></>
}

function ValueText({ cell }) {
  return (
    <span className="ap-tafx-txt">
      <span className="ap-tafx-v-full"><FullValue cell={cell} /></span>
      {cell.short && <span className="ap-tafx-v-short"><ShortValue cell={cell} /></span>}
    </span>
  )
}

// tempoMode: 'inline' = TEMPO 값을 바꾼 줄 안에 칸으로 그린다.
//            'zone'   = 줄에는 주 예보 값만 쓰고(TEMPO가 글자를 가리지 않는다), TEMPO가 바꾸는 줄의 그 시간만
//                       칸 아랫변의 얇은 막대로 표시한다. 바뀐 값은 아래 표(TEMPO 하나에 한 줄)로.
//                       맨 위 띠의 번호가 표의 번호와 같다.
export default function TafForecastTimeline({ view, tz, tempoMode = 'inline' }) {
  const zone = tempoMode === 'zone'
  const rootRef = useRef(null)
  const span = view.end - view.start
  const pct = (ms) => `${((ms - view.start) / span) * 100}%`
  const width = (a, b) => `${((b - a) / span) * 100}%`
  const hourOf = (ms) => (ms - view.start) / 3600e3
  const iso = (ms) => new Date(ms).toISOString()
  const range = (a, b) => `${formatTafPeriodRange(iso(a), iso(b), tz)} ${tz}`

  useLayoutEffect(() => {
    const root = rootRef.current
    layoutTafForecast(root, view.hours)
    const observer = new ResizeObserver(() => layoutTafForecast(root, view.hours))
    observer.observe(root)
    let alive = true
    document.fonts?.ready?.then(() => { if (alive) layoutTafForecast(root, view.hours) })
    return () => { alive = false; observer.disconnect() }
  }, [view])

  useEffect(() => bindTafForecastHighlight(rootRef.current), [])

  const ticks = []
  for (let ms = view.start; ms < view.end; ms += 3 * 3600e3) ticks.push(ms)

  return (
    <div className="ap-tafx" ref={rootRef} data-mode={tempoMode}>
      <div />
      <div className="ap-tafx-scale" aria-hidden="true">
        {ticks.map((ms) => <span key={ms} style={{ left: pct(ms) }}>{formatTafHour(iso(ms), tz)}</span>)}
      </div>

      {zone && view.cards.length > 0 && (
        <>
          <div className="ap-tafx-label ap-tafx-label--zones">TEMPO</div>
          <div className="ap-tafx-zones">
            {view.cards.map((card) => (
              <div key={card.id} className={`ap-tafx-zone${card.probable ? ' is-prob' : ''}`} data-tid={card.id} style={{ left: pct(card.start), width: width(card.start, card.end) }} title={`${card.type} ${range(card.start, card.end)}`}>
                <span>{card.n}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view.rows.map((row) => (
        <RowTrack key={row.key} row={row} pct={pct} width={width} range={range} zone={zone} />
      ))}

      {zone && view.cards.length > 0 && (
        <>
          <div className="ap-tafx-label ap-tafx-label--lane">TEMPO<br />PROB</div>
          <table className="ap-tafx-list">
            <thead>
              <tr><th /><th>시간({tz})</th>{TABLE_COLS.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {view.cards.map((card) => {
                const byKey = Object.fromEntries(card.lines.map((line) => [line.key, line.cell]))
                return (
                  <tr key={card.id} className={card.probable ? 'is-prob' : undefined} data-tid={card.id}>
                    <td><span className="ap-tafx-num">{card.n}</span></td>
                    <td className="ap-tafx-list-when">
                      {card.type !== 'TEMPO' && <span className="ap-tafx-card-type">{card.type}</span>}
                      <span>{formatTafPeriodRange(card.rawStart, card.rawEnd, tz)}</span>
                    </td>
                    {TABLE_COLS.map(({ key }) => {
                      const cell = byKey[key]
                      if (!cell) return <td key={key} className="ap-tafx-list-same">–</td>
                      if (key === 'cat') return <td key={key}><span className="ap-tafx-cat" style={{ background: tone(cell).bg }}>{cell.text}</span></td>
                      return <td key={key} className={cell.tone ? 'ap-tafx-over' : undefined} style={cell.tone ? { color: tone(cell).fg } : undefined}><FullValue cell={cell} /></td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {!zone && view.cards.length > 0 && (
        <>
          <div className="ap-tafx-label ap-tafx-label--lane">TEMPO<br />PROB</div>
          <div className="ap-tafx-lane">
            {view.cards.map((card) => (
              <div key={card.id} className={`ap-tafx-card${card.probable ? ' is-prob' : ''}`} data-tid={card.id} data-s={hourOf(card.start)} data-e={hourOf(card.end)}>
                <div className="ap-tafx-card-head">
                  <span className="ap-tafx-card-type">{card.type}</span>
                  <span className="ap-tafx-card-time">{formatTafPeriodRange(card.rawStart, card.rawEnd, tz)} {tz}</span>
                </div>
                <dl>
                  {card.lines.map((line) => (
                    <div key={line.key} className="ap-tafx-card-line">
                      <dt>{line.label}</dt>
                      <dd>
                        {line.key === 'cat'
                          ? <span className="ap-tafx-cat" style={{ background: tone(line.cell).bg }}>{line.cell.text}</span>
                          : <span className={line.cell.tone ? 'ap-tafx-over' : undefined} style={line.cell.tone ? { color: tone(line.cell).fg } : undefined}><FullValue cell={line.cell} /></span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {view.cards.map((card) => (
            <div key={`col-${card.id}`} className={`ap-tafx-col${card.probable ? ' is-prob' : ''}`} data-tid={card.id} data-l={(card.start - view.start) / span} data-w={(card.end - card.start) / span} aria-hidden="true" />
          ))}
        </>
      )}
    </div>
  )
}

function RowTrack({ row, pct, width, range, zone }) {
  return (
    <>
      <div className="ap-tafx-label">{row.label}</div>
      <div className={`ap-tafx-track ap-tafx-track--${row.key}`}>
        {row.segments.map((seg) => {
          const t = tone(seg.cell)
          return (
            <Fragment key={`seg-${seg.index}`}>
              <div
                className="ap-tafx-seg"
                style={{ left: pct(seg.start), width: width(seg.start, seg.end), background: t.bg }}
                title={`${row.label} ${range(seg.start, seg.end)}: ${seg.cell.text}${seg.becmg ? `\nBECMG ${range(seg.becmg.start, seg.becmg.end)} 사이에 ${seg.becmg.from.text} → ${seg.cell.text}` : ''}`}
              />
              {/* TEMPO가 가운데를 가르는 칸은 테두리로 한 구간임을 보여 준다. TEMPO 칸보다 아래에 깐다. */}
              {seg.split && !zone && <div className="ap-tafx-frame" style={{ left: `calc(${pct(seg.start)} + 1px)`, width: `calc(${width(seg.start, seg.end)} - 2px)`, color: t.fg }} />}
            </Fragment>
          )
        })}
        {zone && row.tempos.filter((tm) => !tm.same).map((tm) => (
          <div
            key={`mark-${tm.id}`}
            className={`ap-tafx-mark${tm.probable ? ' is-prob' : ''}`}
            data-tid={tm.id}
            style={{ left: pct(tm.start), width: `calc(${width(tm.start, tm.end)} - 4px)`, '--tafx-mark': row.key === 'cat' ? tone(tm.cell).bg : undefined }}
            title={`${tm.type} ${range(tm.start, tm.end)}\n${row.label}: ${tm.mainCell.text} → ${tm.probable ? '가능성' : '일시적으로'} ${tm.cell.text}`}
          />
        ))}
        {!zone && row.tempos.map((tm) => {
          const catTone = row.key === 'cat' ? tone(tm.cell) : null
          return (
            <div
              key={`tempo-${tm.id}`}
              className={`ap-tafx-tempo${tm.probable ? ' is-prob' : ''}${tm.same ? ' is-same' : ''}${catTone ? ' is-cat' : ''}`}
              data-tid={tm.id}
              data-short={tm.cell.short ? '1' : undefined}
              style={{ left: pct(tm.start), width: width(tm.start, tm.end), ...(catTone ? { background: tm.same ? undefined : catTone.bg } : {}), '--tafx-fg': catTone ? catTone.fg : tone(tm.cell).fg }}
              title={`${tm.type} ${range(tm.start, tm.end)}\n${row.label}: ${tm.same ? `${tm.mainCell.text} 그대로` : `${tm.mainCell.text} → ${tm.probable ? '가능성' : '일시적으로'} ${tm.cell.text}`}`}
            >
              {!tm.same && <ValueText cell={tm.cell} />}
            </div>
          )
        })}
        {row.segments.flatMap((seg) => (zone ? [[seg.start, seg.end]] : seg.pieces).map(([a, b]) => {
          const t = tone(seg.cell)
          return (
            <div key={`lbl-${seg.index}-${a}`} className="ap-tafx-lbl" data-seg={seg.index} data-short={seg.cell.short ? '1' : undefined} style={{ left: pct(a), width: width(a, b), color: t.fg }}>
              {seg.cell.arrow != null && <MoveUp className="ap-tafx-arrow" style={{ transform: `rotate(${seg.cell.arrow}deg)` }} aria-hidden="true" />}
              <ValueText cell={seg.cell} />
            </div>
          )
        }))}
      </div>
    </>
  )
}
