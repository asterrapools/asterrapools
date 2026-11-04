import type { Address } from "viem";

/**
 * The ASTERRAPOOLS token shown in the landing hero. It launches outside the protocol on Robinhood Chain mainnet, whatever
 * network the visitor picks in the header. `address` stays null until launch; the hero shows "Coming soon" until then.
 */
export const ASTER_TOKEN: { name: string; address: Address | null; explorer: string } = {
  name: "ASTERRAPOOLS",
  address: null,
  explorer: "https://robinhoodchain.blockscout.com",
};
