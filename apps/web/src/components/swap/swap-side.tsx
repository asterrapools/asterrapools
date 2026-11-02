"use client";

import Link from "next/link";
import { ArrowUpRight, Cpu, Radio } from "lucide-react";
import { PairLabel, Sparkline, StatusDot, VenueBadge } from "@/components/kit";
import { useDashboard, useEvents } from "@/hooks/use-api";
import { useOpenVenues } from "@/hooks/use-venues";
import { addressOf } from "@/lib/contracts";
import { formatPct, formatUsd, shortAddress, timeAgo } from "@/lib/format";
import { CHAIN, explorerAddress } from "@/lib/network";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed py-2 text-sm last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-button text-muted">{k}</span>
      <span className="num text-right">{v}</span>
    </div>
  );
}

/** Left rail of /swap: what the router does with the order, with live venue state from the hub. */
export function RouteEngine() {
  const venues = useOpenVenues();
  const router = addressOf("router");
  const href = router ? explorerAddress(router) : null;
  return (
    <aside className="space-y-4 rounded-2xl border bg-surface p-5 shadow-card">
      <p className="eyebrow flex items-center gap-2">
        <Cpu className="size-3.5 text-primary-text" /> Route engine
      </p>
      <div className="space-y-2">
        {[
          ["V4", "Uniswap v4 hook pools", true],
          ["DLMM", "Discrete-bin pools", venues.dlmm],
          ["DAMM", "Single-range pools", venues.damm],
        ].map(([v, label, open]) => (
          <div key={v as string} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-2">
              <VenueBadge venue={v as string} />
              <span className="text-sm text-fg-2">{label}</span>
            </span>
            <StatusDot state={open ? "live" : "idle"} />
          </div>
        ))}
      </div>
      <div>
        <Row k="Search" v="Direct + 2-hop" />
        <Row k="Quotes" v="On-chain, eth_call" />
        <Row k="Settlement" v="One atomic tx" />
        <Row k="Native ETH" v="Auto wrap / unwrap" />
        <Row k="Network" v={CHAIN.name} />
        {router && (
          <Row
            k="Router"
            v={
              href ? (
                <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary-text">
                  {shortAddress(router)} <ArrowUpRight className="size-3" />
                </a>
              ) : (
                shortAddress(router)
              )
            }
          />
        )}
      </div>
    </aside>
  );
}

/** Right rail of /swap: live swaps from the indexer, falling back to the most active pools. */
export function LiveTape() {
  const events = useEvents({ type: "swap", limit: 7 });
  const dash = useDashboard();
  const swaps = events.data ?? [];
  const movers = (dash.data?.all ?? []).filter((p) => !p.external).sort((a, b) => b.volume_24h_usd - a.volume_24h_usd).slice(0, 5);
  return (
    <aside className="space-y-4 rounded-2xl border bg-surface p-5 shadow-card">
      <p className="eyebrow flex items-center gap-2">
        <Radio className="size-3.5 text-success" /> {swaps.length ? "Live tape" : "Active pools"}
      </p>
      {swaps.length > 0 ? (
        <ul className="space-y-1.5">
          {swaps.map((e) => (
            <li key={`${e.tx_hash}-${e.log_index}`} className="flex animate-rise items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-ui hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block truncate text-sm">{e.summary ?? "Swap"}</span>
                <span className="block font-mono text-[10px] uppercase tracking-button text-muted">
                  {e.venue ?? "Router"} · {timeAgo(e.timestamp)}
                </span>
              </span>
              {e.amount_usd ? <span className="num shrink-0 text-sm">{formatUsd(e.amount_usd)}</span> : null}
            </li>
          ))}
        </ul>
      ) : movers.length > 0 ? (
        <ul className="space-y-1.5">
          {movers.map((p) => (
            <li key={p.pool_id}>
              <Link href={`/pools/${encodeURIComponent(p.pool_id)}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-ui hover:bg-surface-2">
                <PairLabel pool={p} />
                <Sparkline values={p.sparkline} className="w-16" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-2">Every swap through the router lands here within seconds of its block.</p>
      )}
      {movers[0] && (
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="font-mono text-[10px] uppercase tracking-button text-muted">Most traded</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <PairLabel pool={movers[0]} />
            <span className="text-right text-sm">
              {movers[0].volume_24h_usd > 0 && <span className="num block">{formatUsd(movers[0].volume_24h_usd, { compact: true })}</span>}
              {movers[0].price_change_24h !== 0 && (
                <span className={movers[0].price_change_24h > 0 ? "block text-xs text-success" : "block text-xs text-danger"}>
                  {formatPct(movers[0].price_change_24h, 2, { sign: true })}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
