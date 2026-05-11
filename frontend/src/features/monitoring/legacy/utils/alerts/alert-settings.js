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
 * 서버 기본값 + localStorage 개인 설정을 병합한다.
 */
export function resolveSettings(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const personal = JSON.parse(raw);
    return deepMerge(defaults, personal);
  } catch {
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
