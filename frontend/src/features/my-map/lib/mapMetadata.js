// 가져온 설명은 실행하지 않는다. 이 모듈은 원문을 보관하고, 상세 화면이 텍스트와
// 표로 안전하게 그릴 수 있는 값만 따로 만든다.

const STANDARD_PROPERTIES = new Set([
  'name', 'address', 'visibility', 'open', 'phoneNumber', 'description',
  'styleUrl', 'stroke', 'stroke-opacity', 'stroke-width', 'fill', 'fill-opacity',
  'icon', 'icon-color', 'icon-opacity', 'icon-scale', 'label-color',
  'label-opacity', 'coordinateProperties', 'timestamp', 'timespan',
])

function text(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function childElements(node, name) {
  return Array.from(node?.childNodes ?? []).filter((child) => child.nodeType === 1
    && String(child.localName ?? child.tagName).toLowerCase() === name.toLowerCase())
}

function directText(node, name) {
  return childElements(node, name)[0]?.textContent ?? ''
}

function htmlFallback(raw) {
  return text(stripUnsafeHtml(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&'))
}

function stripUnsafeHtml(raw) {
  return String(raw).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
}

function htmlDocument(raw, DOMParserImpl) {
  if (!DOMParserImpl) return null
  try {
    const safe = stripUnsafeHtml(raw)
    const html = /^\s*<(?:!doctype|html)\b/i.test(safe) ? safe : `<html><body>${safe}</body></html>`
    const doc = new DOMParserImpl().parseFromString(html, 'text/html')
    if (!doc || doc.getElementsByTagName('parsererror').length > 0) return null
    return doc
  } catch {
    return null
  }
}

function tableEntries(doc) {
  const entries = []
  for (const row of Array.from(doc.getElementsByTagName('tr'))) {
    const cells = childElements(row, 'td').concat(childElements(row, 'th'))
    // 표 제목이나 중첩 표를 감싼 한 칸 행은 속성으로 추정하지 않는다.
    if (cells.length !== 2) continue
    const key = text(cells[0].textContent)
    if (!key) continue
    entries.push({ key, value: text(cells[1].textContent) })
  }
  return entries
}

function narrativeText(doc) {
  const parts = []
  const visit = (node, inTable = false) => {
    if (node?.nodeType === 3) {
      if (!inTable) parts.push(node.nodeValue ?? '')
      return
    }
    const nextInTable = inTable || String(node?.localName ?? node?.tagName ?? '').toLowerCase() === 'table'
    for (const child of Array.from(node?.childNodes ?? [])) visit(child, nextInTable)
  }
  visit(doc.body ?? doc)
  return text(parts.join(' '))
}

export function descriptionMetadata(description, { DOMParserImpl = globalThis.DOMParser } = {}) {
  const warnings = []
  if (description == null) return { descriptionRaw: null, descriptionText: '', descriptionNarrativeText: '', entries: [], warnings }

  if (typeof description === 'string') {
    const descriptionText = text(description)
    return { descriptionRaw: description, descriptionText, descriptionNarrativeText: descriptionText, entries: [], warnings }
  }

  if (typeof description !== 'object' || description['@type'] !== 'html' || typeof description.value !== 'string') {
    warnings.push('지원하지 않는 설명 형식은 원문 속성에 보관했습니다.')
    return { descriptionRaw: description, descriptionText: '', descriptionNarrativeText: '', entries: [], warnings }
  }

  const doc = htmlDocument(description.value, DOMParserImpl)
  if (!doc) {
    warnings.push('HTML 설명 일부를 해석하지 못해 텍스트로 표시합니다.')
    return {
      descriptionRaw: { '@type': 'html', value: description.value },
      descriptionText: htmlFallback(description.value),
      descriptionNarrativeText: htmlFallback(description.value),
      entries: [],
      warnings,
    }
  }

  return {
    descriptionRaw: { '@type': 'html', value: description.value },
    descriptionText: text(doc.body?.textContent ?? doc.documentElement?.textContent ?? doc.textContent),
    descriptionNarrativeText: narrativeText(doc),
    entries: tableEntries(doc),
    warnings,
  }
}

function first(entries, key) {
  return entries.find((entry) => entry.key === key)?.value
}

function has(entries, key) {
  return entries.some((entry) => entry.key === key)
}

function altitudeValue(entries, prefix) {
  const value = first(entries, `${prefix}_Val`)
  const unit = first(entries, `${prefix}_UOM`)
  const datum = first(entries, `${prefix}_Code`)
  if (!has(entries, `${prefix}_Val`) && !has(entries, `${prefix}_UOM`) && !has(entries, `${prefix}_Code`)) return null
  // 빈 값, 0, false를 같은 값으로 취급하지 않는다. KML 원문 표기는 entries에 남는다.
  return [value, unit, datum].filter((part) => part !== undefined && part !== '').join(' ').trim()
}

// 이 명칭은 실제 AIRAC 표본에서 확인한 필드만 요약한다. 다른 파일의 비슷한 이름은
// 전체 원본 속성표로 보이며 의미를 덧붙이지 않는다.
export function buildMetadataSummary(entries) {
  const summary = []
  const known = [
    ['Type_Code', '유형'], ['Class_Code', '등급'], ['Ident_Txt', '식별자'], ['Remarks_Txt', '비고'],
    ['RouteType_Code', '항로 유형'], ['TrueTrack_Val', '진방위'], ['MagTrack_Val', '자방위'],
    ['ReverseTrueTrack_Val', '역방향 진방위'], ['ReverseMagTrack_Val', '역방향 자방위'], ['Length_Val', '길이'],
  ]
  for (const [key, label] of known) {
    if (has(entries, key)) summary.push({ label, value: first(entries, key) })
  }
  for (const [prefix, label] of [['DistVertUpper', '상한'], ['DistVertLower', '하한']]) {
    const value = altitudeValue(entries, prefix)
    if (value !== null) summary.push({ label, value })
  }
  return summary
}

export function readExtendedDataEntries(placemark) {
  const entries = []
  for (const extended of childElements(placemark, 'ExtendedData')) {
    for (const data of Array.from(extended.getElementsByTagName('Data'))) {
      entries.push({ key: data.getAttribute('name') ?? '', value: text(directText(data, 'value')) })
    }
    for (const data of Array.from(extended.getElementsByTagName('SimpleData'))) {
      entries.push({ key: data.getAttribute('name') ?? '', value: text(data.textContent) })
    }
  }
  return entries
}

export function sourceMetadata({ properties = {}, description = properties.description, extendedEntries = [], DOMParserImpl } = {}) {
  const parsed = descriptionMetadata(description, { DOMParserImpl })
  const metadataEntries = [...extendedEntries, ...parsed.entries]

  // 변환기가 ExtendedData 값을 properties에 넣은 경우 원문 순서가 있는 entries가 우선이다.
  // DOM에서 읽지 못한 변환기 속성도 유실시키지 않는다.
  if (metadataEntries.length === 0) {
    for (const [key, value] of Object.entries(properties)) {
      if (!STANDARD_PROPERTIES.has(key)) metadataEntries.push({ key, value })
    }
  }

  return {
    metadataEntries,
    descriptionRaw: parsed.descriptionRaw,
    descriptionText: parsed.descriptionText,
    descriptionNarrativeText: parsed.descriptionNarrativeText,
    summary: buildMetadataSummary(metadataEntries),
    warnings: parsed.warnings,
  }
}
