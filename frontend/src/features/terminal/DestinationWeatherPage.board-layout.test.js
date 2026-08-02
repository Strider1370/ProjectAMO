import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./DestinationWeatherPage.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')
const simulationSource = readFileSync(new URL('./terminalFlightSimulation.js', import.meta.url), 'utf8')

test('터미널은 기존 기상 엔드포인트만 쓰는 실시간 날씨 어댑터를 화면에 연결한다', () => {
  assert.match(source, /import \{ loadTerminalLiveWeatherData, mergeTerminalLiveWeather \} from '\.\/terminalLiveData\.js'/)
  assert.match(source, /loadTerminalLiveWeatherData\(\)/)
  assert.match(source, /mergeTerminalLiveWeather\(flight, liveWeatherData\)/)
})

test('두 안의 상단 한국 시각은 fixture가 아니라 공통 실시간 시각 값을 사용한다', () => {
  assert.match(source, /function formatKoreanClock\(value\)/)
  assert.match(source, /<div className="board-header-clock"><span>\{clock\.date\}<\/span><strong>\{clock\.time\}<\/strong><\/div>/)
  assert.match(source, /<div className="rail-header-clock"><span>\{clock\.date\}<\/span><strong>\{clock\.time\}<\/strong><\/div>/)
})

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

test('두 안은 선택된 출발 공항명을 제목으로 사용한다', () => {
  assert.match(source, /function TerminalTitle\(\{ title, flightCount, destinationCount \}\)/)
  assert.equal((source.match(/<TerminalTitle title=\{title\}/g) ?? []).length, 2)
  assert.match(source, /const terminalTitle = `\$\{departureAirportState\.selected\?\.nameKo\?\.replace\('국제', ''\) \|\| '김포공항'\} 도착지 날씨`/)
  assert.doesNotMatch(source, /곧 출발하는 항공편 · 목적지 날씨|곧 출발 · 도착지 예보/)
  assert.doesNotMatch(source, /도착 현지 시간 기준 예보/)
})

test('공항별 기상 표시는 실제 목적지의 도시와 공항 고유명을 함께 써서 식별한다', () => {
  assert.match(simulationSource, /destination\('오사카', '오사카 간사이', '오사카 간사이', 'JST'/)
  assert.match(simulationSource, /destination\('베이징', '베이징 다싱', '베이징 다싱', 'CST'/)
  assert.doesNotMatch(simulationSource, /샤를 드골|싱가포르 창이|도쿄 하네다/)
})

test('1안과 3안은 한 정규화 시뮬레이션 프레임을 함께 사용한다', () => {
  assert.match(source, /const activeFlights = useMemo\(/)
  assert.equal((source.match(/activeFlights=\{activeFlights\}/g) ?? []).length, 2)
  assert.doesNotMatch(source, /boardFlightGroups|railFlightGroups|alternateBoardFlights|alternateRailFlights/)
})

test('두 안은 묶기 전 전체 운항편 수와 목적지 수를 함께 표시한다', () => {
  assert.equal((source.match(/flightCount=\{simulation\.totalFlights\}/g) ?? []).length, 2)
  assert.equal((source.match(/destinationCount=\{simulation\.totalDestinations\}/g) ?? []).length, 2)
  assert.match(source, /총 \{flightCount\}편 · \{destinationCount\}개 목적지/)
})

test('국내 항공사의 가로 워드마크 대신 심볼 전용 로고 자산을 사용한다', () => {
  assert.match(simulationSource, /logo: '\/Symbols\/airlines\/KAL-symbol\.svg'/)
  assert.match(simulationSource, /logo: '\/Symbols\/airlines\/AAR-symbol\.svg'/)
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
  assert.match(source, /className="board-header-clock"><span>\{clock\.date\}<\/span><strong>\{clock\.time\}<\/strong><\/div>/)
  assert.match(source, /className="rail-header-clock"><span>\{clock\.date\}<\/span><strong>\{clock\.time\}<\/strong><\/div>/)
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

test('다음 날은 날짜 보조 문구로 유지하고 뒤의 시각만 시각 숫자 서체를 쓴다', () => {
  assert.match(source, /const splitArrivalKst = \(value\) => value\.startsWith\("다음 날 "\)/)
  assert.match(source, /<span className="arrival-next-day">\{arrivalDayLabel\}<\/span>/)
  assert.match(styles, /\.progress-clock strong \.arrival-next-day \{[^}]*font-family: "Noto Sans KR", sans-serif/)
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
  assert.match(styles, /\.exact-board \.board-header-actions \{[^}]*top: var\(--terminal-safe-top\)[^}]*left: 60%/)
  assert.match(styles, /\.screen-footer \.header-weather-panel \{[^}]*grid-template-columns: 110px auto 50px/)
})

test('3안의 한국 시각은 1안처럼 헤더 맨 오른쪽에 고정되고 조작 콘솔과 분리된다', () => {
  assert.match(styles, /\.rail-header-clock \{[^}]*position: absolute[^}]*top: auto[^}]*right: var\(--terminal-safe-side\)[^}]*bottom: var\(--terminal-header-bottom-gap\)[^}]*left: auto/)
  assert.match(styles, /\.rail-header-actions \{[^}]*position: absolute[^}]*left: 60%/)
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

test('변경 출발시각이 들어오면 변경값을 우선하고 예정 시각을 보조 정보로 남긴다', () => {
  assert.match(source, /\{flight\.revised \?\? flight\.departure\}/)
  assert.match(source, /예정 <s>\{flight\.departure\}<\/s>/)
  assert.match(styles, /\.operation-status\.is-delay strong \{[^}]*color: var\(--terminal-status-warning\)/)
  assert.match(styles, /\.departure-time\.is-delayed strong, \.rail-stats \.is-delayed strong \{[^}]*color: var\(--terminal-status-warning\)/)
  assert.match(styles, /\.departure-time small s, \.rail-stats em s \{[^}]*text-decoration: line-through/)
})

test('같은 목적지 편명 전환은 pending 값을 선렌더하고 바뀌는 운항값만 움직인다', () => {
  assert.match(source, /classifyTerminalSlotTransition\(activeFlights\[index\], pendingFlights\[index\]\)/)
  assert.match(source, /board-page is-entering/)
  assert.match(source, /rail-page is-entering/)
  assert.match(source, /transitionKind=\{slotTransitions\[index\]\}/)
  assert.match(source, /flight-variant-value/)
  assert.match(styles, /\.board-page\.is-entering \.board-column\.is-slot-flight \{ visibility: hidden; \}/)
  assert.match(styles, /\.rail-page\.is-entering \.rail-flight-row\.is-slot-flight \{ visibility: hidden; background: transparent; \}/)
})

test('혼합 프레임은 각 슬롯에 편명·목적지·퇴장 전환 클래스를 독립 적용한다', () => {
  assert.match(source, /function terminalSlotTransitions\(activeFlights, pendingFlights\)/)
  assert.match(source, /className=\{`board-column is-slot-\$\{transitionKind\}/)
  assert.match(source, /className=\{`rail-flight-row is-slot-\$\{transitionKind\}/)
  assert.doesNotMatch(source, /isFlightOnlyTransition/)
  assert.match(styles, /\.board-column\.is-slot-stable/)
  assert.match(styles, /\.rail-flight-row\.is-slot-stable/)
})

test('1안 빈 슬롯은 카드 구조와 구분선을 함께 퇴장·진입시킨다', () => {
  assert.equal((source.match(/board-column-separator is-slot-\$\{slotTransitions\[index \+ 1\]\}/g) ?? []).length, 2)
  assert.match(styles, /\.motion-split \.board-page\.is-leaving \.board-column\.is-slot-exit \.board-band-surface \{[^}]*animation: split-flap-out/)
  assert.match(styles, /\.motion-split \.board-page\.is-entering \.board-column\.is-slot-enter \.board-band-surface \{[^}]*animation: split-flap-in/)
  assert.match(styles, /\.motion-roll \.board-page\.is-leaving \.board-column\.is-slot-exit \.board-band-surface \{[^}]*animation: vertical-roll-word-out/)
  assert.match(styles, /\.motion-roll \.board-page\.is-entering \.board-column\.is-slot-enter \.board-band-surface \{[^}]*animation: vertical-roll-word-in/)
  assert.match(styles, /\.board-page\.is-leaving \.board-column-separator\.is-slot-exit \{[^}]*animation: slot-divider-out/)
  assert.match(styles, /\.board-page\.is-entering \.board-column-separator\.is-slot-enter \{[^}]*visibility: visible[^}]*animation: slot-divider-in/)
})

test('1안 WIPE 편명 전환은 기존 운항값을 먼저 마스킹해 두 프레임이 겹치지 않는다', () => {
  assert.match(styles, /\.motion-wipe \.board-page\.is-leaving \.board-column\.is-slot-flight \.flight-variant-value \{[^}]*animation: masked-wipe-out/)
  assert.match(styles, /@keyframes masked-wipe-out \{\s*from \{ clip-path: inset\(0 0 0 0\); \}\s*to \{ clip-path: inset\(0 0 0 100%\); \}\s*\}/)
  assert.match(styles, /\.motion-wipe \.board-page\.is-entering \.board-column\.is-slot-flight \.flight-variant-value \{[^}]*animation-delay: calc\(330ms/)
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

test('3안의 시간대별 예보는 1안과 같은 시 단위 표기를 사용한다', () => {
  assert.match(source, /const displayForecastHour = \(value\) => String\(value\)\.replace\(\/\^\\d\{2\}:00\$\//)
  assert.match(source, /<time>\{displayForecastHour\(time\)\}<\/time>/)
})

test('3안은 도착 1시간 전 보조 예보를 제거하고 5개 예보에 오른쪽 패널 전체 폭을 쓴다', () => {
  assert.doesNotMatch(source, /도착 1시간 전/)
  assert.doesNotMatch(styles, /\.pre-arrival-forecast/)
  assert.match(styles, /\.timeline \{[^}]*--forecast-left: 45px/)
})

test('프레임 표시는 실제 편명 전환 프레임 수와 현재 위치를 사용한다', () => {
  assert.match(source, /role="img"/)
  assert.match(source, /aria-label=\{`\$\{currentFrame \+ 1\} \/ \$\{frameCount\} 프레임`\}/)
  assert.equal((source.match(/currentFrame=\{activeFrame\.frameIndex\}/g) ?? []).length, 2)
  assert.equal((source.match(/frameCount=\{activeFrame\.frameCount\}/g) ?? []).length, 2)
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
