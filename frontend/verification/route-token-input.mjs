// 경로 토큰 입력칸을 다루는 공용 도우미. 계약 네 곳이 이것을 함께 쓴다 —
// 입력 방식이 또 바뀌면 여기 한 곳만 고친다.
//
// 요소를 이름으로 찾지 않고 클래스로 범위를 좁힌다(계약 등록부의 규칙). 알약과 입력칸은
// 같은 칸 안에 여러 개 있을 수 있어 이름만으로는 대상이 갈리지 않는다.

/** 토큰들을 차례로 확정한다. 스페이스가 확정 신호이고, 마지막은 엔터로 닫는다. */
export async function enterRouteTokens(page, tokens) {
  const input = page.locator('.rtf-input').first()
  await input.click()
  for (const token of tokens) {
    await input.fill(token)
    await page.keyboard.press('Space')
  }
  await page.keyboard.press('Enter')
}

/** 지금 칸에 있는 알약 글자들. */
export function routeTokenTexts(page) {
  return page.locator('.rtf-pill').allTextContents()
}

/** 오류로 잡힌 알약 수. 0이면 지도가 최신 입력을 반영한 상태다. */
export function routeTokenErrorCount(page) {
  return page.locator('.rtf-pill.is-error').count()
}

/** 「⚠ N error」 줄. 오류가 없으면 빈 문자열. */
export async function routeTokenErrorLabel(page) {
  const toggle = page.locator('.rtf-error-toggle').first()
  return (await toggle.count()) > 0 ? ((await toggle.textContent()) ?? '') : ''
}
