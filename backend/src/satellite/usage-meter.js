// 위성 워커 안에서 API 허브 사용량을 **재기만** 한다. 기록은 부모가 한다.
//
// 사용량 장부(api-hub-usage.js)는 파일 하나를 통째로 읽어 메모리에 들고 있다가 통째로 덮어쓴다.
// 워커에서도 기록하면 부모와 서로의 집계를 지운다 — 그래서 여기서는 숫자만 모아 두고,
// 끝날 때 IPC로 부모에게 넘겨 부모가 한 곳에서 장부에 적는다.
import { endpointFor } from '../lib/fetch-api-hub.js'

const isApiHub = (url) => url.hostname === 'apihub.kma.go.kr' && url.searchParams.has('authKey')

export function createUsageMeter({ fetchImpl = fetch } = {}) {
  let collected = []

  async function measuredFetch(input, options) {
    let url
    try {
      url = new URL(input instanceof Request ? input.url : input)
    } catch {
      return fetchImpl(input, options)
    }
    if (!isApiHub(url)) return fetchImpl(input, options)

    const endpoint = endpointFor(url)
    const upstream = await fetchImpl(input, options)
    // 본문을 여기서 읽어 크기를 재고, 호출측에는 같은 내용의 새 응답을 준다.
    // 안 그러면 재는 쪽이 본문을 먹어버려 수집이 빈 파일을 저장한다.
    const body = await upstream.arrayBuffer()
    if (endpoint) collected.push({ endpoint, bytes: body.byteLength, status: upstream.status })
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers })
  }

  return {
    fetch: measuredFetch,
    // 비우고 준다 — 두 번 세면 하루 예산이 부풀려져 멀쩡한 열쇠가 막힌다.
    take() {
      const drained = collected
      collected = []
      return drained
    },
  }
}

export default { createUsageMeter }
