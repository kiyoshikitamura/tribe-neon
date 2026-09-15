import { expect, test } from "@playwright/test";

async function seedCompletedPlayer(page: import("@playwright/test").Page, currentDay = 0) {
  await page.addInitScript(({ currentDay }) => {
    const userId = "00000000-0000-4000-8000-000000000330";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId, username: "ログボ確認", current_base_id: "shinjuku",
      favorite_character_id: "char_reiji_01", cash: 0, neon_diamonds: 0,
    }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{
      id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 1, awakening_level: 0,
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "EMAIL" }]));
    if (currentDay > 0) localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{
      user_id: userId, current_day: currentDay, total_logins: currentDay,
      last_claimed_date: "2000-01-01", last_claimed_at: "2000-01-01T00:00:00.000Z",
    }]));
  }, { currentDay });
}

test("distinguishes received rewards from today, next and future", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCompletedPlayer(page, 6);
  await enterCompletedGame(page);

  const dialog = page.getByRole("dialog", { name: "ログインボーナス" });
  await expect(dialog.locator(".state-received")).toHaveCount(6);
  await expect(dialog.getByRole("button", { name: /DAY 7 .* 今日/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /DAY 8 .* 明日/ })).toBeVisible();
  await expect(dialog.locator(".state-future")).toHaveCount(22);
  await page.screenshot({ path: "test-results/login-bonus-received-day7-390x844.png" });
});

async function enterCompletedGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  await expect(tapToStart).toBeVisible();
  await tapToStart.click();
  const titleEntry = page.getByRole("button", { name: "続きから" });
  await expect(titleEntry).toBeVisible();
  await titleEntry.click();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`recognizes Day 1 and preserves exactly-once at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedCompletedPlayer(page);
    await enterCompletedGame(page);

    const dialog = page.getByRole("dialog", { name: "ログインボーナス" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("本日のログインボーナス")).toBeVisible();
    await expect(dialog.locator(".login-bonus-cell")).toHaveCount(30);
    await expect(dialog.locator(".state-today")).toHaveCount(1);
    await expect(dialog.locator(".state-next")).toHaveCount(1);
    await expect(dialog.locator(".state-future")).toHaveCount(28);
    await expect(dialog.getByRole("button", { name: /DAY 1 .* 今日/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /DAY 2 .* 明日/ })).toBeVisible();

    const geometry = await dialog.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    await page.screenshot({ path: `test-results/login-bonus-${viewport.width}x${viewport.height}.png` });

    await dialog.getByRole("button", { name: "閉じる" }).click();
    const beforeReload = await page.evaluate(() => ({
      presents: JSON.parse(localStorage.getItem("mock_db_presents") || "[]").length,
      logins: JSON.parse(localStorage.getItem("mock_db_user_login_bonuses") || "[]")[0]?.total_logins,
    }));
    expect(beforeReload).toEqual({ presents: 1, logins: 1 });

    await page.reload();
    const tapToStart = page.getByRole("button", { name: "TAP TO START" });
    const resume = page.getByRole("button", { name: "続きから" });
    await expect(tapToStart.or(resume)).toBeVisible();
    if (await tapToStart.isVisible()) await tapToStart.click();
    await expect(resume).toBeVisible();
    await resume.click();
    await expect(page.locator(".mypage-view")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("dialog", { name: "ログインボーナス" })).toHaveCount(0);

    await page.getByRole("button", { name: /MENU/ }).click();
    const utilityMenu = page.getByRole("dialog", {
      name: "ホームメニュー",
    });
    await expect(utilityMenu).toBeVisible();
    await utilityMenu
      .getByRole("button", { name: "ログインボーナス" })
      .click();
    const reopenedDialog = page.getByRole("dialog", {
      name: "ログインボーナス",
    });
    await expect(reopenedDialog.locator(".state-today")).toHaveCount(1);
    await reopenedDialog
      .getByRole("button", { name: "閉じる" })
      .click();

    await page.getByRole("button", { name: "ボーナス" }).click();
    await expect(page.getByRole("dialog", { name: "ログインボーナス" }).locator(".state-today")).toHaveCount(1);
    const afterReload = await page.evaluate(() => ({
      presents: JSON.parse(localStorage.getItem("mock_db_presents") || "[]").length,
      logins: JSON.parse(localStorage.getItem("mock_db_user_login_bonuses") || "[]")[0]?.total_logins,
    }));
    expect(afterReload).toEqual(beforeReload);

    await page.getByRole("dialog", { name: "ログインボーナス" })
      .getByRole("button", { name: "閉じる" })
      .click();
    await expect(page.getByRole("button", { name: /招待/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /招待/ })).toHaveCount(0);
    await expect(page.getByText(/招待コード|招待URL/)).toHaveCount(0);
    await expect(page.locator('a[href*="invite="]')).toHaveCount(0);

    await page.getByRole("button", { name: "ミッション" }).click();
    const missionDialog = page.getByRole("dialog", { name: "ミッション" });
    await expect(missionDialog).toBeVisible();
    await missionDialog.getByRole("button", { name: /ノーマル/ }).click();
    await expect(missionDialog.getByText(/盟友の招聘/)).toHaveCount(0);
    await missionDialog.getByRole("button", { name: "閉じる" }).click();
  });
}
