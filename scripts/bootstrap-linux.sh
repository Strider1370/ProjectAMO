#!/usr/bin/env bash
# One-time setup for a fresh clone on Linux (WSL Ubuntu or any Linux host).
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "bootstrap-linux.sh: this project is Linux-only; run it inside WSL or a Linux host." >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

required_node="$(tr -d '[:space:]' < .nvmrc)"
required_npm="10.9.8"

if command -v nvm >/dev/null 2>&1 || [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install
  nvm use
else
  echo "bootstrap-linux.sh: nvm not found; using the already-installed Node after version validation." >&2
fi

actual_node="$(node --version 2>/dev/null || true)"
actual_npm="$(npm --version 2>/dev/null || true)"
if [[ "$actual_node" != "v${required_node}" ]]; then
  echo "bootstrap-linux.sh: Node ${required_node} from .nvmrc is required (found ${actual_node:-missing})." >&2
  exit 1
fi
if [[ "$actual_npm" != "$required_npm" ]]; then
  echo "bootstrap-linux.sh: npm ${required_npm} from packageManager is required (found ${actual_npm:-missing})." >&2
  exit 1
fi

echo "== installing dependencies =="
npm ci
npm --prefix frontend ci
npm --prefix backend ci

echo "== installing Playwright browser =="
npm run install:browsers:chromium

echo "== git config =="
git config core.autocrlf false
git config core.eol lf

credential_helper="$(git config --global credential.helper || true)"
if [[ "$credential_helper" == *"/mnt/"* ]]; then
  echo "bootstrap-linux.sh: global git credential.helper depends on a Windows-mounted path (${credential_helper})." >&2
  echo "  That won't exist on a Linux-only host. Fix with, e.g.:" >&2
  echo "  git config --global credential.helper store" >&2
fi

echo "bootstrap complete."
