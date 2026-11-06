"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowRight, ArrowUpRight, Check, Copy, Layers, Route, Waves } from "lucide-react";
import type { Address } from "viem";
import { useBlockNumber } from "wagmi";
import { PairLabel, Sparkline, StatusDot, VenueBadge } from "@/components/kit";
import { SwapCard } from "@/components/swap/swap-card";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/hooks/use-api";
import { useMounted } from "@/hooks/use-mounted";
import { contractGroups } from "@/lib/contracts";
import { formatPct, formatUsd, shortAddress } from "@/lib/format";
import { CHAIN, CHAIN_ID, DEPLOYMENT, explorerAddress, NETWORK, NETWORK_LABEL } from "@/lib/network";
import { ASTER_TOKEN } from "@/lib/token";
import { cn } from "@/lib/utils";
import { BinLab, PositionCard, RangeLab, RouteRace } from "./labs";

const PrismStar = dynamic(() => import("./prism-star").then((m) => m.PrismStar), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-full bg-prism opacity-10 blur-3xl" />,
});

const SpaceBackdrop = dynamic(() => import("./space-backdrop").then((m) => m.SpaceBackdrop), { ssr: false });

const X_URL = "https://x.com/pulseofaster?s=21";

/** Fades a block in once it scrolls into view. CSS only after the first intersection, so scrolling stays smooth. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // the root reaches far above the viewport, so a block a fast flick jumped past still counts as seen
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setShown(true), io.disconnect()), {
      rootMargin: "100000px 0px -8% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn("transition-all duration-700 ease-out motion-reduce:transition-none", shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionHead({ index, kicker, title, children }: { index: string; kicker: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <Reveal className="max-w-2xl space-y-4">
      <p className="eyebrow flex items-center gap-3">
        <span className="text-prism font-semibold">{index}</span>
        <span className="h-px w-8 bg-border-strong" />
        {kicker}
      </p>
      <h2 className="text-[2rem] font-semibold leading-[1.05] tracking-tight md:text-5xl">{title}</h2>
      <p className="text-lg text-fg-2">{children}</p>
    </Reveal>
  );
}

/** Small technical caption that fills side space with real protocol facts. */
function Spec({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-2 last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-button text-muted">{k}</span>
      <span className="num text-right text-sm">{v}</span>
    </div>
  );
}

// ------------------------------------------------------------------ hero

function LiveBlock() {
  const { data } = useBlockNumber({ watch: true, chainId: CHAIN_ID, query: { refetchInterval: 4000 } });
  return data ? <span className="num">#{Number(data).toLocaleString("en-US")}</span> : <span>Syncing</span>;
}

const PILLARS = [
  { href: "#chain", icon: Waves, n: "01", label: "Liquidity on Robinhood Chain" },
  { href: "#engines", icon: Layers, n: "02", label: "DLMM × DAMM" },
  { href: "#flow", icon: Route, n: "03", label: "Positions + smart routing" },
];

/** Contract address of the ASTERRAPOOLS token, "Coming soon" until ASTER_TOKEN_ADDRESS is set on the server. */
function TokenCA({ address }: { address: Address | null }) {
  const { name, explorer } = ASTER_TOKEN;
  return (
    <p data-testid="token-ca" className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-surface/90 px-3 py-2 font-mono text-xs">
      <span className="uppercase tracking-button text-muted">{name} CA</span>
      {address ? (
        <>
          <a href={`${explorer}/token/${address}`} target="_blank" rel="noreferrer" className="break-all text-fg transition-ui hover:text-primary-text">
            {address}
          </a>
          <CopyAddress value={address} />
        </>
      ) : (
        <span className="text-prism font-semibold uppercase tracking-button">Coming soon</span>
      )}
    </p>
  );
}

function Hero({ tokenAddress }: { tokenAddress: Address | null }) {
  return (
    <section className="relative overflow-hidden" data-star="0.45 0 1 1 0 0 0 0" data-star-m="0 -0.62 0.55 1">
      <div className="pointer-events-none absolute -right-40 top-10 size-[640px] rounded-full bg-cobalt/20 blur-[120px] dark:bg-cobalt/30" />
      <div className="container relative grid min-h-[calc(100svh-3.5rem)] items-center gap-6 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-0">
        <div className="relative z-10 space-y-7">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border bg-surface/90 px-3 py-1.5 font-mono text-[11px] uppercase tracking-button text-fg-2">
              <StatusDot state="live" />
              {CHAIN.name} · <LiveBlock />
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="text-display font-semibold">
              Built for the <span className="text-prism animate-prism-pan">flow</span> of every market.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="max-w-xl text-lg text-fg-2 md:text-xl">
              Asterra builds deep liquidity on Robinhood Chain. Bins for precision, curves for depth, and one router that
              finds the best path through all of it.
            </p>
          </Reveal>
          <Reveal delay={240} className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="fx-prism rounded-full px-7">
              <Link href="/swap">
                Launch app <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="fx-prism rounded-full px-7">
              <Link href="/pools">Explore pools</Link>
            </Button>
          </Reveal>
          <Reveal delay={280}>
            <TokenCA address={tokenAddress} />
          </Reveal>
          <Reveal delay={320}>
            <ol className="grid gap-2 sm:grid-cols-3">
              {PILLARS.map(({ href, icon: Icon, n, label }) => (
                <li key={n}>
                  <a href={href} className="fx-prism group flex h-full items-start gap-3 rounded-xl border bg-surface/85 p-3 hover:border-transparent">
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary-text" />
                    <span>
                      <span className="block font-mono text-[10px] text-muted">{n}</span>
                      <span className="block text-sm leading-snug">{label}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
        {/* the star itself lives in the fixed scene behind the page (Landing); this column frames it */}
        <div className="relative h-[46vh] min-h-[320px] cursor-crosshair lg:h-[78vh]">
          {/* HUD labels: real protocol parameters floating around the scene */}
          {[
            ["route.quote() · eth_call", "left-[4%] top-[14%]"],
            ["bin_step = 25 bps", "right-[6%] top-[22%]"],
            ["x · y = k, one range", "left-[8%] bottom-[18%]"],
            ["ERC-721 · lock · vest", "right-[4%] bottom-[10%]"],
          ].map(([t, pos]) => (
            <span
              key={t}
              className={cn("pointer-events-none absolute hidden rounded-full border bg-surface/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-button text-fg-2 sm:block", pos)}
            >
              {t}
            </span>
          ))}
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-button text-muted">
            Click the star
          </span>
        </div>
      </div>
      <Ticker />
    </section>
  );
}

// ------------------------------------------------------------------ ticker

const FACTS = [
  `Chain ID ${CHAIN.id}`,
  "Uniswap v4 hook pools",
  "DLMM · discrete bins",
  "DAMM · single range",
  "Volatility-adaptive fees",
  "ERC-721 LP positions",
  "UUPS + ERC-7201 storage",
  "Exact-input smart router",
];

function Ticker() {
  const dash = useDashboard();
  const pools = (dash.data?.all ?? []).filter((p) => !p.external && p.sparkline.length > 0).slice(0, 12);
  const items: React.ReactNode[] = pools.length
    ? pools.map((p) => {
        const last = p.sparkline[p.sparkline.length - 1]!;
        return (
          <span key={p.pool_id} className="flex items-center gap-2">
            <span className="text-fg">{p.token0.symbol}/{p.token1.symbol}</span>
            <span className="num">{last >= 1 ? last.toLocaleString("en-US", { maximumFractionDigits: 2 }) : last.toPrecision(4)}</span>
            {p.price_change_24h !== 0 && (
              <span className={p.price_change_24h > 0 ? "text-success" : "text-danger"}>{formatPct(p.price_change_24h, 2, { sign: true })}</span>
            )}
          </span>
        );
      })
    : FACTS.map((f) => <span key={f}>{f}</span>);
  return (
    <div className="relative border-y bg-surface/90">
      <div className="flex overflow-hidden py-3 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10 font-mono text-[12px] uppercase tracking-button text-muted hover:[animation-play-state:paused]">
          {[...items, ...items].map((it, i) => (
            <span key={i} className="flex items-center gap-10">
              {it}
              <span className="size-1 rotate-45 bg-prism" aria-hidden />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 01 chain

function ChainSection() {
  const dash = useDashboard();
  const s = dash.data?.stats;
  // only figures that carry information: a zero or missing stat is left out instead of rendered
  const live: [string, string][] = [
    ...(s?.tvl_usd ? [["Liquidity in Asterra pools", formatUsd(s.tvl_usd, { compact: true })] as [string, string]] : []),
    ...(s?.volume_24h_usd ? [["24h volume", formatUsd(s.volume_24h_usd, { compact: true })] as [string, string]] : []),
    ...(s?.trades_24h ? [["24h trades", s.trades_24h.toLocaleString("en-US")] as [string, string]] : []),
    ...(s?.pools ? [["Live pools", String(s.pools)] as [string, string]] : []),
    ...(s?.assets ? [["Listed assets", String(s.assets)] as [string, string]] : []),
  ];
  return (
    <section id="chain" className="container scroll-mt-20 py-20 md:py-28" data-star="-0.62 -0.68 0.52 0.85 0.9 0 0 0">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
        <SectionHead
          index="01"
          kicker="Native to Robinhood Chain"
          title={
            <>
              Liquidity where <span className="text-prism">tokenized markets</span> live.
            </>
          }
        >
          Robinhood Chain brings stocks, ETH and stablecoins onto one EVM rollup. Asterra is the liquidity engine
          underneath: every pool settles on the chain&apos;s canonical Uniswap v4 PoolManager or on Asterra&apos;s own
          bin and curve pools, so liquidity is composable from block one.
        </SectionHead>
        <Reveal delay={120} className="grid content-start gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-surface p-5 shadow-card sm:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Network</p>
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-button text-success">
                <StatusDot state="live" /> {NETWORK_LABEL[NETWORK]}
              </span>
            </div>
            <Spec k="Chain" v={`${CHAIN.name} · ${CHAIN.id}`} />
            <Spec k="Latest block" v={<LiveBlock />} />
            <Spec k="Gas token" v="ETH" />
            <Spec k="Settlement" v="Uniswap v4 singleton + Asterra venues" />
            <Spec k="Assets" v="ETH, stablecoins, tokenized stocks" />
          </div>
          {live.length > 0 ? (
            live.slice(0, 4).map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-surface p-5">
                <p className="eyebrow">{k}</p>
                <p className="num mt-2 text-3xl">{v}</p>
              </div>
            ))
          ) : (
            <>
              <div className="rounded-xl border bg-surface p-5">
                <p className="eyebrow">Venues</p>
                <p className="mt-2 font-display text-3xl font-semibold">v4 · DLMM · DAMM</p>
              </div>
              <div className="rounded-xl border bg-surface p-5">
                <p className="eyebrow">Routing</p>
                <p className="mt-2 font-display text-3xl font-semibold">Direct + 2-hop</p>
              </div>
            </>
          )}
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 02 engines

function EnginesSection() {
  return (
    <section id="engines" className="relative scroll-mt-20 border-y bg-bg-elevated/60 py-20 md:py-28" data-star="0.62 0.45 0.55 0.85 0.2 0 2.2 1">
      <div className="container space-y-12">
        <SectionHead
          index="02"
          kicker="Two engines"
          title={
            <>
              DLMM for precision. <span className="text-prism">DAMM for depth.</span>
            </>
          }
        >
          Different pairs need different curves. Tight, liquid markets want liquidity placed bin by bin. Fresh and
          long-tail markets want one simple range with fees that defend the launch. Asterra runs both, side by side.
        </SectionHead>
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal className="space-y-5 rounded-2xl border bg-surface p-5 shadow-card md:p-7">
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">DLMM · Dynamic Liquidity Market Maker</p>
                <h3 className="mt-2 font-display text-2xl font-semibold">Liquidity, bin by bin</h3>
              </div>
              <VenueBadge venue="DLMM" />
            </header>
            <BinLab />
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Spec k="Pricing" v="(1 + step)^id per bin" />
              <Spec k="Inside a bin" v="Zero slippage" />
              <Spec k="Fees" v="Volatility accumulator" />
              <Spec k="Extras" v="Single-bin limit orders" />
            </div>
          </Reveal>
          <Reveal delay={120} className="space-y-5 rounded-2xl border bg-surface p-5 shadow-card md:p-7">
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">DAMM · Dynamic AMM</p>
                <h3 className="mt-2 font-display text-2xl font-semibold">One range, built to launch</h3>
              </div>
              <VenueBadge venue="DAMM" />
            </header>
            <RangeLab />
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Spec k="Pricing" v="v3 math, one range" />
              <Spec k="LP shares" v="Fungible, 1 share = 1 L" />
              <Spec k="Fees" v="Volatility + launch decay" />
              <Spec k="Best for" v="New and long-tail pairs" />
            </div>
          </Reveal>
        </div>
        <Reveal className="hairline-grid grid-cols-1 md:grid-cols-3">
          {[
            ["Pick DLMM when", "The pair trades tight around a known price: ETH, stables, blue-chip stock tokens. Place liquidity exactly where volume happens and quote limit orders on single bins."],
            ["Pick DAMM when", "The market is new or thin. One range keeps LPing simple, and the launch fee starts high and decays, so snipers pay the LPs instead of farming them."],
            ["Either way", "Both venues register with AsterraHub, show up in the same pool explorer and are quoted by the same router. Swappers never need to know which one filled them."],
          ].map(([k, v]) => (
            <div key={k} className="space-y-2 p-5">
              <p className="font-display text-lg font-semibold">{k}</p>
              <p className="text-sm text-fg-2">{v}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 03 flow

function FlowSection() {
  return (
    <section id="flow" className="container scroll-mt-20 space-y-12 py-20 md:py-28" data-star="0.95 0.15 0.8 0.75 0.45 1 0 2">
      <SectionHead
        index="03"
        kicker="One ecosystem"
        title={
          <>
            Hold the position. <span className="text-prism">Ride the route.</span>
          </>
        }
      >
        Every LP position is an NFT you can lock or vest. Every swap is quoted across every venue and settles on the
        best path in a single transaction. Same app, same wallet session.
      </SectionHead>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Reveal className="space-y-5 rounded-2xl border bg-surface p-5 shadow-card md:p-7">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Smart routing</p>
              <h3 className="mt-2 font-display text-2xl font-semibold">Watch the best route change</h3>
            </div>
            <span className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-button text-muted">4 paths quoted</span>
          </header>
          <RouteRace />
          <p className="text-sm text-muted">
            Small trades fill on the tightest DLMM bins. As size grows, deeper DAMM and v4 ranges take over. The
            router compares direct and two-hop paths with on-chain quotes, then executes the winner atomically.
          </p>
        </Reveal>
        <Reveal delay={120} className="flex flex-col justify-between gap-6 rounded-2xl border bg-surface p-5 shadow-card md:p-7">
          <div>
            <p className="eyebrow">LP Positions</p>
            <h3 className="mt-2 font-display text-2xl font-semibold">Liquidity you can hold</h3>
          </div>
          <PositionCard />
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Spec k="Standard" v="ERC-721" />
            <Spec k="Locks" v="Permanent or timed" />
            <Spec k="Vesting" v="Cliff + linear" />
            <Spec k="Fees" v="Collect any time" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ try it

function TrySection() {
  const dash = useDashboard();
  const top = (dash.data?.all ?? []).filter((p) => !p.external).sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 5);
  return (
    <section className="relative overflow-hidden border-y bg-bg-elevated/60 py-20 md:py-28" data-star="-0.55 -0.45 0.6 0.85 1 0.45 -1.6 1">
      <div className="pointer-events-none absolute -left-40 bottom-0 size-[520px] rounded-full bg-violet/15 blur-[120px]" />
      <div className="container relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-8">
          <SectionHead index="04" kicker="Step inside" title={<>The app is right here.</>}>
            No waitlist, no teaser. Connect a wallet and swap through the live router, or pick a pool and add
            liquidity. This is the same card the app uses.
          </SectionHead>
          {top.length > 0 && (
            <Reveal className="overflow-hidden rounded-xl border bg-surface">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="eyebrow">Top pools</p>
                <Link href="/pools" className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-button text-primary-text hover:underline">
                  All pools <ArrowUpRight className="size-3" />
                </Link>
              </div>
              <ul>
                {top.map((p) => (
                  <li key={p.pool_id}>
                    <Link href={`/pools/${encodeURIComponent(p.pool_id)}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-3 transition-ui last:border-0 hover:bg-surface-2">
                      <span className="flex items-center gap-3">
                        <PairLabel pool={p} />
                        <VenueBadge venue={p.venue} />
                      </span>
                      <Sparkline values={p.sparkline} className="hidden sm:block" />
                      <span className="num w-24 text-right text-sm">{p.tvl_usd > 0 ? formatUsd(p.tvl_usd, { compact: true }) : "New pool"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
        <Reveal delay={120} className="mx-auto w-full max-w-[460px]">
          <React.Suspense>
            <SwapCard />
          </React.Suspense>
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ contracts

function CopyAddress({ value }: { value: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      aria-label="Copy address"
      onClick={() => void navigator.clipboard?.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1200)))}
      className="text-muted transition-ui hover:text-primary-text"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function ContractsSection() {
  const entries = contractGroups(DEPLOYMENT)
    .filter((g) => g.category !== "Tokens" && g.category !== "Oracles")
    .flatMap((g) => g.entries.map((e) => ({ ...e, category: g.category })))
    .filter((e) => e.address);
  return (
    <section id="contracts" className="container scroll-mt-20 space-y-10 py-20 md:py-28" data-star="0 -1.3 1.2 0.35 0 0.6 0 0">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHead index="05" kicker="Verify everything" title={<>The contracts behind every feature.</>}>
          Every address the app talks to, on {CHAIN.name}. Core contracts are UUPS proxies with ERC-7201 storage;
          pools are beacon proxies, so the addresses below never change.
        </SectionHead>
        <Button asChild variant="secondary" className="fx-prism rounded-full">
          <Link href="/contracts">
            Full registry <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => {
          const href = explorerAddress(e.address!);
          return (
            <div key={e.key} className="group flex flex-col gap-3 rounded-xl border bg-surface p-4 transition-ui hover:border-border-strong">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-button text-muted">{e.category}</p>
                  <p className="font-medium">{e.label}</p>
                </div>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-button text-muted">
                  {e.external ? "Canonical" : "Proxy"}
                </span>
              </div>
              <p className="text-sm text-fg-2">{e.description}</p>
              <div className="mt-auto flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary-text">
                    {shortAddress(e.address, 10, 8)} <ArrowUpRight className="size-3" />
                  </a>
                ) : (
                  <span>{shortAddress(e.address, 10, 8)}</span>
                )}
                <CopyAddress value={e.address!} />
              </div>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}

// ------------------------------------------------------------------ outro

function Outro() {
  return (
    <section className="container pb-20" data-star="0 0.05 1.15 0.6 0 0 0 0" data-star-m="0 0.05 0.7 0.45">
      <Reveal className="prism-ring relative overflow-hidden rounded-3xl bg-surface/70 px-6 py-14 text-center md:py-20">
        <div className="pointer-events-none absolute inset-0 bg-prism opacity-[0.07]" />
        <div className="relative mx-auto max-w-2xl space-y-6">
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Go with the <span className="text-prism">flow.</span>
          </h2>
          <p className="text-lg text-fg-2">Swap, provide, route. Everything on Robinhood Chain, everything in one place.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="fx-prism rounded-full px-7">
              <Link href="/swap">
                Launch app <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="fx-prism rounded-full px-7">
              <a href={X_URL} target="_blank" rel="noopener noreferrer">
                Follow @PulseOfAster <ArrowUpRight />
              </a>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Landing({ tokenAddress }: { tokenAddress: Address | null }) {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  const dark = resolvedTheme !== "light";
  return (
    <>
      {/* deep space behind everything: drifting nebulae and a star field that follows the pointer */}
      <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden" data-sky aria-hidden>
        <div className="nebula absolute -inset-[8%]" />
        {mounted && <SpaceBackdrop dark={dark} className="absolute inset-0" />}
      </div>
      {/* one scene behind the whole page; the star travels between the sections' data-star waypoints */}
      <div className="pointer-events-none fixed inset-0 -z-10" data-scene aria-hidden>
        {mounted && <PrismStar dark={dark} className="absolute inset-0" />}
      </div>
      <Hero tokenAddress={tokenAddress} />
      <ChainSection />
      <EnginesSection />
      <FlowSection />
      <TrySection />
      <ContractsSection />
      <Outro />
    </>
  );
}
