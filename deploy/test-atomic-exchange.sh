#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch_dir="$(mktemp -d /tmp/projectamo-renameat2-test.XXXXXX)"
trap 'rm -rf -- "$scratch_dir"' EXIT

mkdir -p "$scratch_dir/first" "$scratch_dir/second"
printf 'first\n' > "$scratch_dir/first/value"
printf 'second\n' > "$scratch_dir/second/value"

python3 "$repo_root/deploy/atomic-exchange.py" "$scratch_dir/first" "$scratch_dir/second"
test "$(<"$scratch_dir/first/value")" = 'second'
test "$(<"$scratch_dir/second/value")" = 'first'
