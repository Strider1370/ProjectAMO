import { makeStyles } from '../../shared/ui/fluent.js'

// 지도 도구 패널/본문 공용 스타일. Fluent 토큰만 사용(디자인 헌법).
export const toolStyles = makeStyles({
  panel: {
    // 런처 버튼(top:12, right:66/12) 바로 아래 — 오른쪽 위에서 뜬다(버튼과 시선 일치).
    position: 'absolute', top: '66px', right: '12px', zIndex: 8,
    display: 'flex', flexDirection: 'column', gap: 'var(--space-s)',
    width: '280px', padding: 'var(--space-m)',
    border: '1px solid var(--stroke-2)', borderRadius: 'var(--radius-lg)',
    background: 'rgba(255, 255, 255, 0.94)', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
    fontFamily: 'var(--font-base)', maxHeight: 'calc(100% - 78px)', overflowY: 'auto',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 'var(--fs-300)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)',
  },
  closeBtn: {
    border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)',
    fontSize: 'var(--fs-400)', lineHeight: 1, padding: 'var(--space-xxs)',
  },
  // 도구 선택기 (아이콘 그리드)
  toolGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-xs)',
  },
  toolBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '2px', padding: 'var(--space-xs) 0', minHeight: '52px',
    border: '1px solid var(--stroke-2)', borderRadius: 'var(--radius-md)',
    background: 'var(--bg-2)', color: 'var(--text-2)', cursor: 'pointer',
    fontSize: 'var(--fs-100)', fontFamily: 'var(--font-base)',
  },
  toolBtnActive: {
    border: '1px solid var(--accent, #2563eb)', color: 'var(--accent, #2563eb)',
    background: 'var(--bg-1)', fontWeight: 'var(--fw-semibold)',
  },
  divider: { height: '1px', background: 'var(--stroke-2)', margin: '2px 0' },
  status: { fontSize: 'var(--fs-200)', color: 'var(--text-2)' },
  hint: { fontSize: 'var(--fs-200)', color: 'var(--text-3)' },
  sectionTitle: { fontSize: 'var(--fs-200)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-2)' },
  readoutBig: { fontSize: 'var(--fs-500)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' },
  readoutRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-s)', fontSize: 'var(--fs-200)', color: 'var(--text-2)' },
  readoutVal: { color: 'var(--text-1)', fontWeight: 'var(--fw-semibold)', fontVariantNumeric: 'tabular-nums' },
  coordSection: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-xxs)',
    padding: 'var(--space-s)', border: '1px solid var(--stroke-2)', borderRadius: 'var(--radius-md)', background: 'var(--bg-2)',
  },
  colorSection: { display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-xxs)' },
  colorGrid: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' },
  coordRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-xs)' },
  coordLabel: { fontSize: 'var(--fs-200)', color: 'var(--text-2)', flexShrink: 0 },
  coordInput: { width: '160px' },
  coordSelect: { width: '160px', minWidth: '160px', maxWidth: '160px' },
  coordError: { fontSize: 'var(--fs-100)', color: 'var(--level-red)' },
  ringList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-xxs)' },
  ringRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-200)', color: 'var(--text-2)' },
  ringDel: { border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 'var(--fs-300)', lineHeight: 1 },
})
