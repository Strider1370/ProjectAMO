import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./DestinationWeatherPage.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')

test('1안은 항공편 정보 오른쪽에 운항 상태를 표시하고 고정 label은 쓰지 않는다', () => {
  const airlineStart = source.indexOf('<div className="airline-block">')
  const airlineEnd = source.indexOf('<div className="board-divider" />', airlineStart)
  const statusStart = source.indexOf('<div className={`operation-status')

  assert.ok(statusStart > airlineStart)
  assert.ok(statusStart < airlineEnd)
  assert.doesNotMatch(source, />운항 상태</)
})

test('1안은 현지 시각을 현재 날씨 제목의 오른쪽에 둔다', () => {
  const weatherHeadingStart = source.indexOf('<div className="current-weather-heading">')
  const weatherHeadingEnd = source.indexOf('<div className="current-weather">', weatherHeadingStart)
  const clockStart = source.indexOf('<div className="current-weather-clock', weatherHeadingStart)
  const destinationStart = source.indexOf('<div className="board-destination">')
  const airlineStart = source.indexOf('<div className="airline-block">')

  assert.ok(clockStart > weatherHeadingStart)
  assert.ok(clockStart < weatherHeadingEnd)
  assert.equal(source.slice(destinationStart, airlineStart).includes('current-weather-clock'), false)
})

test('1안은 승인된 짧은 승객용 문구를 사용한다', () => {
  assert.match(source, />출발</)
  assert.match(source, />탑승구</)
  assert.match(source, />도착</)
  assert.match(source, /현재 날씨/)
  assert.doesNotMatch(source, /출발 예정|도착 예정/)
})

test('두 안은 승인된 공통 제목을 사용한다', () => {
  assert.equal((source.match(/출발 항공편 · 도착지 날씨/g) ?? []).length, 2)
  assert.doesNotMatch(source, /곧 출발하는 항공편 · 목적지 날씨|곧 출발 · 도착지 예보/)
  assert.doesNotMatch(source, /도착 현지 시간 기준 예보/)
})

test('공항별 기상 표시는 도시와 공항 고유명을 함께 써서 목적지를 식별한다', () => {
  assert.match(source, /displayName: "싱가포르 창이", code: "SIN"/)
  assert.match(source, /city: "싱가포르 창이", code: "SIN", flight: "SQ607"/)
  assert.doesNotMatch(source, /displayName: "싱가포르", code: "SIN"/)
  assert.doesNotMatch(source, /city: "싱가포르", code: "SIN", flight: "SQ607"/)
})

test('다음 3편은 국내 공항과 국적 항공사 3편을 두 안에 같은 순서로 표시한다', () => {
  assert.match(source, /const alternateBoardFlights = \[[\s\S]*?displayName: "서울 김포", code: "GMP"[\s\S]*?airline: "KOREAN AIR"[\s\S]*?displayName: "제주", code: "CJU"[\s\S]*?airline: "ASIANA AIRLINES"[\s\S]*?displayName: "부산 김해", code: "PUS"[\s\S]*?airline: "JEJU AIR"/)
  assert.match(source, /const alternateRailFlights = \[[\s\S]*?city: "서울 김포", code: "GMP"[\s\S]*?airline: "Korean Air"[\s\S]*?city: "제주", code: "CJU"[\s\S]*?airline: "Asiana Airlines"[\s\S]*?city: "부산 김해", code: "PUS"[\s\S]*?airline: "Jeju Air"/)
  assert.match(source, /localZone: "KST"/)
})

test('국내 항공사의 가로 워드마크 대신 심볼 전용 로고 자산을 사용한다', () => {
  assert.match(source, /const koreanAirLogo = "\/Symbols\/airlines\/KAL-symbol\.svg"/)
  assert.match(source, /const asianaAirlinesLogo = "\/Symbols\/airlines\/AAR-symbol\.svg"/)
  assert.ok(existsSync(new URL('../../../public/Symbols/airlines/KAL-symbol.svg', import.meta.url)))
  assert.ok(existsSync(new URL('../../../public/Symbols/airlines/AAR-symbol.svg', import.meta.url)))
})

test('두 안은 터미널 전용 토큰으로 공통 시각 언어를 공유한다', () => {
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-type-screen-title: 40px[^}]*--terminal-type-destination: 59px[^}]*--terminal-type-flight-number: 44px/)
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-space-2: 8px[^}]*--terminal-space-4: 16px[^}]*--terminal-space-5: 24px/)
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-border: #cbd2dc[^}]*--terminal-status-success: #168b45/)
  assert.match(styles, /\.board-header h1 \{[^}]*font-size: var\(--terminal-type-screen-title\)/)
  assert.match(styles, /\.rail-header h1 \{[^}]*font-size: var\(--terminal-type-screen-title\)/)
})

test('사이니지 숫자·보조 라벨·단위·안전영역은 원거리 판독을 우선한다', () => {
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-safe-side: 60px[^}]*--terminal-safe-top: 32px[^}]*--terminal-safe-bottom: 32px[^}]*font-feature-settings: "tnum" 1[^}]*font-variant-numeric: tabular-nums/)
  assert.match(styles, /\.board-header \{[^}]*padding: 28px var\(--terminal-safe-side\) 0/)
  assert.match(styles, /\.screen-footer \{[^}]*padding: 0 var\(--terminal-safe-side\) 22px/)
  assert.match(styles, /\.page-indicator \{[^}]*bottom: var\(--terminal-safe-bottom\)/)
  assert.match(styles, /\.airline-block span \{[^}]*color: #526176/)
  assert.match(styles, /\.rail-airline-meta small \{[^}]*color: #526176/)
  assert.match(styles, /\.temperature \.weather-condition \{[^}]*font-size: 16px/)
  assert.match(styles, /\.board-forecast \.weather-condition \{[^}]*font-size: 16px/)
  assert.match(source, /const displayTemperature = \(value\) => String\(value\)\.replace\("℃", "°C"\)/)
  assert.match(source, /\{displayTemperature\(temp\)\}/)
  assert.match(source, /<small>°C<\/small>/)
})

test('한국 시각은 날짜·요일·시각만 한 줄로 간결하게 표시한다', () => {
  assert.match(source, /className="board-header-clock"><span>2026\.07\.30 \(목\)<\/span><strong>06:32<\/strong><\/div>/)
  assert.match(source, /className="rail-header-clock"><span>2026\.07\.30 \(목\)<\/span><strong>09:15<\/strong><\/div>/)
  assert.doesNotMatch(source, /한국 시각/)
  assert.doesNotMatch(source, /2026-07-30 \(목\) · KST/)
})

test('상단 날짜·시각은 현지 시각과 같은 숫자 서체로 맞추고 날짜도 충분히 크게 표시한다', () => {
  assert.match(styles, /\.board-header-clock span \{[^}]*font-family: var\(--terminal-font-time\)[^}]*font-size: 24px/)
  assert.match(styles, /\.board-header-clock strong \{[^}]*font-family: var\(--terminal-font-time\)[^}]*font-size: 36px/)
  assert.match(styles, /\.rail-header-clock span \{[^}]*font-family: var\(--terminal-font-time\)[^}]*font-size: 24px/)
})

test('제목과 날짜·시각은 헤더 하단선에서 같은 여백을 두고 현재 날씨 설명은 아이콘의 시각 중심을 따른다', () => {
  assert.match(styles, /--terminal-header-bottom-gap: 28px/)
  assert.match(styles, /\.board-header h1 \{[^}]*align-self: end[^}]*margin-bottom: var\(--terminal-header-bottom-gap\)/)
  assert.match(styles, /\.rail-header h1 \{[^}]*align-self: end[^}]*margin-bottom: var\(--terminal-header-bottom-gap\)/)
  assert.match(styles, /\.board-header-clock \{[^}]*position: absolute[^}]*top: auto[^}]*right: var\(--terminal-safe-side\)[^}]*bottom: var\(--terminal-header-bottom-gap\)[^}]*left: auto/)
  assert.match(styles, /\.rail-header-clock \{[^}]*position: absolute[^}]*top: auto[^}]*right: var\(--terminal-safe-side\)[^}]*bottom: var\(--terminal-header-bottom-gap\)[^}]*left: auto/)
  assert.match(source, /weather-condition--\$\{type\}/)
  assert.match(styles, /\.temperature \.weather-condition--cloud, \.temperature \.weather-condition--cloudy \{ transform: translateX\(-7px\); \}/)
  assert.match(styles, /\.temperature \.weather-condition--partly, \.temperature \.weather-condition--sun \{ transform: translateX\(-14px\); \}/)
})

test('시각·기간·예보 시각만 현지 시각과 같은 숫자 서체를 쓰고 다른 숫자 정보는 유지한다', () => {
  assert.match(styles, /--terminal-font-time: "Roboto Mono", monospace/)
  assert.match(styles, /\.departure-time strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.arrival-time strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.board-forecast time \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.rail-stats > div:nth-child\(-n \+ 2\) strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.progress-clock strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.timeline-forecast time \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.doesNotMatch(styles, /\.schedule-grid strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.doesNotMatch(styles, /\.temperature strong \{[^}]*font-family: var\(--terminal-font-time\)/)
})

test('터미널 하단은 다음 업데이트 표시를 노출하지 않는다', () => {
  assert.doesNotMatch(source, /다음 업데이트/)
})

test('도착 현지 시간 기준 안내문은 원거리에서도 읽을 수 있는 크기로 표시한다', () => {
  assert.match(styles, /\.screen-footer \{[^}]*font-size: var\(--terminal-type-supporting\)/)
  assert.match(styles, /\.screen-footer-note \{[^}]*font-weight: 600/)
})

test('터미널은 프로젝트의 기상이 마스코트와 해외 공항 상세 날씨 안내를 사용한다', () => {
  assert.match(source, /src="\/gisang-i\/clear_3_avatar\.png" alt="항공기상청 기상이"/)
  assert.match(source, /href="https:\/\/amo\.kma\.go\.kr\/weather\/airport\.do"/)
  assert.match(source, /<strong>해외 공항 상세 날씨<\/strong>/)
  assert.match(styles, /\.agency-mascot \{[^}]*width: 54px/)
})

test('기관 안내는 하단 우측 QR로, 페이지 표시는 하단 중앙으로 배치한다', () => {
  assert.match(source, /import airportWeatherQr from "\.\/assets\/airport-weather-qr\.svg"/)
  assert.match(source, /className="header-weather-panel"/)
  assert.match(source, /src=\{airportWeatherQr\}/)
  assert.match(styles, /\.page-indicator \{[^}]*top: auto[^}]*bottom: var\(--terminal-safe-bottom\)/)
  assert.match(styles, /\.board-header-clock \{[^}]*justify-self: end/)
  assert.match(styles, /\.screen-footer \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.screen-footer \{[^}]*padding: 0 var\(--terminal-safe-side\) 22px/)
  assert.match(styles, /\.screen-footer \.header-weather-panel \{[^}]*grid-template-columns: 110px auto 50px/)
})

test('1안은 3안과 같은 헤더 중앙 위치에 시험용 전환 컨트롤을 두고 기관 워드마크를 하단 QR 왼쪽에 둔다', () => {
  assert.match(source, /import amoWordmark from "\.\/assets\/amo-wordmark\.png"/)
  assert.equal((source.match(/<HeaderWeatherPanel showWordmark \/>/g) ?? []).length, 2)
  assert.match(styles, /\.exact-board \.board-header-actions \{[^}]*top: var\(--terminal-safe-top\)[^}]*left: 66%/)
  assert.match(styles, /\.screen-footer \.header-weather-panel \{[^}]*grid-template-columns: 110px auto 50px/)
})

test('3안의 한국 시각은 1안처럼 헤더 맨 오른쪽에 고정되고 조작 콘솔과 분리된다', () => {
  assert.match(styles, /\.rail-header-clock \{[^}]*position: absolute[^}]*top: auto[^}]*right: var\(--terminal-safe-side\)[^}]*bottom: var\(--terminal-header-bottom-gap\)[^}]*left: auto/)
  assert.match(styles, /\.rail-header-actions \{[^}]*position: absolute[^}]*left: 66%/)
})

test('3안 첫 항공편 행은 헤더와 분리되는 상단 여백을 둔다', () => {
  assert.doesNotMatch(styles, /\.rail-page > \.rail-flight-row:first-child \{[^}]*padding-top/)
  assert.match(styles, /\.rail-page > \.rail-flight-row:first-child \.rail-flight-info h2 \{[^}]*margin-top: 14px/)
  assert.match(styles, /\.rail-page > \.rail-flight-row:first-child \.timeline \{[^}]*transform: translateY\(14px\)/)
})

test('3안 왼쪽 패널은 1안과 같은 원거리 판독 위계로 도시·현지 시각·항공편·운항 값을 표시한다', () => {
  assert.match(styles, /\.rail-flight-row \{[^}]*grid-template-columns: 35% 65%/)
  assert.match(styles, /\.rail-flight-info \{[^}]*padding: 14px 36px 12px calc\(var\(--terminal-safe-side\) \+ var\(--terminal-space-5\)\)/)
  assert.match(styles, /\.rail-flight-info h2 \{[^}]*font-size: var\(--terminal-type-destination\)/)
  assert.match(styles, /\.rail-local-clock strong \{[^}]*font-size: var\(--terminal-type-primary-time\)/)
  assert.match(styles, /\.rail-flight-number strong \{[^}]*font-size: var\(--terminal-type-flight-number\)/)
  assert.match(styles, /\.rail-flight-status > span \{[^}]*font-size: var\(--terminal-type-status\)/)
  assert.match(styles, /\.rail-stats span \{[^}]*font-size: var\(--terminal-type-label\)/)
  assert.match(styles, /\.rail-stats strong \{[^}]*font-size: var\(--terminal-type-flight-number\)/)
  assert.match(styles, /\.rail-stats > div \{[^}]*row-gap: var\(--terminal-space-2\)/)
})

test('3안은 좌우 컬럼이 아니라 항공편별 가로 행으로 먼저 묶여 읽힌다', () => {
  assert.match(styles, /\.rail-flight-row \{[^}]*border-bottom: 2px solid #d3dbe5/)
  assert.match(styles, /\.rail-flight-info \{[^}]*background: #f7f9fc[^}]*border-right: 2px solid #c5d0dd/)
})

test('3안은 편명 오른쪽에 항공사명을 보조 정보로 표시한다', () => {
  assert.match(source, /className="rail-airline-meta"[^>]*>\s*<strong>\{flight\.flight\}<\/strong>\s*<small>\{flight\.airline\}<\/small>/)
  assert.match(styles, /\.rail-airline-meta \{[^}]*display: flex[^}]*align-items: baseline[^}]*gap: 14px/)
  assert.match(styles, /\.rail-airline-meta small \{[^}]*font-size: 14px/)
})

test('지연 항공편은 변경 출발시각을 우선하고 예정 시각을 보조 정보로 남긴다', () => {
  assert.match(source, /flight: "AF 267", airline: "AIR FRANCE"/)
  assert.match(source, /departure: "09:40", revised: "10:00", gate: "31", status: "지연 20분"/)
  assert.match(source, /\{flight\.revised \?\? flight\.departure\}/)
  assert.match(source, /예정 <s>\{flight\.departure\}<\/s>/)
  assert.match(styles, /\.operation-status\.is-delay strong \{[^}]*color: var\(--terminal-status-warning\)/)
  assert.match(styles, /\.departure-time\.is-delayed strong, \.rail-stats \.is-delayed strong \{[^}]*color: var\(--terminal-status-warning\)/)
  assert.match(styles, /\.departure-time small s, \.rail-stats em s \{[^}]*text-decoration: line-through/)
})

test('3안은 현지 시각을 공항명 아래 왼쪽 패널 오른쪽에 한 줄로 표시한다', () => {
  assert.match(source, /className="rail-local-clock"/)
  assert.doesNotMatch(source, /className="rail-current-clock"/)
  assert.doesNotMatch(source, /한국 \{kstTime\} KST/)
  assert.match(styles, /\.rail-local-clock \{[^}]*grid-row: 1[^}]*align-self: end[^}]*justify-self: end/)
  assert.match(styles, /\.rail-local-clock strong \{[^}]*font-size: var\(--terminal-type-primary-time\)/)
})

test('3안 오른쪽 예보는 진행선보다 시각·아이콘·온도가 먼저 읽히도록 확대한다', () => {
  assert.match(styles, /\.progress-clock strong \{[^}]*font-size: 34px/)
  assert.match(styles, /\.timeline-forecast time \{[^}]*font-size: 22px/)
  assert.match(styles, /\.timeline-forecast img \{[^}]*width: 84px[^}]*height: 74px/)
  assert.match(styles, /\.timeline-forecast \.weather-condition \{[^}]*font-size: 16px/)
  assert.match(styles, /\.timeline-forecast strong \{[^}]*font-size: 24px/)
  assert.match(styles, /\.rail-forecast-content > strong \{[^}]*margin-top: var\(--terminal-space-2\)/)
  assert.match(styles, /\.flight-progress \{[^}]*height: 20px/)
})

test('3안은 도착 1시간 전 보조 예보를 제거하고 5개 예보에 오른쪽 패널 전체 폭을 쓴다', () => {
  assert.doesNotMatch(source, /도착 1시간 전/)
  assert.doesNotMatch(styles, /\.pre-arrival-forecast/)
  assert.match(styles, /\.timeline \{[^}]*--forecast-left: 45px/)
})

test('페이지 표시는 승인된 원 크기·간격과 현재/전체 접근성 이름을 사용한다', () => {
  assert.match(source, /role="img"/)
  assert.match(source, /aria-label=\{`\$\{currentPage \+ 1\} \/ \$\{pageCount\} 페이지`\}/)
  assert.match(styles, /\.page-indicator i \{[^}]*width: 12px/)
  assert.match(styles, /\.page-indicator i \{[^}]*height: 12px/)
  assert.match(styles, /\.page-indicator \{[^}]*gap: 10px/)
})

test('1안은 원거리 판독이 필요한 상태·현지 시각·운항 label을 확대한다', () => {
  assert.match(styles, /\.operation-status strong \{[^}]*font-size: var\(--terminal-type-status\)/)
  assert.match(styles, /\.local-clock-main strong \{[^}]*font-size: var\(--terminal-type-primary-time\)/)
  assert.match(styles, /\.local-clock-main > span \{[^}]*font-size: 16px/)
  assert.match(styles, /\.schedule-grid span \{[^}]*font-size: 22px/)
  assert.match(styles, /\.section-label, \.arrival-time span \{[^}]*font-size: 24px/)
  assert.match(styles, /\.arrival-time strong \{[^}]*font-size: 44px/)
})

test('1안은 확대된 글자 주변에 읽기 여백을 유지한다', () => {
  assert.match(styles, /\.airline-flight-meta \{[^}]*row-gap: var\(--terminal-space-3\)/)
  assert.match(styles, /\.schedule-grid > div \{[^}]*row-gap: var\(--terminal-space-3\)/)
  assert.match(styles, /\.operation-status \{[^}]*gap: var\(--terminal-space-3\)/)
  assert.match(styles, /\.section-label \{[^}]*margin: 20px 0 14px/)
  assert.match(styles, /\.current-weather \{[^}]*column-gap: 32px/)
  assert.match(styles, /\.arrival-time \{[^}]*gap: 16px/)
  assert.match(styles, /\.arrival-time strong b \{[^}]*margin-left: 8px/)
  assert.match(styles, /\.board-forecast > div \{[^}]*gap: 6px/)
  assert.match(styles, /\.board-forecast time \{[^}]*font-size: 18px/)
  assert.match(styles, /\.board-forecast strong \{[^}]*font-size: 20px/)
  assert.match(styles, /\.board-column \{[^}]*grid-template-rows: 136px 117px 136px 232px 227px/)
})

test('1안 FLAP은 도시명과 현재 날씨 제목을 한 값으로 전환한다', () => {
  assert.match(source, /className="weather-title roll-unit flap-unit"[^>]*>\{flight\.city\} 현재 날씨<\/span>/)
  assert.doesNotMatch(source, /\{flight\.city\}<\/span>\{" "\}\s*<span className="roll-unit"[^>]*>현재 날씨<\/span>/)
  assert.match(styles, /\.weather-title \{[^}]*white-space: nowrap/)
})

test('1안은 도착 시각에 현지 시간대를 붙이고 현재 날씨에는 현지 시각만 둔다', () => {
  const clockStart = source.indexOf('<div className="current-weather-clock')
  const currentClock = source.slice(clockStart, source.indexOf('<div className="current-weather">', clockStart))

  assert.match(source, /\{flight\.arrival\}<b>\{flight\.localZone\}<\/b>/)
  assert.match(source, />\(한국 \{flight\.arrivalKst\}KST\)<\/small>/)
  assert.doesNotMatch(source, /현지 시각 · 한국 \{flight\.arrivalKst\} KST/)
  assert.match(currentClock, /<div className="local-clock-main"><span>현지 시각<\/span>\{showLocalDate && <time>\{localDate\}<\/time>\}<strong>\{localTime\}<\/strong><b>\{flight\.localZone\}<\/b><\/div>/)
  assert.doesNotMatch(currentClock, /<small>/)
  assert.doesNotMatch(currentClock, /kstDifferenceLabel|kst-difference/)
})

test('1안은 한국과 날짜가 다른 현지 시각에만 날짜를 붙인다', () => {
  assert.match(source, /const showLocalDate = localDate !== kstDate/)
  assert.match(styles, /\.current-weather-clock \{[^}]*grid-template-columns: 1fr/)
  assert.match(styles, /\.local-clock-main time \{[^}]*font-size: 14px/)
  assert.doesNotMatch(styles, /\.kst-difference/)
})
