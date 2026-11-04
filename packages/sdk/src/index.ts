import type { Address } from "viem";
import local from "./addresses/local.json" with { type: "json" };
import testnet from "./addresses/testnet.json" with { type: "json" };
import mainnet from "./addresses/mainnet.json" with { type: "json" };
import type { NetworkName } from "./chains.js";

export * from "./chains.js";
export * from "./types.js";
export * from "./abis/index.js";
export * from "./router.js";
export * from "./math.js";

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** canonical | stock | launch | rwa | test */
  kind: string;
  logo?: string;
}

export interface Deployment {
  poolManager: Address;
  weth: Address;
  multicall3: Address;
  permit2: Address;
  hub: Address | null;
  hook: Address | null;
  router: Address | null;
  positions: Address | null;
  dlmmFactory: Address | null;
  dlmmLimitOrders: Address | null;
  dammFactory: Address | null;
  launchpad: Address | null;
  lendingVault: Address | null;
  creditManager: Address | null;
  buyback: Address | null;
  aster: Address | null;
  /** Deployed but switched off (launchpad, credit, buyback). Move back to the fields above to re-enable. */
  hidden?: Partial<Record<"launchpad" | "lendingVault" | "creditManager" | "buyback" | "aster", Address | null>>;
  tokens: Record<string, TokenInfo>;
  oracles: Record<string, Address>;
  startBlock: number;
}

export const deployments: Record<NetworkName, Deployment> = {
  local: local as Deployment,
  testnet: testnet as Deployment,
  mainnet: mainnet as Deployment,
};

export function getDeployment(network: NetworkName): Deployment {
  return deployments[network];
}

