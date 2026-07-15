# Workflow Constitution Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex를 완전히 제거하고 Claude 네이티브 워크플로우(모델 티어링 + 위임 판단 게이트 + superpowers 동의 게이트 + graphify + ponytail)로 전환하며, 헌법 문서를 슬림화한다.

**Architecture:** 순수 설정/문서 작업(코드 동작 변경 없음). `.codex/` 인프라 삭제 → `.claude/agents/` 3개(모델 티어 내장) 신설 → 전역/프로젝트 헌법 재작성 → Codex 잔재 전수 청소 → graphify(CLI) 설치 → ponytail(사용자) 설치. 검증은 grep(잔재 0건) + `vite build` + 테스트 그린.

**Tech Stack:** Claude Code agents/settings, Markdown 헌법, graphify(`graphifyy` PyPI), ponytail 플러그인, knip/Playwright(기존).

**Spec:** `docs/superpowers/specs/2026-06-28-workflow-constitution-redesign-design.md`

---

## File Structure (decomposition map)

**생성:**
- `.claude/agents/researcher.md` — Haiku, read-only 탐색/리서치
- `.claude/agents/implementer.md` — Sonnet, 스코프 구현
- `.claude/agents/reviewer.md` — Sonnet, read-only 리뷰

**수정:**
- `~/.claude/CLAUDE.md` (전역) — 역할·2단계 라우팅·동의 게이트로 전면 재작성
- `~/.claude/settings.json` (전역) — `CLAUDE_CODE_SUBAGENT_MODEL` 추가
- `CLAUDE.md` (프로젝트) — §2·§3 삭제, §7→graphify, §8 codex줄 삭제, 토큰 위생
- `Architecture.md` — `.codex/` 블록 → `.claude/agents/`
- `README.md` — Codex 참조 정리
- `.gitignore` — code-review-graph → graphify 산출물
- `docs/design/design-language.md:151` — 1행 수술
- `docs/dev-server-and-capture.md` — 탈-Codex 재작성
- `docs/policies/long-context-handoff.md` — 슬림화(§5.3 보존)

**삭제:**
- `.codex/` 디렉터리 전체
- `docs/policies/code-review-graph.md`

**사용자 실행(인터랙티브):** ponytail 설치, codex 플러그인 제거

> 인코딩 안전: 모든 텍스트 편집은 Write/Edit(UTF-8). PowerShell `Set-Content`/`Out-File`/`>` 금지. 디렉터리 삭제는 `rm`/`Remove-Item` 허용.

---

## Task 1: Codex 인프라 삭제

**Files:**
- Delete: `.codex/` (디렉터리 전체: `agents/*.toml`, `config.toml`, `hooks.json`, `hooks/code_review_graph.py`)

- [ ] **Step 1: 삭제 전 현황 기록**

Run: `ls .codex/agents/` 그리고 `git status .codex`
Expected: 11개 `.toml` + config/hooks 존재 확인.

- [ ] **Step 2: 디렉터리 삭제**

Run (Bash): `rm -rf .codex`

- [ ] **Step 3: 삭제 검증**

Run: `test -d .codex && echo EXISTS || echo GONE`
Expected: `GONE`

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore(workflow): remove Codex infrastructure (.codex/)"
```

---

## Task 2: Claude 서브에이전트 로스터 생성 (모델 티어 내장)

**Files:**
- Create: `.claude/agents/researcher.md`
- Create: `.claude/agents/implementer.md`
- Create: `.claude/agents/reviewer.md`

- [ ] **Step 1: researcher.md 작성 (Haiku, read-only)**

Create `.claude/agents/researcher.md`:

```markdown
---
name: researcher
description: Read-only exploration — codebase surveys, research, file reading, grep, log analysis. Returns a tight summary, never raw dumps. Use for broad, read-once exploration the orchestrator wants kept out of main context.
tools: Glob, Grep, Read, Bash, WebSearch, WebFetch
model: haiku
---
You are a read-only research subagent. Do NOT edit files.

Your job is to explore and return a concise, decision-ready summary — not to dump file contents into the main context.

Working mode:
1. Read the task and identify exactly what the orchestrator needs answered.
2. Use Glob/Grep/Read to gather evidence; prefer targeted queries over broad reads.
3. Be rigorous about dynamic imports and string-based references when assessing usage.
4. Return: the answer, the evidence (file:line), and any uncertainty — under the requested length budget.

Do not speculate. If evidence is insufficient, say so and state what would resolve it.
```

- [ ] **Step 2: implementer.md 작성 (Sonnet, write)**

Create `.claude/agents/implementer.md`:

```markdown
---
name: implementer
description: Implements one well-scoped task, verifies it, and reports changed files and residual risks. For substantial scoped work only — trivial one-file or one-line edits stay with the orchestrator.
model: sonnet
---
You are a focused implementation subagent.

You are not alone in the codebase. Other agents or the user may have edits in progress. Do not revert changes you did not make. Keep ownership narrow and work only on the files needed for your assigned task.

Before editing:
1. Read the task text and local project instructions (CLAUDE.md, design-language.md if UI).
2. State assumptions; ask for missing context if the task is ambiguous.
3. Identify the owning files and the smallest verification that proves the task is done.

Implementation rules:
- Make the minimum change that satisfies the task. No speculative abstractions or features.
- Follow existing patterns and architecture boundaries.
- Use UTF-8 safe editing (Write/Edit); never PowerShell Set-Content on source files.
- Clean up only orphans your own change created.

After editing:
1. Run the focused verification that fits the change.
2. Check the nearest caller/failure path for regression risk.
3. Self-review the diff for scope creep.
4. Report status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, plus changed files, verification run, residual risks.
```

- [ ] **Step 3: reviewer.md 작성 (Sonnet, read-only)**

Create `.claude/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Read-only review for bugs, regressions, maintainability risk, and missing validation. Leads with findings, no praise, no edits.
tools: Glob, Grep, Read, Bash
model: sonnet
---
You are a read-only code reviewer. Lead with findings. Do not edit files. Do not give broad praise.

Working mode:
1. Map the changed/affected behavior boundary and likely failure surface.
2. Separate confirmed evidence from hypotheses.
3. Check one normal path, one failure path, one integration edge where possible.
4. Recommend the minimal intervention with the highest risk reduction.

Prioritize: bugs and regressions; incorrect async/state/data/lifecycle handling; data-shape mismatches across boundaries; unnecessary complexity; missing tests for risky behavior; violations of local rules (CLAUDE.md, design-language.md). Ignore style-only issues unless they hide a correctness risk.

Return: scope analyzed; findings ordered by severity with file:line evidence; smallest recommended fix; what still needs runtime/browser verification; residual risk.
```

- [ ] **Step 4: 검증 (frontmatter model 명시 확인)**

Run: `rg "^model:" .claude/agents/`
Expected: `researcher.md:model: haiku`, `implementer.md:model: sonnet`, `reviewer.md:model: sonnet` 3건.

- [ ] **Step 5: 커밋**

```bash
git add .claude/agents/
git commit -m "feat(workflow): add Claude subagent roster with model tiers"
```

---

## Task 3: 전역 settings.json — 서브에이전트 모델 바닥값

**Files:**
- Modify: `~/.claude/settings.json` (전역 — 프로젝트 `.claude/settings.json` 아님)

- [ ] **Step 1: 현재 전역 settings 읽기**

Read `C:\Users\Jond Doe\.claude\settings.json` (없으면 `{}`로 생성).

- [ ] **Step 2: env 키 병합 추가**

기존 키를 보존한 채 `env` 객체에 다음을 병합:

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

(이미 `env`가 있으면 그 안에 `CLAUDE_CODE_SUBAGENT_MODEL`만 추가. JSON 유효성 유지.)

- [ ] **Step 3: 검증**

Run: `rg "CLAUDE_CODE_SUBAGENT_MODEL" "C:\Users\Jond Doe\.claude\settings.json"`
Expected: `"CLAUDE_CODE_SUBAGENT_MODEL": "haiku"`. 그리고 `node -e "JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.claude/settings.json','utf8'));console.log('valid')"` → `valid`.

> 전역 파일이라 git 커밋 대상 아님. 변경만 확인.

---

## Task 4: 전역 ~/.claude/CLAUDE.md 재작성

**Files:**
- Modify: `~/.claude/CLAUDE.md` (전역, 전면 교체)

- [ ] **Step 1: 새 내용으로 전체 교체**

`C:\Users\Jond Doe\.claude\CLAUDE.md`를 다음으로 교체:

```markdown
# CLAUDE.md — Global Role & Workflow

You are Claude Code: orchestrator, architect, implementer, and reviewer. You do the work directly and delegate to subagents only when it pays off.

## Routing — decide in two stages before acting

### Stage 1: Delegate or inline?
Do it INLINE yourself when:
- Trivial/small (≈3 tool calls or fewer, 1-2 files)
- Editing a file already in context; a one-line or small fix
- Integration/wiring points (route registration, prop wiring, shared hooks/stores)
- Rapid debug loops (error → one-line fix → rerun)
- Decisions and judgment calls

DELEGATE to a subagent when:
- Broad exploration across many files
- Independent, parallelizable work units
- Read-once-and-discard output (codebase surveys, search, logs)
- Objective domain review needing fresh eyes

Rule of thumb: never delegate a one-line change. Delegate only when the saved main-context clutter or parallelism outweighs the ~20k-token subagent cold-start. Cap parallel fan-out at 3-5 subagents.

### Stage 2: If delegating, pick the tier
- **Opus** — orchestration, architecture, final review, decisions (usually inline)
- **Sonnet** — scoped implementation (`implementer`), domain review (`reviewer`)
- **Haiku** — research, file reading, grep exploration, test running (`researcher`)

## Skills — ask before applying
When a superpowers (or other) skill matches the situation, do NOT auto-invoke. First state which skill and why, ask "Apply [skill]?", and proceed only after the user approves. User instructions always take precedence over skill defaults.

## Task Packet
Meaningful work lives in `docs/superpowers/{specs,plans,status}/`. Spec = what/why (immutable). Plan = how (immutable). Status = cross-session handoff (mutable, under one page). Chat history is not the source of truth — read the packet first.

## Verification
- Browser-visible behavior → Playwright (`npx playwright ...`)
- Structural changes → `npx depcruise .` / `npx madge --circular .`
- Unused code → `npx knip`
- No completion claims without evidence.

## Hygiene
- Keep this file lean — it loads on every message and feeds the prompt cache.
- After two consecutive failures on the same problem, `/clear` and restart rather than digging deeper.
- On long sessions use `/compact` with an explicit preservation instruction (what to keep).
```

- [ ] **Step 2: 검증 (Codex/죽은참조 0건, 핵심 규칙 존재)**

Run: `rg -i "codex|/gstack|/skills:" "C:\Users\Jond Doe\.claude\CLAUDE.md"`
Expected: 매칭 0건.
Run: `rg -i "Delegate or inline|ask before applying|fan-out" "C:\Users\Jond Doe\.claude\CLAUDE.md"`
Expected: 3개 규칙 모두 존재.

> 전역 파일이라 git 커밋 대상 아님.

---

## Task 5: 프로젝트 CLAUDE.md 편집

**Files:**
- Modify: `CLAUDE.md` (프로젝트 루트, 헤딩은 `# agents.md`)

- [ ] **Step 1: §2·§3 삭제**

`## 2. Simplicity First` 섹션 시작부터 `## 4. Goal-Driven Execution` 직전까지(= §2 전체 + §3 전체)를 삭제. (§3 끝 "Every changed line should trace directly to the user's request." 다음 줄까지 제거하고 §4 헤딩만 남긴다.)
삭제 후 §2 자리에 한 줄 포인터 추가:
```markdown
## 2. 단순성 · 외과적 변경

과잉설계·범위 외 변경 차단은 **ponytail 플러그인**이 담당한다(결정 사다리 자동 검사). 별도 산문 규칙은 두지 않는다.
```

- [ ] **Step 2: §7을 graphify로 교체**

기존:
```
## 7. Code Review Graph

For non-trivial refactors, reviews, dependency changes, or impact analysis, narrow scope with `code-review-graph` before reading broad parts of the codebase. See `docs/policies/code-review-graph.md` for install, CLI commands, and hook behavior.
```
교체:
```
## 7. Code Knowledge Graph (graphify)

For non-trivial refactors, reviews, dependency changes, or impact analysis, query the **graphify** knowledge graph before reading broad parts of the codebase. Build with `graphify .` (code-only scope). Do not treat graph results as a replacement for build/runtime/browser verification.
```

- [ ] **Step 3: §8 Codex 줄 삭제**

`CLAUDE.md`에서 다음 줄 삭제:
```
- Work directly in Claude. Do not delegate implementation to Codex or external/`.codex` agents for now.
```
(같은 §8의 `Do NOT use the Claude Preview (preview_*)` 규칙과 Playwright 규칙은 보존.)

- [ ] **Step 4: 토큰 위생 한 줄 추가**

§9 끝(파일 마지막 `---` 직전)에 추가:
```markdown
## 10. Session Hygiene

- 같은 문제 2회 연속 실패 시 `/clear` 후 재시작.
- 긴 세션은 `/compact`에 "무엇을 남길지" 지시와 함께 사용.
```

- [ ] **Step 5: 검증**

Run: `rg -i "codex|code-review-graph" CLAUDE.md`
Expected: 0건.
Run: `rg "Simplicity First|surgical changes only" CLAUDE.md`
Expected: 0건(§2·§3 산문 제거됨).
Run: `rg "graphify|ponytail|Session Hygiene" CLAUDE.md`
Expected: 각각 존재.

- [ ] **Step 6: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs(workflow): graphify+ponytail in project CLAUDE.md, drop §2/§3, hygiene"
```

---

## Task 6: Codex/그래프 잔재 전수 청소

**Files:**
- Modify: `Architecture.md`, `README.md`, `.gitignore`, `docs/design/design-language.md`

- [ ] **Step 1: Architecture.md — .codex 블록 교체**

`Architecture.md:9-11`의 다음 블록:
```
  .codex/
    agents/                  -> Codex subagent definitions for Superpowers workflow support
    hooks.json               -> Codex lifecycle hooks, including Code Review Graph refresh
```
교체:
```
  .claude/
    agents/                  -> Claude subagent roster (researcher/implementer/reviewer, model-tiered)
```

- [ ] **Step 2: README.md — Codex 참조 정리**

`README.md`에서:
- 82행 `... Windows/Codex 환경의` → `... Windows 환경의`
- 107행 `Codex에서 서버를 열거나 Playwright/Codex App Browser로 캡처할 때는` → `로컬 서버를 열거나 Playwright로 캡처할 때는`
- 201행 `로컬 서버 실행, Playwright 스크린샷, Codex App Browser 캡처 작업은` → `로컬 서버 실행, Playwright 스크린샷·캡처 작업은`

- [ ] **Step 3: .gitignore — code-review-graph → graphify**

`.gitignore:10-11`:
```
# Added by code-review-graph
.code-review-graph/
```
교체:
```
# graphify code knowledge graph artifacts
.graphify/
graph.json
graph.html
GRAPH_REPORT.md
```

- [ ] **Step 4: design-language.md:151 — 1행 수술**

`docs/design/design-language.md:151`에서:
```
- **실행:** 기능 단위 루프(캡처 → 토큰/Fluent 교체 → 스크린샷 회귀 → AA → build/test → 머지). 구현은 Codex 위임, spec→구현→리뷰.
```
의 `구현은 Codex 위임, spec→구현→리뷰.` → `spec→구현→리뷰.` (그 외 디자인 내용 일절 무변경)

- [ ] **Step 5: 검증**

Run: `rg -i "codex|code-review-graph" Architecture.md README.md .gitignore docs/design/design-language.md`
Expected: 0건.
Run: `git diff --stat docs/design/design-language.md`
Expected: 1줄 변경(1 insertion(+), 1 deletion(-) 수준).

- [ ] **Step 6: 커밋**

```bash
git add Architecture.md README.md .gitignore docs/design/design-language.md
git commit -m "chore(workflow): purge residual Codex/code-review-graph references"
```

---

## Task 7: dev-server-and-capture.md 탈-Codex 재작성

**Files:**
- Modify: `docs/dev-server-and-capture.md`

- [ ] **Step 1: Codex 서술 제거·재작성**

문서 전체에서 다음을 제거/치환:
- "Codex App Browser" 섹션 전체 삭제 (Playwright 캡처로 일원화)
- "In Codex, do not spend a first attempt..." 샌드박스 escalation 서술 → 일반 dev 런처 안내로 치환
- "Codex Windows shell/workspace" 표현 → "Windows shell/workspace"
- 모든 "Codex" 단어 제거. 런처(저장소 dev 런처) + Playwright 스크린샷 절차만 남긴다.

핵심 보존 내용: 저장소 dev 런처 사용 권장, 서버 준비 확인, `--strictPort` 5173 충돌 처리, PATH 중복 처리, Playwright 단일/베이스라인 캡처 절차.

- [ ] **Step 2: 검증**

Run: `rg -i "codex" docs/dev-server-and-capture.md`
Expected: 0건.
Run: `rg -i "playwright|launcher|런처|strictPort" docs/dev-server-and-capture.md`
Expected: 핵심 절차 잔존 확인.

- [ ] **Step 3: 커밋**

```bash
git add docs/dev-server-and-capture.md
git commit -m "docs(workflow): de-Codex dev-server-and-capture, Playwright-only"
```

---

## Task 8: 정책 슬림화 + code-review-graph 정책 삭제

**Files:**
- Delete: `docs/policies/code-review-graph.md`
- Modify: `docs/policies/long-context-handoff.md`

- [ ] **Step 1: code-review-graph 정책 삭제**

Run (Bash): `rm docs/policies/code-review-graph.md`

- [ ] **Step 2: long-context-handoff.md에서 Codex 특화 표현 정리**

`docs/policies/long-context-handoff.md`에서:
- §5.1의 정수 보존(직접 처리 기준). §5.3 "Each subagent pays roughly 20k tokens of cold-start overhead." **보존**(Claude에도 유효).
- 본문에 `Codex`/`.codex` 단어가 있으면 제거(예: "Codex" 위임 표현 → "subagent"). Appendix의 "Superpowers" 관계표는 유지.

Run 먼저: `rg -ni "codex" docs/policies/long-context-handoff.md` 로 대상 줄 확인 후 해당 줄만 수술.

- [ ] **Step 3: 검증**

Run: `test -f docs/policies/code-review-graph.md && echo EXISTS || echo GONE` → `GONE`
Run: `rg -i "codex" docs/policies/long-context-handoff.md` → 0건
Run: `rg "20k tokens of cold-start" docs/policies/long-context-handoff.md` → 1건(보존 확인)

- [ ] **Step 4: 커밋**

```bash
git add -A docs/policies/
git commit -m "docs(workflow): delete code-review-graph policy, de-Codex long-context policy"
```

---

## Task 9: graphify 설치 + 코드 그래프 빌드

**Files:** (없음 — 도구 설치/산출물)

- [ ] **Step 1: PyPI 패키지명 재확인**

Run: `pip index versions graphifyy 2>/dev/null || pip install graphifyy==` (존재·정확명 확인. 실패 시 WebFetch로 graphify GitHub README 재확인.)
Expected: `graphifyy` 패키지 확인.

- [ ] **Step 2: 설치**

Run: `uv tool install graphifyy` (uv 없으면 `pipx install graphifyy`)
Expected: 설치 성공, `graphify` 바이너리 사용 가능.

- [ ] **Step 3: 어시스턴트 등록 + 코드 한정 빌드**

Run: `graphify install`
Run: `graphify .` (또는 빌드 명령) — **코드 경로만** 대상으로(문서/이미지 LLM 전송 제외 옵션 확인). 산출물 `graph.json` 등이 `.gitignore`로 무시되는지 확인(Task 6 Step 3).
Expected: `graph.json` 생성, 빌드 성공.

- [ ] **Step 4: 검증**

Run: `graphify query "what connects MapView to weather overlays?"` (또는 status)
Expected: 그래프 응답 정상.

> 빌드 산출물은 `.gitignore` 처리됨 → 커밋 없음. 설치 사실만 status에 기록.

---

## Task 10: ponytail 설치 (사용자) + 검증

**Files:** (없음 — 플러그인)

- [ ] **Step 1: (사용자) ponytail 설치**

USER ACTION: `/plugin install ponytail@ponytail`
이어서 강도 설정: `/ponytail lite`

- [ ] **Step 2: (사용자) codex 플러그인 제거**

USER ACTION: `/plugin` 메뉴에서 `codex` 플러그인 제거(또는 해당 마켓플레이스 제거 명령).

- [ ] **Step 3: 검증**

Run/Check: `/ponytail status` 가 활성 강도(lite)를 보고하거나, 의도적 과잉설계 프롬프트에 ponytail이 반응하는지 확인.
Expected: ponytail 활성. codex 슬래시 명령(`/codex:*`) 미존재.

---

## Task 11: 최종 전수 검증 + 마무리

**Files:** (검증 + 필요 시 Architecture.md 보정)

- [ ] **Step 1: 전수 Codex 잔재 0건 (스펙 성공기준 #1 범위)**

Run: `rg -i "codex" --glob '!docs/superpowers/archive/**' --glob '!backend/src/parsers/**' --glob '!docs/superpowers/specs/2026-06-28-*' --glob '!docs/superpowers/plans/2026-06-28-*'`
Expected: 0건. (남으면 해당 파일 수술 후 재실행.)

- [ ] **Step 2: 빌드/테스트 그린**

Run: `cd frontend && npm run build`
Expected: 빌드 성공.
Run: `npm run test:layout` (프로젝트 표준 테스트)
Expected: 통과.

- [ ] **Step 3: 성공 기준 점검**

스펙 §5의 12개 기준을 하나씩 grep/확인:
- `.claude/agents/` 3개 + `model:` ✓
- 전역 CLAUDE.md 라우팅·게이트 ✓
- `~/.claude/settings.json` env ✓
- `code-review-graph.md` 부재, `encoding-safety.md`·`long-context-handoff.md` 잔존 ✓
- `.gitignore` `.code-review-graph/` 부재 ✓
- Architecture.md `.claude/agents/` 반영 ✓
- dev-server-and-capture.md Codex 0건 ✓
- design-language.md 1행만 변경 ✓

- [ ] **Step 4: status 파일 갱신 + 커밋**

`docs/superpowers/status/workflow-constitution-redesign.status.md`에 완료 기록(Resume Point, Verified, Deviations). 그 후:
```bash
git add -A
git commit -m "chore(workflow): finalize constitution redesign — verification green"
```

---

## Self-Review 결과

- **Spec 커버리지**: §3.1(T1,5,6,7,8) · §3.2(T2) · §3.3(T3,4) · §3.4(T4) · §3.5(T9, T5) · §3.6(T10) · §3.7(T4,5,7,8) — 전 항목 태스크 대응 확인.
- **사람 판단 항목**: ponytail/codex 플러그인(T10)을 USER ACTION으로 분리.
- **타입/명칭 일관성**: 에이전트명 researcher/implementer/reviewer가 전역 CLAUDE.md 루브릭(§Stage 2)과 일치.
- **검증 가능성**: 모든 태스크에 grep 또는 build 검증 단계 포함. 코드 동작 변경이 없어 단위테스트 대신 잔재-grep + build를 검증 수단으로 사용.
