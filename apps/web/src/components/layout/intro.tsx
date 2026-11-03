"use client";

import * as React from "react";
import { INTRO_KEY } from "@/lib/utils";

/**
 * First-visit intro: the Asterra mark inside a ring of DLMM bins, the wordmark and a boot log, for three seconds.
 * Timing and exit are pure CSS (globals.css, `.intro*`), so it paints with the server HTML and leaves on time even
 * before hydration. JS only adds play: the bins swell toward the pointer, the mark tilts, a press pulses everything.
 * Shown once per browser session; the inline script in the root layout hides it on later page loads.
 */

const BINS = 56;
const WORD = "ASTERRAPOOLS";
// bin heights: a liquidity shape with a dense peak, rounded so server and client render the same string
const HEIGHTS = Array.from({ length: BINS }, (_, i) =>
  (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(i * 0.45)) * (0.55 + 0.45 * Math.cos((i / BINS) * Math.PI * 2))).toFixed(3),
);
const BOOT = ["Syncing Robinhood Chain", "Indexing DLMM bins", "Pricing DAMM ranges", "Smart router armed"];

export function Intro() {
  const root = React.useRef<HTMLDivElement>(null);
  const [gone, setGone] = React.useState(false);

  React.useEffect(() => {
    const el = root.current;
    if (!el || document.documentElement.dataset.intro === "seen") return setGone(true);
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // storage blocked: the intro simply plays again next time
    }
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      el.style.setProperty("--tx", x.toFixed(3));
      el.style.setProperty("--ty", y.toFixed(3));
      // +90deg: bin angle 0 points up, atan2 angle 0 points right
      el.style.setProperty("--pa", `${Math.atan2(y, x) + Math.PI / 2}rad`);
      el.style.setProperty("--pf", "1");
    };
    const onDown = () => {
      el.classList.remove("intro-pulse");
      void el.offsetWidth; // restart the pulse animation on every press
      el.classList.add("intro-pulse");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    const done = window.setTimeout(() => setGone(true), 3800); // 3 s on screen + the exit wipe
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.clearTimeout(done);
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={root} className="intro" role="status" aria-label="Loading AsterraPools">
      <div className="intro-stage">
        <div className="intro-ring" aria-hidden>
          {HEIGHTS.map((h, i) => (
            <span key={i} style={{ "--i": i, "--n": BINS } as React.CSSProperties}>
              <i style={{ "--h": h } as React.CSSProperties} />
            </span>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- must paint with the first HTML, before any loader */}
        <img src="/brand/asterra-mark-512.png" alt="" className="intro-mark" width={512} height={512} />
      </div>
      <p className="intro-word" aria-hidden>
        {WORD.split("").map((c, i) => (
          <span key={i} style={{ "--i": i } as React.CSSProperties}>
            {c}
          </span>
        ))}
      </p>
      <p className="intro-tag">Built for the flow of every market.</p>
      <div className="intro-boot" aria-hidden>
        {BOOT.map((line, i) => (
          <span key={line} style={{ "--i": i } as React.CSSProperties}>
            {line}
          </span>
        ))}
      </div>
      <div className="intro-bar" aria-hidden />
    </div>
  );
}
