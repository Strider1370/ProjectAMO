import { AlertOctagon, AlertTriangle, Info } from "lucide-react";

const SEVERITY_COLORS = {
  critical: { bg: "#dc2626", glow: "rgba(220, 38, 38, 0.45)" },
  warning: { bg: "#ea580c", glow: "rgba(234, 88, 12, 0.35)" },
  info: { bg: "#2563eb", glow: "rgba(37, 99, 235, 0.3)" },
};

const SEVERITY_ICON = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

function isAlertValid(alert, validKeys) {
  // 미리보기 등 alertKey가 없는 항목(실제 트리거 재평가 대상이 아님)은 항상 유효로 취급한다.
  return !alert.alertKey || !!validKeys?.has(alert.alertKey);
}

// 지켜보는 대시보드용 상시 알림 패널. 토스트처럼 자동으로 사라지지 않는다.
// 최상단: 지금도 조건이 유지되고 있는(유효한) 가장 최근 알림 1건 — 크게.
// 그 아래: 지금까지 울렸던 알림 이력 — 완전히 다른, 훨씬 얇은 한 줄 목록으로 위계를 준다.
export default function AlertPanel({ alerts, validKeys, onDismiss, settings }) {
  const maxHistory = settings?.max_visible ?? 8;
  const visible = alerts.slice(0, maxHistory);

  if (visible.length === 0) return null;

  const featuredIndex = visible.findIndex((alert) => isAlertValid(alert, validKeys));
  const featured = featuredIndex >= 0 ? visible[featuredIndex] : null;
  const history = featured ? visible.filter((_, i) => i !== featuredIndex) : visible;

  return (
    <div className="alert-panel">
      {featured ? (
        <FeaturedAlert alert={featured} onDismiss={onDismiss} />
      ) : (
        <div className="alert-panel-empty">현재 활성 알림 없음</div>
      )}
      {history.length > 0 && (
        <ul className="alert-panel-history">
          {history.map((alert) => (
            <HistoryRow
              key={alert.id}
              alert={alert}
              valid={isAlertValid(alert, validKeys)}
              onDismiss={onDismiss}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FeaturedAlert({ alert, onDismiss }) {
  const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
  const Icon = SEVERITY_ICON[alert.severity] || Info;

  return (
    <div
      className={`alert-panel-featured alert-panel-featured--${alert.severity}`}
      style={{ "--alert-color": colors.bg, "--alert-glow": colors.glow }}
    >
      <div className="alert-panel-featured-icon">
        <Icon size={24} strokeWidth={2.4} />
      </div>
      <div className="alert-panel-featured-body">
        <div className="alert-panel-featured-header">
          <span className="alert-panel-featured-icao">{alert.icao}</span>
          <span className="alert-panel-featured-time">
            {new Date(alert.timestamp).toLocaleTimeString("ko-KR")}
          </span>
        </div>
        <div className="alert-panel-featured-title">{alert.title}</div>
        {alert.message && (
          <div className="alert-panel-featured-message">{alert.message}</div>
        )}
      </div>
      <button
        className="alert-panel-featured-close"
        onClick={() => onDismiss(alert.id)}
        aria-label="닫기"
      >
        &times;
      </button>
    </div>
  );
}

// 이력 줄: 카드가 아니라 색 점 + 한 줄 텍스트뿐인 로그 행. 최상단 카드와 한눈에 구별되게 한다.
function HistoryRow({ alert, valid, onDismiss }) {
  const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;

  return (
    <li className={`alert-panel-row${valid ? "" : " alert-panel-row--resolved"}`}>
      <span className="alert-panel-row-dot" style={{ background: colors.bg }} aria-hidden="true" />
      <span className="alert-panel-row-icao">{alert.icao}</span>
      <span className="alert-panel-row-title">{alert.title}</span>
      {!valid && <span className="alert-panel-row-resolved-tag">해제됨</span>}
      <span className="alert-panel-row-time">
        {new Date(alert.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button
        className="alert-panel-row-close"
        onClick={() => onDismiss(alert.id)}
        aria-label="닫기"
      >
        &times;
      </button>
    </li>
  );
}
