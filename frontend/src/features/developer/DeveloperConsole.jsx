import { useState } from 'react'
import { Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, TabList, Tab, makeStyles, tokens } from '../../shared/ui/fluent.js'
import TriggerTab from './tabs/TriggerTab.jsx'
import ObserveTab from './tabs/ObserveTab.jsx'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'

const useStyles = makeStyles({
  surface: { width: '760px', maxWidth: '96vw' },
  content: { maxHeight: '72vh', overflowY: 'auto', paddingTop: tokens.spacingVerticalM },
})

// 개발자 콘솔 — 설정창처럼 뜨는 모달. 개인설정 '개발자' 탭 버튼으로 열림(테스트 인스턴스 전용).
// /dev 페이지와 완전히 동일한 조작/관찰 탭(TriggerTab·ObserveTab)을 재사용한다.
// 닫힌 동안엔 탭 내용을 언마운트해 ObserveTab의 2초 폴링을 멈춘다.
export default function DeveloperConsole({ open, onOpenChange }) {
  useCloseOnBackButton(open, () => onOpenChange(false))
  const s = useStyles()
  const [tab, setTab] = useState('trigger')
  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle>개발자 콘솔</DialogTitle>
          <DialogContent className={s.content}>
            <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value)}>
              <Tab value="trigger">① 조작</Tab>
              <Tab value="observe">② 관찰</Tab>
            </TabList>
            {open && (tab === 'trigger' ? <TriggerTab /> : <ObserveTab />)}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
