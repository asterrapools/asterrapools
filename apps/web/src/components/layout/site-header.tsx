"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <Button asChild variant="ghost" size="icon-sm" className="fx-prism hidden md:inline-flex">
            <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="Asterra on X">
              <XIcon className="size-4" />
            </a>
          </Button>
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
