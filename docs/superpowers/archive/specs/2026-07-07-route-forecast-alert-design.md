# 경로 예보변화 알림(#13) 설계

작성일: 2026-07-07 · 상태: 설계 확정(구현 대기)
근거·리서치: [route-forecast-alert-reference.md](../../design/proposals/2026-07-04-route-forecast-alert-reference.md) (ACAS 등 선례·임계값·diff 의사코드·알림피로·용량). 이 문서는 그중 **확정 결정만** 담는다.

## 1. 목적 / 범위

사용자가 **비행예정일 + 경로**를 저장해두면, 그날 전까지 **경로·시각 예보가 의미있게 나빠질 때** 알린다. 브리핑은 "지금 한 번 보는 것"인데 비행은 며칠 뒤 → 그 사이 악화를 자동 감시. (모니터링 페이지의 공항 실시간 임계 경보와 **별개** — 그건 공항·현재값, 이건 내 저장 비행·예보변화.)

**범위 안 (v1 알림 7종):**
1. 목적지 운고/시정 미니마 아래(ETA 기준)
2. 교체공항 새로 "필요" 플립(1-2-3)
3. 경로·고도·시간 신규 Convective SIGMET
4. 경로·고도·시간 severe 착빙
5. 경로·고도·시간 severe 난류
6. 출발공항 저시정(LVP) — ETD 시각
7. 출발공항 TS — ETD 시각

모두 고도필터 계획고도+4000ft. 해외 경로 동일(단 SIGMET은 `asia_firs` 범위).

**범위 밖(v2+):** 바람·측풍·돌풍 미니마(스키마 컬럼만 있음)·pilot_type 프리셋, 인플라이트 감시(CTA+2h), PIREP, 리라우팅, 해외 확장(asia_firs 밖 FIR·해외 NOTAM·해외 엔루트 격자), 자동 반복(recurrence), 상용화 항목(재배포 라이선스·면책·백테스트 등은 별도 트랙).

## 2. 전제 (이미 배포됨 — 하드 전제 충족)

- 로그인·역할(pilot/forecaster/admin), `requireAuth`/`requireRole` — 0.2.3.
- 서버 계획 저장: `routes` 테이블(`etd` 주석에 "#13 감시") + CRUD([me/routes.js](../../../backend/src/me/routes.js)).
- 개인 미니마 서버 미러: `presets` 테이블([me/presets.js](../../../backend/src/me/presets.js)) — 서버측 판정 가능.
- 브리핑 조립: `POST /api/route-briefing`(briefing-composer) — 국내(KMA)+해외(NOAA) 병합 이미 됨.
- 판정 모듈: `flight-category.js`·`taf-window.js`(alternateRequired)·`hazard-section.js`·`geo-time-match.js`·`enroute-model.js`·`planned-altitude.js`.
- 상류 변화감지: `store.js`(SHA-256).

## 3. 감시 라이프사이클

- **시작 = ETD − 2h 기본**(조종사 2~6h 선택). 6h 선택 시 KIM/KTG 모델런을 한 개 더 잡음.
- **종료 = ETD**(프리플라이트만). 각 트리거는 데이터 지평(TAF 24~30h / SIGMET 4~6h)이 비행시각에 닿을 때 자동 발화.
- **저장은 아무 때나**(며칠 전 OK), 푸시는 감시창 진입 후.
- **"이상없음" 확인 = ETD−60분** 1회(옵션).
- **활성 감시 = 사용자당 가장 임박한 예정 비행 1개만**(서버 부하·알림 폭주 방지). 겹치면 임박한 것 우선, 앞 비행 ETD 지나면 다음 감시.

## 4. 판정 · 알림 피로

- diff 엔진 규칙·의사코드·dedup·플래핑 방지(dwell 2h·히스테리시스)·알림 파라미터는 **reference 문서 §3·§4·§5·§5B** 그대로. 판정은 §2 기존 모듈 호출, 신규는 diff+severity+dedup만.
- 감시 소스 2축: 상류 게이트가 **6 store 타입 watch** — `metar`/`taf`/`sigmet`(국내) + `*_overseas`(해외).
- SIGMET 심각도 개인화 안 함 → 전역 규칙(convective/severe=푸시, moderate=인앱).
- 목표: 출발 전 실질 알림 <5건/비행.

## 5. 개인 미니마

- **사용자당 단일 {운고(ft), 시정(m)}**(공항별 아님) + VFR/IFR 프리셋(선 자동 채움).
  - VFR 프리셋: 운고 1000 / 시정 5000(IFR 진입 시 알림). IFR: 운고 500 / 시정 1600.
  - 미설정 시 VFR 프리셋 기본 적용(가장 보수적).
- **실효 미니마 = max(내 값, 그 공항 published[#8])** — 목적지 제한치가 더 높으면 높은 쪽. #8 미구현이라 v1은 내 값만.
- **저장 형태(확정, 리뷰 반영):** 배포된 `presets`는 공항별(`UNIQUE user_id,icao`)이라 단일값엔 안 맞음. v1은 **`users`에 `min_ceiling_ft`·`min_visibility_m` 컬럼 추가**(사용자당 1행, 마이그레이션 `ensureColumns` 패턴). per-airport `presets`는 알림 미니마에 **안 씀**(추후 공항별 override 필요 시 재활용). SettingsModal 미니마 탭도 단일값 입력으로 전환.

## 6. 데이터 모델

**템플릿 vs 예정 비행 — 기존 `routes` 하나, `etd` 유무로 구분:**

| 개념 | `etd` | 감시 | 수명 |
|---|---|---|---|
| 경로 템플릿 | null | 안 함 | 유지(재사용), 상한 100 |
| 예정 비행 | 있음 | ETD−2h~ETD | ETD+3h 지나면 자동삭제 |

**`routes`에 추가할 알림 컬럼**(예정 비행 행에만 의미):
```
alert_enabled, alert_start_min_before_etd(기본 120, 2~6h),
altitude_filter_ft(기본 4000), send_no_change_confirm, confirm_min_before_etd(기본 60),
eta,                         // 목적지 TAF 평가 시각. 입력값 주, 초기값=클라 etaCalc(거리·tasKt) 전송·수정가능
last_briefing_snapshot_id,   // diff 기준
expires_at                   // 감시 종료
// 미니마는 presets를 user_id로 조인
```

**신규 테이블:**
```
push_subscriptions(id, user_id, endpoint, keys(p256dh,auth), created_at)   // Phase 2
triggered_alerts(id, route_id, type, severity, target, from_val, to_val,
                 source_id, source_seq, source_issued_at, dedup_key,
                 reissue_count, detected_at, pushed_at, channel_status)
```
`type`: CATEGORY|VIS|CEIL|ALTERNATE_FLIP|ENROUTE_HAZARD|ENROUTE_ICE_TURB|WX|NO_CHANGE_CONFIRM

## 7. 전달 · 상호작용

**채널:**
| 대상 | 채널 | 단계 |
|---|---|---|
| 데스크톱 웹 | 인앱 알림센터(벨 → 누적 알림 패널) — **신규 제작**(legacy 알림 UI 재사용 안 함) | Phase 1 |
| 모바일 | Web Push(SW·manifest·web-push·VAPID·구독 UI) | Phase 2 (자리만: 테이블·발송 seam은 Phase 1) |
| 시연 | 텔레그램 봇(`sendMessage`, 네이티브 fetch, 의존성 0) | Phase 1 |
| 카카오 알림톡 · 이메일 | — | v2+ |

- **발송 seam**: diff 엔진은 채널 무관 `TriggeredAlert`만 생성, 얇은 sender가 채널 분기(과한 추상화 금지).
- **딥링크**: App.jsx 기존 pathname+쿼리 라우팅에 `?flight=<routeId>` 추가 → 그 비행 브리핑 + 변경점 하이라이트. 세션 만료 시 로그인 후 그 화면 착지. 화면 = reference §2 에스컬레이션 UX(무엇/언제·before→after·왜 알림·[전체 브리핑]·"공식 KMA 재확인").
- **문구(글랜서블)**: `RKPC 목적지 IFR 하락 · ETA 12:10 운고 400ft(내 미니마 500 아래)`. ko/en.

## 8. 프론트 구조 — 개인설정 창(탭 2)

알림 등록·관리의 **유일한 집 = 개인설정 패널**. 경로 창엔 지름길 버튼만.

- **[기상 미니마] 탭**: VFR/IFR 프리셋 + 단일 운고·시정 입력 + 저장/기본값.
- **[비행 알림] 탭**:
  - 새 알림 등록: 템플릿 선택 → ETD → ETA(입력값 주, 거리÷tasKt 러프 pre-fill, "예상·수정" 라벨). **고급(접힘 기본)**: 감시시작[2h ▾ 2~6]·이상없음 확인[off].
  - 등록 목록: 행별 경로·ETD(Z+KST) + 상태칩(대기/감시중/대기·순번#n) + [ETD 조정][삭제].
- **두 입구**: (A) 패널에서 템플릿 선택 등록 / (B) 경로 창 [이 비행 알림 등록] → **경로를 템플릿으로 자동 저장** + 패널로 넘겨 등록.
- **게이트**: 미니마 미설정=VFR 기본+힌트(비차단) · ETD 미래만·ETA>ETD · 상한 100.
- **피드백**: 토스트 "등록됨 · ETD−2h부터 감시". 삭제=즉시+undo. 같은 템플릿 여러 날짜 등록(반복비행).
- **시간대**: 저장=UTC(Z), 표시=Z+KST 병기.
- 디자인: `docs/design/design-language.md` 준수(Pretendard, accent slate `#334155`, 상태=level 토큰).

## 9. 신규 코드 (남은 것)

0. (선행 1줄) `RouteBriefingPanel.jsx` `saveRoute` 스냅샷에 `tasKt` 추가.
1. 재브리핑 스케줄러 — 상류 갱신마다 or 15~30분 정시, 활성 계획 재계산(국내+해외 게이트).
2. diff 엔진 — §4 규칙(판정은 기존 모듈 호출).
3. 인앱 알림센터 + `GET /api/me/alerts`(me/routes 패턴) + 텔레그램 발송.
4. 알림 테이블·설정 컬럼(§6) · 딥링크(`?flight=`).
5. (Phase 2) Web Push: SW·manifest·web-push·VAPID·구독.

## 10. 구현 확인사항 (리뷰로 해소 — 2026-07-07)

- ✅ **경로 저장 = 로그인 시 이미 서버 우선**([routeStore.js:18-44](../../../frontend/src/features/route-briefing/lib/routeStore.js)) — 401/네트워크 실패 시만 localStorage 폴백. "서버 승격 배선" 불필요.
- ⚠️ **`tasKt`는 route 스냅샷에 저장 안 됨** — `RouteBriefingPanel.jsx:329` `saveRoute`에 `cruiseSpeedKt` 빠짐(클라 React state·기기별 localStorage 프로파일에만 있음). **→ 스냅샷에 `tasKt` 추가**(백엔드 `snapshot`은 `z.record`라 스키마 변경 불필요). 1줄짜리 선행 태스크.
- ⚠️ **거리(`plannedDistanceNm`)도 저장 안 됨** — 클라 렌더 시 파생. **v1은 ETA를 클라에서 계산해 전송**([etaCalc.js](../../../frontend/src/features/route-briefing/lib/etaCalc.js) 이미 있음, 사용자 수정 가능) → 서버 재계산 불필요. (스펙의 "둘 다 이미 있음"은 정정: **둘 다 스냅샷엔 없고, ETA는 클라 계산값 전송으로 해결.**)
- ⚠️ **`alert-state.js`는 프론트 브라우저 코드** — 백엔드 스케줄러가 import 불가. 쿨다운/조용시간은 **알고리즘 형태만 참고, 서버측 신규 구현.**
- (Phase 2 유의) 딥링크 `?flight=`는 새 탭/새 로드엔 동작(App.jsx `useState` 초기화). 이미 열린 탭에서 SW 내비게이션(Phase 2)엔 `popstate`/메시지 리스너 필요.

## 11. Phase 구분

- **Phase 1 (시연)**: 스케줄러·diff·피로방지(두뇌) + 인앱 알림센터 + 텔레그램 + 딥링크 + 알림 테이블. **서비스워커 없이 end-to-end 시연 가능.**
- **Phase 2 (모바일 실제)**: Web Push(SW·manifest·VAPID·구독).
- **Phase 3**: 카카오 알림톡, 이메일, 바람 미니마·pilot_type, 해외 확장.
