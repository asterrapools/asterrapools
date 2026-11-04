-- DAMM swaps were stored without a price: the shared Swap event carries the tick index, not the sqrt price. Fill in
-- the execution price from the amounts, fee excluded (token1 per token0, human units), as the indexer now records it.
update public.swaps s
set price = (case when s.token_in = p.token0
               then (s.amount_out / power(10::numeric, t1.decimals)) / ((s.amount_in - s.fee_amount) / power(10::numeric, t0.decimals))
               else ((s.amount_in - s.fee_amount) / power(10::numeric, t1.decimals)) / (s.amount_out / power(10::numeric, t0.decimals))
             end)::float8
from public.pools p
join public.tokens t0 on t0.chain_id = p.chain_id and t0.address = p.token0
join public.tokens t1 on t1.chain_id = p.chain_id and t1.address = p.token1
where s.venue = 'DAMM' and s.price is null
  and p.chain_id = s.chain_id and p.pool_id = s.pool_id
  and s.amount_out > 0 and s.amount_in > s.fee_amount;
