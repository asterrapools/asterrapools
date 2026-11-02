"use client";

import * as React from "react";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { shapeWeight, type BinShape } from "@/lib/dlmm";
import { cn } from "@/lib/utils";

/*
 * Interactive explainers for the landing page. Every figure here is computed in the browser from the same
 * formulas the contracts use (bin prices, single-range capital efficiency, constant-product quotes), so the
 * charts are always populated and react to input instantly.
 */

const usd = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const REF_PRICE = 2284.11; // ETH reference price for the illustrations

/** Drives a value back and forth until the visitor takes over. */
function useAutoplay(period: number, amplitude: number) {
  const [v, setV] = React.useState(0);
  const [manual, setManual] = React.useState(false);
  React.useEffect(() => {
    if (manual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setV(Math.round(Math.sin(((now - t0) / period) * Math.PI * 2) * amplitude));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [manual, period, amplitude]);
  return [v, (n: number) => (setManual(true), setV(n))] as const;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border bg-surface-2 p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-button transition-ui",
            value === v ? "bg-fg text-bg" : "text-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, display }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; display: string }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between font-mono text-[11px] uppercase tracking-button text-muted">
        {label}
        <span className="num text-fg">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="prism-range w-full"
      />
    </label>
  );
}

// ------------------------------------------------------------------ DLMM

const BIN_STEP = 25; // bps
const RADIUS = 18;

export function BinLab() {
  const [shape, setShape] = React.useState<BinShape>("curve");
  const [active, setActive] = useAutoplay(9000, 9);
  const [hover, setHover] = React.useState<number | null>(null);
  const ids = Array.from({ length: RADIUS * 2 + 1 }, (_, i) => i - RADIUS);
  const price = (id: number) => REF_PRICE * Math.pow(1 + BIN_STEP / 10_000, id);
  const focus = hover ?? active;
  const crossed = Math.abs(active);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={shape} onChange={setShape} options={[["spot", "Spot"], ["curve", "Curve"], ["bidask", "Bid-Ask"]]} />
        <span className="font-mono text-[11px] uppercase tracking-button text-muted">bin step {BIN_STEP} bps</span>
      </div>
      <svg viewBox="0 0 370 150" className="h-44 w-full overflow-visible" onMouseLeave={() => setHover(null)} role="img" aria-label="DLMM liquidity bins">
        {ids.map((id, i) => {
          const w = shapeWeight(shape, id, RADIUS);
          const h = 14 + w * 116;
          const x = i * 10 + 1;
          const fill = id < active ? "rgb(var(--chart-2))" : id > active ? "rgb(var(--chart-1))" : "url(#bin-active)";
          return (
            <g key={id} onMouseEnter={() => setHover(id)}>
              <rect x={x - 1} y={0} width={10} height={150} fill="transparent" />
              <rect
                x={x}
                y={140 - h}
                width={8}
                height={h}
                rx={2}
                fill={fill}
                opacity={hover === null || hover === id ? (id === active ? 1 : 0.78) : 0.35}
                style={{ transition: "y 300ms var(--ease-out), height 300ms var(--ease-out), fill 200ms" }}
              />
            </g>
          );
        })}
        <defs>
          <linearGradient id="bin-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--chart-1))" />
            <stop offset="100%" stopColor="rgb(var(--chart-2))" />
          </linearGradient>
        </defs>
        <line x1={(active + RADIUS) * 10 + 5} x2={(active + RADIUS) * 10 + 5} y1={0} y2={146} stroke="rgb(var(--text))" strokeDasharray="2 3" strokeWidth={1} style={{ transition: "x1 300ms, x2 300ms" }} />
        <line x1={0} x2={370} y1={140.5} y2={140.5} stroke="rgb(var(--chart-grid))" />
      </svg>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-4">
        {[
          ["Bin", `#${8_388_608 + focus}`],
          ["Price", `$${usd(price(focus))}`],
          ["Holds", focus < active ? "USDG" : focus > active ? "WETH" : "WETH + USDG"],
          ["Bins crossed", crossed ? String(crossed) : "Active"],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-button text-muted">{k}</p>
            <p className="num truncate">{v}</p>
          </div>
        ))}
      </div>
      <Slider label="Drag the price" min={-RADIUS + 2} max={RADIUS - 2} value={active} onChange={setActive} display={`${active > 0 ? "+" : ""}${((Math.pow(1 + BIN_STEP / 10_000, active) - 1) * 100).toFixed(2)}%`} />
    </div>
  );
}

// ------------------------------------------------------------------ DAMM

export function RangeLab() {
  const [width, setWidth] = React.useState(12);
  const [hoverMin, setHoverMin] = React.useState<number | null>(null);
  const lo = 1 - width / 100;
  const hi = 1 + width / 100;
  const efficiency = 1 / (1 - Math.pow(lo / hi, 0.25));
  // launch fee: starts at 25 % and decays to the 0.30 % base fee over the first hour
  const fee = (min: number) => 0.3 + (25 - 0.3) * Math.exp(-min / 9);
  const feePts = Array.from({ length: 61 }, (_, m) => `${(m / 60) * 170},${70 - (fee(m) / 25) * 62}`).join(" ");
  const depth = Math.min(1, Math.log10(efficiency) / 2.4);
  const hm = hoverMin ?? 12;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-button text-muted">Single range depth</p>
          <svg viewBox="0 0 200 90" className="h-32 w-full" role="img" aria-label="DAMM range depth">
            <line x1="0" x2="200" y1="80.5" y2="80.5" stroke="rgb(var(--chart-grid))" />
            <rect x="0" y="74" width="200" height="6" fill="rgb(var(--muted) / 0.25)" />
            <rect
              x={100 - width * 1.55}
              width={width * 3.1}
              y={80 - 10 - depth * 64}
              height={10 + depth * 64}
              rx="3"
              fill="url(#damm-depth)"
              style={{ transition: "all 250ms var(--ease-out)" }}
            />
            <line x1="100" x2="100" y1="2" y2="84" stroke="rgb(var(--text))" strokeDasharray="2 3" />
            <defs>
              <linearGradient id="damm-depth" x1="0" x2="1">
                <stop offset="0" stopColor="rgb(var(--chart-3))" />
                <stop offset="0.5" stopColor="rgb(var(--chart-1))" />
                <stop offset="1" stopColor="rgb(var(--chart-2))" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-button text-muted">Launch fee decay</p>
          <svg
            viewBox="0 0 170 74"
            className="h-32 w-full"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHoverMin(Math.max(0, Math.min(60, Math.round(((e.clientX - r.left) / r.width) * 60))));
            }}
            onMouseLeave={() => setHoverMin(null)}
            role="img"
            aria-label="Launch fee decaying to the base fee"
          >
            <polyline points={feePts} fill="none" stroke="rgb(var(--chart-2))" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="170" y1="70.5" y2="70.5" stroke="rgb(var(--chart-grid))" />
            <circle cx={(hm / 60) * 170} cy={70 - (fee(hm) / 25) * 62} r="3" fill="rgb(var(--chart-1))" />
          </svg>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {[
          ["Range", `$${usd(REF_PRICE * lo, 0)} – $${usd(REF_PRICE * hi, 0)}`],
          ["Capital efficiency", `${efficiency.toFixed(1)}× full range`],
          [`Fee at minute ${hm}`, `${fee(hm).toFixed(2)}%`],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-3 py-2">
            <p className="truncate font-mono text-[10px] uppercase tracking-button text-muted">{k}</p>
            <p className="num truncate">{v}</p>
          </div>
        ))}
      </div>
      <Slider label="Range width" min={2} max={60} value={width} onChange={setWidth} display={`±${width}%`} />
    </div>
  );
}

// ------------------------------------------------------------------ routing

interface Route {
  id: string;
  path: string[];
  venue: string;
  /** USDG out for `a` WETH in */
  out: (a: number) => number;
}

const cp = (a: number, fee: number, depth: number) => {
  const x = a * (1 - fee);
  return (x * depth * REF_PRICE) / (depth + x);
};

const ROUTES: Route[] = [
  // DLMM: tightest fee, but each bin is shallow, so the price walks bin by bin as size grows
  { id: "dlmm", path: ["WETH", "USDG"], venue: "DLMM · 5 bps", out: (a) => a * REF_PRICE * (1 - 0.0005) * (1 - 0.0005 * a) },
  { id: "damm", path: ["WETH", "USDG"], venue: "DAMM · 20 bps", out: (a) => cp(a, 0.002, 5000) },
  { id: "v4", path: ["WETH", "USDG"], venue: "v4 hook · dynamic", out: (a) => cp(a, 0.004, 6667) },
  { id: "hop", path: ["WETH", "aUSD", "USDG"], venue: "v4 → DLMM", out: (a) => cp(a, 0.003, 6000) * (1 - 0.0005) * 0.9995 },
];

export function RouteRace() {
  const [pos, setPos] = React.useState(38);
  const amount = Number((0.1 * Math.pow(10, (pos / 100) * 3.4)).toPrecision(3));
  const quotes = ROUTES.map((r) => ({ ...r, q: r.out(amount) })).sort((a, b) => b.q - a.q);
  const best = quotes[0]!;
  return (
    <div className="space-y-4">
      <Slider label="You sell" min={0} max={100} value={pos} onChange={setPos} display={`${amount.toLocaleString("en-US")} WETH`} />
      <ul className="space-y-2">
        {quotes.map((r, i) => {
          const gapBps = ((best.q - r.q) / best.q) * 10_000;
          return (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300",
                i === 0 ? "prism-ring border-transparent bg-surface-2" : "bg-surface opacity-75",
              )}
              style={{ transform: `translateY(0)` }}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[12px]">
                {r.path.map((t, j) => (
                  <React.Fragment key={t + j}>
                    {j > 0 && <ArrowRight className="size-3 text-muted" />}
                    <span>{t}</span>
                  </React.Fragment>
                ))}
                <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-button text-muted">{r.venue}</span>
              </span>
              <span className="text-right">
                <span className="num block">{usd(r.q)} USDG</span>
                <span className={cn("block font-mono text-[10px] uppercase tracking-button", i === 0 ? "text-success" : "text-muted")}>
                  {i === 0 ? "Best route" : `${gapBps < 1 ? "<1" : gapBps.toFixed(0)} bps behind`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ positions

export function PositionCard() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [t, setT] = React.useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  return (
    <div
      className="[perspective:1000px]"
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        setT({ rx: (0.5 - y) * 14, ry: (x - 0.5) * 18, gx: x * 100, gy: y * 100 });
      }}
      onPointerLeave={() => setT({ rx: 0, ry: 0, gx: 50, gy: 50 })}
    >
      <div
        ref={ref}
        className="prism-ring relative mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-2xl bg-surface-2 p-5 shadow-card transition-transform duration-200 ease-out"
        style={{ transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)` }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
          style={{ background: `radial-gradient(circle at ${t.gx}% ${t.gy}%, rgb(255 255 255 / 0.45), transparent 55%)` }}
        />
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-prism opacity-30 blur-3xl" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-button text-muted">
            <span>AsterraPositions</span>
            <span>ERC-721</span>
          </div>
          <p className="mt-4 font-display text-2xl font-semibold">WETH / USDG</p>
          <p className="font-mono text-[11px] uppercase tracking-button text-muted">v4 hook pool · dynamic fee</p>
          <svg viewBox="0 0 200 60" className="mt-5 h-16 w-full" aria-hidden>
            <path d="M0 50 C 40 48, 60 12, 100 10 S 160 48, 200 50" fill="none" stroke="rgb(var(--chart-1))" strokeWidth="1.5" />
            <rect x="62" y="4" width="76" height="52" rx="4" fill="rgb(var(--chart-1) / 0.12)" stroke="rgb(var(--chart-1) / 0.5)" strokeDasharray="3 3" />
            <line x1="104" x2="104" y1="2" y2="58" stroke="rgb(var(--text))" strokeWidth="1" />
          </svg>
          <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-muted">
            <span>$2,140</span>
            <span className="rounded-full bg-success/15 px-2 py-0.5 uppercase tracking-button text-success">In range</span>
            <span>$2,460</span>
          </div>
          <div className="mt-auto space-y-3">
            <div className="flex items-end justify-between">
              <span className="font-mono text-[10px] uppercase tracking-button text-muted">Fees earned</span>
              <span className="num text-lg">$184.20</span>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-button text-muted">
                <span className="flex items-center gap-1"><Lock className="size-3" /> Vesting</span>
                <span>62% unlocked</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full w-[62%] rounded-full bg-prism" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-button text-muted">
        <Sparkles className="size-3" /> Tilt the card
      </p>
    </div>
  );
}
