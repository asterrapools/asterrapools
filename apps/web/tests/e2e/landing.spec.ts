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

test("header: the nav sits right beside the logo, on the left", async ({ page }) => {
  await page.goto("/pools");
  const logo = await page.getByRole("banner").getByRole("link", { name: "AsterraPools home" }).boundingBox();
  const nav = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  expect(logo && nav).toBeTruthy();
  expect(nav!.x - (logo!.x + logo!.width)).toBeGreaterThan(0);
  expect(nav!.x - (logo!.x + logo!.width)).toBeLessThan(40);
});

test("the 3D star wears the logo artwork", async ({ page }) => {
  const art = page.waitForResponse((r) => r.url().endsWith("/brand/asterra-mark-512.png") && r.ok(), { timeout: 15_000 });
  await page.goto("/");
  await expect(page.locator("[data-scene] canvas")).toHaveCount(1, { timeout: 15_000 });
  await art;
});

test("reduced motion: the still star is drawn with the logo's colours, not the placeholder", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const art = page.waitForResponse((r) => r.url().endsWith("/brand/asterra-mark-512.png") && r.ok(), { timeout: 15_000 });
  await page.goto("/");
  await expect(page.locator("[data-scene] canvas")).toHaveCount(1, { timeout: 15_000 });
  await art;
  await page.waitForTimeout(800);
  // the star's upper-left arm: lime in the logo, plain cyan in the placeholder gradient
  const png = await page.screenshot({ clip: { x: 820, y: 230, width: 230, height: 230 } });
  const lime = await page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    [c.width, c.height] = [img.width, img.height];
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k]! > 150 && d[k + 1]! > 170 && d[k + 2]! < 140) n++;
    return n;
  }, png.toString("base64"));
  expect(lime).toBeGreaterThan(800);
});

test("space backdrop: a star field that answers the cursor", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-sky] canvas")).toHaveCount(1, { timeout: 15_000 });
  // empty sky above the hero copy; the camera leans toward the pointer, so moving it slides the whole field
  const clip = { x: 250, y: 64, width: 400, height: 150 };
  /** horizontal offset (px) that best lines up two shots of the sky */
  const shift = (a: Buffer, b: Buffer) =>
    page.evaluate(
      async ([x, y]: [string, string]) => {
        const gray = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          [c.width, c.height] = [img.width, img.height];
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          // stars only: the static film grain over the page would otherwise line up best at zero
          return { w: c.width, h: c.height, v: Float32Array.from({ length: d.length / 4 }, (_, i) => Math.max(0, d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]! - 150)) };
        };
        const [p, q] = [await gray(x), await gray(y)];
        let best = 0;
        let bestErr = Infinity;
        for (let dx = -120; dx <= 120; dx++) {
          let err = 0;
          for (let row = 0; row < p.h; row++)
            for (let col = Math.max(0, -dx); col < Math.min(p.w, p.w - dx); col++) err += Math.abs(p.v[row * p.w + col]! - q.v[row * p.w + col + dx]!);
          err /= p.w - Math.abs(dx);
          if (err < bestErr) [best, bestErr] = [dx, err];
        }
        return best;
      },
      [a.toString("base64"), b.toString("base64")] as [string, string],
    );
  await page.mouse.move(150, 450);
  await page.waitForTimeout(2000);
  // two equal 300 ms gaps, the second one with the pointer swept across the screen
  const s1 = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  const s2 = await page.screenshot({ clip });
  await page.mouse.move(1300, 450);
  await page.waitForTimeout(300);
  const s3 = await page.screenshot({ clip });
  // pointer still: only the slow drift (a few px); pointer moved: the field slides tens of pixels further
  const drift = await shift(s1, s2);
  expect(Math.abs(drift)).toBeLessThan(8);
  expect(Math.abs((await shift(s2, s3)) - drift)).toBeGreaterThan(12);
});
