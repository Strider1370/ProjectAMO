import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// 관리자 콘솔: 지금 돌고 있는 버전과 HTTPS 인증서 남은 일수.
// 둘 다 "없으면 감춘다" — 로컬 개발엔 인증서가 없고, 배포 방식에 따라 git 정보가 없을 수도 있다.
// 없는 것을 오류로 취급하면 개발 중 콘솔이 계속 빨개진다.
const CERT_PATH = process.env.TLS_CERT_PATH || '/etc/letsencrypt/live/projectamo.co.kr/fullchain.pem'

// openssl에 의존하지 않고 PEM에서 직접 읽는다. Node에 X509Certificate가 있다.
export function certificateExpiry(certPath = CERT_PATH) {
  try {
    const cert = new X509Certificate(fs.readFileSync(certPath))
    const notAfter = new Date(cert.validTo).toISOString()
    return { notAfter, daysLeft: Math.floor((Date.parse(notAfter) - Date.now()) / 86400000) }
  } catch { return null }
}

function gitCommit(cwd) {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim() } catch { return null }
}

// 배포 시각. 배포 스크립트가 남긴 파일이 있으면 그걸 쓴다.
//
// 없으면 브랜치 참조(.git/refs/heads/<branch>)의 수정시각으로 근사한다 — .git/HEAD는 브랜치를
// 바꿀 때만 바뀌고 fast-forward pull로는 갱신되지 않아서, 그걸 보면 몇 달 전 시각이 나온다.
// (실제로 배포 직후 화면에 "81일 전 배포"가 떴다.) packed-ref만 있는 저장소를 대비해 HEAD도
// 마지막 후보로 남긴다.
function deployedAt(root) {
  const gitDir = path.join(root, '.git')
  const candidates = [path.join(root, '.deployed-at')]
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim()
    const ref = head.startsWith('ref: ') ? head.slice(5) : null
    if (ref) candidates.push(path.join(gitDir, ref))
  } catch { /* git 정보가 없으면 아래 후보로 */ }
  candidates.push(path.join(gitDir, 'HEAD'))

  for (const candidate of candidates) {
    try { return fs.statSync(candidate).mtime.toISOString() } catch { /* 다음 후보 */ }
  }
  return null
}

// 저장소 최상위는 이 파일 위치에서 거슬러 올라가 정한다 — process.cwd()에 기대면 어디서
// 실행했느냐에 따라 결과가 달라진다(backend/에서 켜면 .git을 못 찾는다).
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

export function deploymentInfo({ certPath = CERT_PATH, root = REPO_ROOT } = {}) {
  return {
    commit: process.env.GIT_COMMIT || gitCommit(root),
    deployedAt: deployedAt(root),
    cert: certificateExpiry(certPath),
  }
}

export default { deploymentInfo, certificateExpiry }
