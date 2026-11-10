"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pause, Play, RotateCcw, Search } from "lucide-react";
import { ThemedAreaChart, type Point } from "@/components/charts/area-chart";
import { EmptyState, KV, PageHeader, PairLabel, Panel, QueryState, Stat, StatGrid, VenueBadge } from "@/components/kit";
import { Choice } from "@/components/pools/deposit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePools, usePoolTrades } from "@/hooks/use-api";
import type { ApiPoolTrades, ApiPoolWithOracle } from "@/lib/api";
import type { BinShape } from "@/lib/dlmm";
import { formatDateTime, formatNumber, formatPct, formatUsd, PENDING, timeAgo } from "@/lib/format";
import { MAX_RUNGS, simulate, usdPerToken1, type Ladder, type SimResult } from "@/lib/simulator";
import { cn } from "@/lib/utils";

type Mode = "backtest" | "paper";
const MODES: { v: Mode; l: string; d: string }[] = [
  { v: "backtest", l: "Backtest", d: "Replays a ladder against the pool's real trading, from a past start up to the latest indexed trade." },
  { v: "paper", l: "Paper pool", d: "Opens a ladder at the price now and follows the pool's real trading from that moment." },
];
const WINDOWS = [
  { v: 1, l: "24h" },
  { v: 3, l: "3 days" },
  { v: 7, l: "7 days" },
];
const SHAPES: { v: BinShape; l: string }[] = [
  { v: "spot", l: "Spot" },
  { v: "curve", l: "Curve" },
  { v: "bidask", l: "Bid-ask" },
];
const BINS = [5, 10, 20, MAX_RUNGS].map((v) => ({ v, l: String(v) }));
const STEPS = [
  { title: "Pick a pool", body: "Search any pair, or start from the most traded pools." },
  { title: "Shape the ladder", body: "Set the range, the bins, the shape and the amount." },
  { title: "Replay real trading", body: "See the fees and value the ladder would have made, trade by trade." },
];

interface Form {
  minPct: string;
  maxPct: string;
  bins: number;
  shape: BinShape;
  amount: string;
}
const DEFAULT_FORM: Form = { minPct: "-10", maxPct: "10", bins: 20, shape: "spot", amount: "1000" };

/** An open paper pool, kept in this browser. */
interface Paper {
  pool: string;
  form: Form;
  start: number;
  price: number;
  usd1: number | null;
  end: number | null;
}
const PAPER_KEY = "asterra-sim-paper";

function loadPaper(): Paper | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(PAPER_KEY) ?? "null") as Paper | null;
    return v && typeof v.pool === "string" && v.price > 0 && Number.isSafeInteger(v.start) && v.form ? v : null;
  } catch {
    return null;
  }
}

function savePaper(p: Paper | null) {
  try {
    if (p) window.localStorage.setItem(PAPER_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(PAPER_KEY);
  } catch {
    // storage blocked: the paper pool lives for this visit only
  }
}

const nowSec = () => Math.floor(Date.now() / 1000);
const minute = (t: number) => Math.floor(t / 60) * 60;

/** Deposit in token1: entered in USD when the pool's trades carry USD values, otherwise in token1. */
function ladderOf(form: Form, usd1: number | null): Ladder {
  const amount = Number(form.amount);
  return { minPct: Number(form.minPct), maxPct: Number(form.maxPct), bins: form.bins, shape: form.shape, amount: usd1 ? amount / usd1 : amount };
}

interface Run {
  result: SimResult;
  start: number;
  usd1: number | null;
  deposit: number;
}

function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-full border p-0.5" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn("rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-button", value === o.v ? "bg-fg text-bg" : "text-fg-2 hover:text-fg")}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function PoolPicker({ pools, value, onPick, locked }: { pools: ApiPoolWithOracle[]; value: string | undefined; onPick: (id: string) => void; locked: boolean }) {
  const [q, setQ] = React.useState("");
  const term = q.trim().toLowerCase();
  const list = term
    ? pools.filter((p) => `${p.token0.symbol}/${p.token1.symbol} ${p.token0.symbol} ${p.token1.symbol} ${p.pool_id} ${p.pool_address ?? ""}`.toLowerCase().includes(term))
    : pools.slice(0, 8);
  return (
    <Panel title="1 · Pick a pool" aside={<span className="font-mono text-xs text-muted">{term ? `${list.length} found` : "Most traded"}</span>}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a token, a pair or a pool address" className="pl-9" aria-label="Search pools" disabled={locked} />
      </div>
      <ul className="mt-3 divide-y rounded-lg border">
        {list.slice(0, 12).map((p) => (
          <li key={p.pool_id}>
            <button
              type="button"
              disabled={locked}
              onClick={() => onPick(p.pool_id)}
              aria-pressed={value === p.pool_id}
              className={cn("flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-ui enabled:hover:bg-surface-2", value === p.pool_id && "bg-surface-2")}
            >
              <span className="flex min-w-0 items-center gap-2">
                <PairLabel pool={p} />
                <VenueBadge venue={p.venue} external={p.external} />
              </span>
              <span className="num shrink-0 text-xs text-muted">{p.trades_24h ? `${formatUsd(p.volume_24h_usd, { compact: true })} · 24h` : "Quiet today"}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-6 text-center text-sm text-muted">No pool by that name.</li>}
      </ul>
    </Panel>
  );
}

function NumberField({ label, value, onChange, suffix, disabled }: { label: string; value: string; onChange: (v: string) => void; suffix: string; disabled?: boolean }) {
  return (
    <label className="block space-y-2">
      <span className="eyebrow block">{label}</span>
      <span className="relative block">
        <Input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          className="num pr-12"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">{suffix}</span>
      </span>
    </label>
  );
}

/** Bins of the ladder at the opening price; the bin holding the price at the playback moment is outlined. */
function LadderBars({ result, price }: { result: SimResult; price: number | null }) {
  const P0 = result.points[0]!.price;
  const vals = result.rungs.map((r) => ({ v0: r.amount0 * P0, v1: r.amount1 }));
  const max = Math.max(...vals.map((v) => v.v0 + v.v1)) || 1;
  return (
    <div className="flex h-20 items-end gap-px border-b" aria-hidden>
      {result.rungs.map((r, i) => {
        const here = price !== null && price >= r.lower && price < r.upper;
        return (
          <div key={i} className={cn("flex h-full flex-1 flex-col justify-end", here && "outline outline-1 outline-fg")}>
            <div className="bg-primary" style={{ height: `${(vals[i]!.v0 / max) * 100}%` }} />
            <div className="bg-accent" style={{ height: `${(vals[i]!.v1 / max) * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}

type ChartTab = "value" | "price" | "fees";
const CHART_TABS: { v: ChartTab; l: string }[] = [
  { v: "value", l: "Value" },
  { v: "fees", l: "Fees" },
  { v: "price", l: "Price" },
];

function Results({ run, pool }: { run: Run; pool: ApiPoolWithOracle }) {
  const { result, start, usd1, deposit } = run;
  const pts = result.points;
  const last = pts.length - 1;
  const [pos, setPos] = React.useState(last);
  const [playing, setPlaying] = React.useState(false);
  const [tab, setTab] = React.useState<ChartTab>("value");
  // a live paper pool grows: follow the newest point
  const [seenLast, setSeenLast] = React.useState(last);
  if (seenLast !== last) {
    setSeenLast(last);
    setPos(last);
  }
  React.useEffect(() => {
    if (!playing) return;
    const stride = Math.max(1, Math.ceil(pts.length / 160));
    const id = window.setInterval(() => {
      setPos((i) => {
        const next = Math.min(last, i + stride);
        if (next >= last) setPlaying(false);
        return next;
      });
    }, 40);
    return () => window.clearInterval(id);
  }, [playing, last, pts.length]);

  const sym = pool.token1.symbol;
  const usd = usd1 !== null;
  const p = pts[Math.min(pos, last)]!;
  const k = usd ? (p.usd1 ?? usd1) : 1;
  const money = (v: number) => (usd ? formatUsd(v) : `${formatNumber(v)} ${sym}`);
  const moneyShort = (v: number) => (usd ? formatUsd(v, { compact: true }) : formatNumber(v, 4));
  // float dust on an untouched ladder reads as flat, never as "-$0.00"
  const signed = (v: number) =>
    Math.abs(v) < deposit * 1e-6 ? "Flat" : <span className={cn(v > 0 ? "text-primary-text" : "text-danger")}>{v > 0 ? "+" : ""}{money(v)}</span>;
  const value = (p.value + p.fees) * k;
  const pnl = value - deposit;
  const vsHold = (p.value + p.fees - p.hold) * k;
  const tir = p.t > start ? (p.inRange / (p.t - start)) * 100 : null;
  const ptK = (x: (typeof pts)[number]) => (usd ? (x.usd1 ?? usd1) : 1);
  const shown = pts.slice(0, Math.max(2, pos + 1));
  const series: Record<ChartTab, Point[]> = {
    value: shown.map((x) => ({ t: new Date(x.t * 1000).toISOString(), v: (x.value + x.fees) * ptK(x) })),
    fees: shown.map((x) => ({ t: new Date(x.t * 1000).toISOString(), v: x.fees * ptK(x) })),
    price: shown.map((x) => ({ t: new Date(x.t * 1000).toISOString(), v: x.price })),
  };

  return (
    <div className="space-y-6">
      <StatGrid>
        <Stat label="Value at start" value={money(deposit)} hint="What the ladder held when it opened." />
        <Stat label="Value now" value={money(value)} hint="Bin tokens plus the fees earned." />
        <Stat label="Fees earned" value={money(p.fees * k)} hint={`The ladder's share of the ${pool.token0.symbol}/${sym} swap fees.`} />
        <Stat label="PnL over the run" value={signed(pnl)} hint={formatPct((pnl / deposit) * 100, 2, { sign: true })} />
        <Stat label="VS just holding" value={signed(vsHold)} hint="What the ladder made over holding its deposit untouched." />
        <Stat label="Time in range" value={tir === null ? PENDING : tir < 0.005 ? "Out of range" : `${tir.toFixed(tir >= 99.995 ? 0 : 2)}%`} hint="The share of the run the price spent inside the ladder." />
        <Stat label="Price now" value={formatNumber(p.price, 6)} hint={`${sym} per ${pool.token0.symbol}`} />
        <Stat label="Trades replayed" value={formatNumber(result.trades)} hint={`Since ${formatDateTime(start)}`} />
      </StatGrid>

      <Panel title="Simulation results" aside={<Segmented options={CHART_TABS} value={tab} onChange={setTab} label="Chart" />}>
        <ThemedAreaChart data={series[tab]} format={tab === "price" ? (v) => formatNumber(v, 5) : moneyShort} color={tab === "fees" ? "accent" : "primary"} />
        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!playing && pos >= last) setPos(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause /> : pos >= last ? <RotateCcw /> : <Play />}
            {playing ? "Pause" : pos >= last ? "Replay" : "Play"}
          </Button>
          <input
            type="range"
            min={0}
            max={last}
            value={Math.min(pos, last)}
            onChange={(e) => {
              setPlaying(false);
              setPos(Number(e.target.value));
            }}
            aria-label="Playback position"
            className="w-full accent-primary"
          />
          <span className="num shrink-0 text-xs text-muted">{formatDateTime(p.t)}</span>
        </div>
      </Panel>

      <Panel title="Ladder" aside={<span className="font-mono text-xs text-muted">{result.rungs.length} bins</span>}>
        <LadderBars result={result} price={p.price} />
        <KV label="Range" value={`${formatNumber(result.rungs[0]!.lower)} → ${formatNumber(result.rungs.at(-1)!.upper)}`} />
        <p className="mt-2 text-xs text-muted">
          Bins above the price hold {pool.token0.symbol}, bins below hold {sym}. The outlined bin holds the price at the playback moment.
        </p>
        {!pool.external && (
          <Button asChild size="sm" className="mt-3">
            <Link href={`/pools/${pool.pool_id}`}>Open this pool</Link>
          </Button>
        )}
      </Panel>
    </div>
  );
}

/** Builds the run for a backtest window: it opens at the last trade before the window, or at its first trade. */
function backtestRun(data: ApiPoolTrades, form: Form, end: number): Run | null {
  let trades = data.trades;
  let open = data.open;
  let start = data.since;
  if (!open) {
    open = trades[0] ?? null;
    trades = trades.slice(1);
    if (open) start = open[0];
  }
  if (!open) return null;
  const usd1 = usdPerToken1(open) ?? trades.map(usdPerToken1).find((v) => v !== null) ?? null;
  const result = simulate({ start, price: open[1], usd1, trades, ladder: ladderOf(form, usd1), end });
  return result ? { result, start, usd1, deposit: Number(form.amount) } : null;
}

function formError(form: Form): string | null {
  const [lo, hi, amt] = [Number(form.minPct), Number(form.maxPct), Number(form.amount)];
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= -100) return "Set the range as percents from the price, the min above -100%.";
  if (lo >= hi) return "Set the min below the max.";
  if (!(amt > 0)) return "Enter an amount.";
  return null;
}

export function SimulatorView() {
  const params = useSearchParams();
  const pools = usePools();
  const [mode, setMode] = React.useState<Mode>("backtest");
  const [poolId, setPoolId] = React.useState<string | undefined>(params.get("pool")?.toLowerCase() || undefined);
  const [days, setDays] = React.useState(1);
  const [form, setForm] = React.useState<Form>(DEFAULT_FORM);
  // read on the client only; the paper pool is drawn only in paper mode, which the server never renders
  const [paper, setPaperState] = React.useState<Paper | null>(() => (typeof window === "undefined" ? null : loadPaper()));
  const setPaper = (p: Paper | null) => {
    savePaper(p);
    setPaperState(p);
  };

  const ranked = React.useMemo(
    () => [...(pools.data ?? [])].filter((p) => p.venue !== "LAUNCH").sort((a, b) => b.volume_24h_usd - a.volume_24h_usd || b.trades_24h - a.trades_24h),
    [pools.data],
  );
  const activePaper = mode === "paper" ? paper : null;
  const selected = activePaper?.pool ?? poolId ?? ranked[0]?.pool_id;
  const pool = ranked.find((p) => p.pool_id === selected);
  const shownForm = activePaper?.form ?? form;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const error = formError(shownForm);

  // backtest: trades since the window start; paper: trades since it opened, or the latest price to open at
  const since = React.useMemo(
    () => (mode === "backtest" ? minute(nowSec() - days * 86_400) : (activePaper?.start ?? minute(nowSec()))),
    [mode, days, activePaper?.start, selected], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const trades = usePoolTrades(selected, since, mode === "paper" && !!activePaper && activePaper.end === null);

  const run = React.useMemo<Run | null>(() => {
    if (!trades.data || error) return null;
    if (mode === "backtest") return backtestRun(trades.data, form, nowSec());
    if (!activePaper) return null;
    const result = simulate({ start: activePaper.start, price: activePaper.price, usd1: activePaper.usd1, trades: trades.data.trades, ladder: ladderOf(activePaper.form, activePaper.usd1), end: activePaper.end ?? nowSec() });
    return result ? { result, start: activePaper.start, usd1: activePaper.usd1, deposit: Number(activePaper.form.amount) } : null;
  }, [trades.data, trades.dataUpdatedAt, mode, form, activePaper, error]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = trades.data ? (trades.data.trades.at(-1) ?? trades.data.open) : null;
  const openPaper = () => {
    if (!latest || !selected) return;
    const usd1 = usdPerToken1(latest);
    setPaper({ pool: selected, form, start: nowSec(), price: latest[1], usd1, end: null });
  };
  const opensLate = run && mode === "backtest" && run.start > since + 3_600;
  const inUsd = activePaper ? activePaper.usd1 !== null : run ? run.usd1 !== null : !!latest && usdPerToken1(latest) !== null;
  const amountUnit = inUsd ? "USD" : (pool?.token1.symbol ?? "");

  return (
    <>
      <PageHeader
        eyebrow="Simulator"
        title="Liquidity simulator"
        description="Replay a ladder of bins against a pool's real trading on Robinhood Chain, and see the fees and value it would have made."
        actions={<Segmented options={MODES} value={mode} onChange={setMode} label="Simulation mode" />}
      />
      <ol className="hairline-grid mt-8 grid border md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="space-y-1 bg-surface p-4">
            <p className="eyebrow">
              {i + 1} · {s.title}
            </p>
            <p className="text-sm text-fg-2">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted">{MODES.find((m) => m.v === mode)!.d}</p>

      <div className="mt-6 grid gap-6 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="space-y-6">
          <QueryState query={pools} isEmpty={(d) => d.length === 0} empty={<EmptyState title="Pools are syncing" />}>
            {() => <PoolPicker pools={ranked} value={selected} onPick={setPoolId} locked={!!activePaper} />}
          </QueryState>

          <Panel title="2 · Shape the ladder" brackets>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Min price" value={shownForm.minPct} onChange={(v) => set({ minPct: v })} suffix="%" disabled={!!activePaper} />
                <NumberField label="Max price" value={shownForm.maxPct} onChange={(v) => set({ maxPct: v })} suffix="%" disabled={!!activePaper} />
              </div>
              {!activePaper && (
                <>
                  <Choice label="Bins" options={BINS} value={form.bins} onChange={(v) => set({ bins: v })} />
                  <Choice label="Position shape" options={SHAPES} value={form.shape} onChange={(v) => set({ shape: v })} />
                </>
              )}
              <NumberField label="Amount" value={shownForm.amount} onChange={(v) => set({ amount: v })} suffix={amountUnit} disabled={!!activePaper} />
              {mode === "backtest" && <Choice label="Start" options={WINDOWS} value={days} onChange={setDays} />}
              {error && <p className="text-sm text-warning">{error}</p>}

              {mode === "paper" &&
                (activePaper ? (
                  <div className="space-y-3 rounded-lg border bg-surface-2 p-3">
                    <KV label="Opened" value={timeAgo(activePaper.start * 1000)} />
                    <KV label="Opening price" value={formatNumber(activePaper.price, 6)} />
                    <KV label="Shape" value={`${SHAPES.find((s) => s.v === activePaper.form.shape)!.l} · ${activePaper.form.bins} bins`} />
                    {activePaper.end === null ? (
                      <Button variant="secondary" className="w-full" onClick={() => setPaper({ ...activePaper, end: nowSec() })}>
                        Stop paper pool
                      </Button>
                    ) : (
                      <>
                        <KV label="Stopped" value={formatDateTime(activePaper.end)} />
                        <Button variant="secondary" className="w-full" onClick={() => setPaper(null)}>
                          Start a new paper pool
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full" size="lg" disabled={!latest || !!error} onClick={openPaper}>
                      Open paper pool
                    </Button>
                    <p className="text-xs text-muted">
                      {latest ? `Opens at the price of the latest trade, ${formatNumber(latest[1], 6)}, and follows the pool from there. It stays open in this browser.` : "Waiting for this pool's latest trade."}
                    </p>
                  </div>
                ))}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-3">
          <p className="eyebrow">3 · Replay real trading</p>
          {!pool ? (
            <div className="skeleton h-[60vh] w-full" />
          ) : mode === "paper" && !activePaper ? (
            <EmptyState title="Open a paper pool">Shape the ladder, then open it at the price now. Results follow the pool&apos;s trading as it happens.</EmptyState>
          ) : (
            <QueryState query={trades} skeleton={<div className="skeleton h-[60vh] w-full" />}>
              {() =>
                run ? (
                  <>
                    {opensLate && <p className="text-sm text-muted">This run opens at {formatDateTime(run.start)}, the pool&apos;s first indexed trade in the window.</p>}
                    <Results key={`${selected}:${mode}:${since}`} run={run} pool={pool} />
                  </>
                ) : error ? (
                  <EmptyState title="Shape the ladder">{error}</EmptyState>
                ) : (
                  <EmptyState title="No trading to replay yet">This pool has no indexed trades in the window. Pick a longer start or one of the most traded pools.</EmptyState>
                )
              }
            </QueryState>
          )}
        </div>
      </div>
    </>
  );
}
