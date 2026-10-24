// 의견 보내기. 글을 먼저 저장하고, 받은 일회용 토큰으로 사진을 한 장씩 올린다.
// 사진 하나가 실패해도 글은 이미 전달됐으므로 실패한 장수만 알려 준다.
async function readError(response) {
  try { return (await response.json())?.error || String(response.status) } catch { return String(response.status) }
}

export async function submitFeedback({ kind, message, images = [], context = {} }, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl('/api/feedback', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, message, imageCount: images.length, context }),
  })
  if (!response.ok) throw new Error(await readError(response))
  const { id, uploadToken } = await response.json()
  let failedImages = 0
  for (const image of images) {
    try {
      const upload = await fetchImpl(`/api/feedback/${id}/images`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': image.type || 'image/jpeg', 'X-Feedback-Upload': uploadToken },
        body: image,
      })
      if (!upload.ok) failedImages += 1
    } catch {
      failedImages += 1
    }
  }
  return { id, failedImages }
}
