import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import config from '../config.js'

// 의견 첨부 사진. 공개 기상자료 폴더(nginx /data/ 별칭) 밖에 두고 관리자 API로만 내보낸다.
const DEVELOPMENT_FILES_PATH = fileURLToPath(new URL('../../../artifacts/feedback-files/', import.meta.url))
const KEY_PATTERN = /^[a-f0-9]{32}\.webp$/

export const MAX_UPLOAD_BYTES = 1024 * 1024
export const MAX_STORED_EDGE_PX = 1920
// 디코딩 전에 거르는 최대 픽셀 수 — 아주 큰 그림으로 메모리를 소진시키는 파일을 막는다.
const MAX_INPUT_PIXELS = 40_000_000

function resolveWithMissingTail(value) {
  let cursor = path.resolve(value)
  const suffix = []
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    suffix.unshift(path.basename(cursor))
    cursor = parent
  }
  let real = cursor
  try { real = fs.realpathSync.native(cursor) } catch { /* 절대 경로 그대로 */ }
  return path.join(real, ...suffix)
}

export function feedbackFilesRoot(filesPath) {
  const defaultPath = process.env.NODE_ENV === 'production'
    ? '/opt/projectamo/shared/feedback-files' : DEVELOPMENT_FILES_PATH
  const root = resolveWithMissingTail(filesPath || process.env.FEEDBACK_FILES_PATH || defaultPath)
  for (const publicRoot of [config.storage.base_path, config.storage.active_path].filter(Boolean).map(resolveWithMissingTail)) {
    if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) {
      throw new Error('FEEDBACK_FILES_PATH must be outside public weather data roots')
    }
  }
  return root
}

export function imagePath(root, key) {
  if (!KEY_PATTERN.test(String(key || ''))) return null
  const resolved = path.resolve(root, key.slice(0, 2), key)
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null
}

// 받은 파일을 실제 그림으로 열어 WebP로 새로 만든다. 원본은 저장하지 않으므로
// 그림이 아닌 내용·촬영 위치 같은 메타데이터가 함께 남지 않는다.
export async function reencodeImage(buffer) {
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_STORED_EDGE_PX, height: MAX_STORED_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return null
  }
}

export function writeImage(root, buffer) {
  const key = `${randomBytes(16).toString('hex')}.webp`
  const target = imagePath(root, key)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temp, buffer, { mode: 0o600 })
  fs.renameSync(temp, target)
  return key
}

export function removeImages(root, keys) {
  for (const key of keys) {
    const target = imagePath(root, key)
    if (target) fs.rmSync(target, { force: true })
  }
}
