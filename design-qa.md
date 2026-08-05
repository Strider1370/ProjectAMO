# Terminal option 3 design QA

## Comparison setup

- Source: `.artifacts/figma-weather-review/option3-aligned.png`
- Implementation: `artifacts/responsive-screenshots/after/2026-08-05_terminal-option3/option3-after.png`
- Combined comparison: `artifacts/responsive-screenshots/after/2026-08-05_terminal-option3/comparison.png`
- Viewport: 1920 × 1080 CSS pixels, DPR 1, no normalization or cropping
- Responsive check: `artifacts/responsive-screenshots/after/2026-08-05_terminal-option3/option3-rkpc-1319x960.png`
- Overseas state: `artifacts/responsive-screenshots/after/2026-08-05_terminal-option3/overseas-after.png`

## State and intentional differences

The source shows a fixed Seoul example; the implementation capture uses the live Jeju destination state. Copy and data therefore differ while panel geometry is compared at the same viewport. Per the approved requirements, the implementation uses `탑승구` instead of arrival time, removes `도착 후 바로 확인할 정보`, and increases hourly/weekly readability for large signage.

## Findings

- P0/P1/P2: none.
- Typography: titles, temperatures, flight rows, and forecast labels remain legible at both tested viewports.
- Spacing and geometry: upper and lower vertical splits differ by 0 px; there is no document overflow.
- Color and imagery: the pale-blue current-weather field, weather assets, and source airline logos render correctly.
- Copy: gate replaces arrival time and the removed post-arrival message is absent.
- Hourly chart: temperature labels do not overlap weather icons.
- Overseas fallback: stale/missing overseas hourly data falls back to the flight forecast; missing weekly data shows `주간 예보 확인 중`; airline logos load and stay in the first flight row.
- Browser console/page errors: 0 at 1920 × 1080 and 1319 × 960.

## Iteration history

1. Initial comparison found a 76.8 px split mismatch, excessive current-weather whitespace, hourly icon/temperature collision risk, and blank overseas forecast presentation.
2. The grid was aligned to a shared 58/42 split, current weather was rebalanced, chart spacing was reserved, and existing flight forecast/logo data was reused as the overseas fallback.
3. Final browser measurements: split delta 0 px, no hourly overlap, no horizontal/vertical overflow, and no console errors.

## Verification

- Terminal browser contract: 14 passed, 28 intentionally skipped for non-signage projects.
- Terminal unit tests and production build: passed.

final result: passed
