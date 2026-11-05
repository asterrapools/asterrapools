-- Mainnet lists the 15 most active external Uniswap v4 pools. 20261101000002 set 40, but on a fresh database the
-- migrations run before seed.sql creates the chain row, so that update matched nothing and mainnet stayed at 0.
update public.chains set external_max = 15 where chain_id = 4663;
