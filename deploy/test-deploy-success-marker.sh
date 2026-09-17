#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch_dir="$(mktemp -d /tmp/projectamo-deploy-marker-test.XXXXXX)"
lock_scratch_dir="$(mktemp -d /tmp/projectamo-deploy-lock-test.XXXXXX)"
child_pids=()

cleanup() {
  local pid
  for pid in "${child_pids[@]}"; do
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  done
  rm -rf -- "$scratch_dir"
  rm -rf -- "$lock_scratch_dir"
}
trap cleanup EXIT

make_fixture() {
  local fixture_root="$1"
  mkdir -p "$fixture_root/deploy" "$fixture_root/bin"
  cp "$repo_root/deploy/deploy-vm.sh" "$repo_root/deploy/deploy-vm-full.sh" "$repo_root/deploy/deploy-common.sh" "$fixture_root/deploy/"

  cat > "$fixture_root/ecosystem.config.cjs" <<'EOF'
module.exports = {
  apps: [{ name: 'projectamo-api', env: { NODE_OPTIONS: '--max-old-space-size=1400' } }],
}
EOF
  cat > "$fixture_root/deploy/build-frontend.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' build >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
[ "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}" != build ]
EOF
  cat > "$fixture_root/deploy/configure-pm2-logrotate.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' logrotate >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
EOF
  cat > "$fixture_root/bin/git" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' git >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
[ "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}" != sync ]
EOF
  cat > "$fixture_root/bin/npm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' npm >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
exit 0
EOF
  cat > "$fixture_root/bin/pm2" <<'EOF'
#!/usr/bin/env bash
printf 'pm2-%s\n' "${1:-}" >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
case "${1:-}" in
  restart)
    [ "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}" != restart ]
    ;;
  jlist)
    status=online
    [ "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}" = pm2-offline ] && status=stopped
    printf '[{"name":"other-pm2-app","pid":1,"pm2_env":{"status":"online"}},{"name":"projectamo-api","pid":%s,"pm2_env":{"status":"%s"}}]\n' "$PROJECTAMO_DEPLOY_FIXTURE_PID" "$status"
    ;;
  *)
    exit 0
    ;;
esac
EOF
  cat > "$fixture_root/bin/sudo" <<'EOF'
#!/usr/bin/env bash
printf 'sudo-%s\n' "${1:-}" >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
case "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}:${1:-}" in
  nginx:nginx|reload:systemctl) exit 1 ;;
esac
EOF
  cat > "$fixture_root/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' curl >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
for argument in "$@"; do
  if [ "$argument" = '%{http_code}' ]; then
    [ "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}" = site-health ] && printf '503' || printf '200'
    exit 0
  fi
done
[ "${PROJECTAMO_DEPLOY_FIXTURE_FAILURE:-}" != health ]
EOF
  cat > "$fixture_root/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "$fixture_root/bin/date" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' date >> "$PROJECTAMO_DEPLOY_FIXTURE_LOG"
printf 'fixture-success-marker\n'
EOF
  chmod +x "$fixture_root/deploy/build-frontend.sh" "$fixture_root/deploy/configure-pm2-logrotate.sh" "$fixture_root/bin/"*
}

start_expected_process() {
  NODE_OPTIONS='--max-old-space-size=1400' /bin/sleep 60 &
  child_pids+=("$!")
  expected_process_pid="$!"
}

run_fixture() {
  local deploy_script="$1"
  local failure="$2"
  local expected_status="$3"
  local fixture_root="$scratch_dir/${deploy_script}.${failure:-success}"
  local marker="$fixture_root/.deployed-at"
  local command_log="$fixture_root/commands.log"
  local pid status

  make_fixture "$fixture_root"
  printf 'previous-success-marker\n' > "$marker"
  : > "$command_log"
  start_expected_process
  pid="$expected_process_pid"

  set +e
  PATH="$fixture_root/bin:$PATH" \
    PROJECTAMO_DEPLOY_FIXTURE_LOG="$command_log" \
    PROJECTAMO_DEPLOY_FIXTURE_PID="$pid" \
    PROJECTAMO_DEPLOY_FIXTURE_FAILURE="$failure" \
    PROJECTAMO_DEPLOY_REEXEC=1 \
    bash "$fixture_root/deploy/$deploy_script" >/dev/null 2>&1
  status=$?
  set -e

  test "$status" -eq "$expected_status"
  if [ -n "$failure" ]; then
    test "$(<"$marker")" = previous-success-marker
  else
    test "$(<"$marker")" = fixture-success-marker
    test "$(tail -n 1 "$command_log")" = date
  fi
  ! compgen -G "$marker.tmp.*" > /dev/null
}

# A separate PM2 app deliberately precedes the configured projectamo-api
# entry in every fixture.  This catches a regression to jlist[0].pid.
for deploy_script in deploy-vm.sh deploy-vm-full.sh; do
  run_fixture "$deploy_script" '' 0
  for failure in sync build restart nginx reload health site-health pm2-offline; do
    run_fixture "$deploy_script" "$failure" 1
  done
done

# Keep the held-lock contract fully isolated from the operational default lock.
lock_file="$lock_scratch_dir/deploy.lock"
flock "$lock_file" /bin/sleep 60 &
child_pids+=("$!")
for attempt in $(seq 1 50); do
  if ! flock -n "$lock_file" true; then
    break
  fi
  /bin/sleep 0.01
done
if flock -n "$lock_file" true; then
  echo "failed to hold the isolated deployment lock" >&2
  exit 1
fi
for deploy_script in deploy-vm.sh deploy-vm-full.sh; do
  fixture_root="$scratch_dir/held-${deploy_script}"
  make_fixture "$fixture_root"
  printf 'previous-success-marker\n' > "$fixture_root/.deployed-at"
  : > "$fixture_root/commands.log"
  set +e
  PATH="$fixture_root/bin:$PATH" \
    PROJECTAMO_DEPLOY_FIXTURE_LOG="$fixture_root/commands.log" \
    PROJECTAMO_DEPLOY_FIXTURE_PID="$$" \
    PROJECTAMO_DEPLOY_LOCK_TEST=1 \
    PROJECTAMO_DEPLOY_LOCK_FILE="$lock_file" \
    PROJECTAMO_DEPLOY_REEXEC=1 \
    bash "$fixture_root/deploy/$deploy_script" >/dev/null 2>&1
  status=$?
  set -e
  test "$status" -ne 0
  test "$(<"$fixture_root/.deployed-at")" = previous-success-marker
  test ! -s "$fixture_root/commands.log"
done
