# Workflow Constitution Redesign Status

Updated: 2026-06-28 KST
Spec: docs/superpowers/specs/2026-06-28-workflow-constitution-redesign-design.md
Plan: docs/superpowers/archive/plans/2026-06-28-workflow-constitution-redesign.md

## Resume Point
- Last completed: Phase 1 전체 완료 (Task 1~11 + ponytail 설치/강도 설정).
- Next: Phase 2(청소) 별도 진행 또는 브랜치 마무리.

## Verified
- `.codex/` 삭제, 전역·프로젝트 라이브 지침/설정에 codex 0건 (rg)
- `.claude/agents/` 3개 생성, frontmatter model: haiku/sonnet/sonnet
- 전역 `~/.claude/settings.json`: `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, codex 권한·플러그인·마켓 전면 제거, JSON valid
- 전역 `~/.claude/CLAUDE.md` 재작성 (2단계 라우팅 + 동의 게이트 + 위생)
- 프로젝트 `claude.md`: §2·§3→ponytail 포인터, §7→graphify, §8 codex줄 삭제, §10 위생. 중복 `agents.md` 삭제
- Architecture/README/.gitignore/dev-server-and-capture/design-language:151 청소 완료
- `docs/policies/code-review-graph.md` 삭제, `long-context-handoff.md`(§5.3 보존)·`encoding-safety.md` 잔존
- graphify 0.8.50 설치, 코드 전용 그래프 빌드(3637노드/6199엣지/213커뮤니티, `graphify update .`), `graphify-out/` gitignore
- 옛 code-review-graph `.git/hooks/pre-commit` 제거
- `frontend` build 성공(10.31s), test:layout 10/10, tokens.test.js 1/1

## Verified (user action 완료)
- ponytail 설치 완료: settings `ponytail@ponytail: true` + 마켓 등록, 강도 `full` (`~/.claude/.ponytail-active` = full)

## Unverified / Pending
- graphify 자동 재빌드 훅(`graphify hook install`)은 선택 — 미설정

## Deviations from Plan
- 전역 settings.json의 codex 잔재(권한 ~13개·플러그인·마켓)까지 제거(사용자 "다 없애" 지시)
- 중복 `agents.md` 삭제로 `claude.md` 단일화(사용자 승인) — dev-server 포인터 한 줄은 §8로 흡수
- code-review-graph가 설치한 `.git/hooks/pre-commit` 제거(플랜 미기재 발견분)
- 코드 전용 빌드 명령은 `graphify update .` (기본 `graphify .`는 문서/이미지에 LLM 키 요구 → 데이터 보호 위해 코드 전용 사용)
- graphify CLI 설치·pre-commit 제거는 자동 모드 분류기 차단 → 사용자가 PowerShell에서 직접 실행

## Notes
- 과거 기록(`docs/superpowers/specs|plans|status/`)의 codex 언급은 불변 이력으로 보존(작성 당시 사실). 일부는 Phase 2에서 archive 예정.
