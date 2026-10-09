// 바뀌지 않는(immutable) 큰 JSON 응답을 gzip으로 압축한 채 메모리에 보관한다(최근 쓴 순서, 전체 바이트 상한).
//
// KIM 확대 영역 한 장은 JSON 5~10 MB라 요청마다 파일 읽기·직렬화·압축에 1초 넘게 걸린다(2026-10-09 측정). 같은 장은
// 사용자가 달라도 내용이 같으므로 처음 한 번만 만들고, 이후에는 압축된 바이트를 그대로 보낸다.
import zlib from 'node:zlib'

export function createCompressedResponseCache({ maxBytes = 64 * 1024 * 1024, level = 5 } = {}) {
  const entries = new Map()
  let bytes = 0
  return {
    // key의 압축 본문. 없으면 build()로 만들어 넣는다. build가 던지면 넣지 않는다.
    get(key, build) {
      const hit = entries.get(key)
      if (hit) {
        entries.delete(key)
        entries.set(key, hit)
        return hit
      }
      const gzip = zlib.gzipSync(Buffer.from(JSON.stringify(build())), { level })
      const entry = { gzip }
      if (gzip.length <= maxBytes) {
        entries.set(key, entry)
        bytes += gzip.length
        for (const [oldKey, old] of entries) {
          if (bytes <= maxBytes) break
          entries.delete(oldKey)
          bytes -= old.gzip.length
        }
      }
      return entry
    },
    get size() { return entries.size },
    get bytes() { return bytes },
  }
}

// 압축 본문을 보낸다. gzip을 받지 않는 클라이언트에는 풀어서 보낸다.
export function sendCompressedJson(req, res, entry) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Length', entry.gzip.length)
    res.end(entry.gzip)
    return
  }
  const body = zlib.gunzipSync(entry.gzip)
  res.setHeader('Content-Length', body.length)
  res.end(body)
}
