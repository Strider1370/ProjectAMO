import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button, Dropdown, Input, Option, makeStyles, mergeClasses } from '../../shared/ui/fluent.js'
import { COLOR_OPTIONS } from '../custom-area/usePolygonDraw.js'
import { COORD_FORMAT_OPTIONS, COORD_PLACEHOLDER, parseCoordinate } from '../custom-area/coordFormat.js'
import { toolStyles } from './toolStyles.js'

const useStyles = makeStyles({
  colorSwatch: {
    width: '26px', height: '26px', borderRadius: 'var(--radius-circular)', border: '2px solid transparent',
    padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  colorSwatchSelected: { border: '2px solid var(--text-1)', boxShadow: '0 0 0 2px var(--bg-1)' },
})

// 폴리곤 그리기 도구 본문 — 패널 크롬(헤더/위치)은 MapToolsPanel이 제공, 여기선 컨트롤만.
function PolygonToolBody({ polygon }) {
  const s = { ...toolStyles(), ...useStyles() }
  const {
    drawing, vertCount, polyCount, hasSelection, selectedColor, selectedFeatureColor,
    handleStart, handleCancel, handleUndo, handleDeleteSelected, handleDeleteAll,
    handleChangeSelectedColor, addVertex, setColor,
  } = polygon
  const [coordFormat, setCoordFormat] = useState('dd')
  const [coordInput, setCoordInput] = useState({ lat: '', lng: '' })
  const [coordError, setCoordError] = useState('')

  function handleFormatChange(value) { setCoordFormat(value); setCoordInput({ lat: '', lng: '' }); setCoordError('') }
  function handleCoordAdd(e) {
    e.preventDefault()
    try {
      const lat = parseCoordinate(coordInput.lat, coordFormat, 'lat')
      const lng = parseCoordinate(coordInput.lng, coordFormat, 'lng')
      setCoordError(''); addVertex(lng, lat); setCoordInput({ lat: '', lng: '' })
    } catch (err) { setCoordError(err.message) }
  }

  if (!drawing) {
    return (
      <>
        <Button appearance="primary" onClick={handleStart}>구역 그리기 시작</Button>
        {hasSelection && (
          <>
            <Button appearance="secondary" onClick={handleDeleteSelected}>선택 구역 삭제</Button>
            <div className={s.colorSection}>
              <span className={s.sectionTitle}>선택 구역 색상 변경</span>
              <div className={s.colorGrid} role="group" aria-label="선택 구역 색상 변경">
                {COLOR_OPTIONS.map((opt) => {
                  const isSelected = selectedFeatureColor === opt.value
                  return (
                    <button key={opt.value} type="button"
                      className={mergeClasses(s.colorSwatch, isSelected && s.colorSwatchSelected)}
                      style={{ backgroundColor: opt.value }} aria-label={opt.label} aria-pressed={isSelected}
                      onClick={() => handleChangeSelectedColor(opt.value)}>
                      {isSelected && <Check size={14} color={opt.checkColor} />}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
        {polyCount > 0 && <Button appearance="secondary" onClick={handleDeleteAll}>전체 구역 삭제 ({polyCount})</Button>}
        {polyCount > 0 && !hasSelection && <span className={s.status}>구역 클릭 시 선택</span>}
      </>
    )
  }

  return (
    <>
      <Button appearance="secondary" onClick={handleCancel}>그리기 취소</Button>
      <Button appearance="secondary" disabled={vertCount === 0} onClick={handleUndo}>마지막 점 취소</Button>
      <span className={s.status}>{vertCount}개 점 찍음</span>

      <form className={s.coordSection} onSubmit={handleCoordAdd}>
        <span className={s.sectionTitle}>좌표 직접 입력</span>
        <label className={s.coordRow}>
          <span className={s.coordLabel}>형식</span>
          <Dropdown className={s.coordSelect}
            value={COORD_FORMAT_OPTIONS.find((opt) => opt.value === coordFormat)?.label}
            selectedOptions={[coordFormat]} onOptionSelect={(_, d) => handleFormatChange(d.optionValue)}>
            {COORD_FORMAT_OPTIONS.map((opt) => <Option key={opt.value} value={opt.value}>{opt.label}</Option>)}
          </Dropdown>
        </label>
        <label className={s.coordRow}>
          <span className={s.coordLabel}>위도</span>
          <Input className={s.coordInput} type={coordFormat === 'dd' ? 'number' : 'text'}
            step={coordFormat === 'dd' ? 'any' : undefined} placeholder={COORD_PLACEHOLDER[coordFormat].lat}
            value={coordInput.lat} onChange={(e) => setCoordInput((p) => ({ ...p, lat: e.target.value }))} />
        </label>
        <label className={s.coordRow}>
          <span className={s.coordLabel}>경도</span>
          <Input className={s.coordInput} type={coordFormat === 'dd' ? 'number' : 'text'}
            step={coordFormat === 'dd' ? 'any' : undefined} placeholder={COORD_PLACEHOLDER[coordFormat].lng}
            value={coordInput.lng} onChange={(e) => setCoordInput((p) => ({ ...p, lng: e.target.value }))} />
        </label>
        {coordError && <span className={s.coordError}>{coordError}</span>}
        <Button type="submit" appearance="primary">점 추가</Button>
      </form>

      <div className={s.colorSection}>
        <span className={s.sectionTitle}>그리기 색상</span>
        <div className={s.colorGrid} role="group" aria-label="그리기 색상 선택">
          {COLOR_OPTIONS.map((opt) => {
            const isSelected = selectedColor === opt.value
            return (
              <button key={opt.value} type="button"
                className={mergeClasses(s.colorSwatch, isSelected && s.colorSwatchSelected)}
                style={{ backgroundColor: opt.value }} aria-label={opt.label} aria-pressed={isSelected}
                onClick={() => setColor(opt.value)}>
                {isSelected && <Check size={14} color={opt.checkColor} />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default PolygonToolBody
