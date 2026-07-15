# Refactoring Handoff — 다른 세션에서 이어가기

이 문서는 2026-06-29 세션에서 깔아둔 **도구·워크플로우**와 **server.js / MapView 리팩토링 백로그**를 다음 세션(사람이든 에이전트든)이 맥락 없이도 이어갈 수 있게 정리한 것이다. 단일 진실은 코드와 ADR이며, 이 문서는 "어디서 멈췄고 왜 그렇게 했는지"의 지도다.

---

## 1. 이 세션에서 설치한 도구

| 도구 | 형태 | 호출 | 용도 |
|---|---|---|---|
| **graphify** | CLI (`uv tool install graphifyy`, 0.9.1) + `graphify-out/` 그래프 | `graphify query/explain/path "..."` | 코드 지식 그래프. 광범위 grep 전에 먼저 질의(.claude/settings.json 훅이 강제). 수정 후 `graphify update .` |
| **ponytail** | 플러그인 (`ponytail@ponytail`, full) | 상시 활성 | 과잉설계 차단(게으른 시니어 결정 사다리) |
| **superpowers** | 플러그인 (`superpowers@superpowers-marketplace`) | `/brainstorm`, `/write-plan` 등 | 워크플로우/플랜. **주의: 공식 마켓에도 동명 플러그인이 있어 충돌 가능 — `@superpowers-marketplace`(obra) 쪽이 맞음** |
| **refactor** | 프로젝트 스킬 (`.claude/skills/refactor/`) | `/refactor <경로>` (slash-only) | SOLID 위반·코드스멜 휴리스틱 스캔(얕음). 전체 레포엔 부적합, 모듈 단위로 |
| **improve-codebase-architecture** | 프로젝트 스킬 | `/improve-codebase-architecture` (slash-only) | deep/shallow 모듈 관점 deepening 후보 → HTML 리포트 → grilling. 전체 레포 대상 가능 |
| **codebase-design / grilling / domain-modeling** | 프로젝트 스킬 (improve-codebase-architecture 의존) | 보조 | 아키텍처 어휘(module/interface/depth/seam/leverage/locality), 설계 인터뷰, ADR/CONTEXT 유지 |

> ⚠️ `.claude/skills/`의 5개 스킬은 현재 **git에 미추적(untracked)** 이다. 다른 머신/클론에서도 쓰려면 커밋해야 한다(결정 필요). graphify/ponytail/superpowers는 사용자 환경(`~/.claude`)에 설치돼 레포에 없음.
> ⚠️ 이 환경은 **공용 인터넷 HTTPS에 TLS 문제**가 있다(사내 프록시 SSL 검사). `uv`/`pip`/`npx` 설치는 `--native-tls` 필요할 수 있음. **단, git push와 localhost(테스트·smoke)는 정상.**

### 워크플로우 (이 세션에서 쓴 루프)
`/improve-codebase-architecture`로 후보 도출 → 후보 하나 골라 **grilling**(한 번에 한 질문, 추천답 제시, 코드로 답할 수 있으면 코드 확인) → 합의된 최소 설계로 구현 → **검증** → 커밋. grilling이 "이 후보는 가치<위험"으로 **보류시키는 것도 정상 결과**다(실제로 2건 보류).

---

## 2. 핵심 맥락 — 왜 이 방향인가

- **MapView는 누적(accretion)으로 비대해진다.** 2026-05-15에 한 번 크게 분해(~−1,200줄)했으나, 이후 6주간 기능 커밋 ~30개가 ~+500줄을 **다시 쌓아** 1,400줄로 복귀. 원인: 지도가 MapView에 있고, 새 레이어/effect를 **다른 자리로 강제하는 seam이 없었다.** → [docs/adr/0001-mapview-layer-gravity.md](adr/0001-mapview-layer-gravity.md)
- **그래서 "또 분해"는 답이 아니다.** 6주 뒤 재오염된다. **중력을 바꿔야** 한다 — 목표 모양: `useMap` 컨트롤러(명령형 Mapbox 인스턴스 소유) + **선언적 레이어 스펙**을 reconciler 하나가 적용 → "오버레이 추가 = 레이어 스펙/`useXOverlay` 훅 추가". strangler-fig로 기능 작업에 얹어 진화, **재작성·일회성 재분해 금지**.
- **검증 제약(중요).** 백엔드는 테스트가 탄탄(166개) → 저위험·고확신. **MapView는 단위 테스트가 거의 없고**, 이 환경의 라이브 smoke는 "마운트+레이아웃"까지만 검증(실제 타일·상호작용·타이밍은 못 봄). → MapView 큰 수술은 **시각 검증 되는 환경 + 기능 작업과 함께**일 때만.
- **판단 규칙(ponytail).** 구조 변경은 "예쁜 파일"이 아니라 "내가 실제로 할 미래 작업의 속도"를 사는 것. 아프지 않으면 미룬다.

---

## 3. 리팩토링 백로그

### 완료 (브랜치 `refactor/hotspots-server-mapview`, 푸시됨)
| 커밋 | 내용 | 검증 |
|---|---|---|
| `a03c930` | server.js 중복 cross-section 로더 → `src/briefing/enroute-cross-section.js` | 백엔드 166/166 |
| `3f51846` | MapView `boundsFromCoords` + `useStyleSyncedEffect`(sync effect 11개 통합) | build + 6뷰포트 smoke |
| `76dd919` | snapshot-meta 단일 소스 테이블 + 죽은 `kimWind` 별칭 삭제 | snapshot 가드 + 166/166 |
| `7dd0ebc` | `useWeatherFieldOverlay` — 오버레이 sync+destroy 같은 자리(공용 destroy 삭제) | build + smoke + lib 테스트 |
| `32a6fc8` | `sendKimIndex` — KIM index 4라우트 한 줄씩 | KIM 31/31 + 166/166 |
| `c7c6b7d` | `etagOf` + `sendWithEtag` — etag/304 sender 통합(crypto 4→1) | 166/166 |
| `1246cd7`,`6e7b5ad` | ADR-0001 + Architecture.md 가드레일/최신화 | — |

이미 깔린 **seam**(다음 작업의 발판): `useStyleSyncedEffect`, `useWeatherFieldOverlay`(MapView), `loadRouteCrossSection`, `sendKimIndex`, `etagOf/sendWithEtag`, `SNAPSHOT_SOURCES` 테이블(server.js).

### 보류/기각 (grilling 판정 — 재제안 방지용 기록)
- **MapView 상태 모듈(`useWeatherOverlayState`):** 보류. 진짜 깊은 로직(visibility 불변식 `getNextMetVisibility`)은 **이미 `weather-overlays/lib/metLayerVisibility.js`에 추출·테스트됨**. 남은 건 배선 이동 + prop-drill(22개) 축소뿐 → 이득 중간, MapView 무테스트라 검증 위험 큼. 큰 덩어리로는 하지 말 것.
- **레이어 sync coordinator(`useMapLayerSync`, 원래 후보 6):** 기각(YAGNI). 남은 효과들은 서로 다른 레이어라 **실제 style-reload race 없음(사용자 확인)**. 추측성 coordinator = 복잡도 이동만. **단, 백지 설계의 정답은 이거임**(ADR-0001의 "선언적 레이어 스펙") — 레트로핏이 아니라 진화로만.

### 다음 권장 작업 (우선순위)
1. **🟢 server.js 라우트 분리 (다음 타자, 저위험).** 826줄·43라우트 인라인. 도메인별 express Router 분리(reports / kim / briefing / adsb) → `server.js`는 배선만. 대부분 라우트가 "파일 읽고→(변환)→캐시 헤더 전송"이라 **선언적 라우트 레지스트리**(`{path, source, transform, cache}`)로 80%를 데이터화 가능(이미 `sendKimIndex`·`SNAPSHOT_SOURCES`가 축소판). **백엔드 테스트가 가드라 검증 쉬움.** 점진적으로.
2. **🟡 MapView → `useMap` + 선언적 레이어 스펙 (ADR-0001).** strangler-fig: `useMap` 컨트롤러를 옆에 새로 세우고 한 도메인씩 이주. **시각 검증 되는 환경에서만.** 한 번에 다 하지 말 것.
3. **⚪ 낮은 우선순위(원 리포트의 "worth exploring"):** route-briefing service 캡슐화, cache policy 추가 정리(이미 `etagOf`로 큰 건 처리), processor 베이스(speculative — 비추).

### 손대지 말 것 (의도적으로 얕음)
`WeatherOverlayPanel.jsx`(뷰 모듈), `*OverlaySync.js` 페어(상태↔mapbox adapter — 두 번째 adapter 없으니 추가 seam 불필요). ponytail-audit 결과 레포는 전반적으로 lean(흩어진 군살 거의 없음; `clamp` 4중복 ~10줄이 유일한 소소익).

---

## 4. 검증 명령 (이 환경에서 검증된 절차)

```bash
# 백엔드 전체 테스트 (현재 166 통과)
cd backend && node --test

# 프런트 빌드 (컴파일 확인)
cd frontend && npx vite build

# 프런트 lib 단위 테스트 (오버레이/맵 lib)
cd frontend && node --test src/features/weather-overlays/lib/*.test.js src/features/map/lib/*.test.js

# 라이브 smoke — 서버 2개 기동 → 6뷰포트 마운트/레이아웃 검증 → 정리 (repo 루트)
node scripts/projectamo-dev.mjs smoke

# graphify (광범위 grep 전 오리엔테이션 / 수정 후 갱신)
graphify query "<질문>"
graphify update .
```

> MapView 검증의 한계: 위 smoke는 "크래시 없이 마운트 + 레이아웃 무결"까지. **실제 오버레이 렌더·이벤트·타이밍은 이 환경에서 신뢰 검증 불가**(맵 타일 외부 로드 + 무 단위테스트). MapView 큰 변경은 시각 검증 가능 환경에서.

CLAUDE.md / Architecture.md / `docs/design/design-language.md` 가 기존 규칙의 단일 진실. 이 문서는 그 위의 "리팩토링 진행 맥락"일 뿐이다.
