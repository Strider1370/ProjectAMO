import { test, expect } from '@playwright/test'

test('alert-lab: five categories only and selected airport follows publication', async ({ page }) => {
  await page.goto('/concepts/alerts')
  const categories = page.locator('.al-scenario > strong')
  await expect(categories).toHaveText(['METAR', 'TAF', '공항경보', '낙뢰', 'SIGMET'])
  for (const removed of ['경로 TAF 알람', 'TAF 악화 알람', 'TAF 새 구간 알람', '여러 공항 알람']) {
    await expect(page.getByRole('button', { name: removed, exact: true })).toHaveCount(0)
  }
  await page.getByLabel('감시 공항').selectOption('RKPC')
  await page.getByRole('button', { name: '새 TAF 발표', exact: true }).click()
  for (const name of ['PC 미리보기', '휴대폰 미리보기']) {
    const alert = page.getByRole('region', { name, exact: true }).getByRole('alert')
    await expect(alert).toContainText('제주국제공항')
    await expect(alert).toContainText('새 TAF 발표')
    await expect(alert.locator('.ad-taf-text')).toContainText('TAF RKPC')
    await expect(alert.locator('.ad-taf-text')).toContainText('TEMPO')
    await expect(alert.locator('.ad-taf-text')).toContainText('27012KT=')
    await expect(alert).not.toContainText('악화')
  }
  await page.getByRole('button', { name: 'TAF AMD 발표', exact: true }).click()
  const desktop = page.getByRole('region', { name: 'PC 미리보기', exact: true })
  await desktop.getByRole('button', { name: /알림 열기/ }).click()
  await expect(desktop.locator('.ad-bell-item')).toHaveCount(1)
  await expect(desktop.locator('.ad-bell-item')).toContainText('TAF AMD 발표')
})

test('alert-lab: desktop and phone keep native dimensions while previews scale', async ({ page }) => {
  await page.goto('/concepts/alerts')
  await page.getByRole('button', { name: '임계값 초과', exact: true }).click()
  const desktop = page.getByRole('region', { name: 'PC 미리보기', exact: true })
  const phone = page.getByRole('region', { name: '휴대폰 미리보기', exact: true })
  for (const [device, width, height] of [[desktop, 1440, 900], [phone, 390, 844]]) {
    const geometry = await device.locator('.al-device-frame').evaluate(frame => {
      const rect = frame.getBoundingClientRect()
      return { width: frame.clientWidth, height: frame.clientHeight, xRatio: rect.width / frame.offsetWidth, yRatio: rect.height / frame.offsetHeight }
    })
    expect(geometry.width).toBe(width)
    expect(geometry.height).toBe(height)
    expect(geometry.xRatio).toBeCloseTo(geometry.yRatio, 5)
  }
  expect(await phone.getByRole('alert').evaluate(element => element.offsetWidth)).toBe(366)
  await phone.getByLabel('휴대폰 화면 크기').selectOption('1')
  expect(await phone.locator('.al-device-frame').evaluate(element => element.clientWidth)).toBe(360)
  expect(await phone.getByRole('alert').evaluate(element => element.offsetWidth)).toBe(336)
  await desktop.getByLabel('PC 미리보기 배율').selectOption('actual')
  expect((await desktop.locator('.al-device-frame').boundingBox()).width).toBe(1456)
  expect(await desktop.locator('.al-device-host').evaluate(host => host.scrollWidth > host.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('alert-lab: each retained example opens its related screen on desktop and phone', async ({ page }) => {
  test.setTimeout(90_000)
  const examples = [
    { button: '임계값 초과', alert: '새 공항 알림', open: '공항 상세 보기', openPhone: '공항 알림 상세 보기', panel: '공항 METAR 패널', detail: '시정' },
    { button: '어는 비(FZRA)', alert: '새 METAR 특이기상 알림', open: 'METAR 특이기상 보기', panel: '공항 METAR 패널', detail: '어는 비(FZRA)' },
    { button: '새 TAF 발표', alert: '새 TAF 발표 알림', open: 'TAF 발표 보기', panel: '공항 TAF 패널', detail: '새 TAF 발표' },
    { button: 'TAF AMD 발표', alert: '새 TAF 발표 알림', open: 'TAF 발표 보기', panel: '공항 TAF 패널', detail: 'TAF AMD 발표' },
    { button: '공항경보 발표', alert: '새 공항경보 알림', open: '공항경보 보기', panel: '공항경보 패널', detail: '강풍경보 발표' },
    { button: '공항 주변 낙뢰', alert: '새 낙뢰 알림', open: '낙뢰 정보 보기', panel: '낙뢰 패널', detail: '최근 30분 낙뢰 3건' },
    { button: '경로상 SIGMET', alert: '새 비행경로 알림', open: '비행경로 보기', panel: '비행경로 패널', detail: '심한 난류 · 설정 경로와 영역 겹침' },
  ]
  for (const device of ['desktop', 'phone']) {
    await page.setViewportSize({ width: device === 'phone' ? 390 : 1440, height: 900 })
    for (const example of examples) {
      await page.goto(`/concepts/alerts?preview=${device}`)
      await page.getByRole('button', { name: example.button, exact: true }).click()
      const alert = page.getByRole('alert', { name: example.alert })
      await expect(alert).toContainText(example.detail)
      if (['새 TAF 발표', 'TAF AMD 발표'].includes(example.button)) {
        const taf = alert.locator('.ad-taf-text')
        await expect(taf).toContainText(`${example.button === 'TAF AMD 발표' ? 'TAF AMD' : 'TAF'} RKSI`)
        await expect(taf).toContainText('24008KT 9999 SCT030')
        await expect(taf).toContainText('TEMPO')
        await expect(taf).toContainText('27012KT=')
        await expect(alert).toContainText('유효')
      }
      if (example.button === '경로상 SIGMET') await expect(alert).toContainText('유효')
      expect(await alert.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false)
      await page.getByRole('button', { name: device === 'phone' ? example.openPhone ?? example.open : example.open, exact: true }).click()
      await expect(page.getByRole('region', { name: example.panel })).toContainText(example.detail)
      await expect(page.getByRole('alert')).toHaveCount(0)
    }
  }
})

test('alert-lab: METAR manual evaluation handles missing, recovery, and resolution', async ({ page }) => {
  await page.goto('/concepts/alerts')
  await page.locator('.al-metars-test summary').click()
  await page.getByRole('button', { name: '감시 시작', exact: true }).click()
  await page.getByRole('button', { name: '조건 해당값', exact: true }).click()
  await page.getByRole('button', { name: '이 관측으로 평가', exact: true }).click()
  const desktop = page.getByRole('region', { name: 'PC 미리보기', exact: true })
  await desktop.getByRole('button', { name: /알림 열기/ }).click()
  await expect(desktop.locator('.ad-bell-item')).toHaveCount(1)
  await page.getByRole('button', { name: '자료 없음', exact: true }).click()
  await page.getByRole('button', { name: '이 관측으로 평가', exact: true }).click()
  await desktop.getByRole('button', { name: /알림 열기/ }).click()
  await expect(desktop.locator('.ad-bell-item')).toContainText('해소 미확인')
  await page.getByRole('button', { name: '조건 해소값', exact: true }).click()
  await page.getByRole('button', { name: '이 관측으로 평가', exact: true }).click()
  await desktop.getByRole('button', { name: /알림 열기/ }).click()
  await expect(desktop.locator('.ad-bell-item')).toHaveCount(0)
})

test('alert-lab: settings stay separate from current alerts and restore focus', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  for (const device of ['desktop', 'phone']) {
    await page.setViewportSize({ width: device === 'phone' ? 390 : 1440, height: 900 })
    await page.goto(`/concepts/alerts?preview=${device}`)
    if (device === 'phone') await page.getByRole('button', { name: '웹앱 열기', exact: true }).click()
    const bell = page.getByRole('button', { name: /알림 열기/ })
    await bell.click()
    await expect(page.getByRole('region', { name: '현재 알림', exact: true })).toContainText('진행 중인 알림이 없습니다')
    await page.getByRole('button', { name: '알림 설정', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '알림 설정' })
    await expect(dialog).toBeVisible()
    await expect(page.locator('.ad-body')).toHaveAttribute('inert', '')
    await expect(page.getByRole('button', { name: '알림 설정 닫기' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    const result = await new AxeBuilder({ page }).include('.ad-app').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(bell).toBeFocused()
  }
})

test('alert-lab: phone push stays inside small screens', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/concepts/alerts?preview=phone')
    await page.getByRole('button', { name: '임계값 초과', exact: true }).click()
    const push = page.getByRole('alert')
    await expect(push.locator('.ad-popup-metric')).toHaveCount(4)
    expect(await page.locator('.ad-lockscreen').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false)
    const result = await new AxeBuilder({ page }).include('.ad-lockscreen').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations).toEqual([])
  }
})
