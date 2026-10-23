import { FIELDS } from './model.js'
export default function RuleFields({ rules, onChange }) {
  function change(key, patch) { onChange({ ...rules, [key]: { ...rules[key], ...patch } }) }
  return <div className="al-rule-fields">{FIELDS.map(f => <div className="al-rule" key={f.key}>
    <label><input type="checkbox" checked={rules[f.key].enabled} onChange={e => change(f.key, { enabled: e.target.checked })} />{f.label}</label>
    {f.kind === 'event' ? <span>급변풍 보고 시</span> : <div>
      <input aria-label={`${f.label} 임계값`} type="number" min={f.min ?? 0} max={f.max} step="1" required disabled={!rules[f.key].enabled} value={rules[f.key].threshold} onChange={e => change(f.key, { threshold: e.target.value === '' ? '' : Number(e.target.value) })} /> <span>{f.unit}</span>
      {f.key === 'temperature' ? <select aria-label="기온 비교 방향" value={rules[f.key].direction} onChange={e => change(f.key, { direction: e.target.value })}><option>이상</option><option>이하</option></select> : <span> {f.direction}</span>}
    </div>}
  </div>)}</div>
}
