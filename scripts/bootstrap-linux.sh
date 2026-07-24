#!/usr/bin/env bash
# One-time setup for a fresh clone on Linux (WSL Ubuntu or any Linux host).
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "bootstrap-linux.sh: this project is Linux-only; run it inside WSL or a Linux host." >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if command -v nvm >/dev/null 2>&1 || [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install
  nvm use
else
  echo "bootstrap-linux.sh: nvm not found, skipping Node version pin (see .nvmrc for the required version)." >&2
fi

echo "== installing dependencies =="
npm ci
npm --prefix frontend ci
npm --prefix backend ci

echo "== installing Playwright browser =="
npx --prefix frontend playwright install --with-deps chromium

echo "== git config =="
git config core.hooksPath .githooks
git config core.autocrlf false
git config core.eol lf

credential_helper="$(git config --global credential.helper || true)"
if [[ "$credential_helper" == *"/mnt/"* ]]; then
  echo "bootstrap-linux.sh: global git credential.helper depends on a Windows-mounted path (${credential_helper})." >&2
  echo "  That won't exist on a Linux-only host. Fix with, e.g.:" >&2
  echo "  git config --global credential.helper store" >&2
fi

echo "bootstrap complete."
