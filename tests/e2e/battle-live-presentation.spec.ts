import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 700 }, { width: 320, height: 568 }]) {
  test(`live battle preparation font gate and cutins ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let releaseFonts!: () => void;
    const fontGate = new Promise<void>((resolve) => { releaseFonts = resolve; });
    await page.route("**/effects/battle-live/*.woff2", async (route) => {
      await fontGate;
      await route.continue();
    });
    await page.goto("/qa/battle-live");
    await page.getByRole("button", { name: "Stress Battleを開始" }).click();
    await expect(page.locator(".sf-preparing")).toBeVisible();
    await expect(page.getByRole("heading", { name: "出撃準備" })).toHaveCount(0);
    releaseFonts();
    await expect(page.getByRole("heading", { name: "出撃準備" })).toBeVisible();
    const startBox = await page.getByRole("button", { name: "模擬戦開始", exact: true }).boundingBox();
    expect(startBox!.y).toBeGreaterThanOrEqual(0);
    expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: test.info().outputPath("setup.png") });
    await page.getByRole("button", { name: "模擬戦開始", exact: true }).click();
    await expect(page.locator(".sf-matchup")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("vs.png") });
    await expect(page.locator(".sb-root")).toBeVisible();
    await expect(page.locator('.sb-unit.acting')).toHaveCount(1);
    await page.getByRole("button", { name: "×1", exact: true }).click();
    await expect(page.locator(".sb-root")).toHaveAttribute("data-battle-speed", "2");
    const compact = page.locator(".sb-announcement.compact");
    await expect(compact).toBeVisible({ timeout: 30_000 });
    const cast = await compact.boundingBox();
    expect(Math.abs(cast!.y + cast!.height / 2 - viewport.height / 2)).toBeLessThan(3);
    await page.screenshot({ path: test.info().outputPath("compact-cutin.png") });
    const ssr = page.locator(".sb-announcement.fullscreen");
    await expect(ssr).toBeVisible({ timeout: 30_000 });
    await expect(ssr.locator(".sb-standing")).toHaveCSS("opacity", "1");
    const quote = await ssr.locator(".sb-cast-copy p").boundingBox();
    const controls = await page.locator(".sb-controls").boundingBox();
    expect(quote!.y + quote!.height).toBeLessThanOrEqual(controls!.y);
    await page.screenshot({ path: test.info().outputPath("ssr-cutin.png") });
    await page.getByRole("button", { name: "SKIP", exact: true }).click();
    await expect(page.locator(".battle-result-summary")).toBeVisible();
    const continueBox = await page.getByRole("button", { name: "もう一度確認", exact: true }).boundingBox();
    expect(continueBox!.y).toBeGreaterThanOrEqual(0);
    expect(continueBox!.y + continueBox!.height).toBeLessThanOrEqual(viewport.height);
    await page.getByText("戦績・MVPスコアの詳細", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "MVPスコア内訳", exact: true })).toBeVisible();
    const expandedContinue = await page.getByRole("button", { name: "もう一度確認", exact: true }).boundingBox();
    expect(expandedContinue!.y).toBeGreaterThanOrEqual(0);
    expect(expandedContinue!.y + expandedContinue!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: test.info().outputPath("result.png") });
    await page.getByRole("button", { name: "もう一度確認", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stress Battleを開始" })).toBeVisible();
  });
}

test("legacy quest presentation lights the acting character inside its card", async ({ page }) => {
  await page.goto("/qa/presentation?scenario=battle-5v3");
  const actor = page.locator(".sb-unit.acting");
  await expect(actor).toHaveCount(1);
  await expect(actor).toHaveAttribute("data-participant-id", "player-1");
  await expect(actor).toHaveCSS("outline-width", "2px");
  await expect(actor).toHaveCSS("outline-offset", "-2px");
});
