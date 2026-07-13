import { useState } from 'react'
import { Hexagon, MapPin, Ruler, CircleDashed, Compass, Mountain } from 'lucide-react'
import { Button, Dropdown, Input, Option } from '../../shared/ui/fluent.js'
import { COORD_FORMAT_OPTIONS, formatCoordinate } from '../custom-area/coordFormat.js'
import { toolStyles } from './toolStyles.js'
import PolygonToolBody from './PolygonToolBody.jsx'

const TOOLS = [
  { id: 'polygon', label: '구역', Icon: Hexagon },
  { id: 'coordinate', label: '좌표', Icon: MapPin },
  { id: 'distance', label: '거리', Icon: Ruler },
  { id: 'radius', label: '반경', Icon: CircleDashed },
  { id: 'bearing', label: '방위', Icon: Compass },
  { id: 'elevation', label: '고도', Icon: Mountain },
]

const fmtNm = (nm) => `${nm.toFixed(nm < 10 ? 2 : 1)} nm`
const fmtDeg = (d) => `${Math.round(((d % 360) + 360) % 360)}°`

function CoordinateBody({ s, coord, clear }) {
  const [fmt, setFmt] = useState('dd')
  return (
    <>
      <span className={s.hint}>지도를 클릭하면 위·경도를 표시합니다.</span>
      <label className={s.coordRow}>
        <span className={s.coordLabel}>형식</span>
        <Dropdown className={s.coordSelect}
          value={COORD_FORMAT_OPTIONS.find((o) => o.value === fmt)?.label}
          selectedOptions={[fmt]} onOptionSelect={(_, d) => setFmt(d.optionValue)}>
          {COORD_FORMAT_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
        </Dropdown>
      </label>
      {coord && (
        <div className={s.coordSection}>
          <div className={s.readoutRow}><span>위도</span><span className={s.readoutVal}>{formatCoordinate(coord.lat, fmt, 'lat')}</span></div>
          <div className={s.readoutRow}><span>경도</span><span className={s.readoutVal}>{formatCoordinate(coord.lng, fmt, 'lng')}</span></div>
        </div>
      )}
      {coord && <Button appearance="secondary" onClick={clear}>지우기</Button>}
    </>
  )
}

function DistanceBody({ s, distance, distanceDone, undoVertex, finishDistance, clear }) {
  const count = distance?.count ?? 0
  return (
    <>
      <span className={s.hint}>
        {distanceDone
          ? '측정 완료. 지도를 다시 클릭하면 새 측정을 시작합니다.'
          : '지도를 클릭해 점을 이어 찍으세요. 끝내려면 "측정 완료"(또는 더블클릭).'}
      </span>
      {count >= 2 && (
        <div className={s.coordSection}>
          <div className={s.readoutRow}><span>총 거리</span><span className={s.readoutBig}>{fmtNm(distance.totalNm)}</span></div>
          {distance.segsNm.map((nm, i) => (
            <div key={i} className={s.readoutRow}><span>구간 {i + 1}</span><span className={s.readoutVal}>{fmtNm(nm)}</span></div>
          ))}
        </div>
      )}
      {!distanceDone && count >= 2 && <Button appearance="primary" onClick={finishDistance}>측정 완료</Button>}
      {!distanceDone && count >= 1 && <Button appearance="secondary" onClick={undoVertex}>마지막 점 취소</Button>}
      {count > 0 && <Button appearance="secondary" onClick={clear}>{distanceDone ? '새로 재기' : '지우기'}</Button>}
    </>
  )
}

function RadiusBody({ s, center, rings, addRing, removeRing, clear }) {
  const [input, setInput] = useState('10')
  return (
    <>
      <span className={s.hint}>지도에서 중심을 눌러 드래그하면 그 거리만큼 원이 그려집니다. 또는 아래에 반경(nm)을 입력해 추가하세요.</span>
      <div className={s.coordRow}>
        <span className={s.coordLabel}>반경(nm)</span>
        <Input className={s.coordInput} type="number" step="any" min="0" value={input}
          onChange={(e) => setInput(e.target.value)} placeholder="예: 10" />
      </div>
      <Button appearance="primary" disabled={!center || !(Number(input) > 0)} onClick={() => addRing(Number(input))}>
        {center ? '링 추가' : '중심을 먼저 지정(클릭/드래그)'}
      </Button>
      {rings.length > 0 && (
        <div className={s.ringList}>
          {rings.map((nm) => (
            <div key={nm} className={s.ringRow}>
              <span>{fmtNm(nm)}</span>
              <button type="button" className={s.ringDel} aria-label={`${nm} 링 삭제`} onClick={() => removeRing(nm)}>×</button>
            </div>
          ))}
        </div>
      )}
      {(center || rings.length > 0) && <Button appearance="secondary" onClick={clear}>지우기</Button>}
    </>
  )
}

function BearingBody({ s, bearingInfo, clear }) {
  return (
    <>
      <span className={s.hint}>두 지점을 클릭하면 자북(MN)·진북(TN) 방위와 거리를 표시합니다.</span>
      {bearingInfo && (
        <div className={s.coordSection}>
          <div className={s.readoutRow}><span>자북 (MN)</span><span className={s.readoutBig}>{fmtDeg(bearingInfo.mn)}</span></div>
          <div className={s.readoutRow}><span>진북 (TN)</span><span className={s.readoutVal}>{fmtDeg(bearingInfo.tn)}</span></div>
          <div className={s.readoutRow}><span>거리</span><span className={s.readoutVal}>{fmtNm(bearingInfo.nm)}</span></div>
        </div>
      )}
      {bearingInfo && <Button appearance="secondary" onClick={clear}>지우기</Button>}
    </>
  )
}

function ElevationBody({ s, elevation, clear }) {
  return (
    <>
      <span className={s.hint}>지도를 클릭하면 그 지점의 표고를 표시합니다.</span>
      {elevation && (
        <div className={s.coordSection}>
          {elevation.loading && <span className={s.status}>조회 중…</span>}
          {!elevation.loading && elevation.error && <span className={s.coordError}>조회 실패: {elevation.error}</span>}
          {!elevation.loading && !elevation.error && elevation.ft == null && <span className={s.status}>표고 데이터 없음</span>}
          {!elevation.loading && elevation.ft != null && (
            <div className={s.readoutRow}><span>표고</span><span className={s.readoutBig}>{Math.round(elevation.ft).toLocaleString()} ft</span></div>
          )}
        </div>
      )}
      {elevation && <Button appearance="secondary" onClick={clear}>지우기</Button>}
    </>
  )
}

function MapToolsPanel({ activeTool, setActiveTool, polygon, measure, onClose }) {
  const s = toolStyles()

  return (
    <div className={s.panel} aria-label="지도 도구">
      <div className={s.header}>
        <span>지도 도구</span>
        <button type="button" className={s.closeBtn} onClick={onClose} aria-label="닫기">×</button>
      </div>

      <div className={s.toolGrid} role="tablist" aria-label="도구 선택">
        {TOOLS.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={activeTool === id}
            className={activeTool === id ? `${s.toolBtn} ${s.toolBtnActive}` : s.toolBtn}
            onClick={() => setActiveTool(id)}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={s.divider} />

      {activeTool === 'polygon' && <PolygonToolBody polygon={polygon} />}
      {activeTool === 'coordinate' && <CoordinateBody s={s} coord={measure.coord} clear={measure.clear} />}
      {activeTool === 'distance' && <DistanceBody s={s} distance={measure.distance} distanceDone={measure.distanceDone} undoVertex={measure.undoVertex} finishDistance={measure.finishDistance} clear={measure.clear} />}
      {activeTool === 'radius' && <RadiusBody s={s} center={measure.center} rings={measure.rings} addRing={measure.addRing} removeRing={measure.removeRing} clear={measure.clear} />}
      {activeTool === 'bearing' && <BearingBody s={s} bearingInfo={measure.bearingInfo} clear={measure.clear} />}
      {activeTool === 'elevation' && <ElevationBody s={s} elevation={measure.elevation} clear={measure.clear} />}
    </div>
  )
}

export default MapToolsPanel
