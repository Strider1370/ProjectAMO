// SIGMET/AIRMET 현상코드 → 한글. 단일 소스.
// 코드 출처: backend/src/parsers/iwxxm-advisory-parser.js 의 PHENOMENON_LABELS.
const PHENOMENON_KO = {
  SEV_ICE: '심한 착빙',
  MOD_ICE: '중간 착빙',
  SEV_TURB: '심한 난기류',
  MOD_TURB: '중간 난기류',
  TS: '뇌우',
  EMBD_TS: '차폐뇌우',
  OBSC_TS: '가림뇌우',
  FRQ_TS: '빈번한 뇌우',
  SQL_TS: '스콜선뇌우',
  CB: '적란운',
  GR: '우박',
  MTW: '산악파',
  TC: '태풍',
  VA: '화산재',
  MT_OBSC: '산악가림',
  LLWS: '저고도 윈드시어',
  IFR: '계기비행기상',
  SFC_VIS: '지표시정',
  SFC_WIND: '지상 강풍',
}

// 한글명만 (없으면 null). 지도 라벨 등 공간 좁은 곳·코드를 따로 렌더할 때.
export function phenomenonKo(code) {
  return code ? (PHENOMENON_KO[code] || null) : null
}

// 한 줄 문자열 "한글 (CODE)". 한글 없으면 fallback(영문 라벨)→코드 순.
export function phenomenonText(code, fallback = '') {
  const ko = phenomenonKo(code)
  if (ko && code) return `${ko} (${code})`
  return ko || fallback || (code ? String(code).replaceAll('_', ' ') : '')
}
