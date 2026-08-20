import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { getDataHealth, getMetrics, getPending, getServerHealth } from './adminApi.js'
import { MENUS, MENU_GROUPS, menuBadges, menusIn, topSignals } from './lib/menus.js'
import OverviewScreen from './screens/OverviewScreen.jsx'
import DataCollectionScreen from './screens/DataCollectionScreen.jsx'
import ServerResourceScreen from './screens/ServerResourceScreen.jsx'
import ApiUsageScreen from './screens/ApiUsageScreen.jsx'
import UsersScreen from './screens/UsersScreen.jsx'
import AccountsScreen from './screens/AccountsScreen.jsx'
import AlertWatchScreen from './screens/AlertWatchScreen.jsx'
import './AdminPage.css'

// 관리자 콘솔 껍데기 — 상단 신호등, 왼쪽 메뉴, 그리고 고른 화면 하나.
//
// 자료·서버·지표·승인대기는 여기서 한 번만 받아 화면들에 나눠준다. 화면마다 따로 폴링하면
// 같은 것을 여러 번 부르게 되고, 상단 신호등과 화면 내용이 서로 다른 순간의 값을 보여준다.
// API 사용량과 이용자 통계는 그 화면에서만 쓰므로 각자 받는다.
const SCREENS = {
  overview: OverviewScreen,
  data: DataCollectionScreen,
  server: ServerResourceScreen,
  api: ApiUsageScreen,
  users: UsersScreen,
  accounts: AccountsScreen,
  alerts: AlertWatchScreen,
}

const POLL_MS = 5000

export default function AdminShell() {
  const [menu, setMenu] = useState('overview')
  const [range, setRange] = useState('24h') // 시스템 리소스 기간 — 서버 자원 화면이 바꾼다
  const [health, setHealth] = useState(null)
  const [server, setServer] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [pending, setPending] = useState([])

  const refresh = useCallback(async () => {
    const [h, s, m, p] = await Promise.allSettled([
      getDataHealth(), getServerHealth(), getMetrics(range), getPending(),
    ])
    if (h.status === 'fulfilled') setHealth(h.value)
    if (s.status === 'fulfilled') setServer(s.value)
    if (m.status === 'fulfilled') setMetrics(m.value)
    if (p.status === 'fulfilled') setPending(p.value)
  }, [range])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const Screen = SCREENS[menu]
  const badges = menuBadges({ health, pending })
  const signals = topSignals({ health, server })

  return (
    <div className="admin-page">
      <div className="ac-shell">
        <div className="ac-topbar">
          <a className="ac-back" href="/" aria-label="메인으로"><ArrowLeft size={16} /></a>
          <span className="ac-brand">ProjectAMO 운영</span>
          {signals.map((signal) => (
            <span className="ac-sig" key={signal.id}>
              <i className={`ac-dot-${signal.tone}`} />
              {signal.label}
              {signal.count > 0 && <b>{signal.count}</b>}
            </span>
          ))}
          <span className="ac-right n">
            {health?.generatedAt ? `${new Date(health.generatedAt).toLocaleTimeString('ko-KR')} 갱신` : '불러오는 중'}
          </span>
        </div>

        <div className="ac-layout">
          <nav className="ac-side">
            {MENU_GROUPS.map((group) => (
              <div key={group.id}>
                <div className="ac-grp">{group.label}</div>
                {menusIn(group.id).map((item) => (
                  <a
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={menu === item.id ? 'ac-on' : ''}
                    onClick={() => setMenu(item.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenu(item.id) } }}
                  >
                    {item.label}
                    {badges[item.id] > 0 && (
                      <span className={`ac-badge ${item.id === 'accounts' ? 'ac-warn' : 'ac-bad'}`}>{badges[item.id]}</span>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </nav>

          <main className="ac-stage">
            <Screen
              health={health}
              server={server}
              metrics={metrics}
              pending={pending}
              onGo={setMenu}
              onChanged={refresh}
              range={range}
              onRange={setRange}
            />
          </main>
        </div>
      </div>
    </div>
  )
}

export { MENUS }
