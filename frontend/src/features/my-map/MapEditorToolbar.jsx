import { CircleDot, MapPin, PenLine, Redo2, Route, Undo2 } from 'lucide-react'

const TOOLS = [
  { id: 'point', label: '점', Icon: MapPin },
  { id: 'line', label: '선', Icon: Route },
  { id: 'polygon', label: '면', Icon: PenLine },
  { id: 'circle', label: '원', Icon: CircleDot },
]

export default function MapEditorToolbar({ editor, groups, onAction }) {
  const drawing = editor.activeTool != null
  return (
    <section className="my-map-editor-toolbar" aria-label="지도 작성 도구">
      <div className="my-map-tool-grid" role="group" aria-label="도형 도구">
        {TOOLS.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={`my-map-tool${editor.activeTool === id ? ' is-active' : ''}`} aria-pressed={editor.activeTool === id}
            onClick={() => onAction('setActiveTool', editor.activeTool === id ? null : id)}><Icon size={18} /><span>{label}</span></button>
        ))}
      </div>
      <div className="my-map-editor-options">
        {editor.activeTool === 'point' && <label className="my-map-editor-check"><input type="checkbox" checked={editor.continuousPoint} onChange={(event) => onAction('setContinuousPoint', event.target.checked)} /> 지점 연속 추가</label>}
        {groups.length > 0 && <label>추가할 그룹
          <select value={editor.targetGroupId ?? ''} onChange={(event) => onAction('setTargetGroup', event.target.value || null)}>
            <option value="">그룹 없는 항목</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>}
        <div className="my-map-editor-history">
          <button type="button" className="my-map-icon-button" aria-label="되돌리기" disabled={!editor.canUndo} onClick={() => onAction('undoEdit')}><Undo2 size={17} /></button>
          <button type="button" className="my-map-icon-button" aria-label="다시하기" disabled={!editor.canRedo} onClick={() => onAction('redoEdit')}><Redo2 size={17} /></button>
        </div>
      </div>
      {!drawing && !editor.geometryEdit && <p className="my-map-tool-guide">도구를 선택한 뒤 지도에서 위치를 누르세요.</p>}
      {drawing && <div className="my-map-draft-hint" role="status">
        <span>{editor.activeTool === 'point' ? (editor.continuousPoint ? '누를 때마다 지점을 추가합니다.' : '지점을 놓을 위치를 누르세요.') : editor.activeTool === 'circle' ? (editor.draft?.coordinates?.length ? '원의 반경을 정할 위치를 누르세요.' : '원의 중심을 누르세요.') : `${TOOLS.find((tool) => tool.id === editor.activeTool)?.label} · ${editor.draft?.coordinates?.length ?? 0}개 점 입력됨`}</span>
        <div>
          {editor.draft?.coordinates?.length > 0 && <button type="button" className="my-map-secondary-button" onClick={() => onAction('undoDraftPoint')}>한 점 취소</button>}
          {(editor.activeTool === 'line' || editor.activeTool === 'polygon') && <button type="button" className="my-map-primary-button" disabled={(editor.draft?.coordinates?.length ?? 0) < (editor.activeTool === 'line' ? 2 : 3)} onClick={() => onAction('finishDraft')}>도형 완료</button>}
          <button type="button" className="my-map-secondary-button" onClick={() => onAction('cancelDraft')}>{editor.activeTool === 'point' && editor.continuousPoint ? '추가 마침' : '취소'}</button>
        </div>
      </div>}
    </section>
  )
}
