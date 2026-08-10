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

// 배포 시각 — 배포 스크립트가 남긴 파일이 있으면 그걸 쓰고, 없으면 .git/HEAD 수정시각으로 근사한다.
function deployedAt(root) {
  for (const p of [path.join(root, '.deployed-at'), path.join(root, '.git', 'HEAD')]) {
    try { return fs.statSync(p).mtime.toISOString() } catch { /* 다음 후보 */ }
  }
  return null
}

export function deploymentInfo({ certPath = CERT_PATH, root = process.cwd() } = {}) {
  return {
    commit: process.env.GIT_COMMIT || gitCommit(root),
    deployedAt: deployedAt(root),
    cert: certificateExpiry(certPath),
  }
}

export default { deploymentInfo, certificateExpiry }
