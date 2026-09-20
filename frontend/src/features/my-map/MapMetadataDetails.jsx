import { useId } from 'react'

const DESCRIPTION_COLLAPSE_AT = 800

export function metadataValue(value) {
  if (value === undefined) return { text: '자료 없음', empty: true }
  if (value === null) return { text: '미지정', empty: true }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === '<Null>') return { text: '자료 없음', empty: true }
    return { text: value, empty: false }
  }
  if (typeof value === 'object') {
    try { return { text: JSON.stringify(value), empty: false } } catch { return { text: String(value), empty: false } }
  }
  return { text: String(value), empty: false }
}

function MetadataTable({ entries, label }) {
  if (!entries.length) return null
  return (
    <div className="my-map-metadata-table" role="table" aria-label={label}>
      {entries.map((entry, index) => {
        const value = metadataValue(entry.value)
        return (
          <div className="my-map-metadata-row" role="row" key={`${entry.key}-${index}`}>
            <div role="rowheader">{entry.key || '이름 없음'}</div>
            <div role="cell" className={value.empty ? 'is-empty' : ''}>{value.text}</div>
          </div>
        )
      })}
    </div>
  )
}

function SourceDescription({ value }) {
  if (value.empty) return null
  if (value.text.length <= DESCRIPTION_COLLAPSE_AT) return <><h3 className="my-map-description-heading">설명</h3><p className="my-map-description">{value.text}</p></>
  return <details className="my-map-description-disclosure"><summary>원본 설명 전체 보기</summary><p className="my-map-description">{value.text}</p></details>
}

export default function MapMetadataDetails({ source }) {
  const metadataId = useId()
  if (!source) return null
  const summary = Array.isArray(source.summary) ? source.summary : []
  const metadata = Array.isArray(source.metadataEntries) ? source.metadataEntries : []
  // description can be an original KML HTML object. It is already represented by
  // descriptionText and parsed metadata rows, so exposing it again would show a
  // technical object and tempt consumers to render unsafe source HTML.
  const properties = Object.entries(source.properties ?? {})
    .filter(([key]) => key !== 'description')
    .map(([key, value]) => ({ key, value }))
  const warnings = Array.isArray(source.warnings) ? source.warnings.filter(Boolean) : []
  const hasSummary = summary.length > 0
  // Newer imports provide narrative text that excludes HTML table cells. Older
  // recovery records only have descriptionText; show it rather than lose the
  // author's note while those records remain readable.
  const description = metadataValue(source.descriptionNarrativeText ?? source.descriptionText)
  const hasMetadata = hasSummary || metadata.length > 0 || properties.length > 0 || !description.empty

  return (
    <section className="my-map-metadata" aria-labelledby={metadataId}>
      <h3 id={metadataId}>원본 정보</h3>
      {Array.isArray(source.folderPath) && source.folderPath.length > 0 && (
        <p className="my-map-source-path">원본 폴더 · {source.folderPath.join(' / ')}</p>
      )}
      {hasSummary && (
        <dl className="my-map-summary-list">
          {summary.map((entry, index) => {
            const value = metadataValue(entry.value)
            return <div key={`${entry.label}-${index}`}><dt>{entry.label || '정보'}</dt><dd className={value.empty ? 'is-empty' : ''}>{value.text}</dd></div>
          })}
        </dl>
      )}
      <SourceDescription value={description} />
      {warnings.length > 0 && <p className="my-map-source-warning" role="status">원본 일부를 그대로 해석하지 못했습니다. 표시 가능한 정보만 안전하게 보여 줍니다.</p>}
      {(metadata.length > 0 || properties.length > 0) && (
        <details className="my-map-metadata-disclosure" open={!hasSummary}>
          <summary>전체 원본 속성</summary>
          <MetadataTable entries={metadata} label="원본 메타데이터" />
          {properties.length > 0 && <MetadataTable entries={properties} label="원본 속성" />}
        </details>
      )}
      {!hasMetadata && <p className="my-map-metadata-empty">표시할 원본 설명이나 속성이 없습니다.</p>}
    </section>
  )
}
