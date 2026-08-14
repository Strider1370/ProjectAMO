// KMZ는 KML을 담은 zip이다. 라이브러리를 새로 들이지 않고 브라우저·Node 양쪽에
// 내장된 DecompressionStream으로 푼다. zip 전체를 다루지 않고 "항목 하나 꺼내기"만
// 한다 — KMZ는 doc.kml 하나가 본체이고 나머지는 아이콘이라 그걸로 충분하다.
const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const STORED = 0
const DEFLATED = 8

// 끝쪽의 EOCD(중앙 디렉터리 끝 표시)를 뒤에서부터 찾는다. zip 주석이 붙을 수 있어
// 위치가 고정이 아니다. 주석 최대 길이가 64KB라 그만큼만 거슬러 올라간다.
function findEocd(view, length) {
  const floor = Math.max(0, length - 22 - 65535)
  for (let i = length - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  return -1
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// BOM은 TextDecoder('utf-8')가 알아서 떼어낸다.
const decode = (bytes) => new TextDecoder('utf-8').decode(bytes)

export async function readKmlFromBuffer(arrayBuffer, fileName = '') {
  if (/\.kml$/i.test(fileName)) return decode(new Uint8Array(arrayBuffer))

  const bytes = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)
  const eocd = findEocd(view, bytes.length)
  if (eocd < 0) throw new Error('압축 파일을 열 수 없습니다. KMZ 또는 KML 파일인지 확인하세요.')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  let found = null
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== CEN_SIG) break
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decode(bytes.subarray(p + 46, p + 46 + nameLength))
    // doc.kml이 있으면 그것을, 없으면 처음 만난 .kml을 쓴다.
    if (/\.kml$/i.test(name) && (!found || /(^|\/)doc\.kml$/i.test(name))) {
      found = { name, method, compressedSize, localOffset }
      if (/(^|\/)doc\.kml$/i.test(name)) break
    }
    p += 46 + nameLength + extraLength + commentLength
  }
  if (!found) throw new Error('압축 파일 안에서 KML을 찾지 못했습니다.')

  // 지역 헤더는 이름·부가필드 길이가 중앙 디렉터리와 다를 수 있어 여기서 다시 읽는다.
  const lo = found.localOffset
  if (view.getUint32(lo, true) !== LOC_SIG) throw new Error('압축 파일이 손상되었습니다.')
  const dataStart = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true)
  const data = bytes.subarray(dataStart, dataStart + found.compressedSize)

  if (found.method === STORED) return decode(data)
  if (found.method === DEFLATED) return decode(await inflateRaw(data))
  throw new Error(`지원하지 않는 압축 방식입니다 (${found.method}).`)
}
