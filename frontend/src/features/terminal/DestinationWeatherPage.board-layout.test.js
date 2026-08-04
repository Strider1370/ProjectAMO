import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

// 1안·3안이 쓰던 공용 조각(TerminalTitle, HeaderWeatherPanel 등)이 terminalShared.jsx로 옮겨갔다.
// 아래 검사들은 그 구현 텍스트를 그대로 찾으므로, 두 파일을 합쳐서 본다.
const source = readFileSync(new URL('./DestinationWeatherPage.jsx', import.meta.url), 'utf8')
  + '\n' + readFileSync(new URL('./terminalShared.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')
const simulationSource = readFileSync(new URL('./terminalFlightSimulation.js', import.meta.url), 'utf8')

test('터미널은 기존 기상 엔드포인트만 쓰는 실시간 날씨 어댑터를 화면에 연결한다', () => {
  assert.match(source, /import \{[^}]*loadTerminalLiveWeatherData, mergeTerminalLiveWeather \} from '\.\/terminalLiveData\.js'/)
  assert.match(source, /loadTerminalLiveWeatherData\(\)/)
  assert.match(source, /mergeTerminalLiveWeather\(flight, liveWeatherData\)/)
})

test('1안의 상단 한국 시각은 fixture가 아니라 공통 실시간 시각 값을 사용한다', () => {
  assert.match(source, /function formatKoreanClock\(value\)/)
  assert.match(source, /<div className="board-header-clock"><span>\{clock\.date\}<\/span><strong>\{clock\.time\}<\/strong><\/div>/)
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
  // 도착 줄의 제목은 사용자가 정한 `목적지 공항 예보`다. 국내·국제가 같은 문구를 쓴다.
  assert.match(source, />목적지 공항 예보</)
  assert.match(source, /현재 날씨/)
  // 스펙 5.1이 금지하는 것은 `출발 예정`을 고정 label로 쓰는 것이다.
  // 빈 화면 안내문의 "더 이상 출발 예정인 항공편이 없습니다"는 label이 아니라 문장이라 해당하지 않는다.
  assert.doesNotMatch(source, />출발 예정<|>도착 예정</)
})

test('1안은 선택된 출발 공항명을 제목으로 사용한다', () => {
  assert.match(source, /function TerminalTitle\(\{ title \}\)/)
  assert.equal((source.match(/<TerminalTitle title=\{title\}/g) ?? []).length, 1)
  assert.match(source, /const terminalTitle = `\$\{departureAirportState\.selected\?\.nameKo\?\.replace\('국제', ''\) \|\| '김포공항'\} 가는 곳 날씨`/)
  assert.doesNotMatch(source, /곧 출발하는 항공편 · 목적지 날씨|곧 출발 · 도착지 예보/)
  assert.doesNotMatch(source, /도착 현지 시간 기준 예보/)
})

test('공항별 기상 표시는 실제 목적지의 도시와 공항 고유명을 함께 써서 식별한다', () => {
  assert.match(simulationSource, /destination\('오사카', '오사카 간사이', '오사카 간사이', 'JST'/)
  assert.match(simulationSource, /destination\('베이징', '베이징 다싱', '베이징 다싱', 'CST'/)
  assert.doesNotMatch(simulationSource, /샤를 드골|싱가포르 창이|도쿄 하네다/)
})

test('1안은 정규화 시뮬레이션 프레임을 그대로 사용한다', () => {
  // 2안·3안은 도시 단위 프레임(destinationFrames)을 쓰고, 1안만 activeFlights를 쓴다.
  assert.match(source, /const activeFlights = useMemo\(/)
  assert.equal((source.match(/activeFlights=\{activeFlights\}/g) ?? []).length, 1)
  assert.doesNotMatch(source, /boardFlightGroups|railFlightGroups|alternateBoardFlights|alternateRailFlights/)
})

test('제목은 공항명만 적고 편수·목적지 수는 붙이지 않는다', () => {
  // 승객이 볼 안내판에 집계 숫자는 필요 없다. 화면에 몇 편이 떠 있는지는 눈으로 보면 안다.
  assert.doesNotMatch(source, /총 \{flightCount\}편|개 목적지/)
  assert.doesNotMatch(source, /flightCount|destinationCount/)
})

test('국내 항공사의 가로 워드마크 대신 심볼 전용 로고 자산을 사용한다', () => {
  assert.match(simulationSource, /logo: '\/Symbols\/airlines\/KAL-symbol\.svg'/)
  assert.match(simulationSource, /logo: '\/Symbols\/airlines\/AAR-symbol\.svg'/)
  assert.ok(existsSync(new URL('../../../public/Symbols/airlines/KAL-symbol.svg', import.meta.url)))
  assert.ok(existsSync(new URL('../../../public/Symbols/airlines/AAR-symbol.svg', import.meta.url)))
})

test('두 안은 터미널 전용 토큰으로 공통 시각 언어를 공유한다', () => {
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-type-screen-title: 48px[^}]*--terminal-type-destination: 59px[^}]*--terminal-type-flight-number: 56px/)
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-space-2: 8px[^}]*--terminal-space-4: 16px[^}]*--terminal-space-5: 24px/)
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-border: #cbd2dc[^}]*--terminal-status-success: #168b45/)
  assert.match(styles, /\.board-header h1 \{[^}]*font-size: var\(--terminal-type-screen-title\)/)
})

test('사이니지 숫자·보조 라벨·단위·안전영역은 원거리 판독을 우선한다', () => {
  assert.match(styles, /\.exact-screen \{[^}]*--terminal-safe-side: 60px[^}]*--terminal-safe-top: 32px[^}]*--terminal-safe-bottom: 32px[^}]*font-feature-settings: "tnum" 1[^}]*font-variant-numeric: tabular-nums/)
  // 위 14px + 제목 48px + 아래 28px = 헤더 90px. 제목을 키운 만큼 위 여백에서 덜어냈다.
  assert.match(styles, /\.board-header \{[^}]*padding: 14px var\(--terminal-safe-side\) 0/)
  assert.match(styles, /\.board-header h1 \{[^}]*line-height: 1/)
  assert.match(styles, /\.screen-footer \{[^}]*padding: 0 var\(--terminal-safe-side\) 22px/)
  assert.match(styles, /\.page-indicator \{[^}]*bottom: var\(--terminal-safe-bottom\)/)
  assert.match(styles, /\.airline-block span \{[^}]*color: #526176/)
  assert.match(styles, /\.temperature \.weather-condition \{[^}]*font-size: 16px/)
  assert.match(styles, /\.board-forecast \.weather-condition \{[^}]*font-size: 16px/)
  assert.match(source, /const displayTemperature = \(value\) => String\(value\)\.replace\("℃", "°C"\)/)
  assert.match(source, /\{displayTemperature\(temp\)\}/)
  assert.match(source, /<small>°C<\/small>/)
})

test('1안의 한국 시각은 날짜·요일·시각만 한 줄로 간결하게 표시한다', () => {
  assert.match(source, /className="board-header-clock"><span>\{clock\.date\}<\/span><strong>\{clock\.time\}<\/strong><\/div>/)
  assert.doesNotMatch(source, /한국 시각/)
  assert.doesNotMatch(source, /2026-07-30 \(목\) · KST/)
})

test('1안의 상단 날짜·시각은 현지 시각과 같은 숫자 서체로 맞추고 날짜도 충분히 크게 표시한다', () => {
  assert.match(styles, /\.board-header-clock span \{[^}]*font-family: var\(--terminal-font-time\)[^}]*font-size: 24px/)
  assert.match(styles, /\.board-header-clock strong \{[^}]*font-family: var\(--terminal-font-time\)[^}]*font-size: 36px/)
})

test('1안의 제목과 날짜·시각은 헤더 하단선에서 같은 여백을 두고 현재 날씨 설명은 아이콘의 시각 중심을 따른다', () => {
  assert.match(styles, /--terminal-header-bottom-gap: 28px/)
  assert.match(styles, /\.board-header h1 \{[^}]*align-self: end[^}]*margin-bottom: var\(--terminal-header-bottom-gap\)/)
  assert.match(styles, /\.board-header-clock \{[^}]*position: absolute[^}]*top: auto[^}]*right: var\(--terminal-safe-side\)[^}]*bottom: var\(--terminal-header-bottom-gap\)[^}]*left: auto/)
  assert.match(source, /weather-condition--\$\{type\}/)
  assert.match(styles, /\.temperature \.weather-condition--cloud, \.temperature \.weather-condition--cloudy \{ transform: translateX\(-7px\); \}/)
  assert.match(styles, /\.temperature \.weather-condition--partly, \.temperature \.weather-condition--sun \{ transform: translateX\(-14px\); \}/)
})

test('1안은 시각·기간·예보 시각만 현지 시각과 같은 숫자 서체를 쓰고 다른 숫자 정보는 유지한다', () => {
  assert.match(styles, /--terminal-font-time: "Roboto Mono", monospace/)
  assert.match(styles, /\.departure-time strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.arrival-time strong \{[^}]*font-family: var\(--terminal-font-time\)/)
  assert.match(styles, /\.board-forecast time \{[^}]*font-family: var\(--terminal-font-time\)/)
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

test('터미널은 프로젝트의 기상이 마스코트와 목적지 공항 상세 날씨 안내를 사용한다', () => {
  assert.match(source, /src="\/gisang-i\/clear_3_avatar\.png" alt="항공기상청 기상이"/)
  assert.match(source, /href="https:\/\/amo\.kma\.go\.kr\/weather\/airport\.do"/)
  assert.match(source, /<strong>목적지 공항 상세 날씨<\/strong>/)
  // 제목과 아래 정렬을 공유하므로 상자 높이가 같아야 시각 중심이 겹친다.
  assert.match(styles, /\.agency-mascot \{[^}]*width: 54px; height: 48px/)
  assert.match(styles, /\.agency-mascot \{[^}]*align-self: end[^}]*margin-bottom: var\(--terminal-header-bottom-gap\)/)
})

test('기관 안내는 하단 우측 QR로, 페이지 표시는 하단 중앙으로 배치한다', () => {
  assert.match(source, /import airportWeatherQr from "\.\/assets\/airport-weather-qr\.svg"/)
  assert.match(source, /className="header-weather-panel"/)
  assert.match(source, /src=\{airportWeatherQr\}/)
  assert.match(styles, /\.page-indicator \{[^}]*top: auto[^}]*bottom: var\(--terminal-safe-bottom\)/)
  assert.match(styles, /\.board-header-clock \{[^}]*justify-self: end/)
  // 왼쪽에 운항정보 출처, 오른쪽에 항공기상청 안내. 기준 시각은 상단 시계와 겹쳐 내렸다.
  assert.match(styles, /\.screen-footer \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(source, /한국공항공사 실시간 운항정보/)
  assert.doesNotMatch(source, /screen-footer-clock|KST 기준/)
  assert.match(styles, /\.screen-footer \{[^}]*padding: 0 var\(--terminal-safe-side\) 22px/)
  assert.match(styles, /\.screen-footer \.header-weather-panel \{[^}]*grid-template-columns: 50px auto 110px/)
})

test('1안의 시험용 조작은 설정창으로 내리고 기관 워드마크는 하단 QR 왼쪽에 둔다', () => {
  // source는 DestinationWeatherPage.jsx + terminalShared.jsx다. 2안·3안(WeatherFirstScreen·
  // WeeklyWeatherScreen)은 각자 파일이라 여기 안 잡히고, 1안(BoardScreen)만 남아 개수가 1이다.
  assert.match(source, /import amoWordmark from "\.\/assets\/amo-wordmark\.png"/)
  assert.equal((source.match(/<HeaderWeatherPanel showWordmark \/>/g) ?? []).length, 1)
  // 출발 공항·화면안·전환 효과·다음 항공편은 헤더가 아니라 설정창 안에 있다.
  assert.equal((source.match(/<TerminalSettings>/g) ?? []).length, 1)
  assert.doesNotMatch(source, /board-header-actions|rail-header-actions/)
  // 안내판 정보 영역 바깥 모서리에서, 평소에는 거의 보이지 않는다.
  assert.match(styles, /\.terminal-settings \{[^}]*position: absolute[^}]*bottom: 10px[^}]*left: 10px/)
  assert.match(styles, /\.terminal-settings summary \{[^}]*opacity: \.35/)
  assert.match(styles, /\.screen-footer \.header-weather-panel \{[^}]*grid-template-columns: 50px auto 110px/)
})

test('지연·탑승구 변경은 지금 유효한 값 하나만 보여준다', () => {
  // 공항공사 API도 값 하나에 `지연`·`탑승구 변경`이라는 상태 단어를 따로 주는 구조다.
  // 옛 값을 같은 칸에 나란히 두면 어느 쪽이 유효한지 헷갈린다.
  assert.match(source, /<strong[^>]*>\{flight\.revised \?\? flight\.departure\}<\/strong>/)
  assert.match(source, /const isGateChanged = flight\.status === GATE_CHANGED_STATUS/)
  assert.match(source, /className=\{`gate-value\$\{isGateChanged \? " is-changed" : ""\}`\}/)

  // 옛 값을 함께 보여주던 표기가 남아 있으면 안 된다.
  assert.doesNotMatch(source, /예정 <s>\{flight\.departure\}<\/s>/)
  assert.doesNotMatch(source, /에서 변경/)
  assert.doesNotMatch(source, /change-mark/)
  assert.doesNotMatch(source, /delayMinutes/)
  assert.doesNotMatch(styles, /\.change-mark/)

  // 바뀌었다는 사실은 색과 상태 단어가 알린다.
  assert.match(styles, /\.operation-status\.is-delay strong \{[^}]*color: var\(--terminal-status-warning\)/)
  assert.match(styles, /\.departure-time\.is-delayed strong \{[^}]*color: var\(--terminal-status-warning\)/)
  assert.match(styles, /\.gate-value\.is-changed strong \{[^}]*color: var\(--terminal-status-warning\)/)
})

test('1안은 같은 목적지 편명 전환에서 pending 값을 선렌더하고 바뀌는 운항값만 움직인다', () => {
  assert.match(source, /classifyTerminalSlotTransition\(activeFlights\[index\], pendingFlights\[index\]\)/)
  assert.match(source, /board-page is-entering/)
  assert.match(source, /transitionKind=\{slotTransitions\[index\]\}/)
  assert.match(source, /flight-variant-value/)
  assert.match(styles, /\.board-page\.is-entering \.board-column\.is-slot-flight \{ visibility: hidden; \}/)
})

test('1안 혼합 프레임은 각 슬롯에 편명·목적지·퇴장 전환 클래스를 독립 적용한다', () => {
  assert.match(source, /function terminalSlotTransitions\(activeFlights, pendingFlights\)/)
  assert.match(source, /className=\{`board-column is-slot-\$\{transitionKind\}/)
  assert.doesNotMatch(source, /isFlightOnlyTransition/)
  assert.match(styles, /\.board-column\.is-slot-stable/)
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

test('1안도 배지로 공동운항 사실을 알린다 - 현재 날씨와 공동운항 표시', () => {
  assert.match(source, /<dt>체감<\/dt>[\s\S]*<dt>습도<\/dt>[\s\S]*<dt>바람<\/dt>/)
  // 편명이 3초마다 도는 이유를 알려주는 배지는 1안에 있어야 한다.
  // 2안·3안(terminalShared.jsx의 FlightRow, 2안·3안이 함께 쓴다)도 같은 배지를 재사용해 둘이 됐다.
  assert.equal((source.match(/className="codeshare-badge"/g) ?? []).length, 2)
  // 비행시간은 뺐다. 같은 노선이면 세 행에 같은 숫자가 반복된다.
  assert.doesNotMatch(source, /예상 비행시간|>비행시간</)
})

test('1안의 프레임 표시는 실제 편명 전환 프레임 수와 현재 위치를 사용한다', () => {
  // PageIndicator는 1안(BoardScreen)만 쓴다. 2안·3안은 도시 단위로 넘어가 편명 전환 프레임이 없다.
  assert.match(source, /role="img"/)
  assert.match(source, /aria-label=\{`\$\{currentFrame \+ 1\} \/ \$\{frameCount\} 프레임`\}/)
  assert.equal((source.match(/currentFrame=\{activeFrame\.frameIndex\}/g) ?? []).length, 1)
  assert.equal((source.match(/frameCount=\{activeFrame\.frameCount\}/g) ?? []).length, 1)
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

test('1안은 해외 목적지에만 시간대와 현지 시각을 붙인다', () => {
  const clockStart = source.indexOf('<div className="current-weather-clock')
  const currentClock = source.slice(clockStart, source.indexOf('<div className="current-weather">', clockStart))

  // 목적지가 한국이면 KST를 덧붙이지 않는다. 화면 전체가 이미 그 기준이라 군더더기다.
  assert.match(source, /const isDomesticDestination = flight\.localZone === "KST"/)
  // 도착 시각은 국내선만 적는다. 국제선은 현지 시각·시차 때문에 오히려 헷갈려 비워 둔다.
  assert.match(source, /\{hasArrivalTime && isDomesticDestination && <strong className=\{`arrival-time-value/)
  assert.doesNotMatch(source, /\{flight\.arrival\}\{!isDomesticDestination && <b>\{flight\.localZone\}<\/b>\}/)
  // 목적지가 한국이면 도착 시각 옆 KST도 붙이지 않는다.
  assert.doesNotMatch(source, /\(한국 \{flight\.arrivalKst\}KST\)/)
  assert.match(source, /\{showLocalClock && <div className="current-weather-clock/)
  // 시차를 모르면 `현지 시각 미정`이 되므로 아예 내린다.
  assert.match(source, /const showLocalClock = Boolean\(flight\.localZone\) && !isDomesticDestination/)

  assert.match(currentClock, /<div className="local-clock-main"><span>현지 시각<\/span>\{showLocalDate && <time>\{localDate\}<\/time>\}<strong>\{localTime\}<\/strong><b>\{flight\.localZone\}<\/b><\/div>/)
  assert.doesNotMatch(currentClock, /<small>/)
  assert.doesNotMatch(currentClock, /kstDifferenceLabel|kst-difference/)
})

test('1안의 예보 줄 제목은 도착 시각 유무와 무관하게 표시하고 도착 시각은 국내선만 오른쪽에 붙인다', () => {
  assert.match(source, /<span className="arrival-forecast-label roll-unit"[^>]*>목적지 공항 예보<\/span>/)
  assert.match(source, /\{hasArrivalTime && isDomesticDestination && <strong className=\{`arrival-time-value/)
  // 제목은 왼쪽, 시각은 오른쪽 끝에 붙는다.
  assert.match(styles, /\.arrival-time \{[^}]*justify-content: space-between/)
  assert.match(styles, /\.arrival-forecast-label \{[^}]*font-weight: 700/)
  assert.doesNotMatch(source, />도착 예정<|>예상 도착</)
})

test('1안은 한국과 날짜가 다른 현지 시각에만 날짜를 붙인다', () => {
  assert.match(source, /const showLocalDate = localDate !== kstDate/)
  assert.match(styles, /\.current-weather-clock \{[^}]*grid-template-columns: 1fr/)
  assert.match(styles, /\.local-clock-main time \{[^}]*font-size: 14px/)
  assert.doesNotMatch(styles, /\.kst-difference/)
})

test('화면 갱신 주기는 수집 주기와 같은 1분이다', () => {
  // 수집기가 1분마다 도는데 화면이 5분이면 지연·탑승구 변경이 최대 5분 늦게 뜬다.
  assert.match(source, /window\.setInterval\(refresh, 60 \* 1000\)/)
  assert.doesNotMatch(source, /setInterval\(refresh, 5 \* 60 \* 1000\)/)
})

test('목적지 공항 예보 제목은 도착 시각 유무와 무관하게 같은 높이에 놓인다', () => {
  // min-height가 없으면 도착 시각(44px)이 없는 국제선 칸만 제목 칸이 낮아져
  // 세 열의 예보 시작 위치가 어긋난다. 12px + 44px = 56px가 그 높이다.
  assert.match(styles, /\.arrival-time \{[^}]*min-height: 56px/)
  assert.match(styles, /\.arrival-time-value \{[^}]*line-height: 1/)
  assert.match(styles, /\.arrival-forecast-label \{[^}]*line-height: 1/)
})

test('고정 라벨은 값이 한 줄 늘어나도 움직이지 않는다', () => {
  // 스펙 10.1. 가운데 정렬이면 지연(예정 시각)이나 탑승구 변경(이전 번호)이 붙는 순간
  // 묶음이 길어지면서 `출발`·`탑승구` 라벨이 위로 밀린다. 실측으로 9px, 14px 움직였다.
  assert.match(styles, /\.schedule-grid > div \{[^}]*align-content: start/)
  assert.doesNotMatch(styles, /\.schedule-grid > div \{[^}]*align-content: center/)
})

test('목적지 공항 예보 제목은 형제 섹션과 같은 위치에서 시작한다', () => {
  // 위 칸 `현재 날씨`의 구조를 그대로 따른다.
  //   .current-weather-heading { align-items: start }
  //     .section-label         { margin-top: 20px }   작은 제목
  //     .current-weather-clock { margin-top: 12px }   큰 숫자
  // 아래끝 정렬을 쓰면 44px짜리 도착 시각에 끌려 제목이 구분선에서 40px까지 내려간다.
  assert.match(styles, /\.current-weather-heading \{[^}]*align-items: start/)
  assert.match(styles, /\.section-label \{[^}]*margin: 20px 0 14px/)
  assert.match(styles, /\.arrival-time \{[^}]*align-items: start/)
  assert.match(styles, /\.arrival-forecast-label \{[^}]*margin-top: 20px/)
  assert.match(styles, /\.arrival-time-value \{[^}]*margin-top: 12px/)
  assert.match(styles, /\.board-forecast \{[^}]*margin-top: 14px/)
})

test('화면 전체를 1920px 캔버스로 그리고 배율로 맞춘다', () => {
  // px 고정 배치라 배율이 없으면 1920x1080에서만 맞는다. 1366x768에서는 예보가 통째로 잘렸다.
  assert.match(source, /import \{ terminalCanvasScale \} from '\.\/terminalCanvasScale\.js'/)
  assert.match(source, /window\.addEventListener\("resize", onResize\)/)
  assert.match(source, /"--terminal-canvas-scale": canvasScale/)
  assert.match(styles, /\.exact-screen \{[^}]*width: 1920px/)
  assert.match(styles, /\.exact-screen \{[^}]*height: calc\(100vh \/ var\(--terminal-canvas-scale, 1\)\)/)
  assert.match(styles, /\.exact-screen \{[^}]*transform: scale\(var\(--terminal-canvas-scale, 1\)\)/)
  assert.match(styles, /\.exact-screen \{[^}]*transform-origin: top left/)
  // 뷰포트에 맞춰 늘리던 예전 방식이 남아 있으면 두 규칙이 싸운다.
  assert.doesNotMatch(styles, /\.exact-screen \{[^}]*aspect-ratio: 16 \/ 9/)
})

test('1안 공동운항 편명 전환은 화면 전환과 같은 FLAP으로 뒤집는다', () => {
  assert.match(source, /const isCodeshare = rawFlight\.codeshares\?\.length >= 2/)
  assert.match(source, /const flap = isCodeshare \? " codeshare-flap" : ""/)
  // 공동운항편이 아니면 key가 0으로 고정돼 3초마다 헛도는 재마운트가 없다.
  assert.match(source, /const flapKey = isCodeshare \? codeshareTurn : 0/)
  assert.equal((source.match(/key=\{`(logo|flight|airline)-\$\{flapKey\}`\}/g) ?? []).length, 3)
  assert.match(styles, /\.board-page:not\(\.is-entering\):not\(\.is-leaving\) \.flap-unit\.codeshare-flap \{[^}]*animation: split-flap-in 420ms/)
  assert.match(styles, /\.board-page:not\(\.is-entering\):not\(\.is-leaving\) \.flap-unit\.codeshare-flap \{[^}]*animation-delay: calc\(var\(--item, 0\) \* 60ms\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.board-page \.flap-unit\.codeshare-flap \{ animation: none !important; \}/)
})

test('1안 공동운항편은 배지로 사실을, 아래 점으로 순번을 알린다', () => {
  assert.match(source, /const shareIndex = isCodeshare \? codeshareTurn % rawFlight\.codeshares\.length : 0/)
  assert.match(source, /<b className="codeshare-badge">공동운항<\/b>/)
  // 점만으로는 뜻을 못 읽는다. 읽어주는 기기에는 개수와 순번을 문장으로 준다.
  assert.match(source, /aria-label=\{`공동운항 편명 \$\{rawFlight\.codeshares\.length\}개 중 \$\{shareIndex \+ 1\}번째`\}/)
  assert.match(source, /className=\{index === shareIndex \? "is-current" : undefined\}/)
  // 공동운항편이 아닌 칸에는 배지도 점도 없다.
  assert.match(source, /\{isCodeshare && \(\s*<span className="codeshare-badge-group">/)
  assert.match(styles, /\.airline-flight-line \{[^}]*display: flex[^}]*align-items: center/)
  // 편명 옆에 두면 글자 수가 바뀔 때마다 배지가 흔들린다. 칸 오른쪽 끝에 고정한다.
  assert.match(styles, /\.codeshare-badge-group \{[^}]*display: grid[^}]*margin-left: auto[^}]*row-gap: 9px/)
  assert.match(styles, /\.codeshare-badge \{[^}]*font-size: 20px/)
  assert.match(styles, /\.codeshare-dots i\.is-current \{[^}]*background: #071735/)
})
