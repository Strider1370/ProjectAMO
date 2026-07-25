import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import { buildTyphoonListItems } from './lib/typhoonListModel.js'
import './TyphoonPanel.css'

function formatAnalyzedAt(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'UTC', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

export default function TyphoonPanel({ typhoons = [], status = 'ok', onFocus, onClose }) {
  const isMobile = useIsMobile()
  const items = buildTyphoonListItems(typhoons)

  // 목록 본문은 데스크톱·모바일이 같다. 껍데기만 갈린다.
  const body = (
    <>
        {status === 'unavailable' && (
          <p className="typhoon-panel__empty">자료 없음 — 수집에 실패했습니다. 태풍이 없다는 뜻이 아닙니다.</p>
        )}
        {status !== 'unavailable' && items.length === 0 && (
          <p className="typhoon-panel__empty">현재 활동 중인 태풍 없음</p>
        )}
        {items.map((item) => (
          <section key={item.number} className="typhoon-panel__item">
            <span className="typhoon-panel__swatch" style={{ background: item.color }} aria-hidden="true" />
            <div className="typhoon-panel__body">
              <strong>{item.title}</strong>
              <div className="typhoon-panel__metrics">
                {item.pressureHpa !== null && <span>{item.pressureHpa} hPa</span>}
                {item.maxWindMs !== null && <span>{item.maxWindMs} m/s</span>}
              </div>
              <div className="typhoon-panel__location">{item.location}</div>
              <div className="typhoon-panel__time">{formatAnalyzedAt(item.analyzedAt)} UTC 분석</div>
            </div>
            <button type="button" className="typhoon-panel__focus" onClick={() => onFocus?.(item)}>
              바로가기
            </button>
          </section>
      ))}
    </>
  )

  // 데스크톱 패널은 레이어 드로어 오른쪽에 폭 300px로 붙는다. Pixel 5(393px)에서는
  // 화면 밖으로 나가므로 WeatherOverlayPanel과 같은 방식으로 시트로 전환한다.
  if (isMobile) {
    return (
      <MobileSheet
        open
        eyebrow="기상정보"
        title="태풍"
        onClose={onClose}
        headerExtra={<span className="layer-drawer-status">{items.length}개</span>}
      >
        <div aria-label="활성 태풍 목록">{body}</div>
      </MobileSheet>
    )
  }

  return (
    <div className="dev-layer-panel layer-drawer typhoon-panel" aria-label="활성 태풍 목록">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">기상정보</div>
          <div className="layer-drawer-title">태풍</div>
        </div>
        <span className="layer-drawer-status">{items.length}개</span>
      </div>
      <div className="layer-drawer-body">{body}</div>
    </div>
  )
}
