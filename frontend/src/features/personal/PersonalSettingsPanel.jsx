import { useEffect, useState } from 'react'
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  Button, MessageBar, MessageBarBody, makeStyles,
} from '../../shared/ui/fluent.js'
import usePersonalSettings from './usePersonalSettings.js'

const useStyles = makeStyles({
  surface: { width: '520px', maxWidth: '94vw' },
  body: { display: 'flex', flexDirection: 'column', gap: 'var(--space-m)', paddingTop: 'var(--space-m)' },
  row: { display: 'flex', gap: 'var(--space-m)', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-xxs)', flex: '1 1 140px' },
  input: { padding: 'var(--space-s)', border: '1px solid var(--stroke-1)', borderRadius: 'var(--radius-md)', minHeight: 'var(--touch-min)' },
  hint: { color: 'var(--text-3)', fontSize: 'var(--fs-200)' },
})

export function PersonalSettingsContent() {
  const s = useStyles()
  const { minima, saveMinima } = usePersonalSettings()
  const [ceilingFt, setCeilingFt] = useState('')
  const [visibilityM, setVisibilityM] = useState('')
  const [message, setMessage] = useState(null)
  useEffect(() => {
    setCeilingFt(minima?.ceilingFt == null ? '' : String(minima.ceilingFt))
    setVisibilityM(minima?.visibilityM == null ? '' : String(minima.visibilityM))
  }, [minima])
  const save = async () => {
    const result = await saveMinima(ceilingFt === '' ? null : Number(ceilingFt),
      visibilityM === '' ? null : Number(visibilityM))
    setMessage(result.ok ? { intent: 'success', text: '저장했습니다.' }
      : { intent: 'error', text: result.error })
  }
  return <div className={s.body}>
    <strong>개인 기상 미니마</strong>
    <p className={s.hint}>브리핑 표시 기준입니다. 공항 알림 기준은 알림 설정에서 공항별로 정합니다.</p>
    <div className={s.row}>
      <label className={s.field}>운고 (ft)<input className={s.input} type="number" min="0" max="60000"
        value={ceilingFt} onChange={(event) => setCeilingFt(event.target.value)} aria-label="개인 미니마 운고(ft)" /></label>
      <label className={s.field}>시정 (m)<input className={s.input} type="number" min="0" max="10000"
        value={visibilityM} onChange={(event) => setVisibilityM(event.target.value)} aria-label="개인 미니마 시정(m)" /></label>
    </div>
    <div className={s.row}>
      <Button size="small" onClick={() => { setCeilingFt('1500'); setVisibilityM('5000') }}>VFR (1500ft/5000m)</Button>
      <Button size="small" onClick={() => { setCeilingFt('200'); setVisibilityM('550') }}>CAT-I (200ft/550m)</Button>
    </div>
    {message && <MessageBar intent={message.intent}><MessageBarBody>{message.text}</MessageBarBody></MessageBar>}
    <Button appearance="primary" onClick={save}>미니마 저장</Button>
    <a href="/alerts/settings">공항·비행경로 알림 설정 열기</a>
  </div>
}

export default function PersonalSettingsPanel({ open, onOpenChange }) {
  const s = useStyles()
  return <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
    <DialogSurface className={s.surface}><DialogBody><DialogTitle>개인설정</DialogTitle>
      <DialogContent><PersonalSettingsContent /></DialogContent>
    </DialogBody></DialogSurface>
  </Dialog>
}
