import { useState, useEffect, useRef } from "react";

const SPEED_MAP = { slow: 80, normal: 50, fast: 30 };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export default function AlertMarquee({ alerts, settings }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  const minSeverity = settings?.min_severity ?? "warning";
  const speed = settings?.speed ?? "normal";
  const showDuration = settings?.show_duration_seconds ?? 30;

  const minLevel = SEVERITY_ORDER[minSeverity] ?? 1;
  const filtered = alerts.filter((a) => (SEVERITY_ORDER[a.severity] ?? 2) <= minLevel);
  const alertSignature = filtered
    .map((alert) => `${alert.id}:${alert.severity}:${alert.icao}:${alert.title}`)
    .join("|");

  // auto-hide after show_duration_seconds
  useEffect(() => {
    if (filtered.length === 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (showDuration > 0) {
      timerRef.current = setTimeout(() => setVisible(false), showDuration * 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alertSignature, showDuration]);

  if (!settings?.enabled || filtered.length === 0 || !visible) return null;

  const text = filtered
    .map((a) => `[${a.severity.toUpperCase()}] ${a.icao} — ${a.title}`)
    .join("    ///    ");

  const duration = Math.max(text.length * (SPEED_MAP[speed] || 50) / 10, 10);

  const highestSeverity = filtered.reduce(
    (best, a) => ((SEVERITY_ORDER[a.severity] ?? 2) < (SEVERITY_ORDER[best] ?? 2) ? a.severity : best),
    "info"
  );

  const barClass = `alert-marquee alert-marquee--${highestSeverity}`;

  return (
    <div className={barClass}>
      <div
        className="alert-marquee-text"
        style={{ animationDuration: `${duration}s` }}
      >
        {text}
      </div>
    </div>
  );
}
