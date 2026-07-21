# 레이더 관측 이동 화살표 상태

**Status:** Planned — implementation not started
**Updated:** 2026-07-22
**Spec:** `docs/superpowers/specs/2026-07-22-radar-lightning-motion.md`
**Plan:** `docs/superpowers/plans/2026-07-22-radar-lightning-motion.md`

## Confirmed decisions

- 레이더 연속 5분 관측 프레임으로만 이동 경향을 계산한다. 예측은 포함하지 않는다.
- 낙뢰는 벡터 계산에 쓰지 않고 포인트로 유지한다.
- 표시 기준은 slider 시각이 아니라 실제 표시 레이더 프레임 `radarFrame.tm`이다.
- 레이더 범례 안의 `이동 화살표 표시` 토글로 제어하며 기본값은 OFF다.
- 레이더를 끄면 화살표도 즉시 숨긴다.

## Next checkpoint

Task 1의 순수 이동 산출기와 합성 격자 단위 테스트부터 시작한다. 그 전에는 수집·지도·UI 파일을 변경하지 않는다.

## Recorded review decisions

- FR-009/FR-009a는 실제 렌더링 `radarFrame.tm`을 기준으로 한다.
- 정상 수집 주기에는 직전 원시 격자 재수집 대신 직전 **축소 이동 입력**을 보존한다.
- frame matching, background history, 30초 예산, 화살표 밀도에 대한 코드 리뷰 의견을 스펙과 계획에 반영했다.
- `RENDER_VERSION` 변경은 레이더 PNG와 동일하게 motion metadata/GeoJSON도 재생성하는 cache invalidation이다.

## Operational calibration remaining

운영 KMA 사례로 반사도 임계값, 탐색 반경, 신뢰도 임계값, 속도 범례를 보정한다. 이는 예측 기능을 추가하는 작업이 아니다.
