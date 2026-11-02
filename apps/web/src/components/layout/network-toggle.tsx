"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { chainsByNetwork } from "@asterrapools/sdk";
import { NETWORK_LABEL, SELECTABLE_NETWORKS, isSelectable, setNetwork, useNetwork, type NetworkName } from "@/lib/network";
import { cn } from "@/lib/utils";

/** Testnet / Mainnet switch. A network without published contracts stays visible but disabled ("soon"). */
export function NetworkToggle({ className }: { className?: string }) {
  const active = useNetwork();
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  if (SELECTABLE_NETWORKS.length < 2) {
    return (
      <span className={cn("items-center rounded-full border px-3 py-1 text-xs font-medium text-muted", className)}>
        {NETWORK_LABEL[active]}
      </span>
    );
  }

  function choose(network: NetworkName) {
    if (network === active || !setNetwork(network)) return;
    // keep the wallet on the same chain as the app; if the wallet refuses, the next transaction asks again
    if (isConnected) void switchChainAsync({ chainId: chainsByNetwork[network].id }).catch(() => {});
  }

  return (
    <div role="group" aria-label="Network" className={cn("items-center rounded-full border bg-surface/60 p-0.5", className)}>
      {SELECTABLE_NETWORKS.map((n) => {
        const available = isSelectable(n);
        return (
          <button
            key={n}
            type="button"
            disabled={!available}
            aria-pressed={n === active}
            title={available ? undefined : `${NETWORK_LABEL[n]} is not live yet`}
            onClick={() => choose(n)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-ui",
              n === active ? "bg-fg text-bg" : "text-muted hover:text-fg",
              !available && "cursor-not-allowed opacity-50 hover:text-muted",
            )}
          >
            {NETWORK_LABEL[n]}
            {!available && <span className="ml-1 text-[10px]">soon</span>}
          </button>
        );
      })}
    </div>
  );
}
