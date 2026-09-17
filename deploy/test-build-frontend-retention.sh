#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch_dir="$(mktemp -d /tmp/projectamo-frontend-build-test.XXXXXX)"

cleanup() {
  rm -rf -- "$scratch_dir"
}
trap cleanup EXIT

make_fixture() {
  local fixture_root="$1"
  mkdir -p "$fixture_root/deploy" "$fixture_root/frontend/dist/assets" "$fixture_root/bin"
  cp "$repo_root/deploy/build-frontend.sh" "$fixture_root/deploy/"
  printf 'old index\n' > "$fixture_root/frontend/dist/index.html"
  printf 'old lazy chunk\n' > "$fixture_root/frontend/dist/assets/old-lazy.js"
  cat > "$fixture_root/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

[ "${FAIL_BUILD:-0}" != 1 ] || exit 70

out_dir=''
next_is_out_dir=0
for argument in "$@"; do
  if [ "$next_is_out_dir" = 1 ]; then
    out_dir="$argument"
    next_is_out_dir=0
    continue
  fi
  case "$argument" in
    --outDir) next_is_out_dir=1 ;;
    --outDir=*) out_dir="${argument#--outDir=}" ;;
  esac
done
[ -n "$out_dir" ]
mkdir -p "$out_dir/assets"
printf 'new index\n' > "$out_dir/index.html"
printf 'new lazy chunk\n' > "$out_dir/assets/new-lazy.js"
EOF
  chmod +x "$fixture_root/bin/npm"
cat > "$fixture_root/bin/mv" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

/bin/mv "$@"

# The build script probes support with `mv --exchange --help`.  That probe is
# not a directory exchange, so count only an invocation whose first argument
# is --exchange and which is not the two-argument help invocation.
if [ "${1:-}" = '--exchange' ] \
  && ! { [ "$#" -eq 2 ] && [ "$1" = '--exchange' ] && [ "$2" = '--help' ]; }; then
  root="${PROJECTAMO_BUILD_TEST_ROOT:?}"
  lazy="${PROJECTAMO_EXPECTED_LAZY:?}"
  test -f "$root/frontend/dist/index.html"
  test -f "$root/frontend/dist/assets/$lazy" || test -f "$root/frontend/dist.previous/assets/$lazy"
  printf 'index-and-prior-lazy-available\n' >> "$root/swap-observations"
fi
EOF
  chmod +x "$fixture_root/bin/mv"
}

run_build() {
  local fixture_root="$1"
  local expected_lazy="$2"
  : > "$fixture_root/swap-observations"
  PATH="$fixture_root/bin:$PATH" \
    PROJECTAMO_BUILD_TEST_ROOT="$fixture_root" \
    PROJECTAMO_EXPECTED_LAZY="$expected_lazy" \
    bash "$fixture_root/deploy/build-frontend.sh" >/dev/null
  test "$(wc -l < "$fixture_root/swap-observations")" -eq 2
}

fixture_root="$scratch_dir/first"
make_fixture "$fixture_root"
run_build "$fixture_root" old-lazy.js

test "$(<"$fixture_root/frontend/dist/index.html")" = 'new index'
test "$(<"$fixture_root/frontend/dist.previous/assets/old-lazy.js")" = 'old lazy chunk'
test -f "$fixture_root/frontend/dist/assets/new-lazy.js"
test ! -e "$fixture_root/frontend/dist.new"

# Retention is intentionally bounded: the next successful build replaces the
# prior generation rather than accumulating every historical release.
printf 'older lazy chunk\n' > "$fixture_root/frontend/dist.previous/assets/older-lazy.js"
run_build "$fixture_root" new-lazy.js
test "$(<"$fixture_root/frontend/dist.previous/assets/new-lazy.js")" = 'new lazy chunk'
test ! -e "$fixture_root/frontend/dist.previous/assets/older-lazy.js"

# A failed staging build cannot reach either exchange; the serving generation
# and the one-generation lazy-asset fallback remain byte-for-byte available.
live_before="$(<"$fixture_root/frontend/dist/index.html")"
previous_before="$(<"$fixture_root/frontend/dist.previous/assets/new-lazy.js")"
if PATH="$fixture_root/bin:$PATH" FAIL_BUILD=1 bash "$fixture_root/deploy/build-frontend.sh" >/dev/null 2>&1; then
  echo 'expected fake frontend build to fail' >&2
  exit 1
fi
test "$(<"$fixture_root/frontend/dist/index.html")" = "$live_before"
test "$(<"$fixture_root/frontend/dist.previous/assets/new-lazy.js")" = "$previous_before"

nginx_config="$(<"$repo_root/deploy/nginx/projectamo.conf.example")"
[[ "$nginx_config" == *'location @projectamo_previous_asset'* ]]
[[ "$nginx_config" == *'root /opt/projectamo/current/frontend/dist.previous;'* ]]
[[ "$nginx_config" == *'location = /index.html'* ]]
