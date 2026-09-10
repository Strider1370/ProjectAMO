# KIM 지상풍 레이어 설계 코드 리뷰

리뷰 대상: [2026-05-18-surface-wind-animation-speed-layer-design.md](2026-05-18-surface-wind-animation-speed-layer-design.md)
리뷰 일자: 2026-05-18
리뷰어: Claude (Sonnet 4.6, 코드 리뷰어 역할)
근거: 기존 코드 패턴 조사 3건(weather-overlays 모듈, UI/responsive 가이드, 백엔드 KMA 패턴) + 설계 본문 정독

---

## 전체 평가

**조건부 GO.** 큰 방향(Canvas 2D → WebGL 단계 전환, KMA 직접 수집, 같은 sampler 공유)은 합리적이고 thorough합니다. 다만 (a) 기존 패턴과의 정합성, (b) 성능 가정 검증, (c) UI 정책 준수 측면에서 진입 전 보강이 필요한 항목이 있습니다.

조건부 GO 의미: 아래 Blocker/Major 항목을 설계 문서에 반영(또는 명시적 "결정 보류" 표기)하면 코드 작성 단계로 넘어가도 안전합니다.

---

## 🔴 Blocker (착수 전 결정 필요)

### B1. 백엔드 디렉터리 구조가 기존 컨벤션과 어긋남

- **근거**: 기존은 `backend/src/parsers/`, `backend/src/processors/`에 모든 KMA/SIGWX/satellite 자료가 통합됨. 설계는 `backend/src/kim/grid.js`, `backend/src/kim/cycle-resolver.js`를 분리 신설.
- **권장**: `parsers/kim-grid-parser.js`, `processors/kim-surface-wind-processor.js`로 통합. cycle-resolver는 `processors/` 내부 helper 또는 `backend/src/lib/cycle.js`로 두기.

### B2. Mapbox `project()` 매 frame 호출 성능 가정 미검증

- 설계 라인 428: "particle state는 lon/lat 유지, 매 frame에서 Mapbox projection으로 화면 좌표 계산".
- 5000 particles × 60fps × 2회(prev+curr) ≈ **60만 calls/sec**. `map.project()`는 행렬 변환 + DOM 좌표 계산을 포함해 매번 비싸며, 이 비용을 1차 성능 예산에 넣지 않았음.
- **권장**: 설계 본문에 (a) viewport pixel buffer로 한 번에 변환하는 path, (b) particle 상태를 pixel 기준으로 유지하고 pan/zoom 시에만 다시 lon/lat→pixel 일괄 변환하는 path 중 어느 쪽인지 명시. 사전 mini-bench(빈 Canvas, 5000 particles, project만 호출하는 측정)로 가정 검증.

### B3. UI proposal-first 정책 + screenshot evidence 부재

- `docs/ui-responsive-guidelines.md` 라인 201–221은 구조 변경(신규 toggle/sub-toggle/legend pattern)을 evidence + proposal 후 승인을 거쳐 구현하도록 요구. 본 설계는 proposal 단계이지만 **모바일/monitoring 페이지 screenshot 캡처가 빠짐**.
- **권장**: 코드 작성 전, 현재 MET panel의 desktop/tablet/phone + `/monitoring` 페이지 4개 viewport 캡처를 `artifacts/responsive-screenshots/wind-layer-design/`에 보관하고 어느 위치에 Wind 토글이 들어갈지 mockup 추가.

---

## 🟠 Major (구현 진입 전 보강)

### M1. Renderer lifecycle이 기존 weather-overlays 패턴과 직교

- 기존 헬퍼는 stateless map-aware function(`addLightningLayers(map, data)`, `setLightningVisibility(map, isVisible)`)이며 `destroy()` 메서드가 없음. style.load 시 `styleRevision` effect로 자동 재설치되는 흐름에 의존.
- 설계의 `renderer.setData/setVisibility/start/stop/destroy`는 stateful 객체. **MapView styleRevision effect에서 누가 destroy/recreate를 호출하는지** 본문에 빠져 있음.
- **권장**: `frontend/src/features/weather-overlays/lib/windOverlaySync.js`(가칭)에 cleanup-aware 래퍼를 두고, MapView는 sync 함수만 호출하게 설계 — 기존 SIGWX/lightning과 동일한 책임 분배. 설계 문서의 "허용/금지되는 MapView 변경" 옆에 이 래퍼 책임을 명시.

### M2. Canvas overlay 첫 사례 — basemap switch 복구 절차 부재

- 현재 코드베이스에 Canvas 2D overlay 패턴 자체가 없음. styleRevision effect에서 map style이 reload되는 흐름에서 absolute-positioned Canvas DOM과 `requestAnimationFrame` loop가 어떻게 정리되는지 절차 명세 누락.
- **권장**: "basemap switch → renderer.destroy() → new map style.load → renderer.recreate(canvasEl, windField)" 시퀀스를 설계에 명문화. React 18 strict mode에서 effect가 두 번 mount돼도 안전한지(idempotency) 검증 항목 추가.

### M3. 데이터 hot-swap 시 particle 상태 정책 미정의

- tmfc/hf가 갱신됐을 때 현재 떠 있는 particle을 (a) 전부 reseed, (b) 위치 유지하고 다음 frame에서 새 field 사용, (c) crossfade — 어느 것인지 결정 없음. (b)가 가장 자연스럽지만 명시 필요.
- **권장**: 설계에 한 줄 추가: "data hot-swap 시 particle 상태는 보존하고 다음 update 부터 새 wind field 사용".

### M4. 503 / 데이터 없음 상태의 UX 미정의

- 설계 라인 222 "프론트는 graceful fallback"만 있고, 토글이 비활성화되는지, legend가 회색이 되는지, 사용자 피드백이 있는지 없음.
- **권장**: 기존 lightning/SIGWX 비가용 시 토글 처리 방식 확인 후 동일 패턴 채택 명시.

### M5. monitoring 페이지 자동 노출 — 정책 누락

- `frontend/src/features/monitoring/MonitoringMap.jsx`는 MET 패널을 그대로 재사용하므로 Wind 토글이 **자동으로** 노출됨. 모바일 monitoring에서 입자 애니메이션이 다른 위젯과 경합할 가능성.
- **권장**: monitoring에서는 (a) 기본적으로 Wind 토글 숨김, (b) 노출하지만 Flow는 기본 off — 어느 정책인지 본문 명시.

### M6. 폴링/캐시 swap 정책 부재

- snapshot meta key(`kimSurfaceWind`)는 정의됐지만, 클라이언트가 새 hash 감지 시 wind data를 **즉시** 재요청할지, **다음 tick**에 할지, **사용자가 토글 켜는 순간**만 할지 미정의.
- **권장**: 기존 `frontend/src/app/useWeatherPolling.js` 흐름에 추가하는 방식과 새 hook 만드는 방식 중 하나로 결정. wind data는 다른 자료보다 무거우므로 "토글이 켜져 있을 때만 폴링"이 합리적.

### M7. 인코딩 1차 선택 근거 약함

- 백엔드 조사 기준 페이로드 추정:
  - `float32-json-v1`: raw ~3–4MB → gzip 후 **~300–600KB**
  - `int16-scaled-json-v1`: raw ~1.4–1.7MB → gzip 후 **~200–250KB**
- 기존 응답은 모두 JSON이라 일관성은 동일. **`int16-scaled-json-v1`을 1차로 권장** — 디버깅성 손해 없이 전송량 2배 차이. 설계의 "빠른 검증 위해 float32" 논리는 약함.

### M8. 모바일 사용자 disable 경로 부재

- `mobileCap: 1800`로 입자 수만 줄임. 저사양 기기/배터리 절약 모드에서 사용자가 명시적으로 끌 수 있는 경로는 토글 1개뿐. 자동 감지(`navigator.connection.saveData`, `prefers-reduced-motion`) 정책 없음.
- **권장**: `prefers-reduced-motion: reduce`면 Flow 자동 off 또는 정적 화살표 fallback. 1줄 추가로 접근성 개선.

---

## 🟡 Minor

### N1. 레이어 ID prefix 일관성

설계는 `kim-wind-particles`, `kim-wind-speed`. 기존 라디오/위성/낙뢰는 `kma-` prefix를 주로 사용. 모델 구분이 의미 있다면 `kim-` 유지, 데이터 출처(KMA) 강조면 `kma-kim-wind-*`. 한 줄 결정 필요.

### N2. legend 단위 병기는 신규 패턴

`frontend/src/features/weather-overlays/WeatherLegends.jsx`에 단위 병기 사례 없음. m/s + kt 병기 추가 시 다른 legend도 일관성 맞출지(예: 강수량 mm/h + in/h) 정책 필요. 일단은 wind만 병기로 OK.

### N3. 초기 토글 상태 — 운영 UI 맥락에서 재고

운영 도구에서 Wind 켤 때 **Flow on / Speed off**보다 **둘 다 on**이 더 즉시 유용할 수 있음. 사용자 피드백 후 결정해도 됨.

### N4. frame cap 30fps 구현 미명시

rAF skip vs setTimeout vs `cancelAnimationFrame` 기반 throttle 중 어느 것인지. 모바일에서 24fps도 검토 가치.

### N5. snapshot meta key 일관성

store type은 `kim_surface_wind`(snake_case), snapshot meta는 `kimSurfaceWind`(camelCase). 다른 type들도 동일한 변환 규칙인지 확인하고 본문에 명시.

### N6. WebGL 전환 시 interface 호환 가정 검증

WebGL은 `setData()`가 texture upload(async 가능). Canvas는 sync. interface 호환을 강조하면서 sync/async 차이는 짚지 않음. 한 줄 보강.

---

## ⚪ Nit

- **N7.** 라인 42–76의 Mapbox 예제 참고 범위 섹션이 본 설계 의도 파악을 다소 늦춤 — 부록 또는 문서 후미로 이동 권장.
- **N8.** 색상 ramp 7단계는 운영 UI치고 다채로움 — 5단계(저/약/중/강/매우강)로 단순화 검토.
- **N9.** "Windy급 품질 조건" 섹션은 정보성 — 별 문서로 분리 가능.

---

## 잘된 점

- 1차/2차 단계 전환 기준이 정량적(30fps 유지, 모바일 인터랙션 버벅임 등) — drift 방지 효과
- Canvas/WebGL 공유 인터페이스 명시 — 2차 전환 비용 사전 통제
- 서버/브라우저 부담 분리(설계 라인 376–392) — 운영 비용 예측 가능
- 색상 ramp 자동 스케일 금지(설계 라인 505) — 운영 도구에서 매우 정확한 판단
- KMA 복수 변수 호출 금지를 사전 경고(설계 라인 106) — 과거 실패 경험 반영
- 503 graceful, 데이터 hot-swap 가능성을 인지(다만 정책 미정)

---

## 권장 다음 단계 (우선순위)

1. **B1–B3 해결**: 백엔드 디렉터리 조정 + `project()` 미니 벤치 + screenshot evidence 캡처 → 설계 v2
2. **M1–M3 보강**: renderer lifecycle을 기존 weather-overlay 패턴으로 정렬 + data hot-swap 정책 한 줄
3. 위가 정리되면 **구현 순서 1번(KIM API 파이프라인)부터 착수 GO**

---

## 부록: 리뷰 시 참고한 기존 코드 사실

### Weather overlays 패턴
- 모든 기존 레이어는 imperative `install → sync` 패턴. `setData/setVisibility/destroy` lifecycle 객체 없음.
- basemap switch는 MapView의 `styleRevision` state로 감지하여 sync 함수 재호출. cleanup-aware binding은 없고 `map.remove()`가 전체 정리.
- Canvas overlay는 프로젝트 내 **첫 사례**.

### UI 정책
- `WeatherOverlayPanel.jsx`에 이미 sub-toggle 패턴 존재(낙뢰 깜빡임). `layer-toggle-row--sub` CSS class 재사용 가능 → Wind Flow/Speed 서브 토글은 신규 UX 패턴 아님.
- `layoutTokens.css`의 `--panel-overlay-sm: clamp(260px, 20vw, 320px)`로 패널 폭 여유 충분.
- `WeatherLegends.jsx`는 현재 단일 단위만 표시 — 단위 병기는 신규.

### 백엔드 패턴
- `api-client.js`에 `buildUrl(type)` 또는 processor 내부 helper 패턴. `buildKimGridUrl()` 추가는 합리적.
- `store.js` TYPES 배열에 신규 type 추가, `canonicalHash()`로 SHA-256 change detection.
- `server.js`의 `sendLatest(res, type)` 패턴 — 데이터 없으면 503 응답.
- snapshot meta는 `server.js` `buildHashEntry()` 근처에 신규 key 추가.
- cycle/hf 정책은 sigwx-low-processor의 `resolveSigwxLowTmfcCandidates()`와 유사하나 KIM과 cycle 정책이 달라 신규 helper는 정당.
