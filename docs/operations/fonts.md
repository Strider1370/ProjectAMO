# 자체 호스팅 웹폰트

## 현재 구성

- Pretendard GOV 1.3.9: npm lockfile의 원본 정적 다이나믹 서브셋에서 400/500/600/700/800/900 및 woff2만 선택한다. 글꼴 이름·font-display·문자 범위를 바꾸지 않는다.
- Wanted Sans Variable 1.0.3: `frontend/src/assets/fonts/wanted-sans/1.0.3/`에 원본 CSS·woff2 92개·라이선스·SHA-256 manifest를 보관한다. 이전 CDN의 `@latest`가 제공하던 버전이다. `fontPrefs.js`가 Wanted 선택 시에만 CSS를 동적 import한다.
- 앱의 기본 `wanted`, 저장된 `font_pref`, `--app-font`와 `--font-base` 사용처는 유지한다. 이번 최적화는 글꼴 통일이나 기본 글꼴 변경이 아니다.
- Noto/Gothic/Plex의 기존 저장 선호, 터미널의 Noto Sans/Roboto Mono 및 디자인 시험 화면은 기존 외부 로더를 유지한다. 사이트 전체에서 외부 폰트를 제거했다는 의미는 아니다.
- Vite가 두 자체 호스팅 폰트의 URL을 `/assets/` 해시 파일로 변환한다. 기존 nginx assets 캐시 정책을 사용하므로 새로운 정적 location 설정은 필요 없다.

## 생성과 검증

```bash
npm --prefix frontend run fonts:generate
npm --prefix frontend run fonts:check
node --test frontend/src/shared/theme/fontAssets.test.js
npm run check
```

`fonts:generate`는 설치된 Pretendard 패키지에서
`frontend/src/shared/theme/pretendard-gov.generated.css`와 공개 라이선스 파일을 생성한다.
생성 결과를 저장소에 포함하므로 npm 스크립트를 거치지 않고 Vite를 시작하는 개발 런처도 사용할 수 있다.
`fonts:check`는 생성 결과가 최신인지, 원본 여섯 굵기의 120개 문자 범위와 woff2 파일이 온전한지 확인한다.
프런트엔드 test와 build 전에 자동 실행된다. 원본 패키지를 업데이트할 때는 스크립트의 버전/구조 계약을 검토하고 다시 생성한다.

Wanted 자산 테스트는 CSS가 참조하는 92개 파일과 manifest를 대조하고 각 파일·CSS·라이선스의 해시를 확인한다.
업데이트 시 새 버전 디렉터리를 만들고 import·manifest·공개 라이선스를 함께 갱신한다.
`@latest`나 실행 중 CDN 다운로드로 되돌리지 않는다. 저작권 고지와 OFL 라이선스는
`/licenses/pretendard-gov-OFL-1.1.txt`, `/licenses/wanted-sans-OFL-1.1.txt`로도 배포한다.

## 확인할 화면과 배포

Chromium 데스크톱과 WebKit iPad 가로에서 기본 Wanted 및 저장된 gov 선택을 각각 확인한다.
메인·공항 패널·기관 라운지·공항 모델 비교·기상 브리핑·모니터링의 글꼴 로드 실패, 문자 누락,
줄바꿈/잘림과 원래 굵기 표현을 점검한다. 화면에 없던 한글·기호를 입력해도 해당 서브셋이 로드되어야 한다.
기관 예시·기상 fixture는 폰트 전송 검증에 사용할 수 있지만, 이 검증을 최신 기상자료 검증으로 보고하지 않는다.

확인된 빌드에는 Pretendard 720개 + Wanted 92개 = 812개 woff2가 포함되며 woff는 없다.
굵기 100/200/300의 Pretendard 파일도 없어야 한다. Wanted CSS는 별도 청크에 있고
저장된 gov 선택으로 진입할 때 Wanted CSS·폰트 요청이 없어야 한다.
패키지 scripts도 변경됐으므로 이번 변경을 운영에 배포할 때는 기존 운영 규칙에 따라 full deploy를 사용한다.

[2026-09-11 조사·측정·구현 기록](../research/2026-09-11-font-delivery-optimization.md)
