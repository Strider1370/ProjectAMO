const EOCD_SIG = 0x06054b50, CEN_SIG = 0x02014b50, LOC_SIG = 0x04034b50
export const MAX_MAP_FILE_BYTES = 25 * 1024 * 1024
export const MAX_KML_BYTES = 32 * 1024 * 1024
const invalid = (message = '압축 파일이 손상되었거나 지원하지 않는 KML/KMZ 형식입니다.') => { throw new Error(message) }
const tooLarge = () => invalid('지도 파일 또는 압축 해제 크기가 허용 범위를 초과했습니다.')
export function assertMapFileSize(file) { if (file.size > MAX_MAP_FILE_BYTES) tooLarge() }
function decode(bytes) {
  const declared = new TextDecoder('ascii').decode(bytes.subarray(0,512)).match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1]
  let text
  try { text = new TextDecoder(declared || 'utf-8').decode(bytes) } catch { text = new TextDecoder().decode(bytes) }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) invalid('외부 엔티티 또는 DTD가 포함된 KML은 열 수 없습니다.')
  return text
}
async function inflateRaw(bytes, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks=[]; let size=0
  try {
    for (;;) {
      const {done,value}=await reader.read()
      if(done) break
      size+=value.byteLength
      if(size>limit) { await reader.cancel(); tooLarge() }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result=new Uint8Array(size); let offset=0
  for(const chunk of chunks) { result.set(chunk,offset);offset+=chunk.length }
  return result
}
export async function readKmlFromBuffer(arrayBuffer, fileName = '') {
  if(arrayBuffer.byteLength>MAX_MAP_FILE_BYTES) tooLarge()
  const bytes=new Uint8Array(arrayBuffer)
  if(/\.kml$/i.test(fileName)) return decode(bytes)
  const view=new DataView(arrayBuffer)
  let end=-1
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
    if(view.getUint32(i,true)===EOCD_SIG) {end=i;break}
  }
  if(end<0 || view.getUint16(end+4,true) || view.getUint16(end+6,true) || end+22+view.getUint16(end+20,true)!==bytes.length) invalid()
  const count=view.getUint16(end+10,true)
  if(!count || count>1000) invalid('압축 파일의 항목 수가 허용 범위를 초과했습니다.')
  let cursor=view.getUint32(end+16,true), found=null, total=0
  for(let i=0;i<count;i++) {
    if(cursor+46>end || view.getUint32(cursor,true)!==CEN_SIG) invalid()
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true)
    const compressed=view.getUint32(cursor+20,true),expanded=view.getUint32(cursor+24,true)
    const nameSize=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),offset=view.getUint32(cursor+42,true)
    if(cursor+46+nameSize+extra+comment>end) invalid()
    const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nameSize)).replace(/\\/g,'/')
    if(flags&1 || ![0,8].includes(method) || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) invalid()
    if(!/\/$|\.(?:kml|png|jpe?g|gif|webp)$/i.test(name)) invalid('KML/KMZ 안에 허용되지 않는 부속 파일이 있습니다.')
    total+=expanded
    if(total>MAX_KML_BYTES || expanded>compressed*200+65536) tooLarge()
    if(offset+30>cursor || view.getUint32(offset,true)!==LOC_SIG || view.getUint16(offset+8,true)!==method) invalid()
    const localNameSize=view.getUint16(offset+26,true),start=offset+30+localNameSize+view.getUint16(offset+28,true)
    if(start+compressed>cursor || start>cursor) invalid()
    if(new TextDecoder().decode(bytes.subarray(offset+30,offset+30+localNameSize)).replace(/\\/g,'/')!==name) invalid()
    if(/\.kml$/i.test(name) && (!found || /(^|\/)doc\.kml$/i.test(name))) found={start,compressed,expanded,method}
    cursor+=46+nameSize+extra+comment
  }
  if(!found) invalid('압축 파일 안에서 KML을 찾지 못했습니다.')
  const data=bytes.subarray(found.start,found.start+found.compressed)
  const result=found.method===0 ? data : await inflateRaw(data,Math.min(MAX_KML_BYTES,found.expanded,found.compressed*200+65536))
  if(result.byteLength!==found.expanded) invalid()
  return decode(result)
}
