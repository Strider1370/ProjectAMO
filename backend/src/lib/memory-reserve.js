// 무거운 계산을 시작하기 전에 서버의 남은 메모리(MemAvailable)를 확인한다.
//
// 1.9 GB 서버에서 사이트(백엔드)·위성 처리·KIM 다운로드가 함께 메모리를 쓰므로, 남은 메모리가 기준보다 적으면
// 계산을 바로 띄우지 않고 기다린다. /proc/meminfo가 없거나 읽을 수 없으면 확인하지 않는다(개발 PC 등).
import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

export function readMemAvailableBytes(text = null) {
  try {
    const source = text ?? fs.readFileSync('/proc/meminfo', 'utf8')
    const match = source.match(/^MemAvailable:\s+(\d+)\s+kB/m)
    return match ? Number(match[1]) * 1024 : Number.POSITIVE_INFINITY
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

// 남은 메모리가 minBytes 이상이 될 때까지 기다린다. timeoutMs를 넘기면 code 'memory_reserve_timeout' 오류.
// 기다린 시간(ms)을 돌려준다.
export async function waitForMemoryReserve({ minBytes, timeoutMs, pollMs = 5_000, signal, read = readMemAvailableBytes, now = Date.now } = {}) {
  const started = now()
  while (read() < minBytes) {
    signal?.throwIfAborted()
    if (now() - started >= timeoutMs) {
      const error = new Error('memory_reserve_timeout')
      error.code = 'memory_reserve_timeout'
      throw error
    }
    await delay(pollMs, undefined, { signal })
  }
  return now() - started
}
