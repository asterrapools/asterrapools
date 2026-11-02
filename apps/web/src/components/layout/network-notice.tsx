"use client";

import { NETWORK_LABEL, NETWORK, SELECTABLE_NETWORKS, isDeployed, isSelectable, setNetwork, useNetwork } from "@/lib/network";

/** Shown when the active network has no Asterra contracts (for example a mainnet build before launch). */
export function NetworkNotice() {
  const network = useNetwork();
  if (isDeployed(network)) return null;
  const fallback = SELECTABLE_NETWORKS.find((n) => n !== NETWORK && isSelectable(n));
  // nothing to point at (a fresh local chain): stay quiet rather than show a dead end
  if (!fallback) return null;
  return (
    <div role="status" className="border-b bg-prism/0">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
        <span className="size-1.5 rotate-45 bg-prism" aria-hidden />
        <span className="text-fg-2">{NETWORK_LABEL[network]} is warming up. The full app is live on {NETWORK_LABEL[fallback]}.</span>
        <button type="button" onClick={() => setNetwork(fallback)} className="font-medium text-primary-text underline-offset-4 hover:underline">
          Open {NETWORK_LABEL[fallback]}
        </button>
      </div>
    </div>
  );
}
