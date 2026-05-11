import { useEffect, useRef } from "react";

const SEVERITY_COLORS = {
  critical: { bg: "#FF4444", border: "#CC0000" },
  warning: { bg: "#FF8800", border: "#CC6600" },
  info: { bg: "#2196F3", border: "#1565C0" },
};

export default function AlertPopup({ alerts, onDismiss, settings }) {
  const maxVisible = settings?.max_visible ?? 5;
  const autoDismiss = settings?.auto_dismiss_seconds ?? 10;
  const visible = alerts.slice(0, maxVisible);

  return (
    <div className="alert-popup-container">
      {visible.map((alert) => (
        <PopupItem
          key={alert.id}
          alert={alert}
          autoDismiss={autoDismiss}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function PopupItem({ alert, autoDismiss, onDismiss }) {
  const timerRef = useRef(null);
  const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;

  useEffect(() => {
    if (autoDismiss > 0) {
      timerRef.current = setTimeout(() => {
        onDismiss(alert.id);
      }, autoDismiss * 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alert.id, autoDismiss, onDismiss]);

  return (
    <div
      className="alert-popup-item"
      style={{ borderLeft: `4px solid ${colors.border}` }}
    >
      <div className="alert-popup-header">
        <span
          className="alert-popup-severity"
          style={{ background: colors.bg }}
        >
          {alert.severity.toUpperCase()}
        </span>
        <span className="alert-popup-icao">{alert.icao}</span>
        <button
          className="alert-popup-close"
          onClick={() => onDismiss(alert.id)}
          aria-label="닫기"
        >
          &times;
        </button>
      </div>
      <div className="alert-popup-title">{alert.title}</div>
      {alert.message && (
        <div className="alert-popup-message">{alert.message}</div>
      )}
      <div className="alert-popup-time">
        {new Date(alert.timestamp).toLocaleTimeString("ko-KR")}
      </div>
    </div>
  );
}
