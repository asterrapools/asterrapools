#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/vps-bootstrap.sh
# One-time VPS setup over SSH: Docker, firewall (22/80/443 only), unattended security updates, 2 GB swap, /opt/asterrapools.
set -euo pipefail
HOST="${VPS_HOST:-root@160.238.36.55}"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
apt-get update -qq && apt-get install -y -qq ufw unattended-upgrades rsync >/dev/null
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
mkdir -p /opt/asterrapools
# keep Docker's own disk use in check: unused images go after a deploy
cat >/etc/cron.weekly/docker-prune <<'CRON'
#!/bin/sh
docker image prune -af --filter "until=168h" >/dev/null 2>&1
CRON
chmod +x /etc/cron.weekly/docker-prune
docker --version; ufw status | head -3
REMOTE
