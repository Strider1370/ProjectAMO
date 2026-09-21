export async function createPersonalMap(page, name) {
  await page.getByRole('button', { name: /^(새 지도 그리기|새 지도)$/ }).click()
  const field = page.getByRole('textbox', { name: '지도 이름', exact: true })
  await field.fill(name)
  await field.press('Tab')
}

export async function openExtraTools(page) {
  const details = page.locator('.my-map-extra-tools')
  if (!(await details.getAttribute('open')) && await details.getAttribute('open') !== '') await details.locator('summary').click()
}

export async function openGroupForm(page) {
  const button = page.getByRole('button', { name: '+ 그룹', exact: true })
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click()
}

export async function importMapFile(page, file) {
  await page.getByTestId('my-map-file').setInputFiles(file)
  await page.getByRole('button', { name: '지도에서 보기', exact: true }).click()
}

export async function deleteCurrentMap(page) {
  await page.getByTestId('my-map-file-menu').click()
  await page.getByRole('menuitem', { name: '지도 삭제', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click()
}
