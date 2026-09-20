import { useMemo, useState } from 'react'
import { COORD_FORMAT_OPTIONS, COORD_PLACEHOLDER } from '../custom-area/coordFormat.js'
import { parseBulkCoordinateRows } from './lib/mapEditorUi.js'

export default function MapBulkCoordinatePanel({ groups, onBack, onAdd }) {
  const [format, setFormat] = useState('dd')
  const [coordinateOrder, setCoordinateOrder] = useState('lat-lng')
  const [groupId, setGroupId] = useState('')
  const [text, setText] = useState('')
  const rows = useMemo(() => parseBulkCoordinateRows(text, { format, coordinateOrder }), [text, format, coordinateOrder])
  const invalid = rows.some((row) => row.error)
  const valid = rows.filter((row) => !row.error)
  const placeholders = COORD_PLACEHOLDER[format]
  return (
    <section className="my-map-bulk-panel" aria-label="좌표 여러 줄 입력">
      <button type="button" className="my-map-header-button" onClick={onBack}>← 항목 목록</button>
      <h2>좌표 여러 줄 입력</h2>
      <p>한 줄에 이름(선택), 좌표 2개를 탭으로 구분하세요. 오류 행이 있으면 전체를 추가할 수 없습니다.</p>
      <div className="my-map-bulk-options">
        <label>형식<select value={format} onChange={(event) => setFormat(event.target.value)}>{COORD_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>좌표 순서<select value={coordinateOrder} onChange={(event) => setCoordinateOrder(event.target.value)}><option value="lat-lng">위도, 경도</option><option value="lng-lat">경도, 위도</option></select></label>
        <label>대상 그룹<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">그룹 없는 항목</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      </div>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder={`예: 서울\t${coordinateOrder === 'lat-lng' ? `${placeholders.lat}\t${placeholders.lng}` : `${placeholders.lng}\t${placeholders.lat}`}`} />
      {rows.length > 0 && <ol className="my-map-bulk-preview">{rows.map((row) => <li key={row.line} className={row.error ? 'is-error' : ''}><strong>{row.line}행</strong> {row.error || `${row.name || `지점 ${row.line}`} · ${row.coordinate[1].toFixed(6)}, ${row.coordinate[0].toFixed(6)}`}</li>)}</ol>}
      <div className="my-map-editor-actions"><button type="button" className="my-map-secondary-button" onClick={onBack}>취소</button><button type="button" className="my-map-primary-button" disabled={!valid.length || invalid} onClick={() => onAdd(valid.map((row) => ({ name: row.name, coordinate: row.coordinate })), groupId || null)}>점 {valid.length}개 추가</button></div>
    </section>
  )
}
