// 관리자용 알림 감시 목록 — 지금 누가 무엇을 감시받고 있는지 한 화면에 모은다.
//
// 감시중인 것만 보여주면 "왜 알림이 안 오지?"에 답할 수 없다. 등록됐지만 아직 창 밖인 것과
// 이미 끝난 것까지 같이 내야, 조용한 이유가 "이상없음"인지 "아직 안 봄"인지 갈린다.

// 감시 시작 기본값. me/alerts.js의 등록 기본값과 같은 값이다 — 여기만 다르면 화면이 거짓말을 한다.
const DEFAULT_START_MIN = 360

// 감시창은 [ETD - 감시시작, ETD)다. 이륙 후에는 폰이 비행모드라 연장하지 않는다(스펙 결정).
export function watchStatus(row, now = Date.now()) {
  const etdMs = Date.parse(row?.etd)
  if (!Number.isFinite(etdMs)) return 'unknown'
  if (now >= etdMs) return 'ended'
  const startMs = etdMs - (row.alert_start_min_before_etd || DEFAULT_START_MIN) * 60000
  return now >= startMs ? 'watching' : 'pending'
}

// 급한 것이 위로. 같은 상태 안에서는 ETD가 이른 순이다.
const STATUS_ORDER = { watching: 0, pending: 1, ended: 2, unknown: 3 }

const safeJson = (s) => { try { return JSON.parse(s) } catch { return null } }

export function listAlertWatches(db, now = Date.now()) {
  const rows = db.prepare(`
    SELECT r.id, r.name, r.etd, r.eta, r.alert_start_min_before_etd, r.payload, r.expires_at,
           u.id AS userId, u.username,
           (SELECT COUNT(*) FROM triggered_alerts t WHERE t.route_id = r.id) AS alertCount,
           (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = u.id) AS pushCount
    FROM routes r JOIN users u ON u.id = r.user_id
    WHERE r.alert_enabled = 1
  `).all()

  return rows.map((r) => {
    // 공항은 저장 payload가 유일한 출처다 — routes의 dep/dest 컬럼은 등록 경로가 채우지 않는다.
    const form = safeJson(r.payload)?.base?.routeForm ?? safeJson(r.payload)?.routeForm ?? {}
    return {
      id: r.id,
      userId: r.userId,
      username: r.username,
      name: r.name,
      departureAirport: form.departureAirport ?? null,
      arrivalAirport: form.arrivalAirport ?? null,
      etd: r.etd,
      eta: r.eta,
      startMinBeforeEtd: r.alert_start_min_before_etd || DEFAULT_START_MIN,
      status: watchStatus(r, now),
      alertCount: r.alertCount,
      // 구독이 없으면 알림 행은 쌓여도 폰은 조용하다. 관리자가 이걸 봐야 원인을 짚는다.
      pushSubscribed: r.pushCount > 0,
      expiresAt: r.expires_at,
    }
  }).sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (Date.parse(a.etd) - Date.parse(b.etd)))
}

export default { listAlertWatches, watchStatus }
