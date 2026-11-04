#!/usr/bin/env bash
# Jalankan di: ROOT/infra  ->  bash sync-deployment.sh <testnet|mainnet>
# Loads ../addresses/<network>.json (copied from packages/sdk/src/addresses by vps-deploy.sh) into public.deployments.
# The indexer rewinds to the start block when the core addresses change.
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in testnet) chain=46630 ;; mainnet) chain=4663 ;; *) echo "usage: sync-deployment.sh <testnet|mainnet>"; exit 1 ;; esac
file="../addresses/$1.json"
[ -f "$file" ] || { echo "missing $file"; exit 1; }
if [ "$(grep -c '"hub": null' "$file")" != "0" ]; then echo "$1: no deployment published yet, skipping"; exit 0; fi
# psql only interpolates variables in stdin input, not in -c
echo "select public.asterra_set_deployment(:chain, :'addrs'::jsonb, coalesce((:'addrs'::jsonb->>'startBlock')::bigint, 0));" |
  docker compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tAq -v chain="$chain" -v addrs="$(cat "$file")" >/dev/null
echo "deployments[$chain] <- $1.json"
