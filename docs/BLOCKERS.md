# Waiting on you

Commands that need the keystore password or a login are run by you in your own terminal.

| # | What | Status |
|---|---|---|
| B1 | VPS SSH access for this machine's key | done 2026-11-02 |
| B2 | DNS A records for `@`, `www`, `testnet` → `160.238.36.55` | open |
| B3 | Testnet broadcast (`deployer` keystore password) | open |
| B4 | GHCR image visibility: the VPS gets `unauthorized` pulling the web image | open |
| B5 | Testnet activity swaps after B2–B4 (keystore password) | open |

## B1 · VPS SSH

```bash
# Run in: any directory
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@160.238.36.55
```

## B2 · DNS (Hostinger → asterrapools.tech → DNS records)

Replace the parking records with three A records pointing at `160.238.36.55`: `@`, `www`, `testnet`. Caddy requests
the Let's Encrypt certificates by itself once they resolve.

## B3 · Testnet broadcast

Deployer balance on testnet: 0.0081 ETH; the release needs about 0.0016 ETH (59M gas at 0.01 gwei plus a 0.001 WETH
seed). The script asks the password once, checks the keystore is `0xd09D…9a7C`, then sends all four steps.

```bash
# Run in: ROOT (ASTERRAPOOLS)
TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com bash scripts/testnet-deploy.sh --broadcast
```

If your ISP still hijacks the RPC hostname, add this line to `/etc/hosts` first:
`172.66.147.70 rpc.testnet.chain.robinhood.com rpc.mainnet.chain.robinhood.com`

## B4 · GHCR visibility

The VPS is refused when pulling `ghcr.io/asterrapools/asterrapools-web:testnet` (new packages start private). Open
https://github.com/orgs/asterrapools/packages/container/package/asterrapools-web → Package settings →
Change visibility → Public. The repo is already public, and the image holds only the public web build.

## B5 · Testnet activity

Once the site is live, a few router swaps give every pool chart and the event feed real history:

```bash
# Run in: ROOT (ASTERRAPOOLS)
bash scripts/testnet-activity.sh 3
```
