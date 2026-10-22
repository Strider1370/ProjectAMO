# 지도형 브리핑 · 진행 상황 (2026-10-20)

다른 세션에서 이어받을 때 이 문서부터 읽고, 이어서 아래 순서로 읽는다.
1. 이 문서 — 단계별 완료 내역, 사용자와 정한 것, 로컬 시험 자료·확인 방법, 남은 일, 다음 할 일.
2. 구현 계획 [plans/2026-10-20-map-briefing-implementation.md](../plans/2026-10-20-map-briefing-implementation.md) — 다음 단계 본문, 그리고 끝난 단계마다 "실제로 한 것"(계획과 달라진 점).
3. 설계 [specs/2026-10-20-map-briefing-design.md](../specs/2026-10-20-map-briefing-design.md) — §2.1·§2.2(시안 이후 바뀐 결정, 이쪽이 우선), 다음 단계에 해당하는 §3, §9 열린 질문(건드리지 않음).
4. 최종 시안 `docs/design/mockups/2026-10-20-map-briefing-v8.html` — 다음 단계에 해당하는 상태 버튼.

## 한 일
1. **운영 사이트 신규 사용자 테스트** → [docs/research/2026-10-20-live-site-new-user-test.md](../../research/2026-10-20-live-site-new-user-test.md)
   - 발견 24건(F1~F24), 인터뷰 질문, 기능별 개선(P0~P2).
   - P0: F1(위험 없음 문구와 SEVERE 난류 공존), F3(총 거리에서 SID·STAR 누락 → ETA 틀림).
2. **사용자 인터뷰 준비**(문서화는 안 함, 결론만): 일반 질문 9개로 압축, 진행 순서는 "짧은 소개 → 몸풀기 → 최근 비행 이야기로 시작해 질문 채우기 → 사이트 체험 → 마무리". 사전 안내는 사이트 주소 + 과제 1개("자주 가는 노선 하나로 내일 비행 괜찮을까 확인") + 떠올려 올 것 2개만.
3. **지도형 브리핑 화면 설계** → [specs/2026-10-20-map-briefing-design.md](../specs/2026-10-20-map-briefing-design.md)
4. **시안** → `docs/design/mockups/2026-10-20-map-briefing*.html`
   - **v8이 최종.** 상단 버튼으로 상태 전환(기본, 막대 누름 순항/접근, 단면 확대, 막대 접힘, 단면 접힘, 카드 펼침, 출발 카드 상세, 패널 끔, 자료 없음, 경보·교체·태풍 예시).
   - v1~v7은 검토 이력: v1 배치안·표시안 비교 / v2 작은 패널+막대 / v3·v4 1920×1080 상세 / v5 기능 보강 / v6 덜어내기 / v7 기존 연직단면도 UI·따로 접기·막대 누름 / v8 현상별 줄+예보관 틀·브리핑 버튼.
   - 보기: `cd docs/design/mockups && python3 -m http.server 8765` 후 `http://localhost:8765/2026-10-20-map-briefing-v8.html`.
   - 시안의 실제 값과 예시 구분은 각 시안 하단에 적혀 있음(오늘 실제 자료에 없는 공항경보·윈드시어·태풍·교체공항·대류·과거 METAR·TAF 변경은 예시).

## 주요 결정 (자세한 건 spec §2)
- 지도형 기본 + 문서형 전환, 1280px 이상만.
- 화면이 스스로 움직이지 않음(시간·고도·과거 보기는 사용자 조작).
- 위험 막대: 현상별 줄(난류·착빙·대류·태풍, 걸린 것 없으면 숨김), 모델 = 글자 없는 색 막대, 예보관 SIGMET = 테두리 틀(AIRMET 제외). MOD 이상만. (spec §2.1·§2.2)
- 막대 누름: 경로 하이라이트 + 해당 레이어 켜기, 고도·시간은 그대로.
- 연직단면도는 지도형에서 압축 모드(spec §2.2), 막대와 따로 접기, 확대 연동 대신 테두리 창.
- 고도 슬라이더: 모델 위험은 칠하고, 예보관 발표는 테두리, 비행 범위는 축을 감싸는 상자.
- 공항 카드: 접힘 3줄 기본, TAF ±1h, METAR·TAF ◀▶ 과거 보기, 경보·윈드시어·NOTAM 깃발, 상세(AMOS·이륙예보).
- 상단 버튼 [항공정보·기상정보·브리핑], 브리핑 중 연직단면도 버튼 숨김.
- 범위 밖: 낙뢰, SIGWX, 화산재, 개황, 따라가기, 휴대폰 지도형.

## 개편 전에 먼저 고친 것 (2026-10-20)
테스트 발견 중 F2·F3·F4·F5·F6·F7·F8·F11·F12와 고도 비교 단면 경로선 색을 먼저 고쳐 커밋(594ff465~be11e3f0). F3이 끝났으므로 구현 계획 1단계는 완료. F1(위험 없음 문구)은 계획 2단계에서.
- 남은 문제: 브라우저 계약 `briefing-view` "renders route weather legs"가 `.cs-toggle`을 못 찾아 실패 — 수정 전 HEAD에서도 같음(10-16 단면도 통합 이후 계약이 안 따라감).

## 로컬 시험 자료 (2026-10-20)
- 운영 서버에서 읽기만 해서 받은 자료: `.artifacts/prod-data-20261020/` (git 무시). KIM 10-20 00Z 회차 hf9~15(18~24시 KST, kr+ea, GKTG·ACI·권계면 포함, raw·map-bin 제외)와 11:25Z 실황 최신본(METAR·TAF·SIGMET 2·AIRMET 1 등). 없는 고정 자료는 `backend/data`로 링크, DB는 복사본.
- 실행: `DATA_PATH=$PWD/.artifacts/prod-data-20261020 npm run dev:test` (자동수집 꺼짐 → 기상청 호출 없음). 브리핑은 RKSI→RKPC, ETD 10-20 20:30 KST, FL250이면 난류 MOD·SIGMET SEV TURB(내 고도)·SEV ICE(다른 고도)·AIRMET SFC VIS가 나온다.
- 받는 방법: `ssh -i ~/.ssh/key.pem ec2-user@3.34.113.37`에서 `rsync`로 `kim_nwp_ea`·`kim_nwp`를 시간 필터(`--include='hf009*' --include='hf01[0-5]*' --exclude='hf[0-9][0-9][0-9]*' --exclude=raw/ --exclude=map-bin/`)로.

## 3단계 완료 (2026-10-20)
지도형 브리핑 화면(패널·위험 막대·단면 독)이 폭 1280 이상에서 기본으로 열린다. 사용자와 실제 화면을 보며 여러 번 고쳤고, 계획·설계와 달라진 점은 [spec §2.2](../specs/2026-10-20-map-briefing-design.md)와 계획 3단계 "실제로 한 것"에 정리했다. 요약:
- 독은 뜬 카드, 단면 높이 화면 30%(최소 280), 높이 손잡이 없음, 독 전체 접기 탭.
- 위험 막대: 빈 줄 숨김, AIRMET 제외, 막대는 글자 없이 범례 색, SIGMET 틀은 단면 상자와 같은 구간, 자료 없음 빗금.
- 지도형 단면: 범례는 머리 줄 가운데, 레이어는 왼쪽 칸, 미니맵 등 제거, 가로축 정렬, NWP 시각 레일 유지.
- 브리핑 중 시간 막대 28px, 현재 시각 줄·재생 버튼 숨김.
- 열린 질문(spec §9): 브리핑 단면도에 비행 시간 밖 SIGMET을 그릴지.

## 4단계 완료 (2026-10-21) — a9c5a85c · 57bfd4cd · 4e8b2c2e
경로 위 위험 색 띠, 막대·틀 가리키기/누르기(구간 강조·이름표·레이어 켜기·안내·기상정보 배지), 팝오버("지도·고도·시간 맞추기", 10-22 정리), SIGMET 마우스 올림 강조(단면 상자 ↔ 위험 막대 틀 ↔ 지도 면). 달라진 점은 계획 4단계 "실제로 한 것".
- 코드 위치: `map-briefing/briefingMapLayers.js`(띠·강조·이름표, 거리→좌표), `useBriefingMapLink.js`(MapView가 부르는 훅), `HazardPopover.jsx`, `mapBriefingModel.js`(`selectionDetail`·`focusTarget`·`layerToastText`·`pickRibbonTarget`·`hazardLineColor`), `lib/hazardLayers.js` `ribbonItemLayers`, `lib/profileAdvisoryFocus.js`, `advisoryLayers.js` `setAdvisoryHighlight`.
- 사용자 검토 후 고친 것:
  - 57bfd4cd: 출발 구간 강조가 경로 밖에 그려짐 → 지도 preview 선(SID·STAR 없는 직선) 대신 **연직단면도 경로 축(`verticalProfile.axis.samples`)**으로 자른다. 위험 막대 거리와 같은 축.
  - 4e8b2c2e: 브리핑 중 기상·항공 레이어 패널이 독 아래로 들어가 아래 버튼을 못 누름 → 독(+범례 줄) 위에서 끝나고 안쪽 스크롤.
- 사용자와 확인한 결정: 막대를 눌러도 **지도 확대·고도 변경 없음**(spec §3.3 그대로, "화면이 스스로 움직이지 않는다"). 지금 레이어가 순항고도가 아닌 기압면으로 그려지는 것(예: FL390 브리핑에 "FL270")은 5단계에서 슬라이더 기본값 = 순항고도로 풀린다.
- 실제 화면 확인 방법(운영 자료): `DATA_PATH=$PWD/.artifacts/prod-data-20261020 npm run dev:test` 후 Playwright로 1920×1080, `page.clock.setFixedTime('2026-10-20T11:30:00Z')`(ETD 기본 = 20:30 KST), localStorage `projectamo:skip-intro=1`·`projectamo.briefingView=map`. 흐름: 비행 전 브리핑 → 출발 RKSI·도착 RKPC → 자동 생성 → 경로비교로 → 기본 경로로 고도 비교 → 순항 25000 → 고도 비교 → "이 고도로 진행"을 **두 번**(FL250은 고도 방향 규칙 확인) → 브리핑 생성. 위험 막대 버튼은 마우스를 받지 않으므로(줄이 위치로 고름) `page.mouse`로 막대 좌표를 누른다. 막대 id는 `[data-ribbon-id="turbulence:model:0"]` 형식.
- 남은 것:
  - 브라우저 계약 "막대 누름"·"SIGMET 마우스 올림"(`map-briefing.spec.mjs`, 데스크톱만) 미작성. `dev:contract`는 3001·5173이 비어 있어야 한다(사용자 서버를 끄고 실행). 픽스처(`route-fixture.mjs` `briefingFor`)에 `sections.enroute.ribbon`과 경로에 걸리는 SIGMET(지도 `/api` sigmet 응답 + 같은 id의 ribbon 틀)을 넣어야 한다.
  - 짧은 강하 구간은 시작·끝 이름표가 겹친다(사용자 판단 대기).
- 커밋 전 HEAD의 `App.jsx`는 faec3ff9부터 `mapBriefing` 속성이 `/>` 밖에 있어 빌드가 깨져 있었다 — a9c5a85c에 수정 포함.

## 5단계 완료 (2026-10-22)
고도 슬라이더(브리핑 중 항상 표시, 기본 = 순항고도 기압면, 축 위 위험·비행 범위, 말풍선)와 시간 막대 ETD~ETA 창. 기본값은 브리핑을 열 때 한 번만. 달라진 점은 계획 5단계 "실제로 한 것".
- 운영 자료 화면 확인: 손잡이 FL240(400hPa), 말풍선 "순항 FL250 → 지도 FL240 · SIGMET 심한 난기류", 축에 비행 범위·모델 MOD(순항 꽉 참·강하 빗금)·SIGMET 실선/점선, 시간 막대 "ETD 20:30 → ETA 21:14" 창.
- 확인 스크립트: `.artifacts/map-briefing-check/brief.mjs`(브리핑 생성까지) + 단계별 `stage5*.mjs`. 사용: 서버를 띄운 뒤 `node .artifacts/map-briefing-check/brief.mjs ./stage5.mjs`. 스크린샷은 같은 폴더 `shots/`.
- **사용자가 직접 볼 때**: 서버를 띄우고 평소 브라우저에서 `http://127.0.0.1:5173/?devNow=2026-10-20T20:30:00%2B09:00` (개발 서버 전용, `frontend/src/app/devClock.js`). 브리핑을 만들면 시간 손잡이가 ETD(지났으면 지금 시각)로 가서 ETD~ETA 창이 바로 보인다.
- 받아 둔 자료의 KIM 목록은 실제로 있는 예보시간(hf9~15)만 남게 정리했다(원본은 `*.full.json.bak`·`latest.json.full.bak`). 목록에 없는 시각이 있으면 지도가 그 장을 골라 404를 받고 다음 시각으로 넘어가지 않는다.

## 6단계 완료 (2026-10-22)
공항 카드(접힌 3줄 + 지시선, 출발 ETD·도착/교체 ETA ±1시간 TAF, 깃발) + "상세" = 지도 영역 안으로 줄인 공항 패널(독을 가리지 않음) + 브리핑 중 위쪽 버튼 유지. 달라진 점은 계획 6단계 "실제로 한 것".
- 운영 자료 화면 확인: RKSI(VFR, TAF는 직전 발표 31007KT CAVOK), RKPC(IFR, NOTAM 3, 변화 2), "상세" → 공항 패널 [1348,12]–[1908,618], 독 윗변 630, 위쪽 버튼 남음, 카드가 패널 왼쪽으로 비켜남.
- 확인 스크립트: `.artifacts/map-briefing-check/cards.mjs`.

## 7단계 진행 (2026-10-22)
METAR·TAF 과거 보기: API·보관 방식(시간 기준)·공항 카드 이력 점·공항 패널 METAR·TAF 탭 이력 줄 완료. TAF 개편 작업은 사용자 요청으로 커밋(c89d7868, 낙뢰·알림 쪽 `AirportPanel.jsx`·`.css`·계약은 제외). 남은 것: **보관 방식 운영 반영(배포)**. 자세한 건 계획 7단계 "실제로 한 것".
- 운영 서버 SSH: 집 IP가 바뀌어(`59.16.216.137` → `59.16.216.244`) 접속 시간 초과 → 사용자 승인으로 보안 그룹 `sg-0144bd538dfba7047`에 `59.16.216.244/32` 22번 규칙 추가(`sgr-09be441f7abe5b1df`, 설명 home-2026-10-22). AWS CLI는 Windows `aws.exe`, 로그인은 `aws login --remote`(시크릿 창).
- 과거 보기 확인용 자료: `.artifacts/prod-history-20261022/`(운영 METAR·TAF 보관본, 읽기만) + `.artifacts/prod-data-20261022-hist/`(10-20 사본에 위 METAR·TAF를 연결) → `DATA_PATH=$PWD/.artifacts/prod-data-20261022-hist npm run dev:test`, 오늘 시계로. 스크립트 `.artifacts/map-briefing-check/brief-now.mjs ./history-real.mjs`.

## 다음 할 일
1. 브라우저 계약: 4단계 2개(위 "남은 것") + 5단계(슬라이더 표시·시간 창) 1개 + 6단계(카드 → 상세 → 공항 패널) 1개.
1-1. 공항 패널 TAF 탭에 ETD/ETA 표시 — TAF 개편 정리 후.
2. 7단계 남은 것(보관 방식 배포) → 8단계(마무리).
3. 따로: 문서형 `briefing-view` 계약 3개 실패(10-16 단면 통합 이후 갱신 안 됨, 1개는 수정 전 HEAD에서도 실패 확인).
4. spec §9 열린 질문은 사용자 인터뷰 후(인터뷰는 개편 이후).

## 참고
- 테스트는 Orca 내장 브라우저로 진행(`orca-ide` CLI). WSL이라 Claude in Chrome은 연결 안 됨.
- 이 세션에서 프로젝트 로컬 설정에 Playwright MCP(`claude mcp add playwright`)를 추가했다. 필요 없으면 `claude mcp remove playwright`.
- 운영 사이트 테스트 중 `test` 계정으로 기상이 질문 6회 사용, 계정 데이터 변경 없음.
