-- Runs once when the data volume is created: give the API login roles the stack password.
\set pgpass `echo "$POSTGRES_PASSWORD"`
alter user authenticator with password :'pgpass';
alter user supabase_admin with password :'pgpass';
alter user postgres with password :'pgpass';
