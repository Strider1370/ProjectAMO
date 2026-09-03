#!/usr/bin/env bash
set -euo pipefail

# PM2's module state belongs to the deploying account (ec2-user), not root.
# This is safe to run on every deploy: pm2 set replaces each named setting.
if ! pm2 ls --no-color | grep -q 'pm2-logrotate'; then
  echo '[logrotate] installing pm2-logrotate...'
  pm2 install pm2-logrotate
fi

pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 set pm2-logrotate:workerInterval 30

configuration="$(pm2 conf pm2-logrotate)"
for expected in 'max_size 10M' 'retain 7' 'compress true' 'rotateInterval 0 0 * * *'; do
  if ! grep -Fq "$expected" <<<"$configuration"; then
    echo "[logrotate] configuration verification failed: missing $expected" >&2
    exit 1
  fi
done

pm2 save
echo '[logrotate] verified: 10M or daily, gzip, retain 7'
