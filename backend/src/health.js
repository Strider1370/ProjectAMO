import { isTestMutationApiEnabled } from './dev/test-mutation-gate.js'

// 공개 health 응답에는 실행 가능 여부만 공개한다. 테스트 DB 경로나 플래그 값은
// 진단 정보가 아니라 실행 경계이므로 노출하지 않는다.
export function createHealthStatus(env = process.env, uptime = process.uptime()) {
  return {
    ok: true,
    uptime,
    testMode: Boolean(env.DISABLE_COLLECTION),
    capabilities: {
      testMutations: isTestMutationApiEnabled(env),
    },
  }
}

export default { createHealthStatus }
