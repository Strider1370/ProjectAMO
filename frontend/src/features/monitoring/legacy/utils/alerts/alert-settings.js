const STORAGE_KEY = "aviation-weather-alert-settings";

/**
 * 두 객체를 깊은 병합한다. source가 target을 덮어쓴다.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 저장된 개인 설정을 새 구조로 한 번 옮긴다. 순수 함수 — localStorage를 만지지 않는다.
 * 기본값만 바꾸면 이미 값을 저장한 사용자에게는 아무 일도 일어나지 않으므로 저장분을 직접 손본다.
 */
export function migratePersonalSettings(personal) {
  if (!personal || typeof personal !== "object") return {};

  const out = JSON.parse(JSON.stringify(personal));

  const popup = out.dispatchers?.popup;
  if (popup) {
    if (popup.auto_dismiss_seconds != null) {
      // 옛 값은 "팝업이 사라지는 시간"이고 새 값은 "강조가 유지되는 시간"이라 뜻이 다르다.
      // 10초 이하를 그대로 옮기면 강조가 순식간에 꺼지므로 새 기본값으로 올린다.
      const seconds = Number(popup.auto_dismiss_seconds);
      popup.highlight_seconds = Number.isFinite(seconds) && seconds > 10 ? seconds : 60;
      delete popup.auto_dismiss_seconds;
    }
    if (popup.max_visible === 5) popup.max_visible = 6; // 구 기본값만 올린다
    delete popup.position;
  }

  if (out.dispatchers) delete out.dispatchers.marquee;
  if (out.triggers) delete out.triggers.warning_issued;

  return out;
}

/**
 * 서버 기본값 + localStorage 개인 설정을 병합한다.
 * 저장분이 옛 구조면 한 번 정리하고 그 결과를 다시 저장한다.
 */
export function resolveSettings(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    const personal = migratePersonalSettings(stored);
    if (JSON.stringify(personal) !== JSON.stringify(stored)) {
      savePersonalSettings(personal);
    }
    return deepMerge(defaults, personal);
  } catch {
    // 저장분이 깨졌으면 기본값으로 간다. 알람이 뜨는 것이 개인 설정을 지키는 것보다 중요하다.
    return defaults;
  }
}

/**
 * 개인 설정을 localStorage에 저장한다.
 */
export function savePersonalSettings(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn("[AlertSettings] Failed to save:", err.message);
  }
}

/**
 * 개인 설정을 초기화한다 (기본값 복원).
 */
export function clearPersonalSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[AlertSettings] Failed to clear:", err.message);
  }
}

/**
 * 현재 localStorage에 저장된 개인 설정을 반환한다.
 */
export function loadPersonalSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
