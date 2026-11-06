import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XIcon } from "./site-header";

const UPDATES_URL = "https://x.com/pulseofaster?s=21";

/** Sitewide announcement above the header: official updates moved to @PulseOfAster while the original X account is out of reach. */
export function AccountNotice() {
  return (
    <aside aria-label="Asterra account update" className="relative z-40 overflow-hidden bg-bg">
      <div className="absolute inset-0 animate-prism-pan bg-prism bg-[length:200%_100%] opacity-[0.16]" aria-hidden />
      <div className="container relative flex flex-col items-center gap-x-5 gap-y-2 py-2.5 text-center text-[13px] leading-snug md:flex-row md:justify-center md:text-left">
        <p className="text-fg-2">
          <span className="relative mr-2 inline-flex size-2 align-[1px]" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-cyan opacity-75" />
            <span className="relative size-2 rounded-full bg-cyan" />
          </span>
          <strong className="font-semibold text-fg dark:text-prism">Asterra account update:</strong> We&apos;re temporarily unable to
          access our original X account. Follow official updates at <strong className="font-semibold text-fg">@PulseOfAster</strong>
        </p>
        <Button asChild size="sm" className="fx-prism shrink-0 bg-fg text-bg hover:bg-fg hover:shadow-glow active:bg-fg">
          <a href={UPDATES_URL} target="_blank" rel="noopener noreferrer" aria-label="X Current updates @PulseOfAster">
            <XIcon />
            Current updates @PulseOfAster
            <ArrowUpRight />
          </a>
        </Button>
      </div>
      <div className="relative h-px animate-prism-pan bg-prism bg-[length:200%_100%]" aria-hidden />
    </aside>
  );
}
