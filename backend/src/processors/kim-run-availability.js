// 기상청에 KIM 회차의 한 예보시각이 올라왔는지 작은 요청 한 번(지상기압 한 장, 한반도 영역)으로 확인한다.
//
// 아직 올라오지 않았으면 기상청은 오류 코드 대신 HTTP 200으로 "file is not exist" 안내문(약 430바이트)을 준다
// (2026-10-17 06 UTC 측정: +0h 18:10~18:15, +12h 18:15~18:20, +48h 18:35~18:40 KST, 앞쪽 시각부터 차례로 올라온다).
import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'

// 기상청에 아직 그 파일이 없다는 응답이면 true(층 받기·보조 입력 오류 모두).
export function isKimNotUploaded(error) {
  return error?.code === 'KIM_FILE_NOT_AVAILABLE' || /file\s+is\s+not\s+exist|KIM grid file is not available/i.test(String(error?.message || ''))
}

// 올라왔으면 true, 아직이면 false. 그 밖의 오류(연결 실패 등)는 그대로 던진다.
export async function kimHourUploaded({ tmfc, hf = 0, credential, signal, fetchGrid = fetchKimGrid }) {
  try {
    const text = await fetchGrid({ data: 'U', name: 'ps', level: 0, tmfc, hf, sub: config.kim_surface_wind.sub, credential, signal })
    parseKimGridText(text, { variable: 'ps' })
    return true
  } catch (error) {
    if (isKimNotUploaded(error)) return false
    throw error
  }
}
