import { useEffect, useRef, useState } from 'react'
import useDrawMap, { UNFILED, GEN_TOOLS } from './useDrawMap.js'
import { buildKml } from './lib/kmlWrite.js'
import IconPicker, { IconButton } from './IconPicker.jsx'
import { iconById } from './lib/iconCatalog.js'
import './DrawSpikePage.css'

const TOOLS = [
  { id: 'point', label: '점', mark: '●', hint: '지도를 누르면 점이 찍힙니다. 계속 찍을 수 있습니다.' },
  { id: 'line', label: '선', mark: '〰', hint: '점을 이어 찍고, 끝내려면 더블클릭 또는 Enter.' },
  { id: 'polygon', label: '면', mark: '⬠', hint: '점을 이어 찍고, 시작점을 다시 누르면 닫힙니다.' },
]

// 값으로 정의되는 도형들. 지도에서는 자리만 받고 나머지는 숫자로 정한다.
const GEN_BUTTONS = [
  { id: 'circle', label: '원', mark: '◯', hint: '중심을 누르고 마우스를 움직여 반경을 잡으세요. 한 번 더 누르면 확정.' },
  { id: 'sector', label: '섹터', mark: '◔', hint: '중심을 누르고 마우스를 움직여 반경을 잡으세요. 방위는 그 뒤 아래에서.' },
  { id: 'arc', label: '호', mark: '◜', hint: '중심을 누르고 마우스를 움직여 반경을 잡으세요. 방위는 그 뒤 아래에서.' },
  { id: 'arrow', label: '화살표', mark: '➜', hint: '시작점과 끝점을 차례로 누르세요.' },
  { id: 'corridor', label: '회랑', mark: '▤', hint: '중심선을 그리세요. 폭은 아래에서 정합니다.' },
  { id: 'text', label: '글자', mark: 'T', hint: '글자를 놓을 자리를 누르세요.' },
]

const MARK = Object.fromEntries([...TOOLS, ...GEN_BUTTONS].map((t) => [t.id, t.mark]))
const NEW_FOLDER = '__new__'

const fmtNm = (nm) => `${nm.toFixed(nm < 10 ? 2 : 1)} nm`
const fmtArea = (km2) => `${(km2 / 3.4299).toFixed(km2 < 10 ? 2 : 1)} nm²`
const fmtClock = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

function StyleRow({ label, children }) {
  return <label className="ds-row"><span className="ds-rowLabel">{label}</span>{children}</label>
}

function GenRows({ shape, setGenProp }) {
  const g = shape.gen
  if (!g) return null
  const set = (k) => (e) => setGenProp(shape.id, k, Number(e.target.value))
  return (
    <>
      <p className="ds-genHead">{GEN_TOOLS[g.type]?.label ?? g.type} — 숫자로 고칩니다</p>
      {g.radiusNm != null && (
        <StyleRow label="반경 nm">
          <input type="number" className="ds-input ds-num" min="0.1" step="0.5" value={g.radiusNm} onChange={set('radiusNm')} />
        </StyleRow>
      )}
      {g.widthNm != null && (
        <StyleRow label="폭 nm">
          <input type="number" className="ds-input ds-num" min="0.1" step="0.5" value={g.widthNm} onChange={set('widthNm')} />
        </StyleRow>
      )}
      {g.fromDeg != null && (
        <>
          <StyleRow label="시작 방위">
            <input type="number" className="ds-input ds-num" min="0" max="360" step="1" value={g.fromDeg} onChange={set('fromDeg')} />
          </StyleRow>
          <StyleRow label="끝 방위">
            <input type="number" className="ds-input ds-num" min="0" max="360" step="1" value={g.toDeg} onChange={set('toDeg')} />
          </StyleRow>
          {/* 공역 고시문의 radial은 대개 자북 기준이다. 한국은 서편차 약 8°라
              진북으로 잘못 읽으면 5NM 호에서 0.7NM이 어긋난다. */}
          <StyleRow label="방위 기준">
            <select className="ds-input" value={g.magnetic ? 'mag' : 'true'}
              onChange={(e) => setGenProp(shape.id, 'magnetic', e.target.value === 'mag')}>
              <option value="mag">자북 (MN)</option>
              <option value="true">진북 (TN)</option>
            </select>
          </StyleRow>
          <p className="ds-note">시계방향으로 잽니다. 270→090은 북쪽을 지납니다.</p>
        </>
      )}
    </>
  )
}

function Inspector({ shape, folders, setProp, remove, moveToFolder, setGenProp }) {
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // 다른 도형을 고르면 열려 있던 것을 닫는다 — 앞 도형의 삭제 확인이 남아 있으면 위험하다.
  useEffect(() => { setPicking(false); setConfirming(false) }, [shape?.id])

  if (!shape) {
    return <p className="ds-note">도형을 고르면 여기서 이름·색·고도를 고칩니다.</p>
  }
  const set = (k) => (e) => {
    const v = e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value
    setProp(shape.id, k, v)
  }
  const label = MARK[shape.gen?.type] ?? (shape.textOnly ? 'T' : MARK[shape.kind])
  const kindName = shape.gen ? GEN_TOOLS[shape.gen.type]?.label
    : shape.textOnly ? '글자' : { point: '점', line: '선', polygon: '면' }[shape.kind]

  return (
    <div className="ds-inspector">
      <p className="ds-inspectorHead"><span aria-hidden="true">{label}</span> {kindName}</p>

      <StyleRow label={shape.textOnly ? '글자' : '이름'}>
        {/* 구글어스 Pro와 같은 자리 — 이름칸 바로 옆이 아이콘 단추다. */}
        {shape.kind === 'point' && !shape.textOnly && !shape.gen && (
          <IconButton value={shape.icon} onClick={() => setPicking(true)} />
        )}
        <input className="ds-input" value={shape.name} onChange={set('name')}
          placeholder={shape.textOnly ? '지도에 뜰 글자' : '예: 훈련공역 A'} />
      </StyleRow>
      {picking && (
        <IconPicker value={shape.icon}
          onPick={(id) => setProp(shape.id, 'icon', id)}
          onClose={() => setPicking(false)} />
      )}
      <StyleRow label="메모">
        <textarea className="ds-input" rows={2} value={shape.description} onChange={set('description')} />
      </StyleRow>
      {/* 자유 입력이면 오타 하나로 새 폴더가 생긴다. 있는 것 중에 고르거나 새로 만든다. */}
      <StyleRow label="폴더">
        <select className="ds-input" value={shape.folder}
          onChange={(e) => {
            if (e.target.value !== NEW_FOLDER) { moveToFolder([shape.id], e.target.value); return }
            const name = window.prompt('새 폴더 이름')?.trim()
            if (name) moveToFolder([shape.id], name)
          }}>
          {[...new Set([...folders, shape.folder, UNFILED])].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
          <option value={NEW_FOLDER}>+ 새 폴더…</option>
        </select>
      </StyleRow>

      <div className="ds-sep" />

      <StyleRow label="색">
        <input type="color" className="ds-color" value={shape.color} onChange={set('color')} />
      </StyleRow>
      {shape.kind !== 'point' && (
        <StyleRow label="굵기">
          <input type="range" min="0.5" max="8" step="0.5" value={shape.width} onChange={set('width')} />
          <span className="ds-val">{shape.width}</span>
        </StyleRow>
      )}
      <StyleRow label="선 투명도">
        <input type="range" min="0" max="1" step="0.05" value={shape.opacity} onChange={set('opacity')} />
        <span className="ds-val">{Math.round(shape.opacity * 100)}%</span>
      </StyleRow>
      {shape.kind === 'polygon' && (
        <StyleRow label="면 투명도">
          <input type="range" min="0" max="1" step="0.05" value={shape.fillOpacity} onChange={set('fillOpacity')} />
          <span className="ds-val">{Math.round(shape.fillOpacity * 100)}%</span>
        </StyleRow>
      )}

      <GenRows shape={shape} setGenProp={setGenProp} />

      <details className="ds-alt">
        <summary>
          고도
          <span className="ds-val">
            {shape.ceilFt ? `${shape.floorFt || 'GND'}~${shape.ceilFt} ft` : 'GND'}
          </span>
        </summary>
        {shape.kind === 'polygon' && (
          <StyleRow label="바닥 ft">
            <input type="number" className="ds-input ds-num" value={shape.floorFt} onChange={set('floorFt')} step="500" />
          </StyleRow>
        )}
        <StyleRow label={shape.kind === 'polygon' ? '천장 ft' : '고도 ft'}>
          <input type="number" className="ds-input ds-num" value={shape.ceilFt} onChange={set('ceilFt')} step="500" />
        </StyleRow>
        <p className="ds-note">해수면(MSL) 기준. 0이면 땅에 붙습니다.</p>
      </details>

      {shape.measure && (
        <p className="ds-measure">
          {shape.measure.kind === 'line'
            ? `길이 ${fmtNm(shape.measure.nm)} · 점 ${shape.measure.count}개`
            : `둘레 ${fmtNm(shape.measure.nm)} · 면적 ${fmtArea(shape.measure.km2)}`}
        </p>
      )}

      {confirming ? (
        <>
          <p className="ds-confirmMsg">
            {shape.name ? `"${shape.name}"을(를) ` : '이 도형을 '}지울까요?
          </p>
          <div className="ds-confirm">
            <button type="button" className="ds-btn ds-danger" onClick={() => remove(shape.id)}>지웁니다</button>
            <button type="button" className="ds-btn ds-secondary" onClick={() => setConfirming(false)}>그만두기</button>
          </div>
        </>
      ) : (
        <button type="button" className="ds-btn ds-danger" onClick={() => setConfirming(true)}>삭제</button>
      )}
    </div>
  )
}

export default function DrawSpikePage() {
  const containerRef = useRef(null)
  const fileRef = useRef(null)
  const [mapName, setMapName] = useState('내 지도')
  const [dragOver, setDragOver] = useState(false)
  const {
    ready, error, shapes, selectedId, live, activeTool, saveState, hiddenFolders, undoable,
    pendingTool, sizing, importing,
    startTool, stopTool, setProp, remove, select, fitTo, undo, redo, toggleFolder, moveToFolder,
    startGenTool, cancelGenTool, setGenProp, importFile, clearImportMessage,
  } = useDrawMap(containerRef)

  const pick = (id) => {
    cancelGenTool()
    if (activeTool === id) stopTool(); else startTool(id)
  }
  const pickGen = (id) => (pendingTool === id && !sizing ? cancelGenTool() : startGenTool(id))
  const hint = sizing
    ? '마우스를 움직이면 반경이 늘어납니다. 한 번 더 누르면 확정됩니다.'
    // 값 도구가 켜져 있으면 그쪽 안내가 우선이다. 회랑은 속으로 선 그리기를 쓰는데
    // 그때 '선' 도구 안내가 나오면 어느 도구를 쓰는 중인지 헷갈린다.
    : GEN_BUTTONS.find((t) => t.id === pendingTool)?.hint
      ?? TOOLS.find((t) => t.id === activeTool)?.hint

  // Esc = 도구 끄기(CalTopo), ⌘Z/Ctrl+Z = 되돌리기(Felt·CalTopo).
  // 구글어스에는 되돌리기가 아예 없어서 오른클릭으로 마지막 점을 지우는 것이 전부다.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)
      if (e.key === 'Escape') { stopTool(); cancelGenTool(); return }
      if (typing) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stopTool, cancelGenTool, undo, redo])

  const selected = shapes.find((s) => s.id === selectedId) ?? null

  // 폴더별로 묶는다. Google My Maps의 "레이어"와 같은 개념 — 묶음마다 켜고 끈다.
  const folders = [...new Set(shapes.map((s) => s.folder))].sort((a, b) => (
    a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b, 'ko')
  ))

  // 목록에서 고르면 지도도 그리로 간다. 화면 밖의 도형을 고르고 아무 일도
  // 안 일어나면 무엇을 편집하는 중인지 알 수 없다.
  const pickFromList = (id) => { select(id); fitTo(id) }

  const exportKml = () => {
    const name = mapName.trim() || '내 지도'
    const kml = buildKml(shapes.map((s) => ({ ...s, iconUrl: iconById(s.icon).url })), name)
    const url = URL.createObjectURL(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.kml`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) importFile(file)
  }

  return (
    <div className="ds-root">
      <aside className="ds-panel">
        <div className="ds-head">
          <div className="ds-titleRow">
            <h1 className="ds-title" hidden>그리기 시험</h1>
            <input className="ds-mapName" value={mapName} onChange={(e) => setMapName(e.target.value)}
              aria-label="지도 이름" placeholder="지도 이름" />
            {saveState?.ok && <span className="ds-saved">저장됨 {fmtClock(saveState.at)}</span>}
          </div>
          {/* 저장 실패를 조용히 넘기면 조종사가 두 시간 그린 것이 창을 닫는 순간 사라진다. */}
          {saveState && !saveState.ok && (
            <p className="ds-savedFail" role="alert">
              <strong>저장되지 않고 있습니다.</strong><br />
              브라우저 보관 공간이 찼습니다. 지금 바로 아래 <strong>KML 내보내기</strong>로 파일을 받아 두세요.
            </p>
          )}
          {error && <p className="ds-failure" role="alert">{error}</p>}
          {!ready && !error && <p className="ds-note">지도 여는 중…</p>}

          <div className="ds-tools" role="group" aria-label="손으로 그리는 도구">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" aria-pressed={activeTool === t.id && !pendingTool}
                className={activeTool === t.id && !pendingTool ? 'ds-tool ds-toolOn' : 'ds-tool'}
                onClick={() => pick(t.id)}>
                <span className="ds-toolMark" aria-hidden="true">{t.mark}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="ds-tools ds-toolsGen" role="group" aria-label="숫자로 정하는 도구">
            {GEN_BUTTONS.map((t) => (
              <button key={t.id} type="button" aria-pressed={pendingTool === t.id}
                className={pendingTool === t.id ? 'ds-tool ds-toolOn' : 'ds-tool'}
                onClick={() => pickGen(t.id)}>
                <span className="ds-toolMark" aria-hidden="true">{t.mark}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="ds-undoRow">
            <button type="button" disabled={!undoable.undo} onClick={undo}>↶ 되돌리기</button>
            <button type="button" disabled={!undoable.redo} onClick={redo}>↷ 다시하기</button>
          </div>

          {hint && (
            <p className="ds-hint">
              {hint}
              <br />
              {sizing
                ? <>취소 <kbd>Esc</kbd></>
                : <>마지막 점 무르기 <kbd>⌫</kbd> · 도구 끄기 <kbd>Esc</kbd></>}
            </p>
          )}

          {live && (
            <p className="ds-live" role="status">
              {live.kind === 'radius' ? `반경 ${fmtNm(live.nm)}`
                : live.kind === 'line' ? `길이 ${fmtNm(live.nm)}`
                  : `면적 ${fmtArea(live.km2)} · 둘레 ${fmtNm(live.nm)}`}
            </p>
          )}
        </div>

        <div className="ds-scroll">
          <Inspector shape={selected} folders={folders} setProp={setProp}
            remove={remove} moveToFolder={moveToFolder} setGenProp={setGenProp} />

          <h2 className="ds-subtitle">그린 것 ({shapes.length})</h2>
          {shapes.length === 0 && <p className="ds-note">도구를 고르고 지도를 누르세요.</p>}
          {folders.map((folder) => {
            const items = shapes.filter((s) => s.folder === folder)
            const hidden = hiddenFolders.includes(folder)
            return (
              <div key={folder} className="ds-folder">
                <label className="ds-folderHead">
                  <input type="checkbox" checked={!hidden} onChange={() => toggleFolder(folder)} />
                  <span className={hidden ? 'ds-folderName ds-off' : 'ds-folderName'}>{folder}</span>
                  <span className="ds-count">({items.length})</span>
                </label>
                <ul className="ds-list">
                  {items.map((s) => (
                    <li key={s.id} className={s.id === selectedId ? 'ds-item ds-itemOn' : 'ds-item'}>
                      <button type="button" className="ds-itemBtn" aria-current={s.id === selectedId}
                        onClick={() => pickFromList(s.id)}>
                        <span className="ds-dot" style={{ background: s.color }} />
                        <span className="ds-itemName">
                          {s.name || `(${MARK[s.gen?.type] ?? MARK[s.kind]} 이름 없음)`}
                        </span>
                      </button>
                      <button type="button" className="ds-mini" onClick={() => fitTo(s.id)}
                        aria-label={`${s.name || '이름 없는 도형'} 위치로 이동`} title="여기로">⌖</button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="ds-foot">
          {/* 내보낸 파일을 되돌릴 길이 없으면 다른 기기로 옮기지도, 동료에게 받지도 못한다. */}
          <div className={dragOver ? 'ds-drop ds-dropOver' : 'ds-drop'}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}>
            KML·KMZ 파일을 끌어 놓거나{' '}
            <button type="button" className="ds-linkBtn" onClick={() => fileRef.current?.click()}>
              골라서 불러오기
            </button>
            <input ref={fileRef} type="file" accept=".kml,.kmz" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
          </div>
          {importing?.error && <p className="ds-failure" role="alert">{importing.error}</p>}
          {importing?.done && <p className="ds-note" role="status">{importing.done}</p>}
          {importing?.name && !importing.error && !importing.done && <p className="ds-note" role="status">{importing.name} 읽는 중…</p>}

          <div className="ds-footRow">
            <button type="button" className="ds-btn ds-primary" disabled={!shapes.length} onClick={exportKml}>
              KML 내보내기
            </button>
            {importing && (
              <button type="button" className="ds-btn ds-secondary" onClick={clearImportMessage}>확인</button>
            )}
          </div>
        </div>
      </aside>
      <div ref={containerRef} className="ds-map" />
    </div>
  )
}
