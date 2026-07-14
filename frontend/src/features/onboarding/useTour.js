import { useCallback, useEffect, useRef, useState } from 'react'
import { TOUR_STEPS, TOUR_STORAGE_KEY } from './tourSteps.js'
import { firstVisibleFrom, shouldAutoStart } from './tourMachine.js'
import { resolveTargetRect } from './targetRect.js'

const readDone = () => {
  try { return localStorage.getItem(TOUR_STORAGE_KEY) === '1' } catch { return false }
}
const writeDone = () => {
  try { localStorage.setItem(TOUR_STORAGE_KEY, '1') } catch { /* private mode/SSR: no-op */ }
}

/**
 * 첫 사용자 온보딩 투어 상태머신 훅. 진행은 전부 수동([다음]) — 사용자가 각 스텝(패널 등)을 볼 시간을 갖도록.
 * 스텝 조작(공항/레이어 클릭)은 구멍/실제 버튼으로 하되 자동진행하지 않는다.
 * isFirstVisit: 앱 최초 방문자만 자동 발동(기존 사용자는 도움말로 재실행).
 * markSeen: 최초 자동 발동 시 changelog 소진(업데이트 모달과 이중 노출 방지).
 * willAutoStart: App이 업데이트 모달 자동표시를 투어에 양보할지 판단하는 동기 플래그.
 * 스펙: docs/superpowers/specs/2026-07-14-first-run-onboarding-tour.md
 */
export default function useTour({ isMobile, isFirstVisit, markSeen, getAirportPoint }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const getAirportPointRef = useRef(getAirportPoint)
  getAirportPointRef.current = getAirportPoint

  // 스텝 표시 여부. optional 스텝(배지 바)만 부재 시 스킵 — 지도·사이드바 스텝은 항상 표시
  // (mapAirport 투영이 데이터/지도 준비 전 잠깐 null이어도 스킵하지 않고 오버레이가 준비될 때까지 대기).
  const isPresent = useCallback(
    (step) => (step.optional ? resolveTargetRect(step, getAirportPointRef.current) != null : true),
    [],
  )
  // 마운트 시점 1회 확정 — App의 업데이트 모달 자동표시 가드와 동기적으로 맞물림.
  const [willAutoStart] = useState(() => shouldAutoStart({ done: readDone(), isMobile, isFirstVisit }))

  // 완료/스킵: 재방문 차단 플래그 기록 + changelog 소진(첫 자동 발동이었으면 업데이트 모달 안 뜨게).
  const finish = useCallback(() => { setActive(false); writeDone(); markSeen?.() }, [markSeen])

  const start = useCallback(() => {
    const i = firstVisibleFrom(TOUR_STEPS, isPresent, 0)
    if (i >= TOUR_STEPS.length) return // 보여줄 스텝 없음
    setIndex(i)
    setActive(true)
  }, [isPresent])

  const goTo = useCallback((from, dir) => {
    const i = firstVisibleFrom(TOUR_STEPS, isPresent, from, dir)
    if (dir > 0 && i >= TOUR_STEPS.length) { finish(); return } // 끝 → 완료
    if (dir < 0 && i < 0) return // 첫 스텝에서 이전은 무시
    setIndex(i)
  }, [finish, isPresent])

  const next = useCallback(() => goTo(index + 1, 1), [goTo, index])
  const back = useCallback(() => goTo(index - 1, -1), [goTo, index])
  // 도움말 버튼 재실행 — 완료 플래그와 무관하게 언제든.
  const restart = useCallback(() => start(), [start])

  // 최초 접속 자동 발동 (마운트 1회). map-shell/사이드바 렌더 후를 보장하려 rAF 지연.
  useEffect(() => {
    if (!willAutoStart) return
    const id = requestAnimationFrame(() => start())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc → 건너뛰기(투어 종료).
  useEffect(() => {
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish])

  // 진행 표시(부재 스텝 제외한 실제 순번/총계).
  const visible = active ? TOUR_STEPS.filter(isPresent) : []
  const step = active ? TOUR_STEPS[index] : null
  const stepNumber = step ? visible.findIndex((s) => s.id === step.id) + 1 : 0

  return {
    active,
    willAutoStart,
    step,
    stepNumber,
    total: visible.length,
    isLast: firstVisibleFrom(TOUR_STEPS, isPresent, index + 1) >= TOUR_STEPS.length,
    isFirst: firstVisibleFrom(TOUR_STEPS, isPresent, index - 1, -1) < 0,
    next,
    back,
    skip: finish,
    restart,
  }
}
