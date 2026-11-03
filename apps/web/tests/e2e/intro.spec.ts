import { expect, test } from "@playwright/test";

test("intro plays for about three seconds on the first visit, then never again in the session", async ({ page }) => {
  // the intro paints with the first HTML; waiting for the full load could outlast it on a slow network
  await page.goto("/", { waitUntil: "commit" });
  const intro = page.locator(".intro");
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("Built for the flow of every market.");
  // still covering the page well into the run
  await page.waitForTimeout(1800);
  await expect(intro).toBeVisible();
  // gone after the 3 s run plus the exit wipe
  await expect(intro).toBeHidden({ timeout: 2500 });
  await page.reload();
  await expect(intro).toBeHidden();
  await page.goto("/pools");
  await expect(intro).toBeHidden();
});

test("intro reacts to the pointer", async ({ page }) => {
  // the intro element stays mounted until 3.8 s after hydration, so the listeners always get a window
  await page.goto("/");
  const intro = page.locator(".intro");
  // keep moving until hydration has attached the listener
  await expect
    .poll(async () => {
      await page.mouse.move(900 + Math.random() * 40, 200);
      return intro.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--pf"));
    }, { timeout: 3500 })
    .toBe("1");
});
