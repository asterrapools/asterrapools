import { expect, test } from "@playwright/test";

test("hero: tagline, live chain badge, the WebGL star and the three narrative pillars", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Built for the flow of every market.");
  await expect(page.locator("section").first().locator("canvas")).toHaveCount(1, { timeout: 15_000 });
  for (const pillar of ["Liquidity on Robinhood Chain", "DLMM × DAMM", "Positions + smart routing"]) {
    await expect(page.getByRole("link", { name: new RegExp(pillar.replace(/[+×]/g, ".")) })).toBeVisible();
  }
});

test("the three stories and the contract registry are on the page", async ({ page }) => {
  await page.goto("/");
  for (const id of ["chain", "engines", "flow", "contracts"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: "DLMM for precision." })).toHaveCount(1);
  await expect(page.getByText("Uniswap v4 PoolManager").first()).toBeAttached();
});

test("labs react to input: the bin slider moves the active bin, the route list re-ranks", async ({ page }) => {
  await page.goto("/");
  const engines = page.locator("#engines");
  await engines.scrollIntoViewIfNeeded();
  const slider = engines.locator('input[type="range"]').first();
  await slider.fill("10");
  await expect(engines.getByText("Bins crossed")).toBeVisible();
  await expect(engines.getByText("10", { exact: true })).toBeVisible();
  const flow = page.locator("#flow");
  await flow.locator('input[type="range"]').fill("0");
  await expect(flow.getByText("Best route", { exact: true })).toHaveCount(1);
});

test("never shows the operator wallet, a dash placeholder, a bare zero or a disclaimer", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(3000);
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toContain("0xd09d9c87");
  expect(text).not.toMatch(/not (financial advice|audited)/);
  const cells = await page.$$eval(":not(input).num", (els) => els.map((e) => e.textContent?.trim() ?? ""));
  expect(cells.filter((c) => c === "" || c === "—" || c === "-" || c === "0" || c === "$0.00")).toEqual([]);
});

test("buttons: the prism ring appears on hover and the label never changes", async ({ page }) => {
  await page.goto("/");
  const launch = page.getByRole("link", { name: "Launch app" }).first();
  await page.waitForTimeout(1500); // let the hero reveal settle so the hover target stays put
  const ring = () => launch.evaluate((el) => getComputedStyle(el, "::after").opacity);
  await expect.poll(ring).toBe("0");
  await launch.hover();
  await expect.poll(ring).toBe("1");
  await expect(launch).toHaveText("Launch app");
});
