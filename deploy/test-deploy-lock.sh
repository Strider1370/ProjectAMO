#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch_dir="$(mktemp -d)"
holder_pid=""
cleanup() {
  if [ -n "$holder_pid" ]; then
    kill "$holder_pid" 2>/dev/null || true
    wait "$holder_pid" 2>/dev/null || true
  fi
  rm -rf -- "$scratch_dir"
}
trap cleanup EXIT

lock_file="/tmp/projectamo-deploy.lock"
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
  PATH="$scratch_dir/bin:$PATH" PROJECTAMO_DEPLOY_TEST_MARKER="$marker_file" \
    bash "$repo_root/deploy/$deploy_script" >/dev/null 2>&1
  status=$?
  set -e

  test "$status" -ne 0
  test ! -e "$marker_file"
done
