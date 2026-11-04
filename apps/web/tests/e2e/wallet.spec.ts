import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Wallet flows against a local fork, with a wallet injected into the page (anvil's first dev account, unlocked).
// Jalankan di: ROOT/apps/web
//   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8547
//   NEXT_PUBLIC_NETWORK=mainnet NEXT_PUBLIC_RPC_URL_MAINNET=http://127.0.0.1:8547 pnpm build
//   E2E_FORK_RPC=http://127.0.0.1:8547 NEXT_PUBLIC_NETWORK=mainnet pnpm test:e2e wallet
// Pool and position lists come from the live indexer, so pools created on the fork are checked on-chain only.
const RPC = process.env.E2E_FORK_RPC;
const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

test.skip(!RPC, "needs E2E_FORK_RPC and a build whose RPC points at the fork");
test.describe.configure({ mode: "serial" });

async function rpc(method: string, params: unknown[] = []) {
  const r = await fetch(RPC!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await r.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const balanceOf = async (token: string) =>
  BigInt((await rpc("eth_call", [{ to: token, data: `0x70a08231${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"])) as string);

async function connect(page: Page, path: string) {
  await page.addInitScript(
    ([url, account]) => {
      let id = 0;
      const send = async (method: string, params: unknown[] = []) => {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
        return j.result;
      };
      const local: Record<string, unknown> = {
        eth_requestAccounts: [account],
        eth_accounts: [account],
        eth_chainId: "0x1237",
        net_version: "4663",
        wallet_switchEthereumChain: null,
        wallet_addEthereumChain: null,
        wallet_requestPermissions: [{ parentCapability: "eth_accounts" }],
        wallet_getPermissions: [{ parentCapability: "eth_accounts" }],
      };
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: ({ method, params }: { method: string; params?: unknown[] }) => (method in local ? Promise.resolve(local[method]) : send(method, params)),
        on() {},
        removeListener() {},
      };
    },
    [RPC!, ACCOUNT] as const,
  );
  await page.goto(path);
  // an injected wallet that already lists the account can be reconnected on load without the modal
  const connectBtn = page.getByRole("button", { name: /^connect( wallet)?$/i }).first();
  const accountBtn = page.getByRole("button", { name: "0xf3…2266" });
  await expect(connectBtn.or(accountBtn).first()).toBeVisible({ timeout: 15_000 });
  if (!(await accountBtn.isVisible())) {
    await connectBtn.click();
    await page.getByRole("button", { name: /browser wallet/i }).click();
  }
  await expect(accountBtn).toBeVisible({ timeout: 15_000 });
}

async function pickToken(page: Page, trigger: ReturnType<Page["locator"]>, symbol: string) {
  await trigger.click();
  await page.getByPlaceholder("Search symbol or address").fill(symbol);
  await page.locator("li button").filter({ has: page.getByText(symbol, { exact: true }) }).first().click();
  await expect(page.getByPlaceholder("Search symbol or address")).toHaveCount(0);
}

const confirmed = (page: Page) => expect(page.getByRole("status").filter({ hasText: "Transaction confirmed." })).toBeVisible({ timeout: 60_000 });

test("swap ETH to USDG through the router", async ({ page }) => {
  await connect(page, "/swap");
  await page.getByPlaceholder("Enter amount").first().fill("0.0001");
  const swap = page.getByRole("button", { name: /^swap$/i });
  await expect(swap).toBeEnabled({ timeout: 30_000 });
  await swap.click();
  await confirmed(page);
});

test("swap USDG back to ETH with an approval", async ({ page }) => {
  await connect(page, "/swap");
  await page.getByRole("button", { name: "Flip tokens" }).click();
  await page.getByPlaceholder("Enter amount").first().fill("0.05");
  const approve = page.getByRole("button", { name: /approve usdg/i });
  const swap = page.getByRole("button", { name: /^swap$/i });
  await expect(approve.or(swap)).toBeVisible({ timeout: 30_000 });
  // a confirmed approval swaps the Approve button (and its notice) for Swap
  if (await approve.isVisible()) await approve.click();
  await expect(swap).toBeEnabled({ timeout: 30_000 });
  await swap.click();
  await expect(page.getByRole("status").filter({ hasText: "Transaction confirmed." }).last()).toBeVisible({ timeout: 60_000 });
});

test("mint a full-range position in WETH/USDG", async ({ page }) => {
  await rpc("eth_sendTransaction", [{ from: ACCOUNT, to: WETH, value: "0x5af3107a4000", data: "0xd0e30db0" }]); // wrap 0.0001 ETH
  const before = await balanceOf(WETH);
  await connect(page, "/pools");
  await page.locator('a[href^="/pools/0x"]:visible').first().click();
  await expect(page).toHaveURL(/\/pools\/0x/);
  await page.getByPlaceholder("Enter amount").first().fill("0.00005");
  await page.getByPlaceholder("Enter amount").nth(1).fill("0.2");
  const mint = page.getByRole("button", { name: "Mint position" });
  for (const symbol of ["WETH", "USDG"]) {
    const approve = page.getByRole("button", { name: new RegExp(`approve ${symbol}`, "i") });
    await expect(page.getByRole("button", { name: /approve (weth|usdg)/i }).or(mint)).toBeVisible({ timeout: 30_000 });
    if (await approve.isVisible()) {
      await approve.click();
      await expect(approve).toHaveCount(0, { timeout: 60_000 });
    }
  }
  await mint.click();
  await confirmed(page);
  expect(await balanceOf(WETH)).toBeLessThan(before);
});

for (const venue of ["DLMM", "DAMM"] as const) {
  test(`create a ${venue} WETH/USDG pool`, async ({ page }) => {
    await connect(page, "/pools/create");
    await page.locator("button").filter({ has: page.getByText(venue, { exact: true }) }).first().click();
    const selects = page.locator("button").filter({ hasText: /^select$/i });
    await pickToken(page, selects.first(), "WETH");
    await pickToken(page, page.locator("button").filter({ hasText: /^select$/i }).first(), "USDG");
    await page.getByPlaceholder("Initial price").fill("2300");
    await page.getByRole("button", { name: "Create pool" }).click();
    await confirmed(page);
  });
}

test("every page loads with a connected wallet and no runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await connect(page, "/");
  for (const path of ["/swap", "/pools", "/positions", "/orders", "/analytics", "/events", "/contracts", "/docs", "/pools/create", "/faucet"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await page.locator("body").innerText(), path).not.toMatch(/application error|something went wrong/i);
  }
  expect(errors).toEqual([]);
});
