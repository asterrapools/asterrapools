/**
 * The ASTERRAPOOLS token shown in the landing hero. It launches outside the protocol on Robinhood Chain mainnet, whatever
 * network the visitor picks in the header. Its address comes from ASTER_TOKEN_ADDRESS on the server at request time
 * (app/page.tsx), so it goes live without a rebuild; the hero shows "Coming soon" while that is unset.
 */
export const ASTER_TOKEN = {
  name: "ASTERRAPOOLS",
  explorer: "https://robinhoodchain.blockscout.com",
};
