import { useEffect, useRef, useState } from 'react'
import { editableAltitude } from './lib/mapEditorUi.js'
import { COORD_FORMAT_OPTIONS, COORD_PLACEHOLDER, formatCoordinate, parseCoordinate } from '../custom-area/coordFormat.js'

const ICON_LABELS = { dot: '점', pin: '핀', triangle: '삼각형', square: '사각형', star: '별', cross: '십자' }
const DASH_LABELS = { solid: '실선', dashed: '파선', dotted: '점선' }

function TextField({ label, value, multiline = false, onCommit, onEnd, itemId, field }) {
  const [draft, setDraft] = useState(value ?? '')
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState('')
  const lastSent = useRef(value ?? '')
  useEffect(() => { setDraft(value ?? ''); lastSent.current = value ?? '' }, [value])
  const update = (next) => {
    if (next === lastSent.current) { setError(''); return }
    if (field === 'name' && !next.trim()) { setError('이름을 입력하세요.'); return }
    const result = onCommit({ [field]: next }, `item:${itemId}:${field}`)
    if (result?.ok === false) { setError(result.error); return }
    lastSent.current = next
    setError('')
  }
  const common = {
    value: draft,
    onChange: (event) => { const next = event.target.value; setDraft(next); if (!composing) update(next) },
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: (event) => { setComposing(false); update(event.currentTarget.value) },
    onBlur: () => { if (!composing) update(draft); onEnd?.() },
  }
  return <label className="my-map-editor-field"><span>{label}</span>{multiline ? <textarea {...common} rows={3} /> : <input {...common} />}{error && <small className="my-map-editor-error" role="alert">{error}</small>}</label>
}

function coordinateText(value, format, axis) {
  return format === 'dd' ? Number(value).toFixed(6) : formatCoordinate(value, format, axis)
}

function CoordinateEditor({ coordinate, onCoordinate }) {
  const [format, setFormat] = useState('dd')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!Array.isArray(coordinate)) return
    setLat(coordinateText(coordinate[1], format, 'lat'))
    setLng(coordinateText(coordinate[0], format, 'lng'))
    setError('')
  }, [coordinate?.[0], coordinate?.[1], format])
  const change = (axis, raw) => {
    axis === 'lat' ? setLat(raw) : setLng(raw)
    try {
      const next = axis === 'lat' ? [coordinate[0], parseCoordinate(raw, format, 'lat')] : [parseCoordinate(raw, format, 'lng'), coordinate[1]]
      onCoordinate(next); setError('')
    } catch (caught) { setError(caught.message) }
  }
  if (!Array.isArray(coordinate)) return null
  return <div className="my-map-coordinate-editor">
    <label className="my-map-editor-field"><span>좌표 형식</span><select value={format} onChange={(event) => setFormat(event.target.value)}>{COORD_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <div className="my-map-editor-pair"><label>위도<input value={lat} placeholder={COORD_PLACEHOLDER[format].lat} onChange={(event) => change('lat', event.target.value)} /></label><label>경도<input value={lng} placeholder={COORD_PLACEHOLDER[format].lng} onChange={(event) => change('lng', event.target.value)} /></label></div>
    {error && <p className="my-map-editor-error" role="alert">{error}</p>}
  </div>
}

export default function MapItemEditor({ item, groups, editor, onAction }) {
  const [altitudeError, setAltitudeError] = useState('')
  const [floor, setFloor] = useState(item.altitude?.floorFt ?? '')
  const [ceiling, setCeiling] = useState(item.altitude?.ceilingFt ?? '')
  useEffect(() => { setFloor(item.altitude?.floorFt ?? ''); setCeiling(item.altitude?.ceilingFt ?? ''); setAltitudeError('') }, [item])
  const update = (patch, coalesce) => onAction('updateItem', item.id, patch, { coalesce })
  const commitAltitude = () => {
    try { update({ altitude: { ...item.altitude, ...editableAltitude(floor, ceiling) } }, `item:${item.id}:altitude`); setAltitudeError(''); onAction('endPropertyEdit') } catch (error) { setAltitudeError(error.message) }
  }
  const geometryEditable = !['compound'].includes(item.kind)
  return (
    <section className="my-map-item-editor" aria-label="항목 속성 수정">
      <button type="button" className="my-map-header-button" onClick={() => onAction('setEditorPane', 'list')}>← 항목 목록</button>
      <h2>항목 수정</h2>
      <TextField label="이름" value={item.name} itemId={item.id} field="name" onCommit={update} onEnd={() => onAction('endPropertyEdit')} />
      <label className="my-map-editor-field"><span>그룹</span><select value={item.groupId ?? ''} onChange={(event) => update({ groupId: event.target.value || null })}><option value="">그룹 없는 항목</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <TextField label="메모" value={item.description} itemId={item.id} field="description" multiline onCommit={update} onEnd={() => onAction('endPropertyEdit')} />
      <fieldset className="my-map-editor-fieldset"><legend>지도 표시</legend>
        <label className="my-map-editor-check"><input type="checkbox" checked={item.label?.visible ?? true} onChange={(event) => update({ label: { ...item.label, visible: event.target.checked } })} /> 이름 표시</label>
        <label className="my-map-editor-check"><input type="checkbox" checked={item.label?.always ?? false} onChange={(event) => update({ label: { ...item.label, always: event.target.checked } })} /> 항상 표시</label>
        <label>이름 크기<input type="number" min="8" max="32" value={item.label?.size ?? 12} onChange={(event) => { const size = Number(event.target.value); if (Number.isFinite(size) && size >= 8 && size <= 32) update({ label: { ...item.label, size } }, `item:${item.id}:labelSize`) }} onBlur={() => onAction('endPropertyEdit')} /></label>
        <label>색<input type="color" value={item.style?.color ?? '#475569'} onChange={(event) => update({ style: { ...item.style, color: event.target.value } }, `item:${item.id}:color`)} onBlur={() => onAction('endPropertyEdit')} /></label>
        <label>투명도<input type="range" min="0" max="1" step="0.05" value={item.style?.opacity ?? 1} onChange={(event) => update({ style: { ...item.style, opacity: Number(event.target.value) } }, `item:${item.id}:opacity`)} onMouseUp={() => onAction('endPropertyEdit')} /></label>
        {item.kind === 'point' ? <><label>아이콘<select value={item.style?.icon ?? 'dot'} onChange={(event) => update({ style: { ...item.style, icon: event.target.value } })}>{Object.entries(ICON_LABELS).map(([icon, label]) => <option key={icon} value={icon}>{label}</option>)}</select></label><label>크기<input type="number" min="1" max="50" value={item.style?.pointSize ?? 5} onChange={(event) => { const pointSize = Number(event.target.value); if (Number.isFinite(pointSize) && pointSize >= 1 && pointSize <= 50) update({ style: { ...item.style, pointSize } }, `item:${item.id}:pointSize`) }} onBlur={() => onAction('endPropertyEdit')} /></label></> : <><label>선 굵기<input type="number" min="0" max="30" value={item.style?.width ?? 2} onChange={(event) => { const width = Number(event.target.value); if (Number.isFinite(width) && width >= 0 && width <= 30) update({ style: { ...item.style, width } }, `item:${item.id}:width`) }} onBlur={() => onAction('endPropertyEdit')} /></label><label>선 종류<select value={item.style?.dash ?? 'solid'} onChange={(event) => update({ style: { ...item.style, dash: event.target.value } })}>{Object.entries(DASH_LABELS).map(([dash, label]) => <option key={dash} value={dash}>{label}</option>)}</select></label></>}
        {['polygon', 'circle'].includes(item.kind) && <><label>채움 색<input type="color" value={item.style?.fillColor ?? item.style?.color ?? '#475569'} onChange={(event) => update({ style: { ...item.style, fillColor: event.target.value } }, `item:${item.id}:fillColor`)} onBlur={() => onAction('endPropertyEdit')} /></label><label>채움 농도<input type="range" min="0" max="1" step="0.05" value={item.style?.fillOpacity ?? 0.1} onChange={(event) => update({ style: { ...item.style, fillOpacity: Number(event.target.value) } }, `item:${item.id}:fillOpacity`)} onMouseUp={() => onAction('endPropertyEdit')} /></label></>}
      </fieldset>
      {['polygon', 'circle'].includes(item.kind) && <fieldset className="my-map-editor-fieldset"><legend>고도 · ft {item.altitude?.datum ?? 'MSL'}</legend><div className="my-map-editor-pair"><label>바닥<input value={floor} inputMode="decimal" onChange={(event) => setFloor(event.target.value)} onBlur={commitAltitude} placeholder="미지정" /></label><label>천장<input value={ceiling} inputMode="decimal" onChange={(event) => setCeiling(event.target.value)} onBlur={commitAltitude} placeholder="미지정" /></label></div>{altitudeError && <p className="my-map-editor-error">{altitudeError}</p>}</fieldset>}
      {editor.geometryEdit?.itemId === item.id ? <div className="my-map-draft-hint">지도 손잡이 또는 아래 좌표로 형태를 수정 중입니다.
        {item.kind === 'point' && <CoordinateEditor coordinate={editor.geometryEdit.item.geometry?.coordinates} onCoordinate={(coordinate) => onAction('updatePointCoordinate', coordinate)} />}
        {item.kind === 'circle' && <><CoordinateEditor coordinate={editor.geometryEdit.item.definition?.center} onCoordinate={(center) => onAction('updateGeometryDefinition', { center, radiusNm: editor.geometryEdit.item.definition?.radiusNm })} /><label className="my-map-editor-field"><span>반경 · NM</span><input type="number" min="0.01" step="0.1" value={editor.geometryEdit.item.definition?.radiusNm ?? ''} onChange={(event) => { const radiusNm = Number(event.target.value); if (Number.isFinite(radiusNm) && radiusNm > 0) onAction('updateGeometryDefinition', { center: editor.geometryEdit.item.definition?.center, radiusNm }) }} /></label></>}
        {editor.geometryEdit.selectedVertex != null && item.kind !== 'circle' && <button type="button" className="my-map-secondary-button" onClick={() => onAction('deleteGeometryVertex')}>선택 꼭짓점 삭제</button>}
        <div><button type="button" className="my-map-primary-button" onClick={() => onAction('commitGeometryEdit')}>완료</button><button type="button" className="my-map-secondary-button" onClick={() => onAction('cancelGeometryEdit')}>취소</button></div>
      </div> : <><button type="button" className="my-map-secondary-button" disabled={!geometryEditable} title={geometryEditable ? undefined : '복합 도형은 이번 단계에서 꼭짓점 편집을 지원하지 않습니다.'} onClick={() => onAction('beginGeometryEdit', item.id)}>지도에서 위치·형태 수정</button>{!geometryEditable && <p className="my-map-empty">복합 도형은 속성과 그룹만 수정할 수 있습니다.</p>}</>}
    </section>
  )
}
