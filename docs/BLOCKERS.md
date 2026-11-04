# Waiting on you

Commands that need the keystore password or a login are run by you in your own terminal.

| # | What | Status |
|---|---|---|
| B1 | VPS SSH access for this machine's key | done 2026-11-02 |
| B2 | DNS: A `@` and `testnet` → `160.238.36.55`, `www` CNAME → apex | done 2026-11-04; Let's Encrypt certificates issued for apex and testnet |
| B3 | Testnet broadcast (`deployer` keystore password) | open, ready: step-1 simulation on live testnet passed 2026-11-04 |
| B4 | GHCR image visibility: the VPS gets `unauthorized` pulling the web image | open |
| B5 | Testnet activity swaps after B2–B4 (keystore password) | open |

## B1 · VPS SSH

```bash
# Run in: any directory
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@160.238.36.55
```

## B2 · DNS (done)

`@` and `testnet` are A records to `160.238.36.55`; `www` stays a CNAME to the apex (Hostinger refuses an A record next
to it). Traefik issued the certificates once the records resolved. If a certificate ever fails because DNS was wrong,
recreate a container with Traefik labels (`docker compose up -d --force-recreate functions`) to make it retry.

## B3 · Testnet broadcast

Deployer balance on testnet: 0.0149 ETH (2026-11-04); the release needs about 0.0017 ETH (61M gas at 0.01 gwei plus a
0.001 WETH seed). The script asks the password once, checks the keystore is `0xd09D…9a7C`, then sends all four steps.

```bash
# Run in: ROOT (ASTERRAPOOLS)
TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com bash scripts/testnet-deploy.sh --broadcast
```

The RPC hostname resolves correctly from this workstation again (2026-11-04). If the ISP hijacks it once more, add
`172.66.147.70 rpc.testnet.chain.robinhood.com rpc.mainnet.chain.robinhood.com` to `/etc/hosts`.

When it finishes, tell Claude: the addresses and receipts get committed, `testnet` is updated from `main`, CI builds
the image with the new addresses and the VPS is redeployed.

## B4 · GHCR visibility

The VPS is refused when pulling `ghcr.io/asterrapools/asterrapools-web:testnet` (new packages start private). Open
https://github.com/orgs/asterrapools/packages/container/package/asterrapools-web → Package settings →
Change visibility → Public. The repo is already public, and the image holds only the public web build.

## B5 · Testnet activity

Router swaps give every pool chart, sparkline and the event feed real history. One swap per pool every 15 minutes for
24 hours (Ctrl+C stops it any time; the keystore password is asked once). Sizes follow each pool's reserves and lean
back toward the oracle price, so charts move like a market and the circuit breaker never trips.

```bash
# Run in: ROOT (ASTERRAPOOLS)
bash scripts/testnet-activity.sh 96 900
```
