"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useOpenVenues } from "@/hooks/use-venues";
import { useNetwork } from "@/lib/network";
import { MORE_NAV as ALL_MORE_NAV, PRIMARY_NAV, navFor } from "./nav";
import { NetworkNotice } from "./network-notice";
import { NetworkToggle } from "./network-toggle";
import { ThemeToggle } from "./theme-toggle";

const X_URL = "https://x.com/pulseofaster?s=21";

/** X (Twitter) logo; lucide has no brand icons. */
export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="AsterraPools home">
      <Image src="/brand/asterra-mark-64.png" alt="" width={28} height={28} priority className="transition-transform duration-500 ease-out group-hover:rotate-90" />
      <span className="font-display text-[15px] font-semibold tracking-tight">
        Asterra<span className="text-prism">Pools</span>
      </span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  // /pools/create lives under "More", so it must not light up "Pools"
  if (href === "/pools") return pathname === "/pools" || (pathname.startsWith("/pools/") && pathname !== "/pools/create");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** RainbowKit connect flow rendered with Asterra buttons so it matches the rest of the UI. */
function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        if (!mounted) return <Button size="sm" className="invisible" aria-hidden>Connect</Button>;
        if (!account || !chain) return <Button size="sm" className="fx-prism" onClick={openConnectModal}>Connect</Button>;
        if (chain.unsupported) return <Button size="sm" variant="destructive" className="fx-prism" onClick={openChainModal}>Switch network</Button>;
        return (
          <Button size="sm" variant="secondary" onClick={openAccountModal} className="fx-prism">
            <span className="size-1.5 rounded-full bg-success" />
            {account.displayName}
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/** Header X icon: tells visitors the official account moved before sending them to it. */
function XAccountDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="fx-prism hidden md:inline-flex" aria-label="Asterra on X">
          <XIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="prism-ring max-w-[440px] gap-0 overflow-hidden border-0 p-7 sm:rounded-2xl">
        <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-cobalt/30 blur-[80px]" aria-hidden />
        <div className="pointer-events-none absolute -left-24 bottom-0 size-56 rounded-full bg-cyan/10 blur-[70px]" aria-hidden />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border bg-bg/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-button text-fg-2">
            <span className="size-1.5 rotate-45 bg-prism" aria-hidden />
            Official account update
          </p>
          <DialogTitle className="mt-5 font-display text-[28px] font-semibold leading-tight">
            We&apos;ve <span className="text-prism">moved</span> on X.
          </DialogTitle>
          <DialogDescription className="mt-2.5 text-sm leading-relaxed text-fg-2">
            The official AsterraPools account on X has moved from @AsterraPools to{" "}
            <strong className="font-semibold text-fg">@PulseOfAster</strong>. Follow the new account for every official update.
          </DialogDescription>

          <div className="mt-6 flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-xl border bg-bg/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-button text-muted">Previous</p>
              <p className="mt-1 truncate text-[13px] text-muted line-through">@AsterraPools</p>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface text-fg-2" aria-hidden>
              <ArrowRight className="size-4" />
            </span>
            <div className="prism-ring min-w-0 flex-1 rounded-xl bg-bg/40 p-3">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-button text-fg-2">
                <span className="relative inline-flex size-1.5" aria-hidden>
                  <span className="absolute inset-0 animate-ping rounded-full bg-cyan opacity-75" />
                  <span className="relative size-1.5 rounded-full bg-cyan" />
                </span>
                Official now
              </p>
              <p className="mt-1 truncate text-[13px] font-semibold text-fg">@PulseOfAster</p>
            </div>
          </div>

          <DialogClose asChild>
            <Button asChild size="lg" className="fx-prism mt-6 w-full">
              <a href={X_URL} target="_blank" rel="noopener noreferrer">
                <XIcon />
                Follow @PulseOfAster
                <ArrowUpRight />
              </a>
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const venues = useOpenVenues();
  const MORE_NAV = navFor(ALL_MORE_NAV, useNetwork(), venues);
  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/90">
      <div className="container flex h-14 items-center gap-6">
        <Logo />
        <nav className="hidden items-center gap-0.5 rounded-full border bg-surface/50 p-1 lg:flex" aria-label="Main">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium text-fg-2 transition-ui hover:bg-surface-2 hover:text-fg",
                isActive(pathname, item.href) && "bg-fg text-bg hover:bg-fg hover:text-bg",
              )}
            >
              {item.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-fg-2 transition-ui hover:bg-surface-2 hover:text-fg">
              More <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {MORE_NAV.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="flex flex-col items-start gap-0.5">
                    <span className="text-sm">{item.label}</span>
                    <span className="text-xs text-muted">{item.description}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NetworkToggle className="hidden sm:flex" />
          <XAccountDialog />
          <ThemeToggle />
          <WalletButton />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="fx-prism lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <NetworkToggle className="mt-8 flex w-fit sm:hidden" />
              <nav className="mt-6 flex flex-col" aria-label="Mobile">
                {[...PRIMARY_NAV, ...MORE_NAV].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "border-b py-3 text-[15px] font-medium text-fg-2",
                      isActive(pathname, item.href) && "text-primary-text",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
    <NetworkNotice />
    </>
  );
}
