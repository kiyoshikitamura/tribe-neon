import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`Battle Full Skill Load QA route is mobile-safe at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/qa/battle-full-skill-load");
    const harness = page.locator('[data-qa-harness="battle-full-skill-load"]');
    await expect(harness).toHaveAttribute("data-battle-state", "READY");
    await expect(page.getByText("35 Skill actions / 13 rounds / 283 events", { exact: true })).toBeVisible();
    await expect(page.getByText("/bg/bg_street_shinjuku.jpg", { exact: true })).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.getByRole("button", { name: "Stress Battleを開始" }).click();
    await expect(page.locator(".sb-root")).toBeVisible();
    await expect(page.locator('.sb-unit.player[data-participant-id]')).toHaveCount(5);
    await expect(page.locator('.sb-unit.enemy[data-participant-id]')).toHaveCount(5);
    await expect(page.locator(".battle-stress-audit")).toHaveAttribute("data-location-parity", "pass");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const controls = page.locator(".sb-controls");
    const box = await controls.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({ path: test.info().outputPath(`quest-battle-5v5-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "SKIP", exact: true }).click();
    await expect(page.locator(".battle-result-summary")).toBeVisible({ timeout: 4_000 });
    await expect(page.getByRole("button", { name: "もう一度確認" })).toBeEnabled();
  });
}
