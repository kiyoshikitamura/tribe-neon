import { expect, test } from "@playwright/test";

const userId = "00000000-0000-4000-8000-000000003110";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ userId }) => {
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "Short QA", level: 5, cash: 100000, pvp_points: 5, current_base_id: "shinjuku", last_active_at: now }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "EMAIL" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([
      { id: "short-char-1", user_id: userId, character_id: "char_reiji_01", level: 7, awakening_level: 0, created_at: now },
      { id: "short-char-2", user_id: userId, character_id: "char_ageha_01", level: 4, awakening_level: 0, created_at: now },
    ]));
    localStorage.setItem("mock_db_user_equipments", JSON.stringify([
      { id: "short-equipment-1", user_id: userId, equipment_id: "EQ_001", equipment_master_id: "EQ_001", level: 1, plus_val: 0, equipped_character_id: null, slot_index: null },
    ]));
    localStorage.setItem("mock_db_user_skills", "[]");
    localStorage.setItem("mock_db_user_main_formations", "[]");
    localStorage.setItem("mock_db_user_power_rankings", "[]");
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify([
      "tutorial_complete", "first_free_skill_ten_pull", "first_free_equipment_ten_pull", "character_setup_dialog_eligible",
    ].map((milestone) => ({ user_id: userId, milestone, occurrence_count: 1 }))));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: today }]));
  }, { userId });
});

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  const start = page.getByRole("button", { name: "TAP TO START" });
  const resume = page.getByRole("button", { name: "続きから" });
  await expect(start.or(resume).or(page.locator(".header-mobile"))).toBeVisible();
  if (await start.isVisible()) await start.click();
  if (await resume.isVisible()) await resume.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const close = page.locator(".login-bonus-modal-overlay").getByRole("button", { name: "閉じる" });
  if (await close.isVisible()) await close.click();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`first Character visit applies Party + Equipment once at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page);
    await expect(page.locator(".mypage-primary-cta")).toContainText("キャラ装備");
    await page.locator(".mypage-primary-cta").click();
    const dialog = page.getByRole("dialog", { name: "キャラクターページ初回おすすめ設定" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("今のキャラクターから、おすすめの編成と装備を自動で設定します。");
    const metrics = await dialog.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, bottom: element.getBoundingClientRect().bottom, viewport: window.innerHeight }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewport);
    await dialog.getByRole("button", { name: "おすすめ設定する" }).click();
    await expect(page.locator('[data-acceptance-state="CHARACTER_SETUP_COMPLETE"]')).toBeVisible();
    await expect(page.locator('[data-acceptance-state="CHARACTER_SETUP_COMPLETE"]')).toContainText("総合力");
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]"));
    expect(persisted.some((row: any) => row.milestone === "character_setup_dialog_consumed")).toBeTruthy();
    expect(persisted.some((row: any) => row.milestone === "first_main_loadout")).toBeTruthy();
  });
}

test("Later consumes the first-visit dialog without blocking Character Page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.locator(".mypage-primary-cta").click();
  const dialog = page.getByRole("dialog", { name: "キャラクターページ初回おすすめ設定" });
  await dialog.getByRole("button", { name: "あとで" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".character-v2-shell")).toBeVisible();
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await page.getByRole("button", { name: "キャラ", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]"));
  expect(persisted.some((row: any) => row.milestone === "character_setup_dialog_consumed")).toBeTruthy();
  expect(persisted.some((row: any) => row.milestone === "first_main_loadout")).toBeFalsy();
});
