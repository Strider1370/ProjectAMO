// 강수(KIM 지상 일기도)를 켜면 FIR 경계를 잠시 끈다. FIR 선·강수·L이 모두 파란 계열이라 겹쳐 보이기 때문이다.
// 켜 있는 동안 사용자가 FIR을 직접 켜거나 끄면 그 선택을 따르고, 강수를 끌 때 되돌리지 않는다.
// 강수를 끌 때는 자동으로 껐던 FIR만 다시 켠다.
export function firAfterSurfaceChartChange({ chartOn, firVisible, suppressed }) {
  if (chartOn) return firVisible ? { firVisible: false, suppressed: true } : { firVisible, suppressed }
  return suppressed ? { firVisible: true, suppressed: false } : { firVisible, suppressed: false }
}

// 사용자가 FIR을 직접 누르면 자동 끄기 기억을 지운다.
export function firSuppressionAfterUserToggle() {
  return false
}
