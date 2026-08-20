import { useEffect, useState } from 'react'
import { Dropdown, Option, Checkbox, Button, Input, Badge, MessageBar, MessageBarBody, makeStyles, tokens } from '../../../shared/ui/fluent.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { getRoutes, inject, reset, tick, clearAlerts, setRole, getVapidPublicKey, subscribePush, sendTestPush } from '../developerApi.js'
import DemoModePanel from '../../admin/DemoModePanel.jsx'
// 개인설정의 푸시 스위치와 같은 변환을 쓴다 — 복사해 두면 한쪽만 고쳐져 조용히 갈라진다.
import { urlBase64ToUint8Array } from '../../notifications/pushKey.js'

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '16px' },
  row: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
  group: { display: 'flex', flexDirection: 'column', gap: '6px' },
  block: { display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  h: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  link: { flex: 1, minWidth: '200px' },
})

const ROLE_KO = { pilot: '조종사', forecaster: '예보관', admin: '관리자' }

// ① 조작 탭 — 시나리오 주입/복구, 스케줄러 발화, 딥링크 생성, 역할 전환. store만 in-memory로 건드림(파일 미변경).
export default function TriggerTab() {
  const s = useStyles()
  const { user, refresh } = useAuth()
  const [routes, setRoutes] = useState([])
  const [routeId, setRouteId] = useState(null)
  const [scenario, setScenario] = useState({ depLifr: true, destIfr: false, routeTs: true, routeIce: false, destNotam: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    getRoutes().then((d) => {
      const list = d.routes ?? []
      setRoutes(list)
      if (list[0]) setRouteId(String(list[0].id))
    }).catch(() => setMsg({ intent: 'error', text: '경로 목록을 불러오지 못했습니다. 로그인 상태를 확인하세요.' }))
  }, [])

  async function run(fn, ok) {
    setBusy(true); setMsg(null)
    try { setMsg({ intent: 'success', text: ok(await fn()) }) }
    catch (e) { setMsg({ intent: 'error', text: e.message }) }
    finally { setBusy(false) }
  }

  // 앱을 꺼도 오는 Web Push 구독. 권한 요청 → sw.js 등록 대기 → VAPID 키로 subscribe → 서버 저장.
  async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('이 브라우저는 푸시를 지원하지 않습니다.')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.')
    const registration = await navigator.serviceWorker.ready
    const { key } = await getVapidPublicKey()
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    await subscribePush(subscription.toJSON())
    return '구독 완료. 이제 테스트 알림을 보내보세요.'
  }

  const selected = routes.find((r) => String(r.id) === routeId)
  const toggle = (k) => (_, d) => setScenario((s0) => ({ ...s0, [k]: d.checked }))
  const deeplink = routeId ? `${window.location.origin}/?flight=${routeId}` : ''

  return (
    <div className={s.body}>
      {/* 대상 경로 + 시나리오 */}
      <div className={s.group}>
        <span className={s.label}>대상 경로</span>
        <Dropdown
          value={selected ? selected.name : ''}
          selectedOptions={routeId ? [routeId] : []}
          onOptionSelect={(_, d) => setRouteId(d.optionValue)}
          placeholder={routes.length ? '경로 선택' : '저장된 경로 없음'}
        >
          {routes.map((r) => <Option key={r.id} value={String(r.id)}>{r.name}</Option>)}
        </Dropdown>
      </div>

      <div className={s.group}>
        <span className={s.label}>시나리오 (브리핑 위험 프리셋)</span>
        <Checkbox checked={scenario.depLifr} onChange={toggle('depLifr')} label="출발공항 LIFR (시정 0.8km + 뇌우)" />
        <Checkbox checked={scenario.destIfr} onChange={toggle('destIfr')} label="목적지 IFR (실링 600ft → 교체공항 필요 발생)" />
        <Checkbox checked={scenario.routeTs} onChange={toggle('routeTs')} label="경로 관통 뇌우 SIGMET (EMBD_TS)" />
        <Checkbox checked={scenario.routeIce} onChange={toggle('routeIce')} label="경로 착빙 SIGMET (SEV_ICE, 위험요약)" />
        <Checkbox checked={scenario.destNotam} onChange={toggle('destNotam')} label="목적지 위험구역 NOTAM" />
      </div>

      <div className={s.row}>
        <Button appearance="primary" disabled={busy || !routeId}
          onClick={() => run(() => inject(Number(routeId), scenario), (d) => `주입 완료: ${d.dep} — 알림 ${d.firedCount}건 발화.`)}>
          🌩 악기상 주입
        </Button>
        <Button appearance="outline" disabled={busy}
          onClick={() => run(reset, (d) => `초기화 — 실황 복구(${(d.restored ?? []).join(', ') || '없음'}) + 알림 ${d.deletedAlerts ?? 0}건 삭제.`)}>
          ↺ 초기화 (실황 복구)
        </Button>
        <Button disabled={busy}
          onClick={() => run(tick, (d) => `스케줄러 tick — 평가 ${d.evaluated}건, 발화 ${d.fired}건.`)}>
          ⏱ 스케줄러 즉시 발화
        </Button>
        <Button appearance="subtle" disabled={busy}
          onClick={() => run(clearAlerts, (d) => `알림 ${d.deleted}건 삭제(데이터는 유지).`)}>
          🗑 알림 전체 삭제
        </Button>
      </div>

      <div className={s.hint}>
        <b>즉시 발화 흐름:</b> ① [스케줄러 즉시 발화]로 baseline → ② [악기상 주입] → ③ 다시 [스케줄러 즉시 발화]하면
        실제 스케줄러가 변경을 감지해 발화(15분 대기 없이). 주입 버튼은 별도로도 알림을 바로 발화합니다.
      </div>

      {/* 시연 모드 + 데이터 스냅샷 — 관리자 콘솔(/admin)과 같은 컴포넌트 재사용(배포 서버에서도 써야 해서 백엔드는 /api/admin/*). */}
      <div className={s.block}>
        <DemoModePanel />
      </div>

      {/* 딥링크 생성기 (Task 11) */}
      <div className={s.block}>
        <span className={s.h}>딥링크 생성기</span>
        <span className={s.hint}>선택 경로의 알림 착지(<code>?flight=</code>) 링크. 먼저 [악기상 주입]으로 알림을 심고 링크를 열면 그 비행의 변경점 에스컬레이션 뷰로 착지합니다.</span>
        <div className={s.row}>
          <Input className={s.link} readOnly value={deeplink} placeholder="경로를 먼저 선택하세요" />
          <Button disabled={!deeplink} onClick={() => { navigator.clipboard?.writeText(deeplink); setMsg({ intent: 'success', text: '딥링크를 복사했습니다.' }) }}>복사</Button>
          <Button disabled={!deeplink} onClick={() => window.open(deeplink, '_blank')}>새 탭에서 열기</Button>
        </div>
      </div>

      {/* 역할 전환 (Task 12) — 테스트 모드 전용 */}
      <div className={s.block}>
        <span className={s.h}>역할 전환 <Badge appearance="tint" color="informative">현재: {ROLE_KO[user?.role] ?? user?.role ?? '—'}</Badge></span>
        <span className={s.hint}>내 계정 role을 임시 전환해 권한별 UI/API(예: /admin 접근, 예보관 큐, 403)를 검증합니다. 전환 후 해당 화면을 새로고침/이동하면 반영됩니다. (이 기능은 테스트 인스턴스에만 존재)</span>
        <div className={s.row}>
          {['pilot', 'forecaster', 'admin'].map((r) => (
            <Button key={r} appearance={user?.role === r ? 'primary' : 'outline'} disabled={busy || user?.role === r}
              onClick={() => run(async () => { const d = await setRole(r); await refresh(); return d }, (d) => `역할 → ${ROLE_KO[d.role]} 전환. 권한 화면은 새로고침 후 반영.`)}>
              {ROLE_KO[r]}
            </Button>
          ))}
        </div>
      </div>

      {/* Web Push 테스트 — 앱을 완전히 꺼도 오는지 확인용 */}
      <div className={s.block}>
        <span className={s.h}>푸시 알림 테스트</span>
        <span className={s.hint}>구독 후 앱을 완전히 종료한 상태에서 테스트 알림을 보내 실제로 도착하는지 확인합니다.</span>
        <div className={s.row}>
          <Button disabled={busy} onClick={() => run(subscribeToPush, (t) => t)}>🔔 푸시 구독하기</Button>
          <Button disabled={busy} onClick={() => run(sendTestPush, (d) => `테스트 알림 발송: ${d.sent}건 성공${d.pruned ? `, 만료 구독 ${d.pruned}건 정리` : ''}.`)}>
            📨 테스트 알림 보내기
          </Button>
        </div>
      </div>

      {msg && <MessageBar intent={msg.intent}><MessageBarBody>{msg.text}</MessageBarBody></MessageBar>}
    </div>
  )
}
