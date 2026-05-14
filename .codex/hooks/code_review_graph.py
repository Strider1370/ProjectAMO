#!/usr/bin/env python3
"""Codex hook bridge for code-review-graph.

The hook is intentionally non-blocking. If the CLI is unavailable or the graph
cannot update, Codex should keep working and surface only lightweight guidance.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


def _read_hook_input() -> dict:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


def _repo_root(payload: dict) -> Path:
    cwd = payload.get("cwd") or os.getcwd()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=5,
            check=True,
        )
        return Path(result.stdout.strip())
    except Exception:
        return Path(cwd)


def _json_out(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False))


def _additional_context(message: str) -> None:
    _json_out(
        {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": message,
            }
        }
    )


def _system_message(message: str) -> None:
    _json_out({"systemMessage": message})


def _allow_permission() -> None:
    _json_out(
        {
            "hookSpecificOutput": {
                "hookEventName": "PermissionRequest",
                "decision": {"behavior": "allow"},
            }
        }
    )


def _code_review_graph() -> str | None:
    return shutil.which("code-review-graph")


def _run_crg(args: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess:
    exe = _code_review_graph()
    if exe is None:
        raise FileNotFoundError("code-review-graph")
    return subprocess.run(
        [exe, *args],
        cwd=str(cwd),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def session_start(payload: dict) -> int:
    root = _repo_root(payload)
    graph_db = root / ".code-review-graph" / "graph.db"

    if _code_review_graph() is None:
        _additional_context(
            "[code-review-graph] CLI not found. Install it and run "
            "`code-review-graph update` to enable graph-powered code context."
        )
        return 0

    result = _run_crg(["status"], root, timeout=10)
    if graph_db.exists():
        status = result.stdout.strip() or "graph status available"
        _additional_context(
            "[code-review-graph] Knowledge graph is available. Prefer graph "
            "context for broad impact analysis before scanning large parts of "
            f"the codebase manually.\n\n{status}"
        )
    else:
        _additional_context(
            "[code-review-graph] No graph database found. Run "
            "`code-review-graph update` before broad refactors, dependency "
            "changes, or impact analysis."
        )
    return 0


def update(payload: dict) -> int:
    root = _repo_root(payload)

    if _code_review_graph() is None:
        return 0

    result = _run_crg(["update", "--skip-flows"], root, timeout=30)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        if detail:
            detail = detail[:500]
            _system_message(f"[code-review-graph] update skipped or failed: {detail}")
    return 0


def _requested_command(payload: dict) -> str:
    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command") if isinstance(tool_input, dict) else None
    return command if isinstance(command, str) else ""


def _safe_code_review_graph_command(command: str) -> bool:
    stripped = command.strip()
    forbidden_shell_syntax = [";", "|", "&", ">", "<", "`", "$(", "\n", "\r"]
    if any(token in stripped for token in forbidden_shell_syntax):
        return False

    safe_patterns = [
        r"^code-review-graph\s+status\s*$",
        r"^code-review-graph\s+update\s*$",
        r"^code-review-graph\s+update\s+--skip-flows\s*$",
        r"^code-review-graph\s+detect-changes\s*$",
    ]
    return any(re.fullmatch(pattern, stripped, flags=re.IGNORECASE) for pattern in safe_patterns)


def permission_request(payload: dict) -> int:
    if _safe_code_review_graph_command(_requested_command(payload)):
        _allow_permission()
    return 0


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "update"
    payload = _read_hook_input()

    if action == "session-start":
        return session_start(payload)
    if action == "update":
        return update(payload)
    if action == "permission-request":
        return permission_request(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
