import { test as base } from "@playwright/test";

// Every spec starts past the first-visit intro; intro.spec.ts imports @playwright/test directly to see it.
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => sessionStorage.setItem("asterra-intro", "1"));
    await provide(page);
  },
});
export { expect } from "@playwright/test";
