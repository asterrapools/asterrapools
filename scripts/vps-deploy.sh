#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/vps-deploy.sh [testnet|mainnet]
# Ships the stack config (infra/, functions, migrations, addresses) to the VPS, pulls the web image CI built for the
# branch, restarts the stack, applies migrations and loads the published contract addresses. Builds nothing on the VPS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-root@160.238.36.55}"
NET="${1:-testnet}"
DIR=/opt/asterrapools
case "$NET" in testnet|mainnet) ;; *) echo "usage: vps-deploy.sh [testnet|mainnet]"; exit 1 ;; esac

ssh "$HOST" "mkdir -p $DIR/infra $DIR/supabase $DIR/addresses"
rsync -az --delete --exclude .env "$ROOT/infra/" "$HOST:$DIR/infra/"
rsync -az --delete --exclude node_modules "$ROOT/supabase/functions" "$ROOT/supabase/migrations" "$ROOT/supabase/seed.sql" "$HOST:$DIR/supabase/"
rsync -az "$ROOT/packages/sdk/src/addresses/" "$HOST:$DIR/addresses/"

# first deploy: create the secrets on this machine and send them; they never touch the repo
if ! ssh "$HOST" "test -f $DIR/infra/.env"; then
  tmp="$(mktemp)"; chmod 600 "$tmp"; trap 'rm -f "$tmp"' EXIT
  { node "$ROOT/scripts/vps-secrets.mjs"; grep -v -E '^(POSTGRES_PASSWORD|JWT_SECRET|SERVICE_ROLE_KEY|INDEXER_TOKEN|ACME_EMAIL)=' "$ROOT/infra/.env.example" | grep -v '^#'; echo "ACME_EMAIL=${ACME_EMAIL:?set ACME_EMAIL for Let's Encrypt}"; } > "$tmp"
  scp -q "$tmp" "$HOST:$DIR/infra/.env"
  ssh "$HOST" "chmod 600 $DIR/infra/.env"
fi

profile=""; [ "$NET" = mainnet ] && profile="--profile mainnet"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd $DIR/infra
docker compose $profile pull -q web-$NET
docker compose $profile up -d --remove-orphans
for i in \$(seq 1 30); do docker compose exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
bash migrate.sh
bash sync-deployment.sh testnet
bash sync-deployment.sh mainnet
docker compose ps --format '{{.Service}}\t{{.Status}}'
REMOTE
echo "deployed $NET"
