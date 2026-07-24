# Encoding Safety

Back to the [policy index](index.md).

## Applies when

Editing or generating text that can contain non-ASCII characters, including Korean, or performing a mechanical rewrite.

## Does not apply when

Read-only inspection of ASCII-only output that cannot alter file bytes.

## Re-check trigger

Re-check this policy before changing the edit method, moving a text file, or accepting console output as encoding evidence.

Prevent shell redirection from corrupting UTF-8 source files.

## Rules

- Do not overwrite UTF-8 source files with PowerShell `Set-Content`, `Out-File`, or `>` redirection. This host runs Claude Code on Windows PowerShell against WSL-hosted files, so the risk is live even though the repository lives on Linux.
- Use the `Edit` / `Write` tools for manual edits; they are UTF-8 safe.
- For mechanical rewrites, use Node:
  ```js
  const text = fs.readFileSync(path, 'utf8')
  fs.writeFileSync(path, newText, 'utf8')
  ```
- Do not trust PowerShell console output alone to verify Korean (or other non-ASCII) text. The file bytes may be correct even when the console shows mojibake.
- Verify non-ASCII text by reading with Node as UTF-8. When needed, inspect code points.

## When to apply

- Any source file edit that may contain Korean, Chinese, Japanese, or emoji.
- Build artifacts, migration scripts, or data fixtures that touch non-ASCII text.
