import { fmtKstShort } from './formatters.js'

const WARNING_NAME_KO = {
  WIND_SHEAR: '\uae09\ubcc0\ud48d\uacbd\ubcf4',
  LOW_VISIBILITY: '\uc800\uc2dc\uc815\uacbd\ubcf4',
  STRONG_WIND: '\uac15\ud48d\uacbd\ubcf4',
  HEAVY_RAIN: '\ud638\uc6b0\uacbd\ubcf4',
  LOW_CEILING: '\uc800\uc6b4\uace0\uacbd\ubcf4',
  THUNDERSTORM: '\ub1cc\uc6b0\uacbd\ubcf4',
  TYPHOON: '\ud0dc\ud48d\uacbd\ubcf4',
  HEAVY_SNOW: '\ub300\uc124\uacbd\ubcf4',
  YELLOW_DUST: '\ud669\uc0ac\uacbd\ubcf4',
}

function pickWarningName(item) {
  return WARNING_NAME_KO[item?.wrng_type_key] || item?.wrng_type_name || item?.type_label || item?.type || '\ubbf8\ud655\uc778 \uacbd\ubcf4'
}

export function buildCurrentWarningModel(warning, tz = 'UTC') {
  const warnings = Array.isArray(warning?.warnings) ? warning.warnings : []
  const items = warnings.map((item) => ({
    key: item?.wrng_type_key || item?.type || item?.wrng_type_name || 'UNKNOWN',
    name: pickWarningName(item),
    timeText: `${fmtKstShort(item?.valid_start, tz)} \u2013 ${fmtKstShort(item?.valid_end, tz)}`,
    raw: item,
  }))

  return {
    active: items.length > 0,
    count: items.length,
    label: items.length > 0 ? '\uacf5\ud56d\uacbd\ubcf4' : '\uacf5\ud56d\uacbd\ubcf4 \uc5c6\uc74c',
    items,
  }
}
