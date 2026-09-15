import { expect, test, type Page } from "@playwright/test";
if (process.env.INTEGRATION_BROWSER === "webkit") test.use({ browserName: "webkit", isMobile: true, hasTouch: true });

async function openIntro(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START", exact: true }).click();
  await page.getByRole("button", { name: "はじめから", exact: true }).click();
  await expect(page.locator('[data-entry-state="WORLD_INFORMATION"]')).toBeVisible();
}

async function register(page: Page) {
  await page.getByLabel("プレイヤー名（8文字まで）").fill("確認" + Date.now().toString().slice(-5));
  await page.getByRole("button", { name: "この名前で始める" }).click();
  await expect(page.locator(".tutorial-world")).toBeVisible();
  const milestones = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]"));
  expect(milestones).toEqual([]);
  await page.locator(".tutorial-world-next-cta").click();
  await expect(page.locator(".tutorial-world")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("FREE_GACHA");
}

for (const viewport of [{ width: 375, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 844 }, { width: 390, height: 667 }]) {
  test(`immediate SKIP survives double tap, reload and back at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openIntro(page);
    const skip = page.getByRole("button", { name: "SKIP", exact: true });
    await expect(skip).toBeVisible();
    const box = (await skip.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeGreaterThan(viewport.width - 100);
    await page.screenshot({ path: test.info().outputPath(`intro-${viewport.width}.png`) });
    await skip.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();
    await expect(page.locator('.setup-ageha-character img').last()).toBeVisible();
    await page.locator('.setup-ageha-presentation .setup-primary-action').click();
    await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
    await expect(skip).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_users") || "[]").length)).toBe(0);
    await page.reload();
    await page.getByRole("button", { name: "TAP TO START", exact: true }).click();
    await page.getByRole("button", { name: "チュートリアルを続ける", exact: true }).click();
    await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
    await page.goto("/legal/terms");
    await page.goBack();
    const title = page.getByRole("button", { name: "TAP TO START", exact: true });
    await expect(title.or(page.locator('[data-entry-state="NAME_INPUT"]'))).toBeVisible();
    if (await title.isVisible()) {
      await title.click();
      await page.getByRole("button", { name: "チュートリアルを続ける", exact: true }).click();
    }
    await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
    await register(page);
  });
}

test("normal introduction retains every page and canonical tutorial", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openIntro(page);
  await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
  await page.locator(".setup-world-tap").click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();
  await page.locator(".setup-ageha-presentation .setup-primary-action").click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  await register(page);
});

test("SKIP during scene transition cannot be overwritten by its timer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openIntro(page);
  await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
  await page.locator(".setup-world-tap").click();
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();
  await page.locator('.setup-ageha-presentation .setup-primary-action').click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  await expect(page.locator(".setup-ageha-presentation")).toHaveCount(0);
});
