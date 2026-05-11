import { fmtKst } from '../lib/formatters.js'

const WARNING_LEVEL_COLOR = {
  1: '#f59e0b', 2: '#f97316', 3: '#ef4444', 4: '#dc2626',
}

export default function WarningTab({ warning }) {
  const warnings = warning?.warnings || []

  if (warnings.length === 0) return <div className="ap-empty">현재 활성 경보 없음</div>

  return (
    <div className="ap-warnings">
      {warnings.map((w, i) => {
        const title = w.wrng_type_name || w.type_label || w.type || '경보'
        const start = w.valid_start || w.start
        const end = w.valid_end || w.end
        const message = w.raw_message || w.text
        return (
          <div key={i} className="ap-warning-item" style={{ borderLeftColor: WARNING_LEVEL_COLOR[w.level] || '#94a3b8' }}>
            <div className="ap-warning-title">
              <span className="ap-warning-type">{title}</span>
              {w.wrng_type && <span className="ap-warning-level">Code {w.wrng_type}</span>}
              {w.level && <span className="ap-warning-level">Level {w.level}</span>}
            </div>
            <div className="ap-warning-time">
              {fmtKst(start)} – {fmtKst(end)}
            </div>
            {message && <div className="ap-warning-text">{message}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── 기상정보 tab ─────────────────────────────────────────────────────────────


