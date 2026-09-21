import { MapPin, Route, CircleDot, Shapes, X } from 'lucide-react'
import MapMetadataDetails, { metadataValue } from './MapMetadataDetails.jsx'

const KIND = {
  point: { label: '지점', Icon: MapPin },
  line: { label: '선', Icon: Route },
  polygon: { label: '면', Icon: Shapes },
  circle: { label: '원', Icon: CircleDot },
  compound: { label: '복합 도형', Icon: Shapes },
}

function coordinateCount(value) {
  if (!Array.isArray(value)) return 0
  if (typeof value[0] === 'number') return 1
  return value.reduce((sum, child) => sum + coordinateCount(child), 0)
}

function pointCoordinateText(coordinates) {
  if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null
  return `위도 ${coordinates[1].toFixed(6)}°, 경도 ${coordinates[0].toFixed(6)}°`
}

function geometryText(item) {
  if (item.kind === 'circle') {
    const radius = metadataValue(item.definition?.radiusNm)
    return radius.empty ? '반경 자료 없음' : `반경 ${radius.text} NM`
  }
  const geometry = item.geometry
  if (!geometry) return '형상 자료 없음'
  if (geometry.type === 'Point') return '지점'
  const count = coordinateCount(geometry.coordinates)
  if (!count) return item.kind === 'compound' ? '여러 도형' : '형상 자료 없음'
  if (geometry.type === 'Polygon') return `영역 · 꼭짓점 ${count}개`
  if (geometry.type === 'LineString') return `선 · 경유 지점 ${count}개`
  return item.kind === 'compound' ? `여러 도형 · 위치 ${count}개` : `위치 ${count}개`
}

function altitudeText(altitude) {
  if (!altitude) return null
  const floor = metadataValue(altitude.floorFt)
  const ceiling = metadataValue(altitude.ceilingFt)
  if (floor.empty && ceiling.empty) return null
  return `${floor.text} – ${ceiling.text} ft · ${altitude.datum || 'MSL'}`
}

export default function MyMapDetail({ item, groupName, onClose, onEdit, onCopy }) {
  if (!item) return null
  const kind = KIND[item.kind] ?? KIND.compound
  const altitude = altitudeText(item.altitude)
  const coordinates = item.kind === 'point' ? pointCoordinateText(item.geometry?.coordinates) : null
  const Icon = kind.Icon
  return (
    <section className="my-map-detail" aria-label={`${item.name || '이름 없는 항목'} 상세`}>
      <div className="my-map-detail-heading">
        <span className="my-map-kind"><Icon size={16} aria-hidden="true" /> 선택한 항목 · {kind.label}</span>
        <button type="button" className="my-map-icon-button" onClick={onClose} aria-label="항목 상세 닫기"><X size={18} /></button>
      </div>
      <h2>{item.name || '이름 없는 항목'}</h2>
      <dl className="my-map-detail-facts">
        {groupName && <div><dt>그룹</dt><dd>{groupName}</dd></div>}
        <div><dt>형태</dt><dd>{geometryText(item)}</dd></div>
        {coordinates && <div><dt>위치</dt><dd>{coordinates}</dd></div>}
        {altitude && <div><dt>고도</dt><dd>{altitude}</dd></div>}
      </dl>
      {!item.source && item.description && <p className="my-map-description">{item.description}</p>}
      {item.source && item.description !== item.source.descriptionText && <section aria-label="사용자 메모"><h3>사용자 메모</h3><p className="my-map-description">{item.description || '작성한 메모가 없습니다.'}</p></section>}
      <MapMetadataDetails source={item.source} />
      {typeof onEdit === 'function' && (
        <button type="button" className="my-map-primary-button my-map-detail-edit" onClick={onEdit}>이 항목 수정</button>
      )}
      {typeof onCopy === 'function' && <button type="button" className="my-map-primary-button my-map-detail-edit" onClick={onCopy}>내 지도로 복사</button>}
    </section>
  )
}
