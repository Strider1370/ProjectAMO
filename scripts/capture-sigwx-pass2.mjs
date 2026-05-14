async (page) => {
  const tmfcs = [
    '2026042817',
    '2026041511',
    '2026040205',
    '2026032023',
    '2026030717',
    '2026022211',
    '2026020905',
    '2026012623',
  ]

  await page.setViewportSize({ width: 1100, height: 980 })

  for (const tmfc of tmfcs) {
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
    await page.locator('.mapboxgl-canvas').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '항공정보' }).click()
    await page.getByText('비행정보구역').click()
    await page.getByText('공항').click()
    await page.getByRole('button', { name: '기상정보' }).click()
    await page.getByText('SIGWX').click()
    await page.getByRole('button', { name: '설정' }).click()

    const select = page.getByRole('combobox', { name: 'Reference sample' })
    await select.waitFor({ state: 'visible', timeout: 30000 })
    await select.selectOption(tmfc)
    await page.waitForFunction(
      () => document.body.classList.contains('sigwx-debug-capture-mode'),
      null,
      { timeout: 10000 },
    )
    await page.waitForTimeout(2500)

    const map = page.locator('.mapboxgl-canvas').first()
    await map.screenshot({
      path: `reference/sigwx_low_samples/${tmfc}/site-render-pass2.png`,
    })
    console.log(`captured ${tmfc}`)
  }
}
