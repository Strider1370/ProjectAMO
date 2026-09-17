#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch_dir="$(mktemp -d /tmp/projectamo-deploy-lock-test.XXXXXX)"
holder_pid=""
cleanup() {
  if [ -n "$holder_pid" ]; then
    kill "$holder_pid" 2>/dev/null || true
    wait "$holder_pid" 2>/dev/null || true
  fi
  rm -rf -- "$scratch_dir"
}
trap cleanup EXIT

# Keep the offline test away from the lock that serializes real deployments.
# The deploy entrypoints retain that path as their default; this test injects a
# unique lock path only to exercise the same mutual-exclusion contract.
lock_file="$scratch_dir/deploy.lock"
marker_file="$scratch_dir/commands-ran"
mkdir -p "$scratch_dir/bin"

for command in git npm pm2 sudo curl sleep; do
  cat > "$scratch_dir/bin/$command" <<'EOF'
#!/usr/bin/env bash
touch "$PROJECTAMO_DEPLOY_TEST_MARKER"
exit 0
EOF
  chmod +x "$scratch_dir/bin/$command"
done

flock "$lock_file" sleep 5 &
holder_pid=$!
sleep 0.1

for deploy_script in deploy-vm.sh deploy-vm-full.sh; do
  set +e
  PATH="$scratch_dir/bin:$PATH" PROJECTAMO_DEPLOY_LOCK_FILE="$lock_file" PROJECTAMO_DEPLOY_TEST_MARKER="$marker_file" \
    PROJECTAMO_DEPLOY_LOCK_TEST=1 bash "$repo_root/deploy/$deploy_script" >/dev/null 2>&1
  status=$?
  set -e

  test "$status" -ne 0
  test ! -e "$marker_file"
done

# The scripts update themselves after pull. Their re-exec must retain the
# original lock descriptor, otherwise the new script rejects its own deploy.
for deploy_script in deploy-vm.sh deploy-vm-full.sh; do
  set +e
  PROJECTAMO_DEPLOY_REEXEC=1 bash "$repo_root/deploy/$deploy_script" >/dev/null 2>&1
  status=$?
  set -e
  test "$status" -ne 0 # FD 9 is absent in this direct invocation.
done


# The test-only route must reject arbitrary paths before the redirection that
# opens a lock file.  This keeps an inherited test variable from creating or
# truncating a caller-selected path.
unsafe_lock_file="$scratch_dir/not-an-allowed-lock"
for deploy_script in deploy-vm.sh deploy-vm-full.sh; do
  set +e
  PATH="$scratch_dir/bin:$PATH" PROJECTAMO_DEPLOY_LOCK_FILE="$unsafe_lock_file" PROJECTAMO_DEPLOY_TEST_MARKER="$marker_file" \
    PROJECTAMO_DEPLOY_LOCK_TEST=1 bash "$repo_root/deploy/$deploy_script" >/dev/null 2>&1
  status=$?
  set -e

  test "$status" -ne 0
  test ! -e "$unsafe_lock_file"
  test ! -e "$marker_file"
done
