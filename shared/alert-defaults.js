module.exports = {
  global: {
    alerts_enabled: true,
    poll_interval_seconds: 60,
    cooldown_seconds: 300,
    quiet_hours: null,
  },

  dispatchers: {
    popup: {
      enabled: true,
      auto_dismiss_seconds: 10,
      max_visible: 5,
      position: "top-right",
    },
    sound: {
      enabled: true,
      volume: 70,
      repeat_count: { info: 1, warning: 1, critical: 3 },
    },
    marquee: {
      enabled: true,
      min_severity: "warning",
      speed: "normal",
      show_duration_seconds: 30,
    },
  },

  triggers: {
    warning_issued: {
      enabled: true,
      params: { types: ["00", "1", "2", "3", "4", "5", "7", "8", "13"] },
    },
    warning_cleared: {
      enabled: true,
      params: { types: ["00", "1", "2", "3", "4", "5", "7", "8", "13"] },
    },
    low_visibility: {
      enabled: true,
      params: { threshold: 1500 },
    },
    high_wind: {
      enabled: true,
      params: { speed_threshold: 25, gust_threshold: 35 },
    },
    weather_phenomenon: {
      enabled: true,
      params: { phenomena: ["TS", "SN", "FZRA", "FZFG", "SS", "DS"] },
    },
    low_ceiling: {
      enabled: true,
      params: { threshold: 500, amounts: ["BKN", "OVC"] },
    },
    taf_adverse_weather: {
      enabled: true,
      params: {
        lookahead_hours: 6,
        vis_threshold: 3000,
        phenomena: ["TS", "SN", "FZRA"],
      },
    },
    lightning_detected: {
      enabled: true,
      params: {
        min_count: 1,
        types: ["G", "C"],
        zones: ["alert", "danger", "caution"],
      },
    },
  },
};
