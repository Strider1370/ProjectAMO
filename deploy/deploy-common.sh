#!/usr/bin/env bash
# Shared post-restart checks for the two VM deployment entrypoints.

# The process name is owned by ecosystem.config.cjs.  Keeping the lookup here
# prevents a deployment check from silently drifting to a different PM2 entry.
projectamo_ecosystem_app_name() {
  node -e '
    const apps = require("./ecosystem.config.cjs").apps
    if (!Array.isArray(apps) || apps.length !== 1 || typeof apps[0].name !== "string" || !apps[0].name) {
      throw new Error("ecosystem.config.cjs must define exactly one named app")
    }
    process.stdout.write(apps[0].name)
  '
}

projectamo_ecosystem_node_options() {
  local app_name="$1"
  node -e '
    const appName = process.argv[1]
    const apps = require("./ecosystem.config.cjs").apps
    const app = Array.isArray(apps) ? apps.find((candidate) => candidate && candidate.name === appName) : null
    if (!app) throw new Error(`ecosystem app not found: ${appName}`)
    process.stdout.write(app.env && typeof app.env.NODE_OPTIONS === "string" ? app.env.NODE_OPTIONS : "")
  ' "$app_name"
}

# Print the PID only when the configured app has one unambiguous, online PM2
# entry.  PM2's list ordering is not an identity contract.
projectamo_pm2_online_pid() {
  local app_name app_pid
  app_name="$(projectamo_ecosystem_app_name)" || return 1

  if ! app_pid="$(pm2 jlist | node -e '
    const appName = process.argv[1]
    const input = require("fs").readFileSync(0, "utf8")
    let processes
    try { processes = JSON.parse(input) } catch (error) {
      console.error(`[deploy] PM2 jlist is not valid JSON: ${error.message}`)
      process.exit(1)
    }
    if (!Array.isArray(processes)) {
      console.error("[deploy] PM2 jlist is not an array")
      process.exit(1)
    }
    const matches = processes.filter((process) => process && process.name === appName)
    if (matches.length !== 1) {
      console.error(`[deploy] expected one PM2 app named ${appName}, found ${matches.length}`)
      process.exit(1)
    }
    const app = matches[0]
    if (!app.pm2_env || app.pm2_env.status !== "online") {
      console.error(`[deploy] PM2 app ${appName} is not online`)
      process.exit(1)
    }
    if (!Number.isInteger(app.pid) || app.pid <= 0) {
      console.error(`[deploy] PM2 app ${appName} has no running PID`)
      process.exit(1)
    }
    process.stdout.write(String(app.pid))
  ' "$app_name")"; then
    return 1
  fi

  if [ ! -r "/proc/${app_pid}/environ" ]; then
    echo "[deploy] PM2 app ${app_name} PID ${app_pid} has no readable environment" >&2
    return 1
  fi

  printf '%s\n' "$app_pid"
}

# The marker is a publication record, not a start timestamp.  Put a complete
# replacement in the same directory and rename it only after every deploy
# step and health check has succeeded.
projectamo_write_success_marker() {
  local marker_path="${1:-.deployed-at}"
  local temporary_marker

  temporary_marker="$(mktemp "${marker_path}.tmp.XXXXXX")" || return 1
  if ! date -Iseconds > "${temporary_marker}"; then
    rm -f -- "${temporary_marker}"
    return 1
  fi
  if ! mv -f -- "${temporary_marker}" "${marker_path}"; then
    rm -f -- "${temporary_marker}"
    return 1
  fi
}
