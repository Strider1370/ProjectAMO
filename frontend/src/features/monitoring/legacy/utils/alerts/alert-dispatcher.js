const SEVERITY_LABELS = {
  critical: "CRITICAL",
  warning: "WARNING",
  info: "INFO",
};

const SEVERITY_STYLES = {
  critical: "color: #fff; background: #FF4444; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
  warning: "color: #fff; background: #FF8800; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
  info: "color: #fff; background: #2196F3; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
};

let _alertCallback = null;
let _alertIdCounter = 0;

/**
 * React 컴포넌트에서 알림 콜백을 등록한다.
 */
export function setAlertCallback(cb) {
  _alertCallback = cb;
}

/**
 * 트리거 결과를 디스패치한다.
 * 콘솔 로그 + React 콜백 호출.
 * highlightSince: 강조 창의 기준 시각(최초 발동 시각). 재발화 호출에서도 그대로 넘겨
 * 받아 강조가 재시작되지 않게 한다. 넘기지 않으면(예시 알람 등) 지금 시각으로 대체한다.
 */
export function dispatch(result, dispatchers, icao, alertKey, highlightSince) {
  const { severity, title, message } = result;
  const label = SEVERITY_LABELS[severity] || "UNKNOWN";
  const style = SEVERITY_STYLES[severity] || "";

  // 콘솔 출력 (항상)
  console.log(
    `%c[${label}]%c ${icao} — ${title}`,
    style,
    "color: inherit;"
  );
  if (message) {
    console.log(`  ${message.replace(/\n/g, "\n  ")}`);
  }

  // React 콜백으로 알림 객체 전달
  if (_alertCallback) {
    _alertIdCounter += 1;
    _alertCallback({
      id: `alert-${_alertIdCounter}-${Date.now()}`,
      severity,
      title,
      message,
      icao,
      triggerId: result.triggerId,
      highlight: result.highlight || null,
      alertKey,
      timestamp: Date.now(),
      highlightSince: highlightSince ?? Date.now(),
    });
  }
}

/**
 * quiet hours 내인지 확인한다.
 */
export function isQuietHours(quietHours) {
  if (!quietHours) return false;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const { start, end } = quietHours;
  if (start <= end) {
    return hhmm >= start && hhmm < end;
  }
  // 자정을 넘는 경우 (예: 22:00 ~ 06:00)
  return hhmm >= start || hhmm < end;
}
