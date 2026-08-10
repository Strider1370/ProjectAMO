import { useState } from 'react'

import { STATUS_TONE, STATUS_WORD, formatAge } from '../lib/adminFormat.js'

// 자료 34종 격자.
//
// 정상인 자료에는 상자를 그리지 않는다 — 글자만 놓고, 지연·멈춤만 색 상자를 붙인다.
// 상자 34개가 늘어선 화면에서는 "64일 전"짜리 하나를 눈으로 훑어 찾아야 했다. 이렇게 두면
// 문제만 남는다.
//
// 기본 정렬은 출처(열쇠)별이다. 열쇠 하나가 막히면 그 줄이 통째로 빨개져서 자료 문제인지
// 열쇠 문제인지 바로 갈린다. 성격별은 버튼으로 바꾼다 — 훑을 때 자연스러운 순서다.
const SOURCE_COLOR = {
  kma_aviation: '#3d5a80',
  kma_radar: '#0e7490',
  kma_nwp: '#6d28d9',
  noaa: '#2f7d5e',
  kac: '#a9701d',
  external: '#a8a39c',
}

function Tile({ row, now }) {
  const tone = STATUS_TONE[row.status] || 'ok'
  const age = row.lastSuccessAt ? formatAge(now - Date.parse(row.lastSuccessAt)) : '없음'
  const className = ['ac-tile', tone === 'ok' ? '' : `ac-${tone}`].filter(Boolean).join(' ')
  return (
    <div className={className} title={row.lastError || undefined}>
      <div className="ac-tn">{row.label}</div>
      <div className="ac-ta">
        {row.status === 'quiet' ? '쉬는 중' : row.status === 'disabled' ? '꺼둠' : age}
        {(row.status === 'late' || row.status === 'stopped' || row.status === 'never') && (
          <span className="ac-st">{STATUS_WORD[row.status]}</span>
        )}
      </div>
      {row.eventDriven && row.activeCount != null && (
        <div className="ac-sub n">{row.activeCount}건 발효</div>
      )}
    </div>
  )
}

export default function DataGrid({ health, now = Date.now() }) {
  const [mode, setMode] = useState('source')
  if (!health) return null

  const byKey = new Map(health.rows.map((row) => [row.key, row]))
  const groups = health.groups?.[mode] ?? []

  return (
    <section className="ac-sec">
      <h2>
        자료 {health.counts.total}종
        <div className="ac-seg" style={{ marginLeft: 'auto' }} role="tablist">
          <button type="button" className={mode === 'source' ? 'ac-on' : ''} onClick={() => setMode('source')}>출처별</button>
          <button type="button" className={mode === 'character' ? 'ac-on' : ''} onClick={() => setMode('character')}>성격별</button>
        </div>
      </h2>

      {groups.map((group) => (
        <div className="ac-grp" key={group.id}>
          <div className="ac-gl">
            {mode === 'source' && <i className="ac-kb" style={{ background: SOURCE_COLOR[group.id] || '#a8a39c' }} />}
            <div>
              {group.label}
              <em>{group.keys.length}종</em>
            </div>
          </div>
          <div className="ac-tiles">
            {group.keys.map((key) => {
              const row = byKey.get(key)
              return row ? <Tile key={key} row={row} now={now} /> : null
            })}
          </div>
        </div>
      ))}

      <div className="ac-legend">
        <span>정상은 표시하지 않습니다 — 글자만 놓입니다</span>
        <span><i style={{ background: 'var(--ac-warn-bg)', borderColor: 'var(--ac-warn-bd)' }} />지연</span>
        <span><i style={{ background: 'var(--ac-bad-bg)', borderColor: 'var(--ac-bad-bd)' }} />멈춤</span>
        <span>흐린 글자 = 쉬는 시간(야간·운항시간 밖) 또는 일부러 꺼둔 자료</span>
      </div>
    </section>
  )
}
