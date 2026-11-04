#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/vps-bootstrap.sh
# One-time check of the VPS: the host already runs Docker and Coolify's Traefik (ports 80/443, Let's Encrypt),
# which AsterraPools joins through the external `coolify` network. Firewall and proxy stay as Coolify manages them.
set -euo pipefail
HOST="${VPS_HOST:-root@160.238.36.55}"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
docker --version
docker network inspect coolify >/dev/null && echo "coolify network: ok"
docker ps --filter name=coolify-proxy --format '{{.Names}} {{.Status}}'
command -v rsync >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync >/dev/null)
mkdir -p /opt/asterrapools
echo "ready: /opt/asterrapools"
REMOTE
