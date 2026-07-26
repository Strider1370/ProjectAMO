# 워크플로우 헌법 재설계 (Workflow Constitution Redesign)

> 작성일: 2026-06-28
> 상태: 설계 확정, 리뷰 대기
> 디자인 헌법(`docs/design/design-language.md`)은 **불가침** — 이 재설계의 대상이 아니다.

---

## 1. 무엇을 / 왜 (What / Why)

ProjectAMO의 워크플로우 지침 체계를 **"Codex 위임 + 자동 강제"** 에서 **"Claude 네이티브 + 모델 티어링 + 동의 기반 + 영속 그래프"** 로 전환한다.

현재 체계의 문제:
- **Codex 의존**: 전역 역할정의가 "Claude는 계획만, 구현은 Codex" 전제 위에 서 있어 이중 런타임·이중 유지비 발생.
- **자동 강제**: superpowers가 세션마다 "무조건 발동" 텍스트를 주입해 사용자 통제권이 약함.
- **매번 전수조사**: code-review-graph가 있으나 영속 지식그래프로 정착되지 못함.
- **헌법 비대**: 8레이어 지침이 토큰 위생(매 메시지 로드 + 프롬프트 캐시) 관점에서 무겁다.
- **단일 모델**: 리서치·전수조사 같은 단순노동도 오케스트레이션 모델(Opus)이 직접 수행해 비용 낭비.

전환 목표: Codex 제거, Claude 서브에이전트에 모델 티어 배분, superpowers 동의 게이트, graphify로 전수조사 제거, ponytail로 과잉설계 차단, 헌법 슬림화.

## 2. 확정된 결정 (브레인스토밍 결과)

| # | 질문 | 결정 |
|---|---|---|
| Q1 | 적용 범위 | **전역(`~/.claude/CLAUDE.md`) + 프로젝트 둘 다** |
| Q2 | 동의 게이트 구현 | **CLAUDE.md 규칙으로 제어** (훅 강제 아님) |
| Q3 | ponytail vs §2·§3 | **ponytail이 대체** (§2·§3 삭제) |
| Q4 | Claude 에이전트 로스터 | **린 3개** (researcher/implementer/reviewer) |
| 구조 | 파일 구조 접근법 | **B안 — 통합 압축** |
| 그래프 | 코드 그래프 도구 | **graphify 유지** (경쟁자 CodeGraph/GitNexus 대신) |

## 3. 범위 (In Scope)

### 3.1 Codex 완전 제거 (전수 잔재 청소)
디렉터리/플러그인:
- `.codex/` 디렉터리 통삭제: `agents/*.toml`(11종), `config.toml`, `hooks.json`, `hooks/code_review_graph.py`
- `codex` 플러그인 자체 제거(`/plugin`)는 인터랙티브 명령 → **사용자 실행** (메모만)

지침 파일:
- 전역 CLAUDE.md에서 Codex 역할정의, `/codex:rescue`, `/codex:review`, 스킬 참조표, 죽은 참조(`/gstack:*`, `/skills:*`) 제거
- 프로젝트 CLAUDE.md §8의 Codex 위임 금지 줄 삭제 — 대상: `CLAUDE.md:89` "Work directly in Claude. Do not delegate implementation to Codex or external/`.codex` agents for now." (같은 §8의 Playwright·preview 금지 규칙은 보존)

전수 grep으로 발견된 추가 잔재 (archive·오탐 제외):
- `Architecture.md:9-11` — `.codex/` 디렉터리 설명 블록을 `.claude/agents/`(신규 서브에이전트) 블록으로 교체, "Code Review Graph refresh" 훅 설명 제거
- `README.md:82,107,201` — Codex 환경 주석 및 "Codex App Browser" 캡처 안내를 런처/Playwright 기준으로 정리
- `.gitignore:10-11` — `# Added by code-review-graph` / `.code-review-graph/` 항목 삭제, graphify 산출물 무시 항목으로 교체(`graph.json`/`graph.html`/`GRAPH_REPORT.md` 정책에 따라)
- `docs/design/design-language.md:151` — **불가침 예외(승인됨)**: "구현은 Codex 위임, spec→구현→리뷰" → "spec→구현→리뷰"로 그 한 줄만 수술적 수정. 그 외 디자인 내용 일절 무변경
- `docs/dev-server-and-capture.md` — §3.7에서 개편(아래 참조)

> 오탐 메모: `backend/src/parsers/*.js`의 "codex" 매칭은 `decodeXmlEntities`/`decoded` 부분일치이며 손대지 않는다.

### 3.2 Claude 서브에이전트 로스터 (모델 티어 내장)
`.claude/agents/` 신설. 기존 Codex `.toml`의 developer_instructions를 Claude `.md` frontmatter 형식으로 이식.

| 파일 | `model:` | 역할 | 도구 권한 |
|---|---|---|---|
| `researcher.md` | `haiku` | 코드 전수조사, 리서치, 파일 읽기, grep 탐색, 로그 분석 | read-only |
| `implementer.md` | `sonnet` | 스코프 1개 구현 + 자체 검증 + 변경파일 보고 | write |
| `reviewer.md` | `sonnet` | 버그·회귀·위험 read-only 리뷰 | read-only |

나머지 역할(아키텍처/스펙 리뷰, 디버깅, UI-QA, 보안)은 빌트인 에이전트(Explore/Plan/general-purpose)와 design 플러그인 스킬로 충당.

**중요**: 이 3개 에이전트는 **오케스트레이터가 선택적으로 쓰는 도구**이지 모든 작업이 거쳐가는 의무 경로가 아니다. 특히 `implementer`는 실질 스코프가 있는 구현 전용 — 자명·소규모 구현은 §3.3 위임 판단 게이트에 따라 오케스트레이터가 인라인 처리한다.

### 3.3 라우팅 = 2단계 (위임 판단 → 모델 티어)
전역 CLAUDE.md에 오케스트레이터(Opus)의 라우팅 로직을 2단계로 명문화한다. 1단계가 핵심 — 단순 작업을 서브에이전트로 넘겨 콜드스타트 낭비하는 것을 막는다.

**1단계 — 위임할까, 직접 할까? (서브에이전트 스폰 전 자가 점검)**
- **직접(인라인, 오케스트레이터가 수행)**: 자명·소규모 작업(≈3 툴콜 이하 / 1~2 파일), 이미 컨텍스트에 있는 파일의 한 줄~소폭 수정, 통합·배선 지점(라우트 등록·prop 연결·공용 훅/스토어), 빠른 디버그 루프(에러→한 줄 수정→재실행), 결정/판단 작업
- **위임(서브에이전트)**: 광범위 탐색(다수 파일), 병렬 가능한 독립 작업 단위, 1회성으로 읽고 버릴 산출물(전수조사·검색·로그), 객관성 필요한 도메인 리뷰
- **엄지 규칙**: "한 줄 수정은 절대 위임 금지. 콜드스타트(~20k 토큰) 오버헤드보다 절감(메인 컨텍스트 청결 + 병렬성)이 클 때만 위임."
- 근거: `docs/policies/long-context-handoff.md §5.1~5.3`의 원칙을 오케스트레이터 핵심 로직으로 승격한 것.

**2단계 — 위임한다면 어느 티어?**
- Opus = 오케스트레이션·아키텍처·최종 리뷰·결정 (보통 인라인)
- Sonnet = 실질 스코프 있는 구현(`implementer`), 도메인 리뷰(`reviewer`)
- Haiku = 조사·리서치·파일읽기·grep 탐색·테스트 실행(`researcher`)

**설정·가드레일**
- 전역 `~/.claude/settings.json`(프로젝트 `.claude/settings.json` 아님)에 `env.CLAUDE_CODE_SUBAGENT_MODEL: "haiku"` (애드혹 Task 바닥값)
- **서브에이전트 팬아웃 3~5개 상한** 가드레일 명문화

### 3.4 superpowers 동의 게이트
전역 CLAUDE.md에 규칙 추가:
> superpowers 스킬이 상황에 매칭돼도 **자동 발동 금지**. 먼저 *어떤 스킬을·왜* 밝히고 "적용할까요?" 물은 뒤, 사용자 승인 후에만 실행한다.

근거: superpowers의 `using-superpowers` 스킬(세션 시작 시 주입)이 직접 명시한 우선순위 — *"Superpowers skills override default system behavior, but **user instructions always take precedence** … 1. User's explicit instructions (CLAUDE.md …) — highest priority"* — 에 따라 CLAUDE.md 규칙으로 덮어쓰기가 정당하다. 훅 수정 없이 규칙만으로 달성.

폴백 리스크: 만약 향후 플러그인 갱신으로 이 우선순위가 깨지면 CLAUDE.md 규칙만으로는 부족할 수 있다. 그 경우 §Q2의 "훅 강제" 옵션으로 승격한다(현재는 미채택).

### 3.5 graphify 도입 (전수조사 제거)
- 설치: `uv tool install graphifyy` → `graphify install` (CLI, 작성자 실행)
  - ⚠️ 패키지명은 **`graphifyy`(더블 y)** 가 PyPI 정식명이고, 설치 후 CLI 바이너리·슬래시 명령은 `graphify`. 오타 아님. (대안 `pipx install graphifyy`)
  - 플랜 작성 전 PyPI에서 패키지 존재·정확한 명령을 1회 재확인한다.
- 그래프 빌드 범위: **코드 한정** (graphify는 문서/이미지를 LLM에 전송하므로 항공 데이터 보호 차원에서 코드만)
- 프로젝트 CLAUDE.md §7(code-review-graph) → graphify 사용 규칙으로 교체: "넓은 코드 읽기 전 graphify 그래프 질의"
- 커밋 시 자동 재빌드(graphify git 훅 활용)
- `docs/policies/code-review-graph.md` 삭제

### 3.6 ponytail 도입 (과잉설계 차단)
- 설치: `/plugin install ponytail@ponytail` (인터랙티브, **사용자 실행**)
- 강도 기본값: `lite` 제안 (추후 `/ponytail full` 조정 가능)
- 프로젝트 CLAUDE.md **§2(단순성)·§3(외과적 변경) 삭제** — ponytail이 대체

### 3.7 헌법 단순화 (B안)
**전역 `~/.claude/CLAUDE.md`** — 전면 재작성:
- 새 역할: Claude = 오케스트레이터 + 구현 주체 (Codex 위임 전제 폐기)
- 모델 티어링 루브릭 / 동의 게이트 / 팬아웃 상한
- 검증 규칙 유지(Playwright·depcruise·knip) / 태스크 패킷 유지
- 죽은 참조(gstack·skills·codex) 정리

**프로젝트 `CLAUDE.md`** — 섹션별:
- §1 생각 먼저 → 유지
- §2 단순성 / §3 외과적 변경 → **삭제** (ponytail)
- §4 목표 주도 → 유지
- §5 아키텍처 맵 + design-language → 유지
- §6 인코딩 안전 → 유지
- §7 code-review-graph → **graphify로 교체**
- §8 브라우저 검증(Playwright) → 유지 (Codex 금지 줄만 삭제)
- §9 long-context → 유지·슬림

**`docs/policies/`**:
- `encoding-safety.md` → 유지 (여전히 유효)
- `code-review-graph.md` → 삭제
- `long-context-handoff.md` → 트리거 기준 + 상태파일 표준 유지. **§5.3 "20k cold-start" 비용 인식은 Claude 서브에이전트에도 유효하므로 보존**(모델 티어링과 중복 아님 — 티어링=어떤 모델, 비용인식=스폰 오버헤드). 제거 대상은 Codex 특화 표현/참조에 한정

**`docs/dev-server-and-capture.md`** — 개편(승인됨):
- Codex 샌드박스·"Codex App Browser"·"Codex Windows workspace" 서술 전부 제거
- 런처(저장소 dev 런처) + Playwright 스크린샷 절차만 남겨 현재 지침으로 재작성
- README·design-language가 이 문서를 현재 지침으로 참조 중이므로, 링크는 유지하되 내용을 탈-Codex화

**토큰 위생 보강**(CLAUDE.md에 한 줄씩):
- CLAUDE.md ~100줄 목표
- 2회 연속 실패 → `/clear` 리셋 규칙
- `/compact` 보존지시 활용 안내

## 4. 범위 밖 (Anti-Scope)

- `docs/design/design-language.md` — **불가침**, 단 §3.1의 151줄 1행(Codex 위임) 수술적 수정만 승인된 예외
- `docs/superpowers/{specs,plans,status}/*`, `docs/superpowers/archive/*` 과거 기록 — 보존(archive의 codex 잔재는 의도적 보존)
- `docs/research/*`, `docs/superpowers/specs/refs/*` 참고자료 — 보존
- 결정론적 오케스트레이션 스크립트, spec-kit 도입 — 오버킬, 채택 안 함
- 그래프 도구 교체(CodeGraph/GitNexus) — graphify 유지로 기각
- 코드 동작 변경 — 이번 작업은 워크플로우/설정/문서만 건드린다

## 5. 성공 기준 (Success Criteria)

1. `.codex/` 디렉터리 부재. **"codex" 문자열 0건** — 검색 범위: 저장소 전체에서 `docs/superpowers/archive/`(과거 기록)와 `backend/src/parsers/*.js`(decodeXml 오탐) 제외. 대상에 전역·프로젝트 CLAUDE.md, Architecture.md, README.md, dev-server-and-capture.md 포함
2. `.claude/agents/`에 researcher(haiku)·implementer(sonnet)·reviewer(sonnet) 3개 존재, frontmatter `model:` 명시
3. 전역 CLAUDE.md에 2단계 라우팅(위임 판단 게이트 + 모델 티어 루브릭) + 팬아웃 상한 + 동의 게이트 규칙 존재. 위임 판단 게이트는 "한 줄/소규모 작업은 인라인, 위임은 콜드스타트보다 절감이 클 때만"을 명시
4. 전역 `~/.claude/settings.json`에 `CLAUDE_CODE_SUBAGENT_MODEL: "haiku"` 존재
5. graphify 설치·코드 그래프 빌드 성공, CLAUDE.md §7이 graphify를 가리킴
6. 프로젝트 CLAUDE.md에 §2·§3 부재. ponytail 설치(사용자) 후 동작 확인 — 검증: `/ponytail status` 또는 의도적 과잉설계 프롬프트에 ponytail이 반응
7. `docs/policies/code-review-graph.md` 부재, `encoding-safety.md`·`long-context-handoff.md` 잔존(후자는 슬림화)
8. `.gitignore`에 `.code-review-graph/` 부재
9. `Architecture.md`에 `.codex/`·code-review-graph 참조 0건, `.claude/agents/` 반영
10. `docs/dev-server-and-capture.md`에 Codex 서술 0건, 런처+Playwright 절차로 재작성됨
11. design-language.md는 **151줄 1행 외 무변경** (git diff가 그 한 줄만)
12. 모든 편집 파일 UTF-8 보존(인코딩 정책 준수)

## 6. 리스크 / 통제

| 리스크 | 통제 |
|---|---|
| 전역 CLAUDE.md 재작성이 타 프로젝트에 악영향 | 새 규칙은 도구-불문 일반론(티어링·동의·검증)으로 한정, 프로젝트 고유 내용은 프로젝트 파일에만 |
| ponytail/graphify 플러그인 의존성 | 둘 다 제거해도 원칙은 CLAUDE.md/문서에 잔존하도록 한 줄 포인터 유지 검토 |
| graphify의 문서/이미지 LLM 전송 | 빌드를 코드 경로로 한정 |
| 인코딩 손상(한글 다수) | Write 도구(UTF-8)·Node fs로만 작성, PowerShell Set-Content 금지 |
| 인터랙티브 명령(`/plugin`) | 작성자가 못 함 → 사용자 실행 단계로 명시 분리 |

## 7. 작업 분담

- **작성자(Claude)**: 파일 작성·삭제·재작성, graphify CLI 설치·빌드, settings.json 편집, 검증
- **사용자**: `/plugin install ponytail@ponytail`, `codex` 플러그인 제거 등 인터랙티브 명령
