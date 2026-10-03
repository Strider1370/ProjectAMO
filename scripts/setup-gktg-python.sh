#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
gktg_env="${1:-${project_dir}/.venvs/kim-gktg}"
gktg_base_python="${GKTG_BOOTSTRAP_PYTHON:-}"
if [ -z "${gktg_base_python}" ]; then
  for candidate in python3 python3.14 python3.13 python3.12; do
    if command -v "${candidate}" >/dev/null 2>&1 && "${candidate}" -c 'import sys; sys.exit(sys.version_info < (3, 12))'; then
      gktg_base_python="${candidate}"
      break
    fi
  done
fi
if [ -z "${gktg_base_python}" ]; then
  echo 'GKTG requires Python >=3.12; install it or set GKTG_BOOTSTRAP_PYTHON' >&2
  exit 1
fi
"${gktg_base_python}" -c 'import sys; assert sys.version_info >= (3, 12), "GKTG NumPy requires Python >=3.12; set GKTG_BOOTSTRAP_PYTHON to the installed interpreter"'
"${gktg_base_python}" -m venv "${gktg_env}"
"${gktg_env}/bin/python" -m pip install -r "${project_dir}/backend/python/kim_turbulence/requirements.txt"
"${gktg_env}/bin/python" -c 'import numpy, numba; print("GKTG Python ready", numpy.__version__, numba.__version__)'
