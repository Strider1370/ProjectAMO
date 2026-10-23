import { useState } from 'react'
import { Plus, Pencil, Pause, Play, Trash2 } from 'lucide-react'
import airports from '../../../../shared/airports.js'
import RuleFields from './RuleFields.jsx'
import { FIELDS, initialRules } from './model.js'

export default function WatchManager({ watches, onSaveWatch, onPauseWatch, onDeleteWatch }) {
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('RKSS')
  const [rules, setRules] = useState(initialRules)
  const [channels, setChannels] = useState({ popup: true, push: true })
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState(null)
  function choose(value) {
    setCode(value); setRules(structuredClone(watches[value]?.rules ?? initialRules()))
    setChannels({ popup: watches[value]?.popupEnabled ?? true, push: watches[value]?.pushEnabled ?? true })
  }
  function edit(value) { choose(value); setEditing(true); setNotice('') }
  function save(event) {
    event.preventDefault()
    if (!FIELDS.some(f => rules[f.key].enabled)) { setNotice('조건을 하나 이상 선택하세요.'); return }
    onSaveWatch(code, rules, channels); setEditing(false); setNotice(`${code} 알림 설정을 저장했습니다.`)
  }
  return <section className="ad-manager" aria-label="알림 설정">
    <div className="ad-section-heading"><h3>{editing ? '조건 및 수신 방법' : '등록 공항'}</h3><button className="ad-text-button" onClick={() => edit(airports.find(a => !watches[a.icao])?.icao ?? 'RKSS')}><Plus size={18} />공항 추가</button></div>
    <p className="ad-management-note">METAR 관측 임계값을 조정합니다. TAF 발표·공항경보·낙뢰·SIGMET은 실험실에서 수신 화면만 시험합니다.</p>
    <div role="status">{notice}</div>
    {editing && <form className="ad-rule-form" onSubmit={save}>
      <label>감시할 공항<select aria-label="설정 공항" value={code} onChange={e => choose(e.target.value)}>{airports.map(a => <option key={a.icao} value={a.icao}>{a.nameKo} · {a.icao}</option>)}</select></label>
      <h3>어떤 상황을 알려드릴까요?</h3><RuleFields rules={rules} onChange={setRules} />
      <p className="ad-management-note">급변풍은 수치 임계값 대신 METAR의 보고 여부로 확인합니다.</p>
      <h3>어디로 받을까요?</h3>
      <label className="ad-channel"><input type="checkbox" checked={channels.popup} onChange={e => setChannels({ ...channels, popup: e.target.checked })} />PC 웹사이트 팝업</label>
      <label className="ad-channel"><input type="checkbox" checked={channels.push} onChange={e => setChannels({ ...channels, push: e.target.checked })} />휴대폰 웹앱 푸시 (모의)</label>
      <p className="ad-management-note">수신을 꺼도 벨 알림창에서 현재 알림을 확인할 수 있습니다. 푸시는 모의 표시입니다.</p>
      <div className="ad-form-actions"><button type="button" onClick={() => setEditing(false)}>취소</button><button className="ad-primary" type="submit">알림 설정 저장</button></div>
    </form>}{!editing && <div className="ad-managed-list">
      {!Object.keys(watches).length && <div className="ad-empty"><h2>어느 공항을 알려드릴까요?</h2><p>공항을 추가하고 필요한 조건만 켜보세요.</p><button className="ad-primary" onClick={() => edit('RKSS')}>김포공항으로 시작</button></div>}
      {Object.entries(watches).map(([icao, watch]) => {
        return <article key={icao}>
        <div className="ad-managed-title"><strong>{airports.find(a => a.icao === icao)?.nameKo}</strong><span>{icao} · {watch.paused ? '일시정지' : '감시 중'}</span></div>
        <p className="ad-management-note">설정 항목: {FIELDS.filter(f => watch.rules[f.key]?.enabled).map(f => f.label).join(' · ')}</p>
        <div className="ad-manage-actions"><button onClick={() => edit(icao)}><Pencil size={16} />수정</button><button onClick={() => onPauseWatch(icao)}>{watch.paused ? <Play size={16} /> : <Pause size={16} />}{watch.paused ? '재개' : '일시정지'}</button><button aria-label={`${icao} 감시 삭제`} onClick={() => setDeleting(icao)}><Trash2 size={16} />삭제</button></div>
        {deleting === icao && <div className="ad-delete-confirm"><p>이 공항의 감시를 삭제할까요?</p><button onClick={() => setDeleting(null)}>취소</button><button onClick={() => { onDeleteWatch(icao); setDeleting(null) }}>감시 삭제 확정</button></div>}
      </article> })}
    </div>}
  </section>
}
