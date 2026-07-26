# 비행계획 입력 재설계 (성능·ETD) — 설계 스펙

> 상태: 설계 승인됨(2026-06-27, 명안 2차 확정). 다음: 사용자 스펙 검토 → writing-plans.
> 성격: **프런트 전용.** EFB 입력 관례를 우리 데이터 제약(항공기 DB·AIP·NOTAM·winds 없음)에 맞춰 최적화.
> 선행: 직전 "ETD/ETA 시간 인지형 브리핑"(`briefingTime`, `computeEtaIso`, `plannedDistanceNm`, `useTimeZone`)을 **재사용·확장**한다.

## 0. 리서치 근거
`docs/superpowers/specs/refs/2026-06-27-efb-inputs-{foreflight-garmin,icao-pro,skydemon-ux}.md` 3종. 공통 결론: 빈칸 시작 금지(auto-fill→override), 속도=TAS, ETA는 파생, 고도 FL/ft+VFR힌트, 시간 Zulu 권위+빠른입력. 단 EFB는 항공기 DB로 자동채움 → 우리는 DB가 없으므로 **사용자 입력+저장**으로 대체.

## 1. 결정 (승인됨)
- **성능 프리셋 폐기.** 속도·고도는 **직접 입력**. 대신 **이름붙인 "내 항공기" 프로파일**(name + TAS + 고도)을 저장/불러오기(localStorage) + 마지막 사용값 자동 로드. → "경우의 수"는 사용자가 자기 항공기로 해결.
- **순항속도 = TAS(kt)** 라벨 명시(GS/IAS 아님). GS·연료 계산 없음(데이터 없음).
- **순항고도**: ft↔FL **단위 인식 단일 필드** + 500/1000 스테퍼 + **VFR 반구법칙 힌트**. FL 표기는 전이고도(한국 RKRR 14,000ft) 이상에서, 미만은 ft.
- **ETE 폐기.** 파생 요약 = **거리 · ETD→ETA**(ETA가 헤드라인). 무풍 ETE는 거짓정밀·중복이라 제외.
- **ETD 입력을 플랫폼별로 분리:**
  - 공통: UTC ISO 저장(기구축), `useTimeZone`(Z/현지) 따라 표시, 기본=지금(분 반올림), 상대 칩 `지금/+30분/+1시간/+2시간`.
  - **데스크톱(키보드·정밀):** 월/일 + **시각 타이핑**(HHMM→HH:mm) + 상대 칩.
  - **모바일(터치):** **오늘/내일 칩 + 시각 휠**(네이티브 `type=time` 허용) + 상대 칩.
- **ETA**: 자동 계산·읽기전용(기구축, `computeEtaIso(etd, plannedDistanceNm, TAS)`).
- **모바일 폼 = 3단계 시트 위저드**(① 경로 ② 절차 ③ 성능·시간) + 하단 고정 요약(거리·ETD→ETA) + 이전/생성. 기존 `MobileSheet` 재사용.

## 2. 컴포넌트 / 파일
- **신규** `frontend/src/features/route-briefing/lib/aircraftProfiles.js` — localStorage CRUD: `listProfiles()`, `saveProfile({name,tasKt,altitudeFt})`, `deleteProfile(name)`, `getLastUsed()`, `setLastUsed({tasKt,altitudeFt})`. 순수+테스트.
- **신규** `frontend/src/features/route-briefing/lib/altitude.js` — `formatAltitude(ft)`(≥14000→`FLxxx`, else `x,xxx ft`), `vfrCruiseHint(courseDeg)`(자북코스→홀짝+500 문자열), `stepAltitude(ft, dir)`(500/1000 스텝). 순수+테스트.
- **신규** `frontend/src/features/route-briefing/AircraftProfileField.jsx` — 내 항공기 셀렉터(불러오기 + 저장/관리).
- **신규** `frontend/src/features/route-briefing/EtdField.jsx` — `variant="desktop"|"mobile"`로 분기(타이핑 vs 휠), 상대 칩 공통. `briefingTime` 재사용.
- **수정** `useRouteBriefing.js` — 프로파일 상태/로드·저장, 상대-칩 ETD 세터, (cruiseSpeedKt·cruiseAltitudeFt·etd 기존). 출발→도착 자북코스 파생(VFR 힌트용).
- **수정** `RouteBriefingPanel.jsx` — 데스크톱: 출발/도착 → **내 항공기** → 성능·시간(고도·TAS·ETD) → **요약 strip** → 생성. 모바일: 3단계 위저드.
- **수정** `RouteBriefing.css` — 프로파일/고도/ETD/요약/위저드 스타일.

## 3. 데이터 / 파생
- 프로파일: `localStorage['amo_aircraft_profiles'] = [{name,tasKt,altitudeFt}]`, `localStorage['amo_last_perf']`.
- VFR 힌트: 출발·도착 lat/lon → 초기 대권 방위(true) → 한국 자기편차(약 8°W, 근사) → 자북코스. 0–179 홀수천+500 / 180–359 짝수천+500. **힌트만, 강제 아님.**
- ETA: 기구축 파생. 요약 strip: `거리 {plannedDistanceNm}NM · ETD {fmt} → ETA {fmt}`.

## 4. 플랫폼 동작
- **데스크톱**: 한 화면 폼(스크롤). ETD 시각=숫자 타이핑.
- **모바일**: `MobileSheet` 안 3단계, 하단 요약 고정, ETD=휠+오늘/내일.

## 5. 절대 불변 (회귀 금지)
- 백엔드·payload 불변(프런트 전용). `handleGenerateBriefing` 전송 계약(etd/eta/거리) 불변.
- 직전 ETD/ETA·tz·단면도·스모크·빌드 그린 유지. `briefing-smoke.mjs`(데스크톱) + 모바일 캡처.
- 기존 픽커(공항/SID/STAR/IAP)·스크롤연동·리본 정렬 불변.

## 6. 엣지 / 검증
- 프로파일 없음: 직접 입력(기본 120kt/9,000ft), last-used 로드. 저장은 선택.
- 고도 전이고도 경계: 14,000ft 미만 ft / 이상 FL. (한국 전이고도 14,000ft 확인 후 인코딩.)
- ETD 타이핑 유효성: HHMM 4자리 파싱, 잘못된 값 무시. 모바일 `type=time`은 HH:mm.
- 상대 칩: now/+30/+1h/+2h은 현재시각 기준 ISO 생성.
- 테스트: aircraftProfiles·altitude 순수 단위테스트(`node --test`), briefingTime 기존. UI는 스모크+캡처.

## 7. Out of scope
- winds-aloft 반영 GS/ETE, 연료. 항로 자유텍스트 입력. NOTAM 절차필터. 백엔드 변경. Mach(제트). 정밀 자기편차 모델(근사 사용).

## 8. 페이즈(계획에서 분해)
1. 순수 라이브러리(aircraftProfiles, altitude) + 테스트.
2. EtdField(데스크톱/모바일) — briefingTime 재사용.
3. AircraftProfileField + useRouteBriefing 상태(프로파일·last-used·코스).
4. RouteBriefingPanel 데스크톱 레이아웃 + 요약 strip(ETE 제거).
5. RouteBriefingPanel 모바일 3단계 위저드.
6. 검증(스모크/빌드/캡처) + 푸시.
