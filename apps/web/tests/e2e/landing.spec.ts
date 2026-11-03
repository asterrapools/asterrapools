import { expect, test } from "./fixtures";

test("hero: tagline, live chain badge, the WebGL star and the three narrative pillars", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Built for the flow of every market.");
  await expect(page.locator("[data-scene] canvas")).toHaveCount(1, { timeout: 15_000 });
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
  await expect(engines.getByText("Bins crossed")).toBeVisible();
  // a value set before hydration is reset by React, so retry until the lab owns the input
  await expect(async () => {
    await slider.fill("10");
    await expect(engines.getByText("10", { exact: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  const flow = page.locator("#flow");
  await flow.locator('input[type="range"]').fill("0");
  await expect(flow.getByText("Best route", { exact: true })).toHaveCount(1);
});

// disclaimers and negative framing never appear in the copy
const BANNED = /not (financial advice|audited)|unaudited|\baudited\b|experimental|disclaimer|at your own risk|\bdyor\b/;

test("app pages carry no disclaimer or negative framing", async ({ page }) => {
  for (const path of ["/docs", "/contracts", "/swap", "/pools", "/developers"]) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    expect((await page.locator("body").innerText()).toLowerCase(), path).not.toMatch(BANNED);
  }
});

test("the star travels with the scroll", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("[data-scene] canvas");
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });
  const opacity = () => canvas.evaluate((el) => Number((el as HTMLElement).style.opacity));
  await expect.poll(opacity).toBeGreaterThan(0.95);
  // the contracts waypoint dims the star and parks it under the registry
  await page.locator("#contracts").scrollIntoViewIfNeeded();
  await expect.poll(opacity, { timeout: 5000 }).toBeLessThan(0.8);
});

test("never shows the operator wallet, a dash placeholder, a bare zero or a disclaimer", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(3000);
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toContain("0xd09d9c87");
  expect(text).not.toMatch(BANNED);
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
