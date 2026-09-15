import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000201";
    const now = new Date().toISOString();
    const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: cycleDate }]));
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "C1検証ユーザー", current_base_id: "shinjuku", favorite_character_id: "char_reiji_01", level: 10, cash: 50_000 }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: "10000000-0000-4000-8000-000000000201", user_id: userId, character_id: "char_reiji_01", level: 10, awakening_level: 1, created_at: now }]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([{ user_id: userId, character_ids: ["10000000-0000-4000-8000-000000000201"] }]));
    const mission = { id: "MIS_D_002", title: "派遣に出よう", description: "派遣に出よう", category: "DAILY", trigger_type: "QUEST_COMPLETE_COUNT", target_value: 1, reward_item_id: "CHAR_EXP_S", reward_quantity: 1, condition_params: {}, display_order: 20, is_enabled: true, is_provisional: false };
    localStorage.setItem("mock_db_missions", JSON.stringify([mission]));
    localStorage.setItem("mock_db_user_missions", JSON.stringify([{ id: "user-c1-mission", user_id: userId, mission_id: mission.id, cycle_date: cycleDate, current_progress: 1, status: "CLEAR", claimed_at: null, missions: mission }]));
    localStorage.setItem("mock_db_presents", JSON.stringify([{ id: "present-c1", user_id: userId, item_id: "CHAR_EXP_M", quantity: 2, message: "C1検証プレゼント", status: "UNCLAIMED", created_at: now }]));
    localStorage.setItem("mock_db_guilds", JSON.stringify([
      { id: "30000000-0000-4000-8000-000000000201", name: "NEON BEGINNERS", level: 3, member_count: 4, member_limit: 14, recruitment_mode: "OPEN_JOIN", approval_required: false, description: "毎日活動中", active_members_7d: 4, raid_participants_7d: 3 },
      { id: "30000000-0000-4000-8000-000000000202", name: "TOKYO RAIDERS", level: 4, member_count: 8, member_limit: 17, recruitment_mode: "APPLICATION_REQUIRED", approval_required: true, description: "レイド中心", active_members_7d: 7, raid_participants_7d: 5 },
      { id: "30000000-0000-4000-8000-000000000203", name: "CYAN EDGE", level: 2, member_count: 5, member_limit: 12, recruitment_mode: "OPEN_JOIN", approval_required: false, description: "初心者歓迎", active_members_7d: 4, raid_participants_7d: 1 },
    ]));
    localStorage.setItem("mock_db_guild_members", "[]");
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify([
      "first_free_skill_ten_pull", "first_free_equipment_ten_pull", "first_main_loadout",
    ].map((milestone) => ({ user_id: userId, milestone, occurrence_count: 1 }))));
  });
});

async function enterGame(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
}

async function expectNoHorizontalOverflow(page: Page, selector: string) {
  const size = await page.locator(selector).first().evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1);
}

for (const viewport of [
  { name: "iphone13", width: 390, height: 844 },
  { name: "pixel7", width: 412, height: 915 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test(`${viewport.name}: Home and Mission reward feedback remain usable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await enterGame(page);
    await expect(page.locator(".mypage-primary-cta")).toContainText("CASHをゲット");
    await expect(page.locator(".mypage-live-ticker--visual")).toBeVisible();
    await expect(page.locator(".mypage-leader-layer.is-ssr")).toBeVisible();
    await expect(page.getByRole("button", { name: "ギルドバトルは準備中です" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "ショップは準備中です" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /フレンド/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, ".mypage-view");

    await page.getByRole("button", { name: /ミッション/ }).click();
    await expect(page.locator(".mission-item.CLEAR")).toBeVisible();
    await expect(page.locator(".mission-reward")).toContainText("強化ドリンク・小");
    await expectNoHorizontalOverflow(page, ".mission-panel-container-inner");
    await page.getByRole("button", { name: "受け取る", exact: true }).click();
    const rewardDialog = page.getByRole("dialog", { name: "報酬獲得" });
    await expect(rewardDialog).toBeVisible();
    await expect(rewardDialog).toContainText("強化ドリンク・小");
    await expect(rewardDialog).toContainText("報酬を獲得しました");
    await expectNoHorizontalOverflow(page, ".canonical-dialog");
  });
}

test("Guild recommendations expose current activity and keep join feedback actionable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);
  await page.locator(".circle-menu-btn.guild").click();
  await expect(page.locator(".guild-lobby-section-heading").first()).toContainText("おすすめギルド");
  await expect(page.locator(".guild-lobby-guild-card").first()).toBeVisible();
  await expect(page.locator(".guild-lobby-guild-card").first()).toContainText("直近7日アクティブ");
  await expect(page.locator(".guild-lobby-guild-card").first()).toContainText("レイド貢献");
  await expectNoHorizontalOverflow(page, ".guild-lobby-view");
});

test("Present claim uses the shared reward result and mobile-safe layout", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await enterGame(page);
  await page.getByRole("button", { name: "MENU" }).click();
  await page.getByRole("button", { name: "プレゼント" }).click();
  await expect(page.locator(".inbox-present-item")).toBeVisible();
  await expectNoHorizontalOverflow(page, ".inbox-panel-container-inner");
  await page.getByRole("button", { name: "受け取る", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "報酬獲得" });
  await expect(dialog).toContainText("× 2");
  await expect(dialog).not.toContainText("CHAR_EXP_M");
});
