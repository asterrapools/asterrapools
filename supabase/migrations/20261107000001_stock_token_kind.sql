-- Stocks first seen through an external pool stayed "unknown", which hid them from the stock filter.
update public.tokens set kind = lower(asset_class), updated_at = now()
where kind = 'unknown' and asset_class in ('STOCK', 'RWA');
