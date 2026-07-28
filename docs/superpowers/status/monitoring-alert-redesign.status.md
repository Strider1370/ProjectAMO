# 모니터링 알람 개편 Status

Updated: 2026-07-28 KST
Branch: `main` (별도 브랜치 없음 — 아래 "브랜치" 절 참조)
Spec: `docs/superpowers/specs/2026-07-27-monitoring-alert-redesign-design.md`
Plan A: `docs/superpowers/plans/2026-07-28-monitoring-alert-display-redesign.md` — **완료**
Plan B: `docs/superpowers/plans/2026-07-28-taf-change-alerts.md` (8과제) — **미착수**

## Resume Point

- 마지막 완료: 계획 A 전 과제 + 최종 리뷰 수정 + 화면 결함 3건 수정. 계획 B는 작성·검토·수정까지 끝났고 **코드는 시작 전.**
- 다음: **계획 B Task 1** — `backend/src/processors/taf-previous.js` (직전 TAF 보관 규칙, 순수 함수 + TDD)
- 실행 방식: `superpowers:subagent-driven-development`. 과제마다 서브에이전트 1개 + 사이 검토.
- **계획 B는 이미 reviewer 검토를 받고 지적 16건을 전부 반영했다. 다시 계획 리뷰를 붙이지 마라.**

## 시작 전 기준선 (측정값 — 이 숫자가 유지되어야 한다)

```
프런트 단위:  cd frontend && node --test src/features/monitoring/legacy/utils/alerts/*.test.js
              → 21 tests, 21 pass, 0 fail

브라우저 계약: cd frontend && npx playwright test verification/contracts/monitoring.spec.mjs --retries=0
              → 15 passed, 9 skipped, 0 failed  (desktop · ipad-landscape · mobile)
```

개발 서버가 이미 떠 있으면 playwright 앞에 `CONTRACT_REUSE_SERVER=1`을 붙인다.

## 함정 — 모르면 반드시 시간을 버린다

**1. `node --test <디렉터리>`는 가짜 통과를 낸다.**
Node v22.23.1에서 디렉터리를 넘기면 `*.test.js`를 탐색하지 않고 그 폴더의 `index.js`를 임포트한 뒤 **그 성공을 "테스트 1개 통과"로 센다.** 실제 assertion은 0개다. 계획서 곳곳이 이 함정을 경고하지만 습관적으로 디렉터리를 넘기기 쉽다. **항상 글로브(`*.test.js`)를 쓴다.**
실측: 디렉터리 형식 → `# tests 1 # pass 1`, 글로브 → `# tests 21 # pass 21`.

**2. `git add -A` 금지.** 다른 세션이 같은 워킹트리에서 작업할 수 있다. 각 Task가 명시한 경로만 `git add` 한다. 커밋 전 `git status --porcelain`으로 스테이징을 확인한다. `.artifacts/`는 미추적이 정상이니 건드리지 않는다. pre-commit hook이 graphify 그래프를 재빌드하므로 `graphify-out/`이 커밋에 섞이지 않았는지도 본다.

**3. 한글 파일은 `Edit`/`Write` 도구로만 수정한다.** 셸 리다이렉션(`>`, `sed -i`, `cat <<EOF`) 금지. 읽기용 `grep`/`sed -n`은 괜찮다. 근거: `docs/policies/encoding-safety.md`

**4. 코드 탐색 전 graphify.** `graphify query "<질문>"`을 먼저 돌린다(`explain`/`path`도 있다). 특정 줄을 고칠 때만 raw 파일을 읽는다. **서브에이전트 프롬프트에도 이 지시를 넣는다.** 코드 수정 후 `graphify update .`.

**5. 브라우저 계약의 `route.fetch()`는 픽스처를 우회한다.** 페이지 라우트를 거치지 않고 실제 백엔드(:3001, `webServer`가 `DISABLE_COLLECTION=1`로 띄움)로 나간다. 응답을 받아 고치려 하면 `airports.RKSI`가 없어 TypeError가 난다. 계획 B Task 7이 픽스처에서 본문 생성 함수를 export하게 만들어 두었으니 그것을 쓴다.

**6. 계약 픽스처의 TAF mock은 아직 실제 파서 모양이 아니다.** `timeline`이 없고 `issuedAt`/`validFrom`/`validUntil`이라는 존재하지 않는 이름을 쓴다. 계획 B Task 7이 이것을 다시 만든다. **Task 7 없이는 Task 8의 TAF 계약을 만들 수 없다.**

## 이미 정해진 것 — 다시 논의하지 마라

계획 A 실행 중 사용자가 확정한 사항이다. 스펙 §0에도 적혀 있다.

- **강조는 처음 60초만.** 조건이 이어지는 동안 알람 줄은 표에 남되 다시 강조하지 않는다. `alert-state.js`의 `firstFired` → `dispatch`의 `highlightSince`로 구현돼 있다. **재알림(소리)은 그대로 울린다** — 재발화 자체를 막으면 소리가 죽는다.
- **알람 줄의 수명은 "악화 시각이 모두 지날 때까지"다.** 스펙 §12.7의 "다음 TAF 도착까지"와 다르며, 이쪽이 맞다. 수명을 늘리는 코드를 만들지 마라.
- **정정 발표(`CORRECTION`)는 수정 발표(`AMD`)와 똑같이 취급한다.**
- **지상 모드에서는 렌더 자체를 막는다.** 판정만 멈추면 부족하다. 단 소리 예시 **버튼**은 활성 그대로다.
- **지도 강조 생략 조건은 "낙뢰 레이어 꺼짐"만이다.** 낙뢰 깜빡임 토글은 별개 컨트롤이며 강조와 무관하다.
- **TAF 강조는 시간 눈금이 아니라 막대에 붙고, 한 시간대가 걸리면 다섯 줄(비행조건·날씨·바람·시정·운고)을 함께 강조한다.** 요소별 구분보다 "이 시간대가 문제"가 4m에서 보이는 것이 우선이다. 그래서 `highlight.fields`는 계속 아무도 읽지 않는 예비 값이다 — **계획 B의 새 트리거도 `times`만 채우면 강조가 자동으로 붙는다.**
- **모바일은 `/monitoring` 진입 차단.** 기존 모바일 대응 코드는 지우지 않는다(가드만 풀면 되살아나야 한다).
- **새 임계값 설정을 만들지 않는다.** 계획 B는 기존 트리거의 임계값을 읽는다. 설정창에 늘어나는 것은 켜기/끄기 2개뿐이다.

## 계획 A가 남긴 인터페이스 (계획 B가 갖다 쓸 것)

| 이미 있는 것 | 위치 |
|---|---|
| `highlight` 필드 (`{ panel:'taf', fields, times }`) | 각 트리거 반환 객체 |
| 하단 알람 표 | `.alert-table` · `.alert-table-row` · `.alert-table-row--new` |
| 요소 반짝임 | `.alert-outline-blink`(+`--warning`/`--info`) |
| 공항별 이력 정리 | `clearResolvedAlerts(firedKeys, icao)` — **인자 둘** |
| 최초 발동 시각 | `getFirstFired(key)` → `dispatch(..., highlightSince)` |
| 저장분 정리 | `migratePersonalSettings(personal)` — 계획 B는 **손댈 필요 없다**(개인 설정은 기본값 위에 깊은 병합되므로 새 트리거 2종은 자동으로 기본값을 받는다) |

`trigger.evaluate(current, previous, params, allTriggers)` — **네 번째 인자는 계획 B Task 5가 추가한다.** 지금은 세 인자다.

## 계획 A 실행 중 드러난 결함들 (전부 수정 완료 — 참고용)

계획서나 리뷰가 잡지 못하고 실제로 돌려야 나온 것들이다. 같은 종류를 계속 경계한다.

1. **화면 백지화** — 기본값에서 지운 키를 `Settings.jsx`가 가드 없이 읽어 `/monitoring` 전체가 안 떴다. 계획의 작업 순서를 바꿔(Task 10을 Task 4 뒤로) 해결.
2. **가짜 통과 검증 명령** — 위 함정 1.
3. **픽스처가 처음부터 실제 백엔드와 다른 모양** — METAR/TAF 패널이 브라우저 계약에서 한 번도 렌더된 적이 없었다. 엔드포인트별로 실제 processor에 맞춰 교정했다.
4. **지도 링이 굵은 채로 굳음** — 낙뢰 레이어가 꺼지면 강조가 생략돼야 하는데 5px로 멈췄다.
5. **알람 줄이 재발화마다 쌓임** — 같은 조건이 5분마다 줄을 하나씩 더 만들어, 20분이면 6칸 중 4칸을 한 조건이 점유했다. `alertKey` 기준 중복 제거로 해결.
6. **알람 표 글자가 줄 밖으로 넘침** — 조상에서 물려받은 `line-height: 20px`(고정)에 46px 글자를 넣고 있었다. 단위 없는 `1.25`로 교체.
7. **TAF 막대 테두리가 잘림** — `.taf-new-timeline`의 `overflow: hidden` + 막대 `height: 100%` 조합에서 바깥쪽 `outline`은 위·아래가 잘려 좌우 세로선만 남았다. 음수 `outline-offset`으로 안쪽에 그려 해결.

## 커밋

```
efb171d  docs: TAF 변화 알람 구현 계획(계획 B)
be63a0c  fix: TAF 막대 강조 테두리가 잘리지 않게 안쪽에 그린다
526a6f2  fix: 알람 표 줄높이와 TAF 막대 테두리 가림
3ce2188  fix: 알람 표 글자 잘림과 TAF 강조 위치
4460e79  docs: 스펙을 계획 A 실행 결과에 맞춰 사실대로 고친다
976ee12  fix: 지속되는 알람 조건의 강조 재시작을 막는다
ec009ba  fix: 최종 리뷰 수정 웨이브 (이음매 결함 3건)
1571e3b  test: 알람 표 계약으로 갈아끼우고 등록부 정정   ← 계획 A Task 11
dce6769  feat: 모바일 폭에서 상황판 진입 차단            ← Task 9
eeeb2c2  fix: 낙뢰 레이어 꺼짐일 때 링 강조 굳음
ea187ec  feat: 강조 대상 분배, 판정 중단·재개 정리       ← Task 8
3292935  feat: 문제가 난 요소를 외곽선으로 짚어준다       ← Task 7
d1a5782  refactor: 자막 알림 바 제거                     ← Task 6
114c667  feat: 알람 패널을 하단 알람 표로 재작성          ← Task 5
8e3b84d  feat: 설정창 정리                               ← Task 10 (앞당겨 실행)
edeaf92  fix: 알람 모듈 ESM 확장자
43a078f  feat: 저장된 개인 설정 마이그레이션             ← Task 4
88462c5  fix: 알람 이력 공항별 분리                      ← Task 3
e9d2e08  feat: 판정 결과에 강조 대상 싣기                ← Task 2
f63eff6  refactor: 공항경보 트리거·죽은 설정 키 제거     ← Task 1
```

기준 커밋: `2d07f3b`. 계획 A 범위 diff는 `git diff 2d07f3b..1571e3b`.

## 브랜치

**별도 feature 브랜치 없이 `main`에 직접 쌓았다.** 다른 세션이 같은 저장소에서 작업 중이라 브랜치를 갈아타면 그쪽에 영향이 가기 때문이며, 사용자 확인을 거친 결정이다. 계획 B도 같은 방식으로 갈지, 이 시점에서 브랜치를 팔지는 **작업 시작 전에 사용자에게 확인한다.**

## 남은 Minor (미조치, 의도적)

계획 A의 리뷰들이 "합쳐도 무방"으로 판정한 것들이다. 계획 B 중에 건드릴 이유는 없다.

- `AlertPanel.jsx` — 행의 `key={alert.id}`가 재발화마다 바뀌어 리마운트된다(시각적으로 무해).
- `MonitoringPage.jsx` `collect()` — 알 수 없는 심각도가 먼저 들어오면 덮이지 않는다. 현재 트리거·예시가 `critical`/`warning`/`info`만 쓰므로 도달 불가.
- `alert-state.js` `clearResolvedAlerts` — 구조적 split이 아니라 부분문자열 매칭. ICAO가 4글자 고정이라 오늘은 안전.
- `monitoring-fixture.mjs` `/api/sigwx-low-history` — mock은 객체인데 실제 라우트는 배열. `Array.isArray` 가드가 있어 조용히 "이력 없음"으로 떨어진다.
- `/api/ground-overview` — 백엔드 processor를 찾지 못해 프런트 소비처로만 정당화된 mock 모양.
