# 폰트 전송 최적화 조사 — 2026-09-11

## 결론

진행 가능하다. 우선 기존 Pretendard GOV 정적 다이나믹 서브셋의 400/500/600/700/800/900 굵기와 woff2만 유지하는 방식을 권장한다. 현재 화면의 글꼴 선택과 문자의 지원 범위를 유지하면서 패키지 자산과 공통 CSS를 줄일 수 있다. 가변 서브셋은 용량 효과가 더 크지만 기존 정적 글꼴과 동일한 렌더링을 보장하지 않으므로 후속 후보로 둔다.

이번 작업은 조사와 격리 실험이다. 앱 소스·패키지·배포 설정·운영 서버는 변경하지 않았다. 실험 CSS와 스크립트는 ignored `artifacts/font-study/`에만 생성했다.

## 실제 글꼴 사용 구조

- `frontend/src/main.jsx`는 Pretendard GOV 1.3.9의 정적 다이나믹 서브셋 CSS 전체를 import한다.
- `frontend/src/shared/theme/fontPrefs.js`의 `DEFAULT_ID`는 `wanted`다. 저장된 선호가 없는 방문자는 Wanted Sans Variable을 외부 jsDelivr의 `@latest` CSS로 로드한다. `--app-font`와 body를 이 글꼴로 바꾸고 `font_pref=wanted`를 저장한다.
- Fluent 테마는 `--app-font`를 사용하지만 기관 라운지·공항 모델 비교 등 일부 화면은 `--font-base`의 Pretendard GOV를 사용한다. 한 페이지에서도 두 글꼴이 로드될 수 있다. 따라서 Pretendard 정리는 앱 전체의 폰트 전략 정리와 동일하지 않다.
- 디자인 문서의 자체 호스팅·CDN 비의존 계약과 임시 글꼴 비교 로더가 충돌한다. 최적화 과정에서 사용자가 보던 Wanted Sans를 몰래 Pretendard로 변경하지 않는다. 현재 글꼴 선택을 보존한 자체 호스팅과 글꼴 통일 여부를 구분한다.
- 직접 선언된 숫자 굵기는 400/500/550/600/650/700/750/800/850/900이다. 공통 토큰은 400/500/600/700. 앱 소스와 Fluent Text/Theme의 얇은 굵기 선언 검색에서 100/200/300 사용은 발견하지 못했다. 이는 모든 사용자 상태의 실행 검증을 대신하지 않는다.
- 550/650/750/850은 정적 글꼴에서 인접 제공 굵기로 매칭된다. 이 선언을 이번 정리에서 바꾸지 않고 400~900의 기존 여섯 파일 집합을 유지한다.
- Mapbox의 PBF 글리프(`text-font`, Noto Sans CJK JP 등)는 별도 전달 경로이며 이번 woff 최적화 대상이 아니다. 사용자 PDF 내부 글꼴도 별도다.

## 현재 운영 페이지의 실제 로드 관찰

로그인하지 않은 새 Chromium 컨텍스트, 데스크톱 1600×1000, 실제 HTTPS 운영 화면을 사용했다. 온보딩/업데이트 안내의 최초 방문 플래그만 설정했으며 인증·기상·폰트 API는 대체하지 않았다. 각 페이지 로드 후 6.5초 및 document.fonts.ready를 기다렸다. 아래는 이 한 번의 관찰에서 받은 폰트 응답 본문 크기이며 HTTP 헤더, CSS, Mapbox PBF는 포함하지 않는다.

| 화면 | Pretendard | Wanted Sans | 합계 |
|---|---:|---:|---:|
| 메인 지도 `/` | 2개 / 31,828 B | 3개 / 84,452 B | 116,280 B (113.6 KiB) |
| 라운지 미리보기 | 17개 / 217,300 B | 3개 / 82,408 B | 299,708 B (292.7 KiB) |
| 김포 공항 모델 비교 | 26개 / 331,240 B | 0개 | 331,240 B (323.5 KiB) |

본문의 computed font-family와 로드 완료 FontFace도 함께 수집했다. 실제 날씨·보이는 글자·사용자 선호·캐시 상태가 바뀌면 요청 집합이 달라진다. 이 결과로 일반적인 첫 화면 속도 개선 시간을 단정할 수 없다. 모델 비교는 `/airport/RKSS/models`에서 측정했으며 잘못된 복수형 URL을 사용한 최초 측정은 최종 JSON에서 교체했다.

## 용량 비교

| 항목 | 현재 정적 전체 | 정적 400~900 + woff2 | 가변 다이나믹 서브셋 |
|---|---:|---:|---:|
| 전체 폰트 자산 수 | 2,160 | 720 | 120 |
| 전체 폰트 자산 크기 | 42.8 MiB | 13.0 MiB | 5.4 MiB |
| font-face 선언 수 | 1,080 | 720 | 120 |
| 메인 CSS gzip 비교치 | 273.1 KiB | 186.9 KiB | 67.0 KiB |

폰트 파일은 설치된 패키지의 실제 바이트 크기다. CSS는 현재 빌드의 비폰트 선언을 유지하고 font-face만 교체한 뒤 Node gzip level 9로 비교했다. 가변 CSS는 기존 Vite로 메모리에서 빌드하여 실제 파일 해시 경로를 반영했다. 전체 앱을 새로 빌드한 측정은 아니며 압축기·규칙 순서에 따른 소폭 차이가 있다. 앞선 Python gzip 비교와 수 KiB 차이는 있어도 정적 정리의 CSS 감소율 약 31%라는 결론은 같다.

정적 방식은 서버의 폰트 자산을 약 29.8 MiB 줄인다. 현재 전체 dist는 약 106 MiB이며 이미지·JSON·지도 자료도 있으므로 전체 배포물이 15 MB가 된다는 계산은 성립하지 않는다. 사용 중인 글자의 정적 woff2 파일은 그대로이므로 폰트 파일 다운로드량 자체가 반드시 줄지는 않는다. 직접적인 방문자 이익은 항상 포함되는 CSS의 감소다.

## 브라우저·빌드 실험

- Chromium 및 WebKit에서 같은 표본을 baseline/정적 정리/가변의 새 컨텍스트에 렌더링했다. 400~900과 중간 굵기, 한글·공항 코드·숫자·기상 단위·기호를 포함했다. 폰트는 로컬 패키지 바이트를 격리된 테스트 origin에서 제공했다. 네트워크 지연 또는 실제 페이지 성능 실험은 아니다.
- 정적 정리: 두 엔진 모두 10개 굵기 행의 PNG SHA-256 및 텍스트 폭/높이가 baseline과 동일했다. font 요청 60개, 총 795,732 B도 동일했다. 지원하지 않는 글자의 시스템 fallback까지 포함한 표본 비교이며 모든 Unicode의 실제 glyph를 검사한 것은 아니다.
- 가변: 요청은 10개, 총 293,924 B로 줄었지만 두 엔진 모두 10개 행의 PNG가 baseline과 달랐다. 최대 문자열 폭 차이는 Chromium 13 px, WebKit 2.578 px였고 특히 중간 굵기에서 차이가 있었다. 모든 차이를 중간 굵기 하나만의 영향으로 단정하지 않는다. 표·버튼·줄바꿈 회귀 확인 없이 즉시 교체하지 않는다.
- 정적 생성 CSS의 격리 Vite 빌드가 실제 woff2 자산 720개를 만들고 woff 0개임을 확인했다. 굵기마다 원본 120개 unicode-range가 그대로인지 비교했으며 원본 라이선스 고지를 보존했다. 새로운 의존성은 필요 없었다.
- 생성 CSS 파일 위치에서 패키지까지의 상대 경로로 자산을 연결한다. 최초 실험에서 앱 바깥 artifacts의 bare package URL이 해석되지 않았으므로, 미해결 URL을 남기는 빌드를 성공으로 취급하지 않고 상대 경로로 수정해 검증했다.

## 권장 구현 순서

1. **정적 정리부터 적용한다.** 재현 가능한 생성 스크립트를 `frontend/scripts/`에 두고 설치된 Pretendard GOV 패키지 CSS에서 여섯 굵기와 woff2 source를 선택한다. family/style/display/unicode-range와 라이선스는 그대로 유지한다. 글자 목록을 앱 소스에서 뽑아 한글을 다시 줄이는 방식은 쓰지 않는다. 사용자 문서·이름·공지의 새로운 글자를 지원해야 한다.
2. 생성 CSS를 `frontend/src/shared/theme/`에서 관리하고 `main.jsx`의 전체 패키지 CSS import를 교체한다. URL은 해당 파일에서 node_modules까지의 상대 경로로 생성하며 Vite가 최종 해시 파일을 관리한다. 패키지 업데이트 때 재생성·비교 검증을 할 수 있게 하고 예상 굵기/선언 수/문자 범위/파일 누락 시 명시적으로 실패시킨다. node_modules 원본은 수정하지 않는다.
3. **Wanted Sans 외부 로더는 후속으로 정리한다.** 현재 제공 중인 버전/파일을 확인하여 버전을 고정하고 라이선스와 함께 자체 호스팅한다. `fontPrefs.js`의 기본 선택·기존 저장 선호를 보존하고, 선택되지 않은 글꼴을 불필요하게 불러오지 않는 구조로 조정한다. 외부 `@latest`를 제거하는 목적이며 화면 글꼴 통일은 별도 결정이다. 이 단계의 자산·잠금 파일 변경에 따라 full deploy 여부를 판단한다.
4. **가변 전환은 선택적 후속 개선이다.** 공식 패키지가 이미 제공하므로 기술적으로 가능하지만 중간 굵기와 줄바꿈 검토가 필요하다. 앞선 정적 최적화와 한 번에 합치지 않아 변경 원인을 추적할 수 있게 한다.

## 실제 적용 시 완료 기준

- 생성 결과가 결정적이고 원본 문자 범위·여섯 굵기·라이선스가 보존될 것. woff 및 100/200/300 자산이 최종 빌드에 없을 것.
- Chromium 데스크톱·WebKit iPad 가로의 메인, 공항 패널, 기상 브리핑, 라운지, 합동 발표, 모델 비교, 모니터링, 터미널에서 글꼴 로드 실패/문자 누락/줄바꿈·잘림 회귀가 없을 것. 기본 Wanted 및 저장된 gov 선호를 모두 확인할 것.
- 차가운 캐시와 재방문의 CSS·폰트 응답량을 분리하고, 실제 로딩 시간 개선은 동일 조건의 반복 측정 후에만 보고할 것. 화면에 없던 문자 입력 시 필요한 서브셋이 추가 로드되는지도 확인할 것.
- 관련 검증 후 npm run check. 배포한다면 immutable 폰트 URL·Content-Type·CSS 캐시를 확인하고 공개 서버의 첫 방문도 점검할 것. 기존 import 복원으로 되돌릴 수 있도록 첫 변경을 집중된 커밋으로 유지할 것.

## 증거와 참고

실험: `artifacts/font-study/{measure-fonts.mjs,specimen-results.json,specimen.log,specimen-*.png,audit-live.mjs,live-audit.json,build-estimates.mjs,css-estimates.json,verify-static-build.mjs,static-build-result.json}`. 전체 npm 검사/배포는 조사 단계에 필요하지 않아 실행하지 않았다.

- [Pretendard GOV 공식 문서 — 정적/가변 다이나믹 서브셋](https://github.com/orioncactus/pretendard/blob/main/packages/pretendard-gov/README.md)
- [MDN — 가변 폰트의 weight 축](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Fonts/Variable_fonts)
- [MDN — unicode-range](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/unicode-range)
- [Wanted Sans 공식 배포·라이선스 안내](https://github.com/wanteddev/wanted-sans)

## 구현 — 2026-09-11 후속 요청

사용자의 ‘수정해’ 요청으로 정적 정리와 Wanted 자체 호스팅을 구현했다. 위의 ‘조사만 수행’은 최초 조사 단계의 상태다.

- `frontend/scripts/generate-font-css.mjs`가 설치된 Pretendard GOV 1.3.9의 여섯 굵기를 선택하여 `pretendard-gov.generated.css`를 만든다. 원본 120개 문자 범위, family/style/display, 라이선스와 모든 woff2 파일을 검증한다. main.jsx의 전체 CSS import를 교체했으며 `fonts:check`를 frontend test와 build에 연결했다.
- 이전 Wanted `@latest` 응답의 x-jsd-version은 1.0.3이었다. 해당 버전의 원본 CSS와 woff2 92개를 vendoring하고 manifest/SHA-256과 OFL을 포함했다. Wanted 선택 시 동적 CSS import로 Vite가 관리하는 동일 출처 해시 자산을 로드한다. 기본 Wanted와 기존 저장 선호는 유지한다. 새 npm 의존성이나 폰트 바이너리 수정은 없다.
- 실제 production build: woff 0개, Pretendard 720개 + Wanted 92개 = woff2 812개/15,934,512 B(15.2 MiB). Pretendard 100/200/300 파일 0개. Wanted가 새로 자체 호스팅되는 2.2 MiB도 포함한 전체 dist는 106.07 → 78.19 MiB다.
- 실제 메인 CSS는 1,035,884 → 725,504 B, Python gzip 기준 274,902 → 189,039 B(268.5 → 184.6 KiB, 31.2% 감소). Wanted CSS는 별도 청크 46,394 B/gzip 12,834 B이며 Wanted를 선택한 경우에만 요청한다. 이 수치는 앞 절의 메모리 가공 추정치와 달리 실제 앱 빌드 결과다.
- Wanted 원본 CSS·라이선스·92개 파일·manifest 일치 테스트를 추가했다. 양쪽 폰트의 OFL 파일도 공개 licenses 경로에 배포된다.
- 화면 점검 중 터미널의 기존 Noto Sans KR/Roboto Mono Google Fonts import를 별도로 확인했다. 이 화면과 디자인 시험 화면, 기존 Noto/Gothic/Plex 선택은 이번 변경에 포함하지 않는다. 따라서 기본/공통 자체 호스팅 폰트의 외부 요청 제거를 사이트 전체 CDN 제거로 표현하지 않는다.
- [운영·재생성 안내](../operations/fonts.md)에 명령과 업데이트/배포 절차를 기록했다.

### 구현 검증 결과

- 실제 production build를 임시 Vite preview(4173)로 제공하고 기존 로컬 backend(3001)에 연결했다. 개발 backend의 AUTO_ADMIN_LOGIN 때문에 인증 조회만 비로그인 응답으로 대체했으며, 미리보기 CRUD/기상과 폰트 자산은 실제 서버/빌드 파일을 사용했다. 임시 프록시에서 개발 서버가 허용하는 Origin을 전달했으므로 이 검증을 새로운 Origin 권한 검증으로 취급하지 않는다.
- Chromium 1600×1000·WebKit 1180×820 각각 기본 Wanted의 메인·라운지·공항 모델 비교·모니터링·터미널·기상 브리핑 6개 화면과 저장된 gov의 메인 1개 화면, 합계 14개 표면을 확인했다. 폰트 파일 실패·FontFace 오류·pageerror 모두 0. 원래 선호가 보존되고 gov에서는 Wanted CSS/woff2 요청이 0이었다. 터미널의 기존 Google Fonts만 별도 관측됐으며 공통 화면의 외부 폰트 요청은 없었다.
- 그림과 기상 상태는 자동수집을 끈 로컬 자료로 확인했다. 폰트 전송/표현 검증이며 최신 기상 검증은 아니다. 브라우저·빌드·검사는 CPU 한 코어/nice 10에서 순차 실행했고 임시 preview 서버는 종료했다.
- 최종 npm run check 통과: backend 1,140 + frontend 1,538 = 2,678 통과, 기존 skip 1. production build 성공, 기존 큰 JS chunk 경고 유지. 증거 `artifacts/font-study/npm-check.log`, `implementation-browser-result.json`, `implementation-browser.log`, `after-*.png`, `build-after.json`.
