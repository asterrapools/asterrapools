# Waiting on you

Commands that need the keystore password or a login are run by you in your own terminal.

| # | What | Status |
|---|---|---|
| B1 | VPS SSH access for this machine's key | done 2026-11-02 |
| B2 | DNS: A `@` and `testnet` → `160.238.36.55`, `www` CNAME → apex | done 2026-11-04; Let's Encrypt certificates issued for apex and testnet |
| B3 | Testnet broadcast (`deployer` keystore password) | done 2026-11-04: 119 transactions, 34/34 contracts verified |
| B4 | GHCR image visibility: the VPS gets `unauthorized` pulling the web image | done: testnet site live |
| B5 | Testnet activity swaps after B2–B4 (keystore password) | done: 7 pools with swaps |
| M1 | Mainnet V1.0 deploy + seed (keystore password) | done 2026-11-04: 36 + 5 transactions, asterrapools.tech serves mainnet |
| M2 | Mainnet V2.0 open (keystore password), about 1 hour after M1 | done 2026-11-05 |
| M3 | Mainnet V3.0 open (keystore password) | done 2026-11-05: 4 transactions, vault funded with 0.14 USDG |
| M4 | Router upgrade: a launch buy past the curve returns the unused ETH (keystore password) | waiting |

## M1 · Mainnet V1.0

Deployer: 0.00493 ETH. Deploy ≈ $2, then the seed uses the rest except a gas reserve. Three commands, in order:

```bash
# Run in: ROOT (ASTERRAPOOLS)
bash scripts/mainnet-deploy.sh               # dry run, nothing is sent
bash scripts/mainnet-deploy.sh --broadcast   # password asked twice
bash scripts/mainnet-launch-v1.sh            # buys USDG, opens + seeds WETH/USDG, smoke swap; password asked once
```

When it finishes, tell Claude: addresses and receipts get committed, the apex domain moves to the mainnet app, CI builds
both images, the VPS is redeployed and the contracts are verified.

## M2 · Mainnet V2.0

Stock feeds must be fresh (the script checks). About 0.0007 ETH.

```bash
# Run in: ROOT (ASTERRAPOOLS)
bash scripts/mainnet-v2.sh
```

Then tell Claude: the stock tokens and the launchpad appear in the web app after one rebuild.

## M3 · Mainnet V3.0

Opens credit: 4 transactions, about 0.000005 ETH. Prints the plan and asks `y` before the password.

```bash
# Run in: ROOT (ASTERRAPOOLS)
bash scripts/mainnet-v3.sh
```

Then tell Claude: the Credit page and the credit contracts appear in the web app after one rebuild.

## M4 · Router refund upgrade

A buy through `AsterraRouter` that is larger than what a launch curve still needs used to leave the unused WETH in the
router (the launchpad only pulls what it uses). The fixed router sends it back to the caller, as ETH when the buy was paid
in ETH. The site buys through the router on the launch page and on Swap, so the upgrade fixes the live site without a web
rebuild. Same storage, same constructor; rehearsed on a mainnet fork (`test/launchpad/RouterLaunchRefund.t.sol` holds the
unit tests). Cost: one implementation deploy and one `upgradeToAndCall`, well under $1 of gas.

`deployed2026-11-07` is the reference build of the code deployed today (`packages/contracts/upgrades/`, git-ignored). If it is
missing, make it from the commit before the fix: `bash scripts/snapshot-build.sh 9117718 deployed2026-11-07`.

```bash
# Run in: ROOT (ASTERRAPOOLS)
DIRECT=true bash scripts/upgrade.sh mainnet router deployed2026-11-07              # validate + simulate, nothing sent
DIRECT=true bash scripts/upgrade.sh mainnet router deployed2026-11-07 --broadcast  # password asked twice
```

`DIRECT=true` lets the script send the upgrade itself (the deployer owns the router on mainnet). Testnet has no launchpad, so
its router does not need it; to keep both in step: `bash scripts/upgrade.sh testnet router deployed2026-11-07 --broadcast`.
Then tell Claude: the new implementation gets verified on the explorer.

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

Router swaps give every pool chart, sparkline and the event feed real history. Young pools are charted trade by trade,
so a quick run already moves every chart: 30 rounds, one about every 40 seconds (Ctrl+C stops it any time; the keystore
password is asked once). Sizes follow each pool's reserves and lean back toward the oracle price, so charts move like a
market and the circuit breaker never trips. For a slow day-long history use `96 900` instead.

```bash
# Run in: ROOT (ASTERRAPOOLS)
bash scripts/testnet-activity.sh 30 10
```
