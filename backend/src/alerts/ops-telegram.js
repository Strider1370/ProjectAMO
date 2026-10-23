// 운영자 시스템 모니터링의 텔레그램 전송. 사용자 알림 발송기와 독립적이다.
export async function sendTelegram(text, { routeId } = {}, { fetchImpl = fetch, env = process.env } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { skipped: 'no_telegram_env' }
  const base = env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
  const url = routeId != null ? `${base}/?flight=${routeId}` : base
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: routeId != null ? { inline_keyboard: [[{ text: '비행 브리핑 열기', url }]] } : undefined,
      }),
    })
    return { ok: res.ok, status: res.status }
  } catch (error) { return { ok: false, error: error.message } }
}
