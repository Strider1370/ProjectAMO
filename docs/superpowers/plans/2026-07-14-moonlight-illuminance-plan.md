# 야간 지면 조도 — 구현 계획

- 스펙: [`../specs/2026-07-14-moonlight-illuminance.md`](../specs/2026-07-14-moonlight-illuminance.md) (v6)
- 작성일: 2026-07-14
- 상태: 미착수

## 0. 코드 검증 — 스펙이 틀린 곳 3개 (2026-07-14)

실제 코드를 읽고 스펙의 전제를 대조했다. **세 가지가 틀렸다. 스펙을 먼저 고친다.**

### ❌ 0-A. "공항 패널 7번째 탭" — **탭 구조가 아니다**

`AirportPanel.jsx:31` 주석: *"Phase 1: 탭 → 단일 스크롤 + 스크롤스파이 레일"*.
이미 **단일 스크롤 + 섹션(`<details class="ap-sec">`) + 좌측 레일** 구조로 바뀌었고 `현재날씨`는 해체됐다.

**실제 추가 방법 (탭이 아니라 섹션):**
1. `AirportPanel.jsx:120` `sections` 배열에 항목 1개 추가
2. `AirportPanel.jsx:29` `SECTION_ICON`에 아이콘 1개 추가 (`lucide-react`의 `Moon`)
3. 섹션은 `<details open>`로 렌더되고 레일 버튼이 자동 생성된다 — 별도 배선 불필요

섹션 순서는 **"위험도/시급성"**(`AirportPanel.jsx:31`)이다. 달빛은 위험이 아니므로 **맨 끝**(`info` 뒤).

### ❌ 0-B. `airport-panel-capture.mjs:17`의 `TABS` 배열은 **이미 낡았다**

`{ id: 'current', label: '현재날씨' }`가 남아 있는데 그 섹션은 해체됐다.
**스펙이 "이 배열에 추가하라"고 한 것은 잘못된 지시.** 이 스크립트가 아직 동작하는지부터 확인하고,
낡았다면 **이 작업 범위 밖의 별건**으로 처리한다(스코프 오염 방지).

### ❌ 0-C. `isFullFeature` 게이트 — 스펙이 언급조차 안 했다

`AirportPanel.jsx:26` `FULL_FEATURE_AIRPORTS` = 국내 8개 공항. `amos`·`info` 섹션은 이 8개에만 뜬다.

**달빛 섹션은 게이트하지 않는다.** 근거: 위경도와 시각만 있으면 계산되며 **상류 데이터가 전혀 없다.**
해외 공항에서도 그대로 동작한다. (단 고위도 가드 필요 — §2-C)

## 1. 확인된 사실 (계획의 근거)

| 항목 | 확인 결과 | 출처 |
|---|---|---|
| 공항 좌표 | **있다.** `airport.lat`, `airport.lon` | `weatherApi.js:66-72` (`coordinates` → `{lat, lon}`) |
| 시간대 | `useTimeZone()` → `tz` = `'KST'` \| `'UTC'`. 표시 시각은 이걸 따라야 함 | `TimeZoneContext.jsx:15` |
| 시각 포맷터 | `fmtKstShort(iso, tz)` 이미 있음 — 재사용 | `airport-panel/lib/formatters.js` |
| 테스트 | `node:test` + `node:assert/strict`. **npm test 스크립트 없음** → `node --test <파일>` | `shared/weather/helpers.test.js:1-2` |
| 차트 패턴 | 인라인 SVG + `viewBox` + CSS 클래스. 계산은 JS에서 | `route-briefing/VerticalProfileChart.jsx:472` |
| 토큰 | `theme/tokens.css` 와 `theme/tokens.js`의 `CSS_VARS`가 **완전히 일치해야 함** — 테스트가 `deepEqual`로 강제 | `theme/tokens.test.js:13` |
| 차트 라이브러리 | 없음 (확인) | `frontend/package.json` deps 18개 |

## 2. 단계

### 1단계 — 계산 모듈 (화면 없음)

**파일:** `frontend/src/shared/astro/illuminance.js` (신규, ~70줄)
**의존성:** `npm i suncalc --prefix frontend` (신규 1개)

스펙 §1-B(USNO Circular 171) 그대로 이식:
- `apparentAlt(h)`, `attenuation(HA)` — 태양·달 공용
- `sunIlluminance(altDeg, sk)`, `moonIlluminance(altDeg, psiRad, sk)`, `NIGHT_SKY(sk)`
- `illuminanceAt(date, lat, lon, sk=1)` → `{ sun, moon, sky, total, sunAlt, moonAlt, fraction, phase }`
- `nightSummary(eveningDate, lat, lon)` → 차트·달력이 공유 (스펙 §4-1)

> ⚠️ **suncalc 2.x는 `getPosition`·`getMoonPosition` 모두 고도를 도(°)로 반환한다. 변환 금지.**
> (이 세션에서 두 번 밟았다 — 스펙 §4-1 경고 박스)
> ⚠️ `ψ = π − 위상각` (이각). 위상각을 그대로 넣으면 보름달이 0이 된다.

**검증:** `frontend/src/shared/astro/illuminance.test.js` — `node --test`로 통과시킨다.

| 케이스 | 단언 |
|---|---|
| 태양 고도 +90° | `123000 < sun < 125000` lx |
| 태양 고도 −6° | `2 < sun < 4` lx |
| 보름달(ψ=π) 천정 | `0.35 < moon < 0.45` lx (USNO 0.425) |
| 반달/보름 비 | `< 0.10` (선형 아님 고정) |
| **아무 시각** | **`abs(sunAlt) ≤ 90` 그리고 `abs(moonAlt) ≤ 90`** ← 단위 함정 회귀 방지 |
| 달 고도 < 0 | `moon === 0` |
| 총합 | `total ≥ sun`, `total ≥ moon`, `total ≥ 0.0005` |
| 한 달치 `nightSummary` | `peakMoonLux` 최대 날짜가 보름 ±1일 |

**→ 1단계 완료 기준: 위 테스트 전부 통과. 화면 코드는 아직 0줄.**

### 2단계 — 토큰

`theme/tokens.css` **와** `theme/tokens.js`의 `CSS_VARS`에 **둘 다** 추가 (안 그러면 `tokens.test.js` 실패):
```
--surface-night: #1c2530;   /* 무월광 칸·달 아이콘 칩 배경 전용 */
--moon-lit:      #E8B54B;   /* 달 원반·달빛 곡선 전용. 이 탭의 유일한 유채색 */
```
**검증:** `node --test frontend/src/shared/theme/tokens.test.js` 통과.
그 다음 `docs/design/design-language.md` §5에 등록 (스펙 §5-D).

### 3단계 — 섹션 컴포넌트

**파일:** `frontend/src/features/airport-panel/tabs/MoonSection.jsx` + `MoonSection.css`
(디렉터리명은 `tabs/`지만 실제로는 섹션 — 기존 파일들과 같은 자리에 둔다)

구성은 스펙 §4-2 · 목업 `docs/design/moonlight-tab-mockup.html` 그대로:
1. 요약 줄 (달 모양 칩 · 등급 · 조명률 · 월출/월몰 · 최대 mlx)
2. 지면 조도 곡선 — **총 조도 + 달빛 2선**, 박명 밴드, 별빛 배경선, 로그축
3. 월간 달력 — 칸 = 하룻밤, 무월광만 반전, 막대 = log(mlx)
4. 캡션 (출처 + "맑은 하늘 기준")

**성능:** 달력 = 31일 × ~60표본 ≈ 1,900회 계산. 순수 산술이라 빠르지만
**`useMemo([icao, 표시월])` 필수** — 섹션이 `<details open>`이라 리렌더마다 재계산되면 낭비.

**시간대:** 표시 시각은 `useTimeZone()`의 `tz`를 따른다. 계산은 UTC 기준 `Date`로.

### 4단계 — 배선

`AirportPanel.jsx` 3곳:
- `SECTION_ICON`에 `moon: Moon` (lucide-react)
- `sections` 배열 **맨 끝**에 `{ id: 'moon', label: '달빛', node: <MoonSection airport={airport} /> }`
- import 추가

**게이트 없음** (§0-C). `airport.lat`/`airport.lon`이 없으면 섹션 자체를 렌더하지 않는다(방어).

### 5단계 — 브라우저 검증 (필수)

`docs/dev-server-and-capture.md` 절차를 따른다. **단일 캡처이므로 18장 baseline 매트릭스는 돌리지 않는다.**

1. `npm.cmd run dev:verify` → 서버 기동 확인
2. 포커스 Playwright 스크립트: RKSI 패널 열기 → 달빛 섹션까지 스크롤 → 캡처
3. 확인 항목:
   - 곡선 2선이 목업과 같은 모양인가 (일몰 급락 → 달빛 인수 → 새벽 급등)
   - 달력의 무월광 반전 칸이 실제 삭 근처에 오는가
   - 콘솔 에러 0
   - 모바일 폭(390px)에서 달력 7열이 깨지지 않는가 (design-language §6 터치 44px)

## 3. 하지 않을 것 (스코프 고정)

- 구름(SK) 매핑 · 지도 레이어 · 백엔드 · NVG 기준선 · 거리(슈퍼문) 보정
- `airport-panel-capture.mjs`의 낡은 `TABS` 배열 수리 (§0-B — 별건)

## 4. 미결 — 착수 전 확인 필요

1. **§0-A~C 스펙 수정을 승인하는가?** (탭 → 섹션, 게이트 없음)
2. **섹션 위치가 맨 끝이 맞는가?** 섹션 순서 원칙은 "위험도/시급성"인데 달빛은 위험이 아니다.
3. 거리(슈퍼문) 보정: 스펙 §1-F대로 **넣지 않는다**가 기본. 그대로 갈지 확인.
