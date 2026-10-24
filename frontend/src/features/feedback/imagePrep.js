// 첨부 사진을 보내기 전에 브라우저에서 줄인다. 요청 하나가 1 MB(nginx 기본 한도)를 넘지 않게
// 하려는 것이며, 서버는 받은 뒤 다시 그려 저장하므로 여기서 줄인 결과를 믿지는 않는다.
export const MAX_EDGE_PX = 1920
export const MAX_UPLOAD_BYTES = 900 * 1024
export const MAX_IMAGES = 3

export function fitWithin(width, height, maxEdge = MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// 큰 사진이 한도를 넘으면 화질을 먼저, 그다음 크기를 줄인다.
export const ENCODE_STEPS = [
  { edge: 1920, quality: 0.85 },
  { edge: 1920, quality: 0.7 },
  { edge: 1600, quality: 0.7 },
  { edge: 1280, quality: 0.7 },
  { edge: 1024, quality: 0.6 },
]

export async function prepareImage(file) {
  if (!/^image\/(?:jpeg|png|webp|heic|heif|gif|bmp)$/i.test(file.type || '')) throw new Error('not_image')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    for (const step of ENCODE_STEPS) {
      const size = fitWithin(bitmap.width, bitmap.height, step.edge)
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', step.quality))
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob
    }
  } finally {
    bitmap.close?.()
  }
  throw new Error('too_large')
}
