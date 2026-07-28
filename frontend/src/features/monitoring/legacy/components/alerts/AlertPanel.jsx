import { useEffect, useState } from "react";

// 심각도 순서. 정렬과 "가장 심한 것" 판단에 쓴다.
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const SEVERITY_LABEL = { critical: "위험", warning: "경고", info: "정보" };

function isAlertValid(alert, validKeys) {
  // 예시 등 alertKey가 없는 항목은 트리거 재평가 대상이 아니므로 항상 유효로 본다.
  return !alert.alertKey || !!validKeys?.has(alert.alertKey);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

// 벽걸이 상황실용 하단 알람 표. 자동으로 숨지 않는다 — 조건이 살아있는 한 계속 보인다.
// 정렬은 심각도순 → 같으면 최신순. 색으로 채우는 줄은 가장 최근 새 알람 1건뿐이다.
export default function AlertPanel({ alerts, validKeys, onDismiss, settings }) {
  const highlightMs = (settings?.highlight_seconds ?? 60) * 1000;
  const maxVisible = settings?.max_visible ?? 6;

  const now = Date.now();
  // highlightSince: 최초 발동 시각(재발화에도 안 바뀜). 예시 알람처럼 없는 경우만
  // timestamp로 대체한다. 표에 보이는 시각(formatTime)은 여전히 timestamp(마지막
  // 발동)를 쓴다 — 강조 기준점과 표시 시각은 서로 다른 의미다.
  const isNew = (alert) => now - (alert.highlightSince ?? alert.timestamp) < highlightMs;

  // 강조 창이 지나면 다시 그려 "새 알람"에서 빠지게 한다. 강조 중인 알람이 하나라도
  // 있을 때만 돈다 — alerts.length로 걸면 강조가 다 끝난 뒤에도(며칠 켜져 있는
  // 상황판이라) 초당 재렌더가 영원히 계속된다.
  const hasOpenHighlight = alerts.some((alert) => isAlertValid(alert, validKeys) && isNew(alert));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasOpenHighlight) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [hasOpenHighlight]);

  if (!settings?.enabled) return null;

  const live = alerts.filter((alert) => isAlertValid(alert, validKeys));
  if (live.length === 0) return null;

  // 초과분은 "오래된 것부터" 버린다(스펙 §7). 그래서 최신순으로 먼저 추린 뒤
  // 그 결과를 심각도순으로 세운다. 순서를 바꾸면 방금 뜬 낮은 등급 알람이 잘려 나간다.
  const visible = [...live]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxVisible)
    .sort((a, b) => {
      const bySeverity = (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2);
      return bySeverity !== 0 ? bySeverity : b.timestamp - a.timestamp;
    });

  // 색으로 채우는 줄은 새 알람 중 가장 최근 1건뿐이다. 색을 아껴 써야 무엇이 급한지가 남는다.
  const featuredId = visible
    .filter(isNew)
    .reduce((best, alert) => (best && best.timestamp >= alert.timestamp ? best : alert), null)?.id;

  return (
    <div className="alert-table" role="log" aria-label="알람 목록">
      {visible.map((alert) => {
        const featured = alert.id === featuredId;
        return (
          <div
            key={alert.id}
            className={`alert-table-row alert-table-row--${alert.severity}${featured ? " alert-table-row--new" : ""}`}
          >
            <span className="alert-table-band" aria-hidden="true" />
            <span className="alert-table-level">{SEVERITY_LABEL[alert.severity] || "정보"}</span>
            <span className="alert-table-body">
              <span className="alert-table-title">{alert.title}</span>
              {featured && alert.message && (
                <span className="alert-table-message">{alert.message}</span>
              )}
            </span>
            <span className="alert-table-time">{formatTime(alert.timestamp)}</span>
            <button
              type="button"
              className="alert-table-close"
              onClick={() => onDismiss(alert.id)}
              aria-label={`${alert.title} 닫기`}
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
