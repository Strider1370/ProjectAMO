// TAF 악화 판정 (스펙 §12.2·§12.3, §13). 순수 함수 — 상태 없음, 이전→현재 전이만 본다.
//
// backend/src/alerts/diff.js가 경로 알림 계통에서 같은 모양의 판정을 하지만 코드를
// 공유하지 않는다. diff.js는 한 시점의 공항 상태를 다루고 여기는 시간표 전체를 다룬다.
// 억지로 합치면 양쪽 모두 나빠진다. 대신 원칙을 맞춘다.

import { riskOf } from "./taf-risk.js";

// 규칙 ②의 경계. 기존 트리거가 severity를 warning에서 critical로 올릴 때 쓰는 값과 같다.
// 새 숫자를 만들지 않았다.
const HARD_VIS_M = 500;
const HARD_CEILING_FT = 200;
const HARD_GUST_KT = 50;

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const byTime = (timeline) => {
  const map = new Map();
  for (const slot of timeline ?? []) {
    if (slot?.time) map.set(slot.time, slot);
  }
  return map;
};

/**
 * 두 TAF의 유효기간이 겹치는 구간, 그중 현재 시각 이후.
 * 겹치는 구간이 없으면 null.
 */
function overlapWindow(previous, current, now) {
  const prevStart = ms(previous?.header?.valid_start);
  const prevEnd = ms(previous?.header?.valid_end);
  const nextStart = ms(current?.header?.valid_start);
  const nextEnd = ms(current?.header?.valid_end);
  if (prevStart === null || prevEnd === null || nextStart === null || nextEnd === null) return null;

  const start = Math.max(prevStart, nextStart, now.getTime());
  const end = Math.min(prevEnd, nextEnd);
  // end는 배타다. 파서의 hourRange가 `cursor < end`라 이전 TAF에는 valid_end 시각의
  // 칸이 존재하지 않는다(taf-parser.js의 hourRange). 포함으로 두면 정규 TAF 한 쌍마다
  // 그 시각이 짝 없는 칸이 되어 가짜 "신규 위험"이 뜬다.
  return start < end ? { start, end } : null;
}

// 규칙 ②: 원래 위험하던 요소가 아래 경계를 새로 넘었는가.
// 값이 조금 나빠진 것까지 잡으면 소음이 된다.
function crossedHardLine(field, from, to) {
  if (field === "visibility") return from >= HARD_VIS_M && to < HARD_VIS_M;
  if (field === "ceiling") return from >= HARD_CEILING_FT && to < HARD_CEILING_FT;
  if (field === "wind") return from < HARD_GUST_KT && to >= HARD_GUST_KT;
  // 특이기상은 값이 아니라 종류다. TS가 없다가 생긴 경우만 본다.
  if (field === "weather") return !String(from).includes("TS") && String(to).includes("TS");
  return false;
}

/**
 * 겹치는 구간에서 악화한 항목을 낸다.
 * @returns {Array<{time, field, from, to, rule}>} rule은 "new"(규칙①) 또는 "worse"(규칙②)
 */
export function findWorsening(previous, current, thresholds, now = new Date()) {
  const window = overlapWindow(previous, current, now);
  if (!window) return [];

  const prevSlots = byTime(previous.timeline);
  const out = [];

  for (const slot of current.timeline ?? []) {
    const t = ms(slot?.time);
    if (t === null || t < window.start || t >= window.end) continue;

    // 짝이 되는 이전 칸이 없으면 비교할 수 없다. "신규 위험"으로 단정하지 않는다 —
    // 시간표 격자가 어긋나면(AMD처럼 valid_start가 정시가 아닌 발표) 겹침 구간 전체가
    // 짝을 잃어 시간표가 통째로 가짜 악화로 잡힌다.
    const prevSlot = prevSlots.get(slot.time);
    if (!prevSlot) continue;

    const nextRisk = riskOf(slot, thresholds);
    const prevRisk = riskOf(prevSlot, thresholds);

    for (const [field, to] of Object.entries(nextRisk)) {
      const from = prevRisk[field];
      if (from === undefined) {
        out.push({ time: slot.time, field, from: null, to, rule: "new" });
      } else if (crossedHardLine(field, from, to)) {
        out.push({ time: slot.time, field, from, to, rule: "worse" });
      }
    }
  }
  return out;
}

/**
 * 이전 TAF의 valid_end 이후이면서 새 TAF 유효기간 안인 꼬리 구간의 위험.
 * 비교 대상이 없으므로 "늘었다"고 말하지 않는다 — "새 구간에 위험이 있다"이다.
 * @returns {Array<{time, field, value}>}
 */
export function findTailRisk(previous, current, thresholds, now = new Date()) {
  const prevEnd = ms(previous?.header?.valid_end);
  const nextEnd = ms(current?.header?.valid_end);
  if (prevEnd === null || nextEnd === null || prevEnd >= nextEnd) return [];

  const start = Math.max(prevEnd, now.getTime());
  const out = [];

  for (const slot of current.timeline ?? []) {
    const t = ms(slot?.time);
    if (t === null || t < start || t > nextEnd) continue;

    for (const [field, value] of Object.entries(riskOf(slot, thresholds))) {
      out.push({ time: slot.time, field, value });
    }
  }
  return out;
}

export default { findWorsening, findTailRisk };
