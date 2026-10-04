// 무거운 계산 자식 프로세스(위성 IR/FOG·CI/CTPS·VI006, KIM GKTG·권계면)를 서버 전체에서 한 번에 하나만 띄운다.
//
// 각자의 큐는 같은 종류끼리만 줄을 세워서, 위성은 5분마다(:35 포함) 시작하고 KIM 파생 계산은 :35와 기본 수집
// 직후에 시작해 새 KIM 회차마다 둘이 겹쳤다. 1.9GB 서버에서 함께 돌면 스왑으로 넘어가 사이트까지 느려진다.
// 순서는 먼저 온 차례이고, 기다리는 동안 취소되면 줄에서 빠진다. 기다리는 시간은 각 작업의 제한 시간에
// 넣지 않도록 호출측이 순번을 받은 뒤에 프로세스와 타이머를 시작한다.
function once(fn) {
  let done = false
  return () => {
    if (done) return
    done = true
    fn()
  }
}

export function createExclusiveGate() {
  let busy = false
  const waiters = []

  const release = () => {
    const next = waiters.shift()
    if (next) next.grant()
    else busy = false
  }

  function acquire({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason)
    if (!busy) {
      busy = true
      return Promise.resolve(once(release))
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        reject(signal.reason)
      }
      const waiter = {
        grant: () => {
          signal?.removeEventListener('abort', onAbort)
          resolve(once(release))
        },
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      waiters.push(waiter)
    })
  }

  // 순번을 받아 fn을 돌리고, 성공·실패와 관계없이 다음 차례에 넘긴다. 비어 있으면 기다리지 않고 바로 시작한다.
  function run(fn, { signal } = {}) {
    const execute = (releaseTurn) => {
      let result
      try {
        result = Promise.resolve(fn())
      } catch (error) {
        releaseTurn()
        return Promise.reject(error)
      }
      return result.finally(releaseTurn)
    }
    if (signal?.aborted) return Promise.reject(signal.reason)
    if (!busy) {
      busy = true
      return execute(once(release))
    }
    return acquire({ signal }).then(execute)
  }

  return { acquire, run, get waiting() { return waiters.length }, get busy() { return busy } }
}

export const heavyChildGate = createExclusiveGate()

export default heavyChildGate
