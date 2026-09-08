import { expect, test, type Page } from "@playwright/test";
import { seedBattleTop } from "./support/battleTopSeed";

async function openBattle(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START", exact: true }).click();
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await page.locator(".circle-menu-btn.fight").click();
  await expect(page.locator(".battle-top-start")).toBeEnabled();
}

test.beforeEach(async ({ page }) => { await page.addInitScript(seedBattleTop); await page.addLocatorHandler(page.getByRole("dialog", { name: "ログインボーナス", exact: true }), async dialog => { await dialog.getByRole("button", { name: "閉じる", exact: true }).click(); }); });

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`VS First View, switch, Ready and cancellation ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openBattle(page);
    await page.locator("html").evaluate(root => { root.style.setProperty("--app-safe-top", "47px"); root.style.setProperty("--app-safe-bottom", "34px"); });
    const hero = page.locator(".battle-top-hero");
    await expect(hero.locator(".character-presentation-character")).toHaveCount(2);
    await expect(hero).toContainText("185,240");
    const comparison = await hero.locator(".battle-top-comparison").boundingBox();
    for (const portrait of await hero.locator(".character-presentation-character").all()) {
      const portraitBox = await portrait.boundingBox();
      expect(portraitBox!.y + portraitBox!.height).toBeLessThanOrEqual(comparison!.y);
    }
    const bounds = await page.locator(".battle-top-start").boundingBox();
    const footer = await page.locator(".footer-mobile").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(footer!.y);
    expect((await page.locator(".battle-top-selector").boundingBox())!.y).toBeLessThan(footer!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(await page.locator(".pvp-view").evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
    const initialHeight = (await hero.boundingBox())!.height;
    const originalUrl = page.url();
    const rivals = page.locator(".battle-top-rival");
    await rivals.nth(1).click();
    await expect(rivals.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(hero.locator(".battle-top-comparison .is-rival")).toContainText("ケンゴ");
    await expect(page.locator(".battle-top-start")).toBeEnabled();
    expect((await hero.boundingBox())!.height).toBe(initialHeight);
    expect(page.url()).toBe(originalUrl);
    await page.screenshot({ path: `scratch/battle-top/after-safe-${viewport.width}.png` });
    await page.locator(".battle-top-start").evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.locator(".sf-live-setup")).toBeVisible();
    await page.getByRole("button", { name: "戻る", exact: true }).click();
    await expect(hero).toBeVisible();
    await expect(hero).toContainText("5 / 5");
    await expect(rivals.nth(1)).toHaveAttribute("aria-pressed", "true");
  });
}

test("ranking, Raid, reload and foreground return", async ({ page }) => {
  await openBattle(page);
  await page.getByRole("button", { name: "ランキングを見る" }).click();
  await expect(page.locator(".ranking-category-nav .sub-tab-item.active")).toHaveAttribute("data-sub-tab-id", "pvp");
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await page.locator(".circle-menu-btn.fight").click();
  await page.getByRole("button", { name: "レイドへ", exact: true }).click();
  await expect(page.locator(".raid-view")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "TAP TO START", exact: true }).click();
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await page.locator(".circle-menu-btn.fight").click();
  const another = await page.context().newPage();
  await another.goto("about:blank");
  await another.bringToFront();
  await page.bringToFront();
  await another.close();
  await expect(page.locator(".battle-top-start")).toBeEnabled();
  await expect(page.locator(".battle-top-rival").first()).toHaveAttribute("aria-pressed", "true");
});

test("failed leader image keeps primary action locked", async ({ page }) => {
  await page.route("**/characters/reiji_transparent_asset.png*", route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START", exact: true }).click();
  await page.getByRole("button", { name: "続きから", exact: true }).click();
  await page.locator(".circle-menu-btn.fight").click();
  await expect(page.locator(".battle-top-start")).toBeDisabled();
  await expect(page.getByRole("button", { name: "画像を再取得" })).toBeVisible();
  await page.unroute("**/characters/reiji_transparent_asset.png*");
  await page.getByRole("button", { name: "画像を再取得" }).click();
  await expect(page.locator(".battle-top-start")).toBeEnabled();
});

test("existing server rejection preserves BP and permits Ready cancellation", async ({ page }) => {
  await openBattle(page);
  await page.locator(".battle-top-rival").nth(1).click();
  await page.locator(".battle-top-start").click();
  await expect(page.locator(".sf-live-setup")).toBeVisible();
  await page.getByRole("button", { name: "バトルスタート", exact: true }).first().click();
  // 既存Mockは公式PvPのcommitに未対応。成功を捏造せず拒否時の導線を検証する。
  const error = page.getByRole("dialog", { name: "エラー", exact: true });
  await expect(error).toContainText("サーバーで確定できませんでした");
  await error.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.locator(".battle-top-hero")).toBeVisible();
  await expect(page.locator(".battle-top-hero")).toContainText("5 / 5");
});
