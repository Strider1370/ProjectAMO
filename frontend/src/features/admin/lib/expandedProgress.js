// KIM 확대 영역 회차 진행(관리자 자료 상태 응답의 expandedProgress)을 화면 문구로 바꾼다.

const STATE_WORD = { running: '받는 중', published: '게시함', not_published: '게시 안 함', interrupted: '끊김' }
const STATE_TONE = { running: 'warn', published: 'ok', not_published: 'bad', interrupted: 'bad' }
const STOP_TEXT = {
  memory_reserve: '서버 메모리 부족으로 새 시각 중단',
  disk_reserve: '디스크 여유 부족으로 중단',
  next_cycle_started: '다음 회차가 시작돼 중단',
  request_cutoff: '23:50 마감으로 중단',
  credential_rejected: '대용량 키 거부',
  cancelled: '취소됨',
}

export function expandedProgressView(progress) {
  if (!progress) return null
  const cycle = `${progress.tmfc.slice(4, 6)}/${progress.tmfc.slice(6, 8)} ${progress.cycle} UTC`
  return {
    cycle,
    stateWord: STATE_WORD[progress.state] || progress.state,
    tone: STATE_TONE[progress.state] || 'warn',
    // 표의 이름 칸에 붙이는 짧은 문구. 받는 중일 때만.
    brief: progress.state === 'running' ? `${progress.cycle} UTC ${progress.computedPct}%` : null,
    collected: `${progress.collected}/${progress.planned} (${progress.collectedPct}%)${progress.lastCollectedHour != null ? ` · +${progress.lastCollectedHour}h까지` : ''}`,
    computed: `${progress.computed}/${progress.planned} (${progress.computedPct}%)`,
    stop: progress.stopReason ? STOP_TEXT[progress.stopReason] || progress.stopReason : null,
    korea: progress.korea === undefined ? null : progress.korea === null ? '아직(+0~12h가 모이면)' : progress.korea.saved ? '게시함' : `안 함(${progress.korea.reason || '이유 없음'})`,
    // 지도 파일·강수 장: 이 기능이 없던 회차(기록 없음)는 표시하지 않는다.
    extras: progress.aci || progress.mapFiles || progress.precipFrames || progress.precipFailed
      ? `${progress.aci ? `${progress.aci.task?.state === 'aci_wait' ? `ACI 작업 순번 대기 +${progress.aci.task.hf}h · ` : progress.aci.task?.state === 'aci_calculating' ? `ACI 계산 중 +${progress.aci.task.hf}h · ` : ''}ACI 입력 ${progress.aci.inputs}/${progress.planned} · 계산 ${progress.aci.computed}/${progress.planned} · 게시 ${progress.aci.published ?? 0}${progress.aci.failures.length ? ` · 실패 ${progress.aci.failures.map(f=>`+${f.hf}h`).join(',')}` : ''} · 추가 ${progress.aci.requests}회 ${(progress.aci.bytes/1e6).toFixed(1)}MB · 계산 ${(progress.aci.calculationMs/1000).toFixed(0)}초 / ` : ''}지도 파일 ${progress.mapFiles ?? 0}시각 · 강수 ${progress.precipFrames ?? 0}시각${progress.precipFailed ? ` (실패 ${progress.precipFailed})` : ''}${progress.precipPublished != null ? ` · 강수 게시 ${progress.precipPublished}장` : ''}`
      : null,
    memory: progress.memory ? `남은 ${progress.memory.availableMiB} MiB(최저 ${progress.memory.minAvailableMiB}) · 스왑 ${progress.memory.swapUsedMiB} MiB` : null,
  }
}
