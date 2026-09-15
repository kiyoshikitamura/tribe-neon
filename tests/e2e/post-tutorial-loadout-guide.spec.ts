import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const userId = "00000000-0000-4000-8000-000000002218";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ userId }) => {
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    // Fresh fixture has no prior Raid battle receipts; no progression is advanced.
    localStorage.setItem("mock_rpc_fixture:empty_raid_recoveries", "true");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "Guide QA", level: 5, cash: 100000, pvp_points: 5, current_base_id: "shinjuku", last_active_at: now }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "EMAIL" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: "guide-character", user_id: userId, character_id: "char_reiji_01", level: 7, awakening_level: 0, created_at: now }]));
    if (!localStorage.getItem("mock_db_guilds")) localStorage.setItem("mock_db_guilds", JSON.stringify([{ id: "30000000-0000-4000-8000-000000002217", name: "GUIDE OPEN TRIBE", leader_id: "00000000-0000-4000-8000-000000002217", level: 5, member_limit: 20, recruitment_mode: "OPEN_JOIN" }]));
    if (!localStorage.getItem("mock_db_guild_members")) localStorage.setItem("mock_db_guild_members", JSON.stringify([{ id: "guide-open-master", guild_id: "30000000-0000-4000-8000-000000002217", user_id: "00000000-0000-4000-8000-000000002217", role: "MASTER" }]));
    if (!localStorage.getItem("mock_db_user_funnel_milestones")) {
      localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify([{ user_id: userId, milestone: "tutorial_complete", occurrence_count: 1 }]));
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: today }]));
    localStorage.setItem("mock_db_gacha_masters", JSON.stringify([
      { id: "SKILL_NORMAL", gacha_type: "SKILL", cost_cash: 100, cost_diamond: 10 },
      { id: "EQUIP_NORMAL", gacha_type: "EQUIPMENT", cost_cash: 100, cost_diamond: 10 },
    ]));
    // Room UI consumes the read RPC projection, not the retired legacy boss activity row.
    localStorage.setItem("mock_rpc_fixture:raid_rooms", JSON.stringify([{
      roomId:"raid-guide",difficultyId:"beginner",owner:{status:"unknown"},
      state:{status:"available",value:"active"},createdAt:{status:"available",value:now},
      expiresAt:{status:"available",value:new Date(Date.now()+86400000).toISOString()},
      endedAt:{status:"available",value:null},hp:{status:"available",value:{current:1000,max:1000}},
      participantCount:{status:"available",value:1},serverEligibility:{status:"unknown"},
    }]));
  }, { userId });
});

async function enterGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  const start = page.getByRole("button", { name: "TAP TO START" });
  const resume = page.getByRole("button", { name: "続きから" });
  await expect(start.or(resume).or(page.locator(".header-mobile"))).toBeVisible();
  if (await start.isVisible()) await start.click();
  if (await resume.isVisible()) await resume.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonusClose = page.locator(".login-bonus-modal-overlay").getByRole("button", { name: "閉じる" });
  if (await loginBonusClose.isVisible()) await loginBonusClose.click();
}

async function addMilestones(page: import("@playwright/test").Page, ...names: string[]) {
  await page.evaluate(({ userId, names }) => {
    const rows = JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]");
    for (const milestone of names) if (!rows.some((row: any) => row.user_id === userId && row.milestone === milestone)) rows.push({ user_id: userId, milestone, occurrence_count: 1 });
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify(rows));
  }, { userId, names });
}

test("guide resumes free gacha, loadout and Quest in canonical order without view completion", async ({ page }) => {
  await enterGame(page);
  const primary = page.locator(".mypage-primary-cta");
  await expect(primary).toContainText("無料ガチャ");
  await primary.click();
  await expect(page.locator('[data-gacha-category="SKILL"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("初心者ガイド：スキルの無料10連を引こう")).toBeVisible();
  let persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]"));
  expect(persisted.some((row: any) => row.milestone === "first_free_skill_ten_pull")).toBeFalsy();

  await addMilestones(page, "first_free_skill_ten_pull");
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await expect(primary).toContainText("無料ガチャ");
  await primary.click();
  await expect(page.locator('[data-gacha-category="EQUIPMENT"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("初心者ガイド：装備の無料10連を引こう")).toBeVisible();

  await addMilestones(page, "first_free_equipment_ten_pull");
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await expect(primary).toContainText("キャラ装備");
  await primary.click();
  await expect(page.getByRole("button", { name: "キャラ", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".character-v2-party")).toBeVisible();
  await expect(page.getByRole("button", { name: "おまかせ編成", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await page.getByRole("button", { name: "キャラ", exact: true }).click();
  await expect(page.locator(".character-v2-party")).toHaveCount(0);
  persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]"));
  expect(persisted.some((row: any) => row.milestone === "first_main_loadout")).toBeFalsy();

  await addMilestones(page, "first_main_loadout");
  await page.reload();
  await enterGame(page);
  await expect(primary).toContainText("CASHをゲット");
  await expect(primary).not.toContainText("ランキングを確認");
});

test("post-loadout guide keeps Quest, Battle, Raid and Mission handoff without Guild", async ({ page }) => {
  await enterGame(page);
  await addMilestones(page, "first_free_skill_ten_pull", "first_free_equipment_ten_pull", "first_main_loadout");
  await page.reload();
  await enterGame(page);
  const primary = page.locator(".mypage-primary-cta");
  await expect(primary).toContainText("CASHをゲット");

  await addMilestones(page, "post_tutorial_quest");
  await page.reload();
  await enterGame(page);
  await expect(primary).toContainText("腕試しをしよう");

  await addMilestones(page, "first_pvp");
  await page.reload();
  await enterGame(page);
  await expect(primary).toContainText("強敵に挑戦");

  await addMilestones(page, "first_raid");
  await page.reload();
  await enterGame(page);
  await expect(primary).toContainText("ミッションを確認");
  await expect(page.getByText(/ギルドに加入しよう|ギルドを設立しよう/, { exact: true })).toHaveCount(0);
});
