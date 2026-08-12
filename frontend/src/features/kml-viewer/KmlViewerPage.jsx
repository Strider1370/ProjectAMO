import { useRef, useState } from 'react'
import { kmlWithFolders } from '@tmcw/togeojson'
import { readKmlFromBuffer } from './lib/kmzUnzip.js'
import { buildLayerList, isLayerVisible } from './lib/kmlFolderTree.js'
import { httpsIcon } from './lib/kmlPaint.js'
import useKmlMap from './useKmlMap.js'
import useKmlWeather, { WEATHER_LAYERS } from './useKmlWeather.js'
import WeatherOverlayPanel from '../weather-overlays/WeatherOverlayPanel.jsx'
import '../map/MapView.css' // 기상 패널 타일 스타일이 여기 있다 — 다시 만들지 않는다
import './KmlViewerPage.css'

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

export default function KmlViewerPage() {
  const mapContainerRef = useRef(null)
  const { mapRef, ready, error: mapError, setLayers, setHidden, setLabelsOn, set3d, setExaggeration, fitTo, addMs, displayMs, wallCount, elevCount, wallMs } = useKmlMap(mapContainerRef)
  const weather = useKmlWeather(mapRef, ready)
  const [layers, setLayerList] = useState([])
  const [hidden, setHiddenSet] = useState(new Set())
  const [labelsOn, setLabels] = useState(true)
  const [on3d, setOn3d] = useState(false)
  const [exaggeration, setExag] = useState(1)
  const [stats, setStats] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(null)

  async function handleFile(file) {
    if (!file) return
    setFailure(null)
    setStats(null)
    let stage = '파일 읽기'
    // 큰 파일은 해석 중 화면이 굳는다(맥케이 파일 기준 1.6초 이상). 최소한 무슨 일이
    // 벌어지는지는 알려준다.
    setBusy(`${stage} 중… 파일이 크면 시간이 걸릴 수 있습니다`)
    const t0 = performance.now()
    try {
      const buffer = await file.arrayBuffer()
      stage = '압축 해제'
      setBusy(`${stage} 중…`)
      const text = await readKmlFromBuffer(buffer, file.name)
      const t1 = performance.now()
      stage = 'XML 해석'
      setBusy(`${stage} 중…`)
      const doc = new DOMParser().parseFromString(text, 'text/xml')
      // DOMParser는 깨진 XML에도 예외를 던지지 않고 <parsererror>를 심는다.
      // 검사하지 않으면 "폴더 0개"만 뜨고 실패인 줄 모른다.
      if (doc.querySelector('parsererror')) throw new Error('KML XML을 해석하지 못했습니다.')
      const t2 = performance.now()
      stage = 'GeoJSON 변환'
      const tree = kmlWithFolders(doc)
      const t3 = performance.now()
      stage = '레이어 목록 만들기'
      const list = buildLayerList(tree)
      stage = '지도에 올리기'
      setBusy(`${stage} 중…`)
      setLayerList(list)
      setHiddenSet(new Set())
      setLayers(list, t0)
      setLabelsOn(labelsOn) // 새로 그리면 라벨 레이어가 켜진 채로 생기므로 현재 설정을 다시 건다
      set3d(on3d) // 기둥 레이어도 새로 생기므로 마찬가지
      fitTo(list)

      // 아이콘은 이 스파이크에서 그리지 않고(점은 원으로 표시) "쓸 수 있는가"만 잰다.
      // 스펙이 요구하는 것은 로딩 성공/실패 수이지 아이콘 렌더링이 아니다.
      stage = '아이콘 확인'
      const iconUrls = new Set()
      for (const l of list) for (const f of l.features) {
        const u = httpsIcon(f.properties?.icon)
        if (u) iconUrls.add(u)
      }
      // 분자만 자르고 분모를 전체로 두면 비율이 거짓이 된다. 확인한 것만 세고,
      // 확인한 개수를 분모로 쓴다.
      const probeUrls = [...iconUrls].slice(0, 40)
      const probes = await Promise.all(probeUrls.map((u) =>
        fetch(u, { method: 'GET', mode: 'cors' }).then((r) => r.ok).catch(() => false)))
      const iconOk = probes.filter(Boolean).length

      let poly = 0, line = 0, point = 0, coords = 0
      const walk = (c) => { if (typeof c[0] === 'number') coords += 1; else c.forEach(walk) }
      const geom = (g) => {
        if (!g) return
        if (g.type === 'GeometryCollection') { g.geometries?.forEach(geom); return }
        if (g.type === 'Polygon') poly += 1
        else if (g.type === 'MultiPolygon') poly += g.coordinates.length
        else if (g.type === 'LineString') line += 1
        else if (g.type === 'MultiLineString') line += g.coordinates.length
        else if (g.type === 'Point') point += 1
        if (g.coordinates) walk(g.coordinates)
      }
      for (const l of list) for (const f of l.features) geom(f.geometry)

      setStats({
        fileSize: file.size,
        kmlSize: new Blob([text]).size,
        unzipMs: Math.round(t1 - t0),
        parseMs: Math.round(t2 - t1),
        convertMs: Math.round(t3 - t2),
        // 최상위 도형을 담으려고 만든 가상 폴더는 파일의 폴더가 아니므로 빼고 센다.
        folders: list.filter((l) => l.name !== '(폴더 없음)').length,
        features: list.reduce((n, l) => n + l.features.length, 0),
        poly, line, point, coords,
        iconProbed: probeUrls.length,
        iconTotal: iconUrls.size,
        iconOk,
        memoryMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      })
      setBusy(null)
    } catch (err) {
      setBusy(null)
      // 측정 도구가 빈 화면으로 죽으면 아무것도 배울 수 없다. 어느 단계에서
      // 무엇 때문에 실패했는지 남긴다.
      setFailure(`${stage} 단계에서 실패: ${err?.message ?? err}`)
    }
  }

  const toggle = (id) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id); else next.add(id)
    setHiddenSet(next)
    setHidden(next)
  }

  return (
    <div className="kv-root">
      <aside className="kv-panel">
        <h1 className="kv-title">KML 표출 시험</h1>
        {/* 지도가 준비되기 전에 올리면 addSource가 던지고, 16MB를 해석해놓고 버리게 된다. */}
        <input type="file" accept=".kml,.kmz" disabled={!ready}
          onChange={(e) => handleFile(e.target.files?.[0])} />
        <div className="kv-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (ready) handleFile(e.dataTransfer.files?.[0]) }}>
          {'여기에 KMZ·KML을 끌어다 놓아도 됩니다'}
        </div>

        {failure && <p className="kv-failure">{failure}</p>}
        {mapError && <p className="kv-failure">지도: {mapError}</p>}
        {!ready && <p className="kv-note">지도 준비 중…</p>}
        {busy && <p className="kv-note">{busy}</p>}

        {stats && (
          <dl className="kv-stats">
            <dt>원본 / KML</dt><dd>{mb(stats.fileSize)} → {mb(stats.kmlSize)}</dd>
            <dt>압축 해제</dt><dd>{stats.unzipMs} ms</dd>
            <dt>XML 해석</dt><dd>{stats.parseMs} ms</dd>
            <dt>GeoJSON 변환</dt><dd>{stats.convertMs} ms</dd>
            <dt>지도 등록(동기)</dt><dd>{addMs ?? '—'} ms</dd>
            <dt><strong>표시 완료까지</strong></dt><dd><strong>{displayMs != null ? `${(displayMs / 1000).toFixed(1)} 초` : '그리는 중…'}</strong></dd>
            <dt>폴더</dt><dd>{stats.folders.toLocaleString()}</dd>
            <dt>Feature</dt><dd>{stats.features.toLocaleString()}</dd>
            <dt>폴리곤 / 선 / 점</dt><dd>{stats.poly.toLocaleString()} / {stats.line.toLocaleString()} / {stats.point.toLocaleString()}</dd>
            <dt>좌표점</dt><dd>{stats.coords.toLocaleString()}</dd>
            <dt>고도 벽 / 뜬 경로</dt><dd>{wallCount ?? '—'} / {elevCount ?? '—'} 개 ({wallMs ?? '—'} ms)</dd>
            <dt>아이콘 주소</dt><dd>{stats.iconOk} / {stats.iconProbed} 불러와짐 (고유 {stats.iconTotal})</dd>
            <dt>메모리</dt><dd>{stats.memoryMb ? `${stats.memoryMb} MB` : '측정 불가'}</dd>
          </dl>
        )}

        {layers.length > 0 && (
          <label className="kv-labels">
            <input type="checkbox" checked={labelsOn} onChange={(e) => { setLabels(e.target.checked); setLabelsOn(e.target.checked) }} />
            {' 이름표 표시'}
          </label>
        )}

        {layers.length > 0 && (
          <label className="kv-labels">
            <input type="checkbox" checked={on3d} onChange={(e) => { setOn3d(e.target.checked); set3d(e.target.checked) }} />
            {' 3D 보기 (고도 벽 세우고, 경로 띄우고, 지도 기울이기)'}
          </label>
        )}

        {layers.length > 0 && on3d && (
          <label className="kv-labels">
            {'고도 과장 '}
            <select value={exaggeration}
              onChange={(e) => { const x = Number(e.target.value); setExag(x); setExaggeration(x) }}>
              {[1, 3, 5, 10, 20].map((x) => <option key={x} value={x}>{x}배</option>)}
            </select>
            <span className="kv-count">{' 높이만 늘린다 — 위치는 그대로'}</span>
          </label>
        )}

        <div className="kv-weather">
          <h2 className="kv-subtitle">
            {'기상 레이어'}
            <span className="kv-count">
              {weather.loaded ? ` (자료 ${weather.loadMs} ms)` : ' 불러오는 중…'}
            </span>
          </h2>
          {weather.error && <p className="kv-failure">기상 자료: {weather.error}</p>}
          <WeatherOverlayPanel
            layers={WEATHER_LAYERS}
            visibility={weather.visibility}
            onToggle={weather.toggle}
            onClose={() => {}}
            onClearAll={weather.clearAll}
            isLayerDisabled={() => !weather.loaded}
            getLayerBadge={() => null}
            showWind={false}
          />
        </div>

        <ul className="kv-tree">
          {layers.map((l) => {
            // 상위가 꺼져 실제로 안 보이는 폴더는 체크도 풀어 보여준다 — 지도에는
            // 없는데 목록에서는 켜져 보이면 무엇이 그려지는지 알 수 없다.
            const effective = isLayerVisible(layers, l.id, hidden)
            return (
              <li key={l.id} style={{ paddingLeft: `${l.depth * 14}px` }}>
                <label className={effective ? '' : 'kv-off'}>
                  <input type="checkbox" checked={effective} onChange={() => toggle(l.id)} />
                  {' '}{l.name}
                  <span className="kv-count">{l.features.length > 0 ? ` (${l.features.length})` : ''}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </aside>
      <div className="kv-map" ref={mapContainerRef} />
    </div>
  )
}
