import { Suspense } from "react";
import type { Metadata } from "next";
import { SwapCard } from "@/components/swap/swap-card";
import { LiveTape, RouteEngine } from "@/components/swap/swap-side";

export const metadata: Metadata = { title: "Swap" };

export default function SwapPage() {
  return (
    <div className="container grid gap-6 py-10 md:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)_minmax(0,1fr)] lg:items-start">
      <div className="order-2 lg:order-1">
        <RouteEngine />
      </div>
      <div className="order-1 flex justify-center lg:order-2">
        <Suspense>
          <SwapCard />
        </Suspense>
      </div>
      <div className="order-3">
        <LiveTape />
      </div>
    </div>
  );
}
