import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000001";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "検証ユーザー",
      current_base_id: "shinjuku",
      favorite_character_id: "char_reiji_01",
    }]));
  });
});

async function enterGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator("html").evaluate((root) => root.style.setProperty("--app-safe-top", "47px"));
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  const welcomeAction = page.getByRole("button", { name: "抗争に参入する" });
  await welcomeAction.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await welcomeAction.isVisible()) await welcomeAction.click();
}

test("authenticated game shell keeps the header and footer inside its safe frame", async ({ page }) => {
  await enterGame(page);

  const header = page.locator(".header-mobile");
  const footer = page.locator(".footer-mobile");
  await expect(header).toBeVisible();
  await expect(footer).toBeVisible();

  const headerBox = await header.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(headerBox!.y).toBeGreaterThanOrEqual(36);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(844);
});

test("shared shell preserves footer navigation", async ({ page }) => {
  await enterGame(page);
  await page.getByRole("button", { name: "キャラ", exact: true }).click();
  await expect(page.locator(".footer-item.active")).toContainText("キャラ");
});

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`global identity keeps the explicit favorite and opens the self profile at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enterGame(page);

    const header = page.locator(".header-mobile");
    const identity = header.locator(".user-identity-row.is-compact");
    await expect(identity).toBeVisible();
    await expect(identity.getByText("検証ユーザー", { exact: true })).toBeVisible();
    await expect(identity.locator(".character-presentation-character")).toHaveAttribute("src", /reiji_transparent_asset/);
    await expect(identity.locator(".character-presentation-frame")).toBeVisible();
    await expect(identity.locator(".character-presentation-rarity")).toHaveCount(0);

    const geometry = await header.evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      height: node.getBoundingClientRect().height,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.height).toBeLessThanOrEqual(96);

    await identity.click();
    const profile = page.getByRole("dialog", { name: "検証ユーザーの公開プロフィール" });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole("button", { name: "DMを送る" })).toHaveCount(0);
    await profile.getByRole("button", { name: "閉じる" }).click();

    await page.getByRole("button", { name: /キャラ/ }).click();
    await expect(page.locator(".header-mobile .user-identity-row.is-compact")).toBeVisible();

    await page.reload();
    const titleStart = page.getByRole("button", { name: "TAP TO START" });
    const continueAction = page.getByRole("button", { name: "続きから" });
    const headerAfterReload = page.locator(".header-mobile");
    await expect(titleStart.or(continueAction).or(headerAfterReload)).toBeVisible();
    if (await titleStart.isVisible()) await titleStart.click();
    if (await continueAction.isVisible()) await continueAction.click();
    const reloadedIdentity = page.locator(".header-mobile .user-identity-row.is-compact");
    await expect(reloadedIdentity).toBeVisible();
    await expect(reloadedIdentity.locator(".character-presentation-character")).toHaveAttribute("src", /reiji_transparent_asset/);
  });
}

test("Open Beta home prioritizes the next action and keeps unreleased GvG unavailable", async ({ page }) => {
  await enterGame(page);
  await expect(page.locator(".mypage-primary-cta")).toBeVisible();
  await expect(page.getByRole("button", { name: "ギルドバトルは準備中です" })).toBeDisabled();
});

test("stage two hubs share a mobile-safe page frame", async ({ page }) => {
  await enterGame(page);

  const cases = [
    { trigger: page.locator(".circle-menu-btn.fight"), title: "バトル", period: false, hero: ".pvp-hero" },
    { trigger: page.locator(".circle-menu-btn.conquest"), title: "クエスト", period: false, hero: ".quest-v2-identity" },
    { trigger: page.locator(".mypage-sub-icons-left").getByRole("button", { name: /ランキング/ }), title: "ランキング", period: false, hero: ".ranking-current" },
  ];

  for (const target of cases) {
    await target.trigger.click();
    const hub = page.locator(".ui-hub-page");
    await expect(hub.getByRole("heading", { name: target.title, exact: true })).toBeVisible();
    await expect(hub.locator(target.hero).first()).toBeVisible();
    const pageMetrics = await hub.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth + 1);
    if (target.period) await expect(hub.locator(".period-status")).toBeVisible();
    if (target.title === "ランキング") {
      await expect(hub.locator(".ranking-category-nav")).toBeVisible();
      await expect(hub.getByRole("group", { name: "集計期間" })).toBeVisible();
      await expect(hub.locator(".ranking-category-nav .sub-tab-item:visible")).toHaveText(["総合力", "バトル", "ギルド"]);
      await expect(hub.locator(".ranking-category-nav").getByRole("button", { name: "レイド", exact: true })).toHaveCount(0);
      await expect(hub.locator(".ranking-current")).not.toContainText("--");
    }
    await page.locator(".footer-item").first().click();
    await expect(target.trigger).toBeVisible();
  }
});
