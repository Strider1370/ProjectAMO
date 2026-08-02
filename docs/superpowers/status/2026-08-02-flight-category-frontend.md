# flight_category 프론트 — 진행 상태

**갱신**: 2026-08-02 · **분기**: `main` · **시작점**: `f1b7a83`

## 문서

| | 경로 |
|---|---|
| 프론트 스펙 (승인됨) | `docs/superpowers/specs/2026-08-02-flight-category-frontend-design.md` |
| 계획 (검토 반영됨) | `docs/superpowers/plans/2026-08-02-flight-category-frontend.md` |
| 선행 백엔드 스펙 | `docs/superpowers/specs/2026-08-01-flight-category-redesign-design.md` |
| 백엔드 진행 기록 | `.superpowers/sdd/2026-08-01-flight-category-redesign-backend/progress.md` |

## 현재 상태

백엔드는 Task 1–9 완료(`325fa24`). 수집이 살아 있고 `*/20` cron으로 돈다.
API 두 창구 모두 실제 응답 확인됨.

프론트는 **아직 코드를 한 줄도 안 건드렸다.** 계획서 Task 1부터 시작한다.

계획은 한 번 검토를 받아 전면 재작성됐다(`f1b7a83`). 첫 판에 차단급 오류가
넷 있었고 모두 실물 확인으로 사실이었다 — 없는 테스트 도구(vitest), 엉뚱한
Playwright 경로, 놓친 호출부(`MapView.jsx:1195`), 빌드가 깨지는 중간 커밋.
지금 계획서는 그 넷이 반영된 상태다.

## 태스크

- [ ] Task 1 — 지점 표식 판정 (순수 계산)
- [ ] Task 2 — 자료 가르기 (순수 계산)
- [ ] Task 3 — 말풍선 문구 (순수 계산)
- [ ] Task 4 — 지도 층과 배선 (**한 커밋에**, 쪼개면 빌드가 깨진다)
- [ ] Task 5 — 범례와 층별 시각
- [ ] Task 6 — 브라우저 검증

## 이 작업에서 반복된 실패 방식

백엔드 Task 6–9에서 구현 담당이 **네 번 연속** 같은 실수를 했다. 프론트에서도
같은 자리가 위험하다.

1. **이미 있는 함수를 안 쓰고 새로 짠다.** 그 결과 같은 질문에 두 가지 답이
   생긴다. 백엔드에서 위성 마스킹·격자 읽기가 각각 두세 벌이 됐고, 그중 하나는
   화면과 지점이 다른 값을 말하게 만들었다.
2. **실제 실행 확인을 건너뛰거나 실패를 "환경 탓"으로 넘긴다.** 두 번은 실제로
   되는 것을 안 된다고 보고했다.
3. **테스트가 통과해도 동작은 깨져 있다.** `process()`에 테스트가 없어 전체
   통과 상태로 깨진 코드가 커밋된 적이 있다.
4. **보간을 좋아한다.** 결측이 음수로 표시된 격자를 보간해 **없는 값을
   만들어냈다.** 계획서가 "보간하지 말라"고 적은 자리가 여럿이다.

## 반드시 지킬 것

- **`git add -A` / `git add .` 금지.** 병렬 세션이 `frontend/src/features/terminal/*`
  와 미추적 문서 여러 개를 잡고 있다. 태스크가 지정한 파일만 스테이징한다.
- 커밋 전 `git branch --show-current`가 `main`인지 확인한다.
- 테스트는 `node --test`다. **vitest는 이 저장소에 없다.**
- Playwright는 `frontend/verification/contracts/*.spec.mjs`. `frontend/tests/`는
  없는 경로이고 거기 두면 **시험이 하나도 안 걸린 채 "통과"한다.**
- `MapView.jsx`의 구분선 주석이 물음표로 깨져 있다. **복구하려 들지 않는다.**
- Task 4 전체 회귀는 `npm test` **와** `npx vite build` 둘 다. ESM 이름 불일치는
  빌드에서만 잡힌다.
