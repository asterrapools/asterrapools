#!/usr/bin/env bash
# Jalankan di: ROOT/infra  ->  bash migrate.sh
# Applies supabase/migrations/*.sql once each (tracked in supabase_migrations.schema_migrations, the table the
# Supabase CLI uses), loads seed.sql on the first run and writes the Vault secrets the indexer cron reads.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
psql() { docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -c "create schema if not exists supabase_migrations;
         create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);"
fresh=$(psql -tAc "select count(*) = 0 from supabase_migrations.schema_migrations")

for f in ../supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  if [ "$(psql -tAc "select 1 from supabase_migrations.schema_migrations where version = '$v'")" != "1" ]; then
    echo "apply $(basename "$f")"
    { echo "begin;"; cat "$f"; echo; echo "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$(basename "$f" .sql)');"; echo "commit;"; } | psql
  fi
done

if [ "$fresh" = "t" ]; then
  echo "seed"
  psql < ../supabase/seed.sql
fi

# Vault secrets for public.asterra_invoke_indexer (pg_cron -> pg_net -> asterra-gateway -> indexer)
psql -tA -v url="http://asterra-gateway:8000" -v token="$INDEXER_TOKEN" >/dev/null <<'SQL'
select vault.update_secret(id, :'url') from vault.secrets where name = 'project_url';
select vault.create_secret(:'url', 'project_url') where not exists (select 1 from vault.secrets where name = 'project_url');
select vault.update_secret(id, :'token') from vault.secrets where name = 'indexer_token';
select vault.create_secret(:'token', 'indexer_token') where not exists (select 1 from vault.secrets where name = 'indexer_token');
SQL
echo "migrations up to date"
