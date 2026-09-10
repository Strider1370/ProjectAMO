# Plan — 디자인 시스템 Phase 1 (준비/토대)

> 기준: `docs/design/design-language.md` (디자인 헌법). 이 단계는 **토대만** 만든다. 기능 마이그레이션은 다음 단계.

## 목표 / 성공 기준
헌법을 "실행 가능한 토대"로 전환.
- 토큰 단일 소스 존재(JS + CSS, 값은 헌법 §5와 일치)
- Pretendard **자체 호스팅**(런타임 CDN 호출 0)
- 드리프트 가드 테스트 통과
- `vite build` 성공 + 기존 `test:layout` 통과
- **기존 화면 시각 회귀 없음**(토큰은 변수 "선언"만, 기존 CSS는 아직 참조 안 함)

## 범위 (In)
1. **Pretendard 자체 호스팅** → verify: `pretendard` npm 설치, `main.jsx`에서 import, `/test`에서 Pretendard 렌더 + 네트워크에 폰트 CDN 호출 0
2. **토큰 단일 소스** `frontend/src/shared/theme/tokens.css`(`:root`) + `tokens.js`(JS 미러, 지도/canvas/SVG 소비용) → verify: 값이 헌법 §5와 일치
3. **드리프트 가드** `frontend/src/shared/theme/tokens.test.js` (css ↔ js 정확히 일치) → verify: `node --test` 통과 (`layoutTokens.test.js` 패턴 모사)
4. **Fluent 테마 모듈** `frontend/src/shared/theme/fluentTheme.js` (webLightTheme + Pretendard) → verify: `/test`가 이 테마 사용
5. **전역 토큰 주입** `main.jsx`에 `tokens.css` import → verify: `:root` 변수 사용 가능, 기존 화면 무변화
6. **검증** → verify: `vite build` 성공, `npm run test:layout` 통과, `/test` 콘솔 에러 0

## 범위 (Out — 다음 단계)
- 앱 전역 `FluentProvider` 적용(파일럿에서)
- 기능별 컴포넌트 마이그레이션(브리핑=견본 → 공항패널 → …)
- lint 가드레일(하드코딩 색 차단) — 기존 297곳 때문에 **warning-only 별도 소작업**
- 다크 테마
- 기준선 스크린샷 일괄 캡처(백엔드 데이터 필요 — 파일럿 직전에)

## 리스크 / 통제
- `tokens.css` 전역 import가 **기존 색을 바꾸면 안 됨** → 변수 "선언"만 추가, 기존 CSS는 `var()` 미참조라 무영향. build + `/test`로 확인.
- Fluent를 **전역 적용하지 않음**(범위 통제) — 테마 모듈만 준비, `/test`에서만 사용.
- 인코딩: 모든 파일 UTF-8(Write 도구), PowerShell `Set-Content`/`>` 사용 금지(헌법/agents.md §6).

## Status
- [x] 1 Pretendard 자체 호스팅 (`pretendard` npm, `main.jsx` import → dist에 woff 번들, /test에서 로드 확인, CDN 0)
- [x] 2 tokens.css + tokens.js (`frontend/src/shared/theme/`)
- [x] 3 tokens.test.js (css↔js 일치, `node --test` 통과)
- [x] 4 fluentTheme.js (appLightTheme/appDarkTheme + Pretendard)
- [x] 5 main.jsx 전역 주입 (`tokens.css` → `:root` 변수 전역 확인: --cat-ifr/--space-l)
- [x] 6 검증: `vite build` 성공 · token 테스트 통과 · /test 콘솔 에러 0 · 16섹션 정상
- 정리: 구 `DesignTestPage.css`(CDN 글꼴) 삭제, /test는 공용 `appLightTheme`(Pretendard) 사용
