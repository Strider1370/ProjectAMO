import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'

import {
  TabList, Tab, Button, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem, makeStyles, tokens,
} from '../../shared/ui/fluent.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PersonalSettingsContent } from '../personal/PersonalSettingsPanel.jsx'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import { listSavedRoutes, deleteSavedRoute } from '../route-briefing/lib/routeStore.js'
import { isSavedEtdPast } from '../route-briefing/lib/savedRouteBriefing.js'
import { MAX_SAVED_BRIEFINGS } from './accountLimits.js'
import '../settings/SettingsModal.css'

const ROLE_LABEL_KO = { admin: '관리자', pilot: '조종사', forecaster: '예보관' }

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS, border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  chips: { display: 'flex', gap: tokens.spacingHorizontalXS, marginTop: '2px', flexWrap: 'wrap' },
  chip: { fontSize: tokens.fontSizeBase100, padding: `0 ${tokens.spacingHorizontalXS}`, borderRadius: tokens.borderRadiusSmall },
  empty: { padding: tokens.spacingVerticalXXL, textAlign: 'center', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: '1.6' },
  notice: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalS },
  head: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalM },
})

function relativeTime(ts) {
  if (!Number.isFinite(ts)) return ''
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return day === 1 ? '어제' : `${day}일 전`
}

const hhmmZ = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

// 저장한 브리핑 한 줄. 여는 시각은 갈라지는 버튼 하나로 고른다 — 나란한 버튼 둘은 5줄이면
// 10개가 되고 둘이 비슷하게 생겨 잘못 누르기 쉽다. 기본값은 상황에 맞게 자동으로 정해진다.
function BriefingRow({ entry, watched, onOpen, onDelete }) {
  const s = useStyles()
  const past = isSavedEtdPast(entry)
  const savedEtd = hhmmZ(entry.etd)

  return (
    <div className={s.row}>
      <span className={s.body}>
        <div className={s.name}>{entry.name}</div>
        <div className={s.meta}>{relativeTime(entry.savedAt)} 저장</div>
        {(past || watched) && (
          <div className={s.chips}>
            {past && (
              <span className={s.chip} style={{ color: 'var(--level-gray)', background: 'var(--level-gray-bg)' }}>
                출발시각 지남
              </span>
            )}
            {watched && (
              <span className={s.chip} style={{ color: 'var(--level-amber)', background: 'var(--level-amber-bg)' }}>
                알림 감시중
              </span>
            )}
          </div>
        )}
      </span>

      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <MenuButton
            appearance="primary"
            size="small"
            onClick={() => onOpen(entry, past ? { etd: new Date().toISOString() } : undefined)}
          >
            열기
          </MenuButton>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem onClick={() => onOpen(entry, { etd: new Date().toISOString() })}>지금 시각으로 열기</MenuItem>
            <MenuItem
              disabled={past}
              onClick={() => onOpen(entry)}
              title={past ? '저장된 출발시각이 지나 예보가 없습니다' : undefined}
            >
              {savedEtd ? `저장된 시각으로 열기 (${savedEtd})` : '저장된 시각으로 열기'}
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      <Button size="small" onClick={() => onDelete(entry)} aria-label={`${entry.name} 삭제`}>삭제</Button>
    </div>
  )
}

// 내 계정 — 저장한 브리핑과 개인설정을 한자리에 모은다. 둘 다 "내 것"인데 서로 다른 곳에
// 흩어져 있을 이유가 없고, 알림 없이 브리핑을 여는 입구가 여기서 생긴다.
export default function AccountPanel({ onClose, onOpenBriefing, watchedBriefingIds = [] }) {
  useCloseOnBackButton(true, onClose)
  const s = useStyles()
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('briefings')
  const [briefings, setBriefings] = useState([])
  const watched = new Set(watchedBriefingIds)

  const refresh = useCallback(async () => {
    try { setBriefings(await listSavedRoutes({ kind: 'briefing' })) }
    catch { /* best-effort: 목록을 못 받아도 개인설정은 쓸 수 있어야 한다 */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function handleOpen(entry, options) {
    onClose()
    onOpenBriefing?.(entry, options)
  }

  async function handleDelete(entry) {
    // 알림은 등록 시점의 복제본을 감시한다. 원본을 지워도 계속 도는데, 사용자는
    // "지웠으니 알림도 끝"이라고 읽는다 — 그 어긋남을 여기서 말해 준다.
    const extra = watched.has(entry.id)
      ? '\n\n이 브리핑으로 등록한 비행 알림은 계속 감시합니다. 알림도 멈추려면 비행 알림에서 따로 지우세요.'
      : ''
    if (!window.confirm(`'${entry.name}'을(를) 지울까요?${extra}`)) return
    await deleteSavedRoute(entry.id)
    refresh()
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>내 계정</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="settings-layout">
          <TabList
            className="settings-tabs"
            vertical
            selectedValue={activeTab}
            onTabSelect={(_, data) => setActiveTab(data.value)}
          >
            <Tab value="briefings">저장한 브리핑</Tab>
            <Tab value="personal">개인설정</Tab>
          </TabList>

          <div className="settings-body">
            {activeTab === 'briefings' && (
              <div>
                <div className={s.head}>
                  <strong>{user?.display_name || user?.username}</strong>
                  <span className={s.meta}>{ROLE_LABEL_KO[user?.role] || user?.role}</span>
                </div>

                {briefings.length >= MAX_SAVED_BRIEFINGS && (
                  <div className={s.notice}>
                    {MAX_SAVED_BRIEFINGS}개까지 저장할 수 있습니다. 새로 저장하려면 하나를 지우세요.
                  </div>
                )}

                {briefings.length === 0 ? (
                  <div className={s.empty}>
                    저장한 브리핑이 없습니다.<br />
                    브리핑 화면에서 <strong>[브리핑 저장]</strong>을 누르면 여기에 담깁니다.
                  </div>
                ) : (
                  <div className={s.list}>
                    {briefings.map((entry) => (
                      <BriefingRow
                        key={entry.id}
                        entry={entry}
                        watched={watched.has(entry.id)}
                        onOpen={handleOpen}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'personal' && <PersonalSettingsContent />}
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-btn-reset" onClick={async () => { await logout(); onClose() }}>로그아웃</button>
        </div>
      </div>
    </div>
  )
}
