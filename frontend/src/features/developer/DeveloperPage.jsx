import { useEffect, useState } from 'react'
import { TabList, Tab, MessageBar, MessageBarBody, Spinner, Link, makeStyles, tokens } from '../../shared/ui/fluent.js'
import { getRuntimeCapabilities } from '../admin/adminApi.js'
import TriggerTab from './tabs/TriggerTab.jsx'
import ObserveTab from './tabs/ObserveTab.jsx'

const useStyles = makeStyles({
  page: { maxWidth: '960px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' },
  head: { display: 'flex', alignItems: 'baseline', gap: '12px' },
  title: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
})

// /dev 개발자 콘솔 — ① 조작(Trigger) + ② 관찰(Observe). 테스트 인스턴스(npm run dev:test)에서만 동작.
// 게이트: App.jsx가 import.meta.env.DEV로 라우트 자체를 운영 빌드에서 제거 + 여기서 런타임 testMode 재확인.
export default function DeveloperPage() {
  const s = useStyles()
  const [tab, setTab] = useState('trigger')
  const [testMutations, setTestMutations] = useState(null) // null=확인중

  useEffect(() => {
    getRuntimeCapabilities().then((d) => setTestMutations(d.testMutations)).catch(() => setTestMutations(false))
  }, [])

  if (testMutations === null) return <div className={s.page}><Spinner label="확인 중…" /></div>

  return (
    <div className={s.page}>
      <div className={s.head}>
        <span className={s.title}>개발자 콘솔</span>
        <span className={s.sub}>조작 + 관찰 · 테스트 인스턴스 전용</span>
      </div>

      {!testMutations ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            이 환경에서는 테스트 조작이 허용되지 않았습니다. 시연 모드는 관리자 콘솔의 “시연 모드”에서 사용할 수 있습니다.
          </MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value)}>
            <Tab value="trigger">① 조작</Tab>
            <Tab value="observe">② 관찰</Tab>
          </TabList>
          {tab === 'trigger' && <TriggerTab />}
          {tab === 'observe' && <ObserveTab />}
        </>
      )}
      <Link href="/">← 메인으로</Link>
    </div>
  )
}
