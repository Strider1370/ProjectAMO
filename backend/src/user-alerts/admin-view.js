export function readUserAlertWatches(db, { paused = false, nowMs = Date.now() } = {}) {
  const airports = db.prepare(`SELECT w.user_id AS userId,u.username,w.icao,w.enabled,w.state,w.last_evaluated_at AS lastEvaluatedAt,
      (SELECT COUNT(*) FROM airport_alert_events e WHERE e.user_id=w.user_id AND e.icao=w.icao) AS eventCount,
      (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id=w.user_id) AS pushCount
    FROM airport_alert_watches w JOIN users u ON u.id=w.user_id ORDER BY u.username,w.icao`).all()
    .map((row) => ({ id: `airport:${row.userId}:${row.icao}`, kind: 'airport', userId: row.userId,
      username: row.username, target: row.icao, status: row.enabled ? paused ? 'paused_demo' : 'watching' : 'paused',
      lastEvaluatedAt: row.lastEvaluatedAt, sourceStatus: JSON.parse(row.state || '{}').sourceStatus ?? null,
      eventCount: row.eventCount, pushSubscribed: row.pushCount > 0 }))
  const routes = db.prepare(`SELECT w.id,w.user_id AS userId,u.username,w.route_name AS routeName,w.route_snapshot AS snapshot,
      w.enabled,w.last_evaluated_at AS lastEvaluatedAt,
      (SELECT COUNT(*) FROM route_sigmet_events e WHERE e.watch_id=w.id) AS eventCount,
      (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id=w.user_id) AS pushCount
    FROM route_sigmet_watches w JOIN users u ON u.id=w.user_id
    WHERE w.deleted_at IS NULL ORDER BY u.username,w.id`).all()
    .map((row) => { const snapshot = JSON.parse(row.snapshot); return {
      id: `route:${row.id}`, kind: 'route', userId: row.userId, username: row.username,
      target: row.routeName, etd: snapshot.etd ?? null, eta: snapshot.eta ?? null,
      status: !row.enabled ? 'paused' : Date.parse(snapshot.eta) <= nowMs ? 'ended' : paused ? 'paused_demo' : 'watching',
      lastEvaluatedAt: row.lastEvaluatedAt, sourceStatus: null,
      eventCount: row.eventCount, pushSubscribed: row.pushCount > 0,
    } })
  const watches = [...airports, ...routes]
  return { watches, generatedAt: new Date(nowMs).toISOString(),
    summary: { configured: watches.length, watching: watches.filter((watch) => watch.status === 'watching').length,
      paused: watches.filter((watch) => watch.status === 'paused' || watch.status === 'paused_demo').length,
      ended: watches.filter((watch) => watch.status === 'ended').length } }
}
