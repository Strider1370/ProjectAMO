import { formatUtc } from "../helpers.js";

function strikeKey(s) {
  return `${s.time}:${s.lon}:${s.lat}:${s.type}`;
}

// T-03: 저시정
const lowVisibility = {
  id: "low_visibility",
  name: "저시정 알림",
  category: "metar",
  severity: "warning",
  evaluate(current, _previous, params) {
    const vis = current.observation?.visibility?.value;
    if (vis == null || vis >= params.threshold) return null;
    return {
      triggerId: "low_visibility",
      severity: vis < 500 ? "critical" : "warning",
      title: `METAR 저시정: ${vis}m`,
      message: `현재 시정이 ${vis}m으로 임계값(${params.threshold}m) 이하입니다.`,
      data: { value: vis, threshold: params.threshold },
      highlight: { panel: "metar", field: "visibility" },
    };
  },
};

// T-04: 강풍
const highWind = {
  id: "high_wind",
  name: "강풍 알림",
  category: "metar",
  severity: "warning",
  evaluate(current, _previous, params) {
    const wind = current.observation?.wind;
    if (!wind) return null;
    const exceeded = [];
    if (wind.speed >= params.speed_threshold) exceeded.push(`풍속 ${wind.speed}kt`);
    if (wind.gust && wind.gust >= params.gust_threshold) exceeded.push(`돌풍 ${wind.gust}kt`);
    if (exceeded.length === 0) return null;
    return {
      triggerId: "high_wind",
      severity: wind.gust && wind.gust >= 50 ? "critical" : "warning",
      title: `강풍: ${exceeded.join(", ")}`,
      message: `${wind.raw || ""} — 임계값 초과`,
      data: { speed: wind.speed, gust: wind.gust },
      highlight: { panel: "metar", field: "wind" },
    };
  },
};

// T-05: 특정 기상현상
const weatherPhenomenon = {
  id: "weather_phenomenon",
  name: "기상현상 알림",
  category: "metar",
  severity: "warning",
  evaluate(current, _previous, params) {
    const wxList = current.observation?.weather;
    if (!wxList || wxList.length === 0) return null;

    const matched = [];
    for (const wx of wxList) {
      const combo = (wx.descriptor || "") + (wx.phenomena || []).join("");
      for (const target of params.phenomena) {
        if (
          combo.includes(target) ||
          (wx.phenomena || []).includes(target) ||
          wx.descriptor === target
        ) {
          matched.push({ code: wx.raw, target });
        }
      }
    }
    if (matched.length === 0) return null;

    const hasTSorFC = matched.some((m) => m.target === "TS" || m.target === "FC");
    return {
      triggerId: "weather_phenomenon",
      severity: hasTSorFC ? "critical" : "warning",
      title: `기상현상: ${matched.map((m) => m.code).join(", ")}`,
      message: `관측된 기상현상: ${wxList.map((w) => w.raw).join(" ")}`,
      data: matched,
      highlight: { panel: "metar", field: "weather" },
    };
  },
};

// T-06: 운저고도 저하
const lowCeiling = {
  id: "low_ceiling",
  name: "운저고도 알림",
  category: "metar",
  severity: "warning",
  evaluate(current, _previous, params) {
    const clouds = current.observation?.clouds;
    if (!clouds || clouds.length === 0) return null;

    const ceiling = clouds.find((c) => params.amounts.includes(c.amount));
    if (!ceiling || ceiling.base >= params.threshold) return null;

    return {
      triggerId: "low_ceiling",
      severity: ceiling.base < 200 ? "critical" : "warning",
      title: `저운고: ${ceiling.amount}${String(Math.round(ceiling.base / 100)).padStart(3, "0")} (${ceiling.base}ft)`,
      message: `운저고도 ${ceiling.base}ft — 임계값(${params.threshold}ft) 이하`,
      data: { amount: ceiling.amount, base: ceiling.base },
      highlight: { panel: "metar", field: "ceiling" },
    };
  },
};

// T-07: TAF 악기상 예보
const tafAdverseWeather = {
  id: "taf_adverse_weather",
  name: "악기상 예보 알림",
  category: "taf",
  severity: "warning",
  evaluate(current, _previous, params) {
    const now = new Date();
    const limit = new Date(now.getTime() + params.lookahead_hours * 3600000);
    const alerts = [];

    for (const slot of current.timeline || []) {
      const slotTime = new Date(slot.time);
      if (slotTime < now || slotTime > limit) continue;

      if (slot.visibility?.value < params.vis_threshold) {
        alerts.push({ time: slot.time, type: "vis", value: slot.visibility.value, detail: `시정 ${slot.visibility.value}m` });
      }

      for (const wx of slot.weather || []) {
        const combo = (wx.descriptor || "") + (wx.phenomena || []).join("");
        if (params.phenomena.some((p) => combo.includes(p))) {
          alerts.push({ time: slot.time, type: "wx", detail: wx.raw });
        }
      }
    }

    if (alerts.length === 0) return null;

    const highlightFields = [...new Set(alerts.map((a) => (a.type === "vis" ? "visibility" : "weather")))];
    const highlightTimes = [...new Set(alerts.map((a) => a.time))];

    // 제목엔 실제로 위험한 값(시정/기상현상)을 담는다 — "TAF"라는 분류명은 본문으로 내리고,
    // METAR 기반 저시정("관측 저시정")과 헷갈리지 않게 "예보"를 명시한다.
    const worst = alerts.find((a) => a.type === "wx" && /TS|FC/.test(a.detail)) || alerts[0];
    const title = worst.type === "vis" ? `TAF 저시정: ${worst.value}m` : `TAF 특이기상: ${worst.detail}`;
    return {
      triggerId: "taf_adverse_weather",
      severity: alerts.some((a) => a.detail.includes("TS")) ? "critical" : "warning",
      title,
      message: `TAF ${params.lookahead_hours}시간 내 예보\n`
        + alerts.map((a) => `[${formatUtc(a.time)}] ${a.detail}`).join("\n"),
      data: alerts,
      // fields는 계획 B(TAF 변화 알람 - 날씨/비행조건 막대 강조)를 위해 남겨둔 값이다.
      // 지금은 소비하는 곳이 없다 — TafTimeline은 times만 쓴다.
      highlight: { panel: "taf", fields: highlightFields, times: highlightTimes },
    };
  },
};

// T-08: 낙뢰 감지
const lightningDetected = {
  id: "lightning_detected",
  name: "낙뢰 감지",
  category: "lightning",
  severity: "warning",
  evaluate(current, previous, params) {
    const strikes = current?.strikes || [];
    if (strikes.length === 0) return null;

    const allowedTypes = params?.types || ["G", "C"];
    const allowedZones = params?.zones || ["alert", "danger", "caution"];
    const minCount = Number(params?.min_count ?? 1);

    const filtered = strikes.filter(
      (s) => allowedTypes.includes(s.type) && allowedZones.includes(s.zone)
    );
    if (filtered.length < minCount) return null;

    const prevKeys = new Set((previous?.strikes || []).map(strikeKey));
    const fresh = filtered.filter((s) => !prevKeys.has(strikeKey(s)));
    if (fresh.length === 0) return null;

    const byZone = { alert: 0, danger: 0, caution: 0 };
    for (const s of fresh) {
      if (byZone[s.zone] != null) byZone[s.zone] += 1;
    }

    const severity = byZone.alert > 0 ? "critical" : byZone.danger > 0 ? "warning" : "info";
    const nearest = Math.min(...fresh.map((s) => Number(s.distance_km || 999)));
    const latest = fresh[0]?.time || null;

    return {
      triggerId: "lightning_detected",
      severity,
      title:
        byZone.alert > 0
          ? `낙뢰 경보: 8km 이내 ${byZone.alert}건`
          : byZone.danger > 0
          ? `낙뢰 위험: 16km 이내 ${byZone.danger}건`
          : `낙뢰 주의: 32km 이내 ${byZone.caution}건`,
      message: [
        Number.isFinite(nearest) ? `최근접 ${nearest.toFixed(1)}km` : null,
        byZone.alert > 0 ? `경보 ${byZone.alert}건` : null,
        byZone.danger > 0 ? `위험 ${byZone.danger}건` : null,
        byZone.caution > 0 ? `주의 ${byZone.caution}건` : null,
        latest ? `최신 ${formatUtc(latest)}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
      data: { byZone, nearest, newStrikes: fresh },
      highlight: {
        panel: "map",
        zone: byZone.alert > 0 ? "alert" : byZone.danger > 0 ? "danger" : "caution",
      },
    };
  },
};

const triggers = [
  lowVisibility,
  highWind,
  weatherPhenomenon,
  lowCeiling,
  tafAdverseWeather,
  lightningDetected,
];

export default triggers;
