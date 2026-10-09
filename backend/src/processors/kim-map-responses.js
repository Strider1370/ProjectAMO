// KIM 지도 레이어 한 장(기온·구름·착빙·바람·GKTG)을 이진 형식(shared/kim-map-binary.js)으로 회차 폴더에 저장해 두고,
// 브라우저가 정적 파일(/data/...)로 바로 받게 한다. 저장된 파일은 nginx가 백엔드를 거치지 않고 내보낸다.
//
// 확대 영역 한 장은 만들 때 1초 안팎이 든다(2026-10-09 운영 측정: 격자 읽기 0.2~0.3초, 착빙·구름 계산 0.6~0.8초,
// 지면 아래 표시 0.3초, JSON·압축 0.1~0.2초). 같은 장은 누가 보든 같으므로 한 번 만든 응답을 파일로 남긴다.
// - 착빙·구름: 확대 회차를 받을 때 시각마다 미리 만든다(파생 작업 kim_map_responses, 별도 계산 프로세스).
// - 나머지: 처음 요청될 때 만들어 저장한다.
// 파일은 회차 폴더 derived/map-responses/ 아래에 있어 회차를 정리할 때 함께 지워진다.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import {
  KIM_NWP_ICING_LEVEL_IDS, KIM_NWP_MODEL, KIM_NWP_MOISTURE_LEVEL_IDS,
  buildKimCloudPotentialFieldFromGrid, buildKimIcingFieldFromGrid, buildKimSurfaceWindFieldFromWindGrid, buildKimTemperatureFieldFromGrid,
} from './kim-nwp-model.js'
import { readKimNwpGrid, resolveKimNwpRunDir, validateKimNwpSelection } from './kim-nwp-store.js'
import { applyKimBelowGround } from './kim-surface-mask.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { KIM_DEFAULT_DOMAIN, kimDomain } from './kim-domain.js'
import { encodeKimMapBinary } from '../../../shared/kim-map-binary.js'

// 지면 아래 칸을 비울 필드 배열(int16, 결측 -32768). 바람 10 m 같은 높이 고도는 kim-surface-mask가 건드리지 않는다.
export const KIM_BELOW_GROUND_ARRAYS = Object.freeze({ wind: ['u', 'v'], temp: ['T'], cloud: ['spread', 'cloudPotential'], icing: ['icingScore', 'icingGrade'] })
// 응답 모양이 바뀌면 이 값을 올린다(ETag·저장 파일 이름에 들어간다).
export const KIM_BELOW_GROUND_VIEW = 'below-ground-v1'
const BUILDERS = Object.freeze({
  temp: buildKimTemperatureFieldFromGrid,
  cloud: buildKimCloudPotentialFieldFromGrid,
  icing: buildKimIcingFieldFromGrid,
  wind: buildKimSurfaceWindFieldFromWindGrid,
})
// 확대 회차를 받을 때 미리 만드는 레이어와 고도. 착빙·구름은 요청 때 계산이 들어 전 고도, 기온·바람은 처음 켤 때 고도(700 hPa).
export const KIM_PRECOMPUTED_MAP_LAYERS = Object.freeze({ icing: KIM_NWP_ICING_LEVEL_IDS, cloud: KIM_NWP_MOISTURE_LEVEL_IDS, temp: ['700hPa'], wind: ['700hPa'] })

export function buildKimMapField({ root, domain = KIM_DEFAULT_DOMAIN, tmfc, hf, level, type }) {
  const build = BUILDERS[type]
  if (!build) throw new Error('Invalid KIM map layer')
  validateKimNwpSelection({ tmfc, hf, levelId: level, domain })
  const grid = readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf: Number(hf), levelId: level, domain })
  return applyKimBelowGround(build(grid), { root, arrays: KIM_BELOW_GROUND_ARRAYS[type], domain, missing: -32768 })
}

// 저장 위치(회차 폴더 기준 상대 경로도 같은 규칙). name은 레이어와 응답 모양(예: icing-below-ground-v1, gktg-<revision>-below-ground-v2-q3).
export function kimMapBinaryRelativePath({ domain = KIM_DEFAULT_DOMAIN, tmfc, hf, level, name }) {
  validateKimNwpSelection({ tmfc, hf, levelId: level, domain })
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid KIM map binary name')
  return `${kimDomain(domain).storeDir}/runs/KIMG_NE57_${tmfc}/derived/map-bin/${name}/${level}/hf${String(Number(hf)).padStart(3, '0')}.bin.gz`
}

export function kimMapBinaryPath({ root, ...selection }) {
  return path.join(root, kimMapBinaryRelativePath(selection))
}

// 정적 주소(/data/<상대 경로>)를 풀어 선택값으로 되돌린다. 형식이 맞지 않으면 null.
export function parseKimMapBinaryPath(relativePath) {
  const match = /^(kim_nwp|kim_nwp_ea)\/runs\/KIMG_NE57_(\d{10})\/derived\/map-bin\/([a-z0-9-]+)\/(\w+)\/hf(\d{3})\.bin\.gz$/.exec(relativePath)
  if (!match) return null
  const domain = match[1] === 'kim_nwp_ea' ? 'ea' : 'kr'
  return { domain, tmfc: match[2], name: match[3], level: match[4], hf: Number(match[5]) }
}

const measure = (bytes) => zlib.deflateRawSync(bytes, { level: 1 }).length

// 저장된 압축 이진 파일이 있으면 읽고, 없으면 build()(JSON 응답과 같은 객체)로 만들어 저장한다.
// 저장에 실패해도 만든 바이트는 돌려준다.
export function readOrWriteKimMapBinary(file, build) {
  try { return { gzip: fs.readFileSync(file), stored: true } } catch {}
  const gzip = zlib.gzipSync(encodeKimMapBinary(build(), { measure }), { level: 6 })
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, gzip)
    fs.renameSync(tmp, file)
  } catch {}
  return { gzip, stored: false }
}

export function kimMapResponseName(type) {
  return `${type}-${KIM_BELOW_GROUND_VIEW}`
}

// 파생 작업(kim_map_responses): 지정한 시각들의 KIM_PRECOMPUTED_MAP_LAYERS를 미리 만든다. 이미 있으면 건너뛴다.
export async function process({ root, domain = 'ea', tmfc, forecastHours = [], signal, turn = async () => () => {} } = {}) {
  root ??= (await import('../config.js')).default.storage.base_path
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain })
  const failures = []
  let written = 0
  for (const hf of forecastHours) {
    signal?.throwIfAborted()
    const started = Date.now()
    const release = await turn()
    try {
      for (const [type, levels] of Object.entries(KIM_PRECOMPUTED_MAP_LAYERS)) {
        for (const level of levels) {
          signal?.throwIfAborted()
          try {
            const result = readOrWriteKimMapBinary(kimMapBinaryPath({ root, domain, tmfc, hf, level, name: kimMapResponseName(type) }),
              () => buildKimMapField({ root, domain, tmfc, hf, level, type }))
            if (!result.stored) written += 1
          } catch (error) {
            if (signal?.aborted) throw error
            failures.push({ hf, type, level, reason: String(error.code || error.message).slice(0, 200) })
          }
        }
      }
    } finally {
      release?.()
    }
    appendKimRunEvent(runDir, { type: 'map_responses_hour', hf, ms: Date.now() - started, written, failures: failures.filter(f => f.hf === hf).length })
  }
  return { type: 'kim_map_responses', tmfc, written, failures, saved: failures.length === 0 }
}

export default { process }
