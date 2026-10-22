// 직전 TAF 보관 규칙 (스펙 §11·§15). 순수 함수 — 파일도 네트워크도 만지지 않는다.
//
// "같은 issued면 그대로 둔다"가 이 설계의 핵심이다. 이것이 빠지면 다음 폴링에서
// previous가 current로 덮여 비교 기준이 사라지고, 프런트가 겪던 문제가 서버로 옮겨간다.

const CANCELLATION = "CANCELLATION";

// previous에는 직전 발표를 원문·변화군·표시 문자열까지 그대로 담는다(그 안의 previous만 뺀다 — 세대가 줄줄이 쌓이지 않게).
// 예전에는 비교에 필요한 값만 남겨 저장량을 줄였는데, 그러면 공항 패널·카드의 TAF 과거 보기에서 직전 발표의
// 원문·TEMPO/BECMG를 보여 줄 수 없었다(사용자 결정, 2026-10-22). 변화 비교(알림)는 timeline 값을 그대로 쓴다.
function snapshot(taf) {
  const { previous: _nested, ...rest } = taf;
  return rest;
}

/**
 * 새로 받은 공항별 TAF에 previous를 붙여 돌려준다.
 * @param {object} nextAirports   - 이번 수신분 { [icao]: parsedTaf }
 * @param {object} cachedAirports - 직전 저장분 { [icao]: parsedTaf }
 * @returns {object} previous가 붙은 새 객체. 입력은 변형하지 않는다.
 */
export function attachPrevious(nextAirports, cachedAirports) {
  if (!nextAirports || typeof nextAirports !== "object") return {};

  const out = {};
  for (const [icao, next] of Object.entries(nextAirports)) {
    const cached = cachedAirports?.[icao];
    if (!cached) {
      // 최초 실행. previous가 없으며 두 트리거는 아무것도 발동하지 않는다. 오류가 아니다.
      out[icao] = next;
      continue;
    }

    const nextCancelled = next.header?.report_status === CANCELLATION;
    const cachedCancelled = cached.header?.report_status === CANCELLATION;

    let previous;
    if (nextCancelled) {
      // 취소 통보는 시간표가 비어 들어온다. 그것을 previous로 삼으면 다음 정상 TAF가
      // '빈 것'과 비교돼 모든 위험이 신규로 판정된다 — 가짜 악화 알람이다.
      // 다만 취소 직전의 마지막 정상 TAF는 반드시 보존해야 한다. 그것을 건너뛰면
      // 다음 정상 TAF가 한 세대 더 낡은 것과 비교된다(스펙 §15).
      previous = cachedCancelled ? cached.previous : snapshot(cached);
    } else if (cachedCancelled) {
      // 취소 문서가 들고 있던 "취소 직전의 마지막 정상 TAF"와 비교한다.
      previous = cached.previous;
    } else if (next.header?.issued !== cached.header?.issued) {
      previous = snapshot(cached);
    } else {
      previous = cached.previous;
    }

    out[icao] = previous ? { ...next, previous } : { ...next };
  }
  return out;
}

export default { attachPrevious };
