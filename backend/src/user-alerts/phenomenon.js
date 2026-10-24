// SIGMET/AIRMET 현상코드 → 한글. 프론트 frontend/src/shared/weather/phenomenonKo.js와 같은 표다
// (백엔드는 프론트 코드를 가져오지 않는다). 한쪽을 고치면 다른 쪽도 고친다 — test/user-alert-content.test.js가 대조한다.
export const PHENOMENON_KO = {
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

// "심한 착빙 SEV ICE"처럼 한글과 전문 약어를 함께.
export function phenomenonTitle(code, fallback = 'SIGMET') {
  const ko = code ? PHENOMENON_KO[code] : null
  const abbr = code ? String(code).replaceAll('_', ' ') : null
  if (ko && abbr) return `${ko} ${abbr}`
  return ko || fallback || abbr || 'SIGMET'
}
