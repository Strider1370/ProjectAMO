// 강수(KIM 지상 일기도)를 켜면 FIR 경계(국내·해외 FIR 묶음)를 잠시 끈다. FIR 선·강수·L이 모두
// 파란 계열이라 겹쳐 보이기 때문이다. 켜 있는 동안 사용자가 FIR을 직접 켜거나 끄면 그 선택을 따르고,
// 강수를 끌 때는 자동으로 껐던 레이어만 다시 켠다.
// visibility: 항공 레이어 표시 상태, groupIds: FIR 묶음(AVIATION_PANEL_MERGE_GROUPS.fir), suppressedIds: 자동으로 끈 id
export function firAfterSurfaceChartChange({ chartOn, visibility, groupIds, suppressedIds }) {
  if (chartOn) {
    const hide = groupIds.filter((id) => visibility[id])
    if (!hide.length) return { visibility, suppressedIds }
    return { visibility: { ...visibility, ...Object.fromEntries(hide.map((id) => [id, false])) }, suppressedIds: hide }
  }
  if (!suppressedIds.length) return { visibility, suppressedIds: [] }
  return { visibility: { ...visibility, ...Object.fromEntries(suppressedIds.map((id) => [id, true])) }, suppressedIds: [] }
}

// 사용자가 FIR 묶음을 직접 누르면 자동 끄기 기억을 지운다.
export function firSuppressionAfterUserToggle() {
  return []
}
