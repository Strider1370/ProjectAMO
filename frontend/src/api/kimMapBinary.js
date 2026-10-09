// KIM 지도 한 장을 이진 파일(/data/.../map-bin/...)로 받아 JSON 응답과 같은 객체로 푼다(shared/kim-map-binary.js).
// 파일은 nginx가 정적 파일로 바로 보내고, 아직 없으면 백엔드가 만들어 저장한 뒤 보낸다(kim-map-responses.js).
// 브라우저가 gzip 풀기(DecompressionStream)를 지원하지 않거나 받기에 실패하면 호출한 쪽이 JSON API로 돌아간다.
import { decodeKimMapBinary } from '../../../shared/kim-map-binary.js'

// 응답 모양 이름. 서버(kim-map-responses.js kimMapResponseName, server.js GKTG)와 같아야 한다.
export function kimMapBinaryName(type, revision = null) {
  return type === 'gktg' ? `gktg-${String(revision).toLowerCase()}-below-ground-v2-q3` : `${type}-below-ground-v1`
}

export function kimMapBinaryUrl({ domain, tmfc, hf, level, name }) {
  const storeDir = domain === 'ea' ? 'kim_nwp_ea' : 'kim_nwp'
  return `/data/${storeDir}/runs/KIMG_NE57_${tmfc}/derived/map-bin/${name}/${level}/hf${String(Number(hf)).padStart(3, '0')}.bin.gz`
}

export function kimMapBinarySupported() {
  return typeof fetch === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function'
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function fetchKimMapBinary(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`)
  let bytes = new Uint8Array(await response.arrayBuffer())
  // 파일은 gzip으로 저장돼 있다. 중간 서버가 Content-Encoding으로 이미 풀었으면 그대로 쓴다.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes)
  return decodeKimMapBinary(bytes)
}
