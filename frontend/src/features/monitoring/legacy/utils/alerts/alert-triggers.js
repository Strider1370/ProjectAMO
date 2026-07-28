import { formatUtc } from "../helpers.js";
import { collectThresholds } from "./taf-risk.js";
import { findWorsening, findTailRisk } from "./taf-change.js";

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

const FIELD_LABEL = {
  visibility: "시정",
  weather: "특이기상",
  ceiling: "운고",
  wind: "바람",
};

const RANK = { info: 0, warning: 1, critical: 2 };
const BY_RANK = ["info", "warning", "critical"];
const bump = (severity) => BY_RANK[Math.min(RANK[severity] + 1, 2)];

// 정정(CORRECTION)도 수정(AMENDMENT)과 같이 본다 — 사용자 결정(2026-07-28).
// 둘 다 "예정에 없던 발표"이고 예보관이 급히 값을 고쳤다는 신호이므로 무게를 같이 둔다.
// 스펙 §12.6은 AMD만 적었으나 실제 파서가 CORRECTION을 내보낸다.
const isAmendment = (status) => typeof status === "string" && /AMD|AMEND|COR/i.test(status);
const isCancellation = (status) => status === "CANCELLATION";

function describe(item) {
  const label = FIELD_LABEL[item.field] ?? item.field;
  const when = formatUtc(item.time);
  if (item.field === "weather") return `${label}  ${when} ${item.to ?? item.value}`;
  const unit = item.field === "ceiling" ? "ft" : item.field === "wind" ? "kt" : "m";
  if (item.rule === "new") return `${label}  ${when} 새로 위험 (${item.to}${unit})`;
  if (item.rule === "worse") return `${label}  ${when} ${item.from}${unit} → ${item.to}${unit}`;
  return `${label}  ${when} ${item.value}${unit}`;
}

// T-09: TAF 변화 — 새 발표가 겹치는 구간을 나쁘게 바꿨는가.
// 알람 엔진이 넘기는 previous 인자를 쓰지 않고 current.previous를 읽는다. 그래야
// 유효성 재확인으로 previous 인자가 비는 경우에도 판정이 성립하고, 알람이 다음 TAF가
// 올 때까지 살아 있다가 새 TAF가 오면 교체된다. 별도의 수명 관리 코드가 필요 없다.
const tafChange = {
  id: "taf_change",
  name: "TAF 변화 알림",
  category: "taf",
  severity: "warning",
  evaluate(current, _previous, _params, allTriggers) {
    const previous = current?.previous;
    if (!previous) return null;
    if (isCancellation(current.header?.report_status)) return null;

    const thresholds = collectThresholds(allTriggers);
    const worsened = findWorsening(previous, current, thresholds, new Date());
    const amd = isAmendment(current.header?.report_status);

    if (worsened.length === 0) {
      // 악화 없음 + 정규 발표 → 알릴 것이 없다.
      if (!amd) return null;
      // 악화 없음 + AMD → 발표가 있었다는 사실만 알린다.
      return {
        triggerId: "taf_change",
        issued: current.header?.issued ?? null,
        severity: "info",
        title: "TAF AMD 발표됨",
        message: `${formatUtc(current.header?.issued)} AMD — 위험 증가 없음`,
        data: [],
        highlight: { panel: "taf", fields: [], times: [] },
      };
    }

    const base = worsened.some((w) => w.field === "weather" && String(w.to).includes("TS"))
      ? "critical"
      : "warning";
    const severity = amd ? bump(base) : base;

    // 제목엔 실제로 위험한 값을 담는다. 한 번의 발표는 한 줄이며 본문에 요소별로 나열한다.
    const worst = worsened.find((w) => w.field === "visibility") ?? worsened[0];
    const kind = FIELD_LABEL[worst.field] ?? worst.field;
    // 단위를 붙인다 — 4m 거리에서 읽는 화면이라 숫자만 있으면 무엇인지 알 수 없다.
    const unit = worst.field === "ceiling" ? "ft" : worst.field === "wind" ? "kt" : worst.field === "visibility" ? "m" : "";
    const title = `${amd ? "TAF AMD 악화" : "TAF 악화"}: ${kind} ${worst.to}${unit}`;

    return {
      triggerId: "taf_change",
      issued: current.header?.issued ?? null,
      severity,
      title,
      message: `${formatUtc(current.header?.issued)} ${amd ? "AMD" : "발표"} (직전 ${formatUtc(previous.header?.issued)} 대비)\n`
        + worsened.map(describe).join("\n"),
      data: worsened,
      highlight: {
        panel: "taf",
        fields: [...new Set(worsened.map((w) => w.field))],
        times: [...new Set(worsened.map((w) => w.time))],
      },
    };
  },
};

// T-10: TAF 새 구간 — 이전 TAF에 없던 꼬리 구간에 위험이 있는가.
// 비교 대상이 없으므로 "늘었다"고 말하지 않는다.
const tafNewPeriod = {
  id: "taf_new_period",
  name: "TAF 새 구간 알림",
  category: "taf",
  severity: "info",
  evaluate(current, _previous, _params, allTriggers) {
    const previous = current?.previous;
    if (!previous) return null;
    if (isCancellation(current.header?.report_status)) return null;

    const thresholds = collectThresholds(allTriggers);
    const risks = findTailRisk(previous, current, thresholds, new Date());
    if (risks.length === 0) return null;

    const worst = risks.find((r) => r.field === "weather") ?? risks[0];
    const kind = FIELD_LABEL[worst.field] ?? worst.field;

    return {
      triggerId: "taf_new_period",
      issued: current.header?.issued ?? null,
      // AMD여도 심각도를 올리지 않는다. AMD의 무게는 taf_change가 이미 표현한다.
      severity: "info",
      title: `TAF 새 구간: ${formatUtc(worst.time)} ${kind} ${worst.value}`,
      message: `${formatUtc(current.header?.issued)} 발표 — 직전 예보에 없던 구간\n`
        + risks.map(describe).join("\n"),
      data: risks,
      highlight: {
        panel: "taf",
        fields: [...new Set(risks.map((r) => r.field))],
        times: [...new Set(risks.map((r) => r.time))],
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
  tafChange,
  tafNewPeriod,
  lightningDetected,
];

export default triggers;
