# 구름·착빙 — 승인 시안과 제품 검증

승인 당시 비교 HTML·캡처는 `artifacts/cloud-icing-native-ui/`에 보존했다. **현재 제품에 A안을 적용했으며**, [구현 결과](../../proposals/2026-10-03-kim-cloud-icing-a-implementation.md)에서 변경 파일과 검증 범위를 확인할 수 있다.

현재 소스로 재생성하려면 프로젝트 루트에서 다음 명령을 실행한다.

```bash
node scripts/preview-cloud-icing-product.mjs
node scripts/verify-cloud-icing-product.mjs
```

이 폴더의 `build.mjs`·`verify.mjs`도 위 제품 검증 명령으로 연결한다. `NativeControls.jsx`는 승인 당시 비교 시안의 기록이며 제품에서 import하지 않는다. 새 결과는 `artifacts/cloud-icing-production/`에만 생성한다.

검증 번들은 실제 App·MapView·범례·기상 패널·단면·브리핑·AI 보관 결과·기관 발표 컴포넌트를 사용한다. 색·UI·상태 전이를 가상 변환으로 대체하지 않는다. 저장 KIM 2026091006, F+6/F+9 및 로컬 배경·글꼴·이미지를 fixture로 제공하며 제품의 최초 고도·실시간 시계를 변경하지 않는다. 난류 중첩 시험에는 저장 착빙 단면에 **명시적인 GKTG 시험 밴드**를 덧붙이고, 단면 지형은 시험용 평탄 지형이다. 실제 난류·지형 관측으로 해석하지 않는다.

파일 기반 확인을 위해 자료 응답·로컬 리소스·Mapbox testMode·검사 bridge만 번들에 주입한다. HTTP 차단 검사에서 외부 요청 시도도 실패로 처리한다. 기상청 호출·수집·개발 서버 실행은 없다. 실제 Standard/위성 지도와 실기기 검증은 이 번들의 범위 밖이다.
